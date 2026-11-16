import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { addOrderGroup, updateOrderGroupQuantity, removeOrderGroup, normalizeOrderDraft,
  updateOrderGroupVariant, replaceOrderGroup,
  applyOrderRecommendation, updateOrderLines, readStoredOrderDraft, writeStoredOrderDraft,
  ORDER_DRAFT_KEY } from "../src/order-draft.js";

const ids = new Set(["tea", "coffee", "cake", "hot", "flavored"]);
const line = (id, quantity = 1) => ({ id, quantity });

test("different pairs remain independently editable and removable; repeats merge the same pair", () => {
  let draft = addOrderGroup(null, [line("tea"), line("cake")], 2, ids).draft;
  draft = addOrderGroup(draft, [line("coffee"), line("cake")], 1, ids).draft;
  draft = addOrderGroup(draft, [line("cake"), line("tea")], 1, ids).draft;
  assert.equal(draft.groups.length, 2);
  const teaPair = draft.groups.find(group => group.items.some(item => item.id === "tea"));
  assert.equal(teaPair.quantity, 3);
  assert.deepEqual(teaPair.items.map(item => item.id), ["tea", "cake"], "display order stays drink first even when an equivalent recipe arrives reordered");
  draft = updateOrderGroupQuantity(draft, teaPair.id, 2, ids).draft;
  assert.deepEqual(draft.lines, [line("cake", 3), line("coffee"), line("tea", 2)]);
  draft = removeOrderGroup(draft, teaPair.id, ids);
  assert.deepEqual(draft.lines, [line("cake"), line("coffee")]);
});

test("flavors retain separate identities through serialization and reload", () => {
  let draft = addOrderGroup(null, [{ id: "flavored", variant: "vanilla" }], 1, ids).draft;
  draft = addOrderGroup(draft, [{ id: "flavored", variant: "caramel" }], 2, ids).draft;
  assert.equal(draft.groups.length, 2);
  assert.deepEqual(normalizeOrderDraft(JSON.parse(JSON.stringify(draft)), ids), draft);
  assert.deepEqual(draft.lines, [line("flavored", 3)]);
});

test("the global product cap spans groups and flavors and rejects entire pairs", () => {
  const draft = addOrderGroup(null, [line("cake")], 99, ids).draft;
  const blocked = addOrderGroup(draft, [line("tea"), line("cake")], 1, ids);
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.draft, draft);
  const flavored = addOrderGroup(null, [{ id: "flavored", variant: "vanilla" }], 99, ids).draft;
  assert.equal(addOrderGroup(flavored, [{ id: "flavored", variant: "caramel" }], 1, ids).blocked, true);
});

test("replacing a pair changes its composition once and preserves unrelated latest selections", () => {
  const original = addOrderGroup(null, [line("tea"), line("cake")], 2, ids).draft;
  const latest = addOrderGroup(original, [line("coffee")], 3, ids).draft;
  const replacement = replaceOrderGroup(latest, original.groups[0], [line("tea"), line("hot")], 2, ids);
  assert.equal(replacement.applied, true);
  assert.deepEqual(replacement.draft.lines, [line("coffee", 3), line("hot", 2), line("tea", 2)]);
  assert.equal(replacement.draft.groups.length, 2, "the old pair is replaced, not appended");
  assert.deepEqual(latest.lines, [line("cake", 2), line("coffee", 3), line("tea", 2)], "input basket is immutable");
});

test("pair editing can keep just its drink and merge an identical selection without duplication", () => {
  let draft = addOrderGroup(null, [{ id: "flavored", variant: "vanilla" }, line("cake")], 2, ids).draft;
  const original = draft.groups[0];
  draft = addOrderGroup(draft, [{ id: "flavored", variant: "vanilla" }], 3, ids).draft;
  const replacement = replaceOrderGroup(draft, original, [{ id: "flavored", variant: "vanilla" }], 2, ids);
  assert.equal(replacement.applied, true);
  assert.equal(replacement.draft.groups.length, 1);
  assert.equal(replacement.draft.groups[0].quantity, 5);
  assert.deepEqual(replacement.draft.groups[0].items, [{ id: "flavored", variant: "vanilla", quantity: 1 }]);
  assert.deepEqual(replacement.draft.lines, [line("flavored", 5)]);
});

test("pair replacements reject product-cap overflow atomically without dropping the original", () => {
  let draft = addOrderGroup(null, [line("tea"), line("cake")], 2, ids).draft;
  const original = draft.groups[0];
  draft = addOrderGroup(draft, [line("hot")], 98, ids).draft;
  const replacement = replaceOrderGroup(draft, original, [line("tea"), line("hot")], 2, ids);
  assert.equal(replacement.applied, false);
  assert.equal(replacement.blocked, true);
  assert.deepEqual(replacement.draft, draft);
  const invalid = replaceOrderGroup(draft, original, [line("unknown")], 2, ids);
  assert.equal(invalid.applied, false);
  assert.deepEqual(invalid.draft, draft);
});

test("a stale composition editor cannot overwrite a changed quantity, flavor, or removal", () => {
  const draft = addOrderGroup(null, [{ id: "flavored", variant: "vanilla" }, line("cake")], 2, ids).draft;
  const original = draft.groups[0];
  const updates = [
    updateOrderGroupQuantity(draft, original.id, 3, ids).draft,
    updateOrderGroupVariant(draft, original.id, 0, "caramel", ids).draft,
    removeOrderGroup(draft, original.id, ids)
  ];
  for (const latest of updates) {
    const replacement = replaceOrderGroup(latest, original, [{ id: "flavored", variant: "vanilla" }], 2, ids);
    assert.equal(replacement.applied, false);
    assert.equal(replacement.stale, true);
    assert.deepEqual(replacement.draft, latest);
  }
});

test("an unchanged edit at the product cap remains saveable without adding another pair", () => {
  const draft = addOrderGroup(null, [line("tea"), line("cake")], 99, ids).draft;
  const replacement = replaceOrderGroup(draft, draft.groups[0], [line("tea"), line("cake")], 99, ids);
  assert.equal(replacement.applied, true);
  assert.deepEqual(replacement.draft, draft);
});

test("changing a flavor preserves components when their identities collide inside or between groups", () => {
  let draft = addOrderGroup(null, [{ id: "flavored", variant: "vanilla" }, { id: "flavored", variant: "caramel" }, line("cake")], 2, ids).draft;
  const originalLines = draft.lines;
  draft = updateOrderGroupVariant(draft, draft.groups[0].id, 1, "vanilla", ids).draft;
  assert.deepEqual(draft.lines, originalLines);
  assert.equal(draft.groups.length, 1);
  assert.equal(draft.groups[0].quantity, 2);
  assert.deepEqual(draft.groups[0].items, [{ id: "flavored", variant: "vanilla", quantity: 2 }, line("cake")]);
  draft = addOrderGroup(draft, [{ id: "flavored", variant: "caramel", quantity: 2 }, line("cake")], 3, ids).draft;
  draft = updateOrderGroupVariant(draft, draft.groups[1].id, 0, "vanilla", ids).draft;
  assert.equal(draft.groups.length, 1, "matching recipes merge after a flavor edit");
  assert.equal(draft.groups[0].quantity, 5);
  assert.deepEqual(draft.lines, [line("cake", 5), line("flavored", 10)]);
  assert.equal(updateOrderGroupVariant(draft, draft.groups[0].id, 9, "vanilla", ids).blocked, true);
  assert.equal(updateOrderGroupVariant(draft, draft.groups[0].id, 0, "", ids).blocked, true);
});

test("full-menu +/- gestures use the current transaction draft rather than a stale visible row", async () => {
  const source = readFileSync(new URL("../src/menu-order-ui.js", import.meta.url), "utf8");
  const start = source.indexOf("async function setCartQuantity(");
  const end = source.indexOf("\nfunction variantsFor(", start);
  assert.ok(start >= 0 && end > start, "execute the real menu mutation handler");
  const run = async (currentQuantity, displayedTarget, control, expected) => {
    const latest = addOrderGroup(null, [line("tea"), line("cake")], currentQuantity, ids).draft;
    let saved;
    const context = {
      orderDraft: null, cart: null, cartWrites: 0, cartSession: 1, cartDialog: { hasAttribute: () => true },
      document: { querySelector: () => null }, orderProductIds: ids, updateOrderGroupQuantity,
      lastAddedSelection: { quantity: 1 }, cartCheckoutError: { hidden: false },
      readCart: () => { context.orderDraft = latest; return new Map(latest.lines.map(item => [item.id, item.quantity])); },
      saveCart: async updater => { const result = updater(latest); saved = context.orderDraft = result.draft; return result; }, renderCart: () => {}
    };
    await vm.runInNewContext(`${source.slice(start, end)}\nsetCartQuantity(${JSON.stringify(latest.groups[0].id)}, ${displayedTarget}, ${JSON.stringify(control)}, false);`, context);
    assert.equal(saved.groups[0].quantity, expected);
    assert.deepEqual(saved.lines, [line("cake", expected), line("tea", expected)]);
    assert.equal(context.lastAddedSelection, null, "Editing the basket clears the previous Add confirmation");
    assert.equal(context.cartCheckoutError.hidden, true, "Editing the basket clears a previous checkout error");
  };
  await run(2, 2, "increase", 3); // The old row still showed one when another tab added one.
  await run(3, 1, "decrease", 2); // The old row still showed two when another tab added one.
});

function menuReplacement() {
  const source = readFileSync(new URL("../src/menu-order-ui.js", import.meta.url), "utf8");
  const start = source.indexOf("export function replaceMenuGroupItem(");
  const end = source.indexOf("\n// Ordering dialogs", start);
  assert.ok(start >= 0 && end > start, "exercise the actual full-menu replacement operation");
  return vm.runInNewContext(`${source.slice(start, end).replace(/^export /, "")}\nreplaceMenuGroupItem`, { normalizeOrderDraft });
}

test("full-menu replacement retains pair component counts and unrelated fresh edits", () => {
  const replace = menuReplacement();
  const original = addOrderGroup(null, [line("tea"), line("cake", 2)], 3, ids).draft;
  const latest = addOrderGroup(original, [line("hot")], 4, ids).draft;
  const result = replace(latest, original.groups[0], 0, { id: "coffee" }, ids);
  assert.equal(result.applied, true);
  assert.deepEqual(result.draft.lines, [line("cake", 6), line("coffee", 3), line("hot", 4)]);
  const pair = result.draft.groups.find(group => group.items.some(item => item.id === "cake"));
  assert.equal(pair.quantity, 3);
  assert.equal(pair.items.find(item => item.id === "cake").quantity, 2);
  assert.deepEqual(latest.lines, [line("cake", 6), line("hot", 4), line("tea", 3)], "Previewing replacement cannot mutate the input draft");
});

test("full-menu replacement merges matching components and groups without losing quantities", () => {
  const replace = menuReplacement();
  let draft = addOrderGroup(null, [line("tea"), line("coffee")], 2, ids).draft;
  let result = replace(draft, draft.groups[0], 1, { id: "tea" }, ids);
  assert.equal(result.applied, true);
  assert.deepEqual(result.draft.lines, [line("tea", 4)]);
  assert.deepEqual(result.draft.groups[0].items, [line("tea", 2)]);
  draft = addOrderGroup(null, [line("tea"), line("cake")], 2, ids).draft;
  draft = addOrderGroup(draft, [line("coffee"), line("cake")], 3, ids).draft;
  result = replace(draft, draft.groups[0], 0, { id: "coffee" }, ids);
  assert.equal(result.draft.groups.length, 1);
  assert.equal(result.draft.groups[0].quantity, 5);
  assert.deepEqual(result.draft.lines, [line("cake", 5), line("coffee", 5)]);
});

test("full-menu replacement rejects stale removals, quantity changes and recommendation changes", () => {
  const replace = menuReplacement();
  const original = addOrderGroup(null, [line("tea"), line("cake")], 2, ids).draft;
  const snapshot = original.groups[0];
  for (const latest of [removeOrderGroup(original, snapshot.id, ids), updateOrderGroupQuantity(original, snapshot.id, 3, ids).draft]) {
    const result = replace(latest, snapshot, 0, { id: "coffee" }, ids);
    assert.equal(result.reason, "stale");
    assert.deepEqual(result.draft, latest);
  }
  const owned = applyOrderRecommendation(null, { token: "pair", signature: "tea", lines: [line("tea"), line("cake")] }, ids).draft;
  const changed = applyOrderRecommendation(owned, { token: "pair", signature: "hot", lines: [line("hot"), line("cake")] }, ids).draft;
  assert.equal(replace(changed, owned.groups[0], 0, { id: "coffee" }, ids).reason, "stale", "A stable recommendation ID does not make changed contents safe to overwrite");
});

test("full-menu replacement validates mandatory flavors and refuses overflow atomically", () => {
  const replace = menuReplacement();
  let draft = addOrderGroup(null, [line("tea"), line("cake")], 2, ids).draft;
  const original = draft.groups[0];
  for (const replacement of [{ id: "flavored" }, { id: "flavored", variant: "unknown" }]) {
    const result = replace(draft, original, 0, replacement, ids, ["vanilla", "caramel"]);
    assert.equal(result.applied, false);
    assert.deepEqual(result.draft, draft);
  }
  const flavored = replace(draft, original, 0, { id: "flavored", variant: "vanilla" }, ids, ["vanilla", "caramel"]);
  assert.equal(flavored.applied, true);
  assert.equal(flavored.draft.groups[0].items[0].variant, "vanilla");
  assert.equal(replace(draft, original, 0, { id: "coffee", variant: "vanilla" }, ids).applied, false);
  draft = addOrderGroup(draft, [line("coffee")], 98, ids).draft;
  const limited = replace(draft, original, 0, { id: "coffee" }, ids);
  assert.equal(limited.reason, "limit");
  assert.deepEqual(limited.draft, draft, "A failed substitution cannot remove the original or companion dessert");
});

test("full-menu replacement preserves recommendation ownership and explicit dessert substitution", () => {
  const replace = menuReplacement();
  const selection = { token: "pair", signature: "first", lines: [line("tea"), line("cake")] };
  const original = applyOrderRecommendation(null, selection, ids).draft;
  const dessertIndex = original.groups[0].items.findIndex(item => item.id === "cake");
  const result = replace(original, original.groups[0], dessertIndex, { id: "hot" }, ids);
  assert.equal(result.draft.groups[0].source, "recommendation");
  assert.deepEqual(result.draft.recommendation.removedLines, [line("cake")]);
  const revised = applyOrderRecommendation(result.draft, { ...selection, signature: "next", lines: [line("coffee"), line("cake")] }, ids).draft;
  assert(!revised.lines.some(item => item.id === "cake"), "A same-selection advisor update cannot restore the replaced dessert");
  const restored = replace(result.draft, result.draft.groups[0], dessertIndex, { id: "cake" }, ids);
  assert.deepEqual(restored.draft.recommendation.removedLines, [], "Explicitly restoring the original dessert clears its removal marker");
});

test("flat legacy drafts migrate without repricing or losing recommendation ownership", () => {
  const draft = normalizeOrderDraft({ version: 1, lines: [line("tea", 2), line("cake")],
    recommendation: { token: "old", signature: "old", lines: [line("tea"), line("cake")] } }, ids);
  assert.equal(draft.groups.length, 2);
  assert.equal(draft.groups.find(group => group.source === "menu").quantity, 1);
  assert.deepEqual(draft.lines, [line("cake"), line("tea", 2)]);
});

test("a substitution cannot resurrect a component removed from the current recommendation", () => {
  let draft = applyOrderRecommendation(null, { token: "one", signature: "tea-cake", lines: [line("tea"), line("cake")] }, ids).draft;
  draft = updateOrderLines(draft, [line("tea")], ids);
  draft = applyOrderRecommendation(draft, { token: "one", signature: "hot-cake", lines: [line("hot"), line("cake")] }, ids).draft;
  assert.deepEqual(draft.lines, [line("hot")]);
  draft = removeOrderGroup(draft, "recommendation", ids);
  draft = applyOrderRecommendation(draft, { token: "one", signature: "tea-cake-again", lines: [line("tea"), line("cake")] }, ids).draft;
  assert.deepEqual(draft.lines, []);
  draft = applyOrderRecommendation(draft, { token: "two", signature: "tea-cake-again", lines: [line("tea"), line("cake")] }, ids).draft;
  assert.deepEqual(draft.lines, [line("cake"), line("tea")]);
});

test("same-selection substitutions retain pair quantity and chosen flavors; a new selection starts once", () => {
  let draft = applyOrderRecommendation(null, { token: "one", signature: "tea-cake", lines: [line("tea"), line("cake")] }, ids).draft;
  draft = updateOrderGroupQuantity(draft, "recommendation", 3, ids).draft;
  draft = applyOrderRecommendation(draft, { token: "one", signature: "flavored-cake", lines: [line("flavored"), line("cake")] }, ids).draft;
  assert.deepEqual(draft.lines, [line("cake", 3), line("flavored", 3)]);
  const flavorIndex = draft.groups[0].items.findIndex(item => item.id === "flavored");
  draft = updateOrderGroupVariant(draft, "recommendation", flavorIndex, "vanilla", ids).draft;
  draft = applyOrderRecommendation(draft, { token: "one", signature: "flavored-hot", lines: [line("flavored"), line("hot")] }, ids).draft;
  assert.equal(draft.groups[0].quantity, 3);
  assert.deepEqual(draft.groups[0].items.find(item => item.id === "flavored"), { id: "flavored", quantity: 1, variant: "vanilla" });
  assert.deepEqual(draft.lines, [line("flavored", 3), line("hot", 3)]);
  draft = applyOrderRecommendation(draft, { token: "two", signature: "flavored-hot", lines: [line("flavored"), line("hot")] }, ids).draft;
  assert.equal(draft.groups[0].quantity, 1);
  assert.equal(draft.groups[0].items.find(item => item.id === "flavored").variant, undefined);
  assert.deepEqual(draft.lines, [line("flavored"), line("hot")]);
});

test("retaining recommendation quantity makes substitutions respect the product cap atomically", () => {
  let draft = addOrderGroup(null, [line("coffee")], 97, ids).draft;
  draft = applyOrderRecommendation(draft, { token: "one", signature: "tea-cake", lines: [line("tea"), line("cake")] }, ids).draft;
  draft = updateOrderGroupQuantity(draft, "recommendation", 3, ids).draft;
  const blocked = applyOrderRecommendation(draft, { token: "one", signature: "coffee-cake", lines: [line("coffee"), line("cake")] }, ids);
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.draft, draft, "neither component nor recommendation metadata changes on a blocked substitution");
});

test("legacy quantity edits preserve manual ownership before changing a recommendation", () => {
  let draft = addOrderGroup(null, [line("tea")], 1, ids).draft;
  draft = applyOrderRecommendation(draft, { token: "one", signature: "tea", lines: [line("tea")] }, ids).draft;
  draft = updateOrderLines(draft, [line("tea")], ids);
  draft = applyOrderRecommendation(draft, { token: "two", signature: "hot", lines: [line("hot")] }, ids).draft;
  assert.deepEqual(draft.lines, [line("hot"), line("tea")]);
});

test("legacy flat quantity edits share one allowance across flavors inside the same group", () => {
  const draft = addOrderGroup(null, [{ id: "flavored", variant: "vanilla" }, { id: "flavored", variant: "caramel" }, line("cake")], 2, ids).draft;
  const edited = updateOrderLines(draft, [line("flavored", 3), line("cake", 2)], ids);
  assert.deepEqual(edited.lines, [line("cake", 2), line("flavored", 3)]);
  assert.deepEqual(edited.groups[0].items, [
    { id: "flavored", variant: "vanilla", quantity: 2 },
    { id: "flavored", variant: "caramel", quantity: 1 }, line("cake", 2)
  ]);
  const single = updateOrderLines(draft, [line("flavored")], ids);
  assert.deepEqual(single.lines, [line("flavored")]);
  assert.deepEqual(single.groups[0].items, [{ id: "flavored", variant: "vanilla", quantity: 1 }]);
});

test("removing an extra copy does not suppress the base recommendation", () => {
  let draft = applyOrderRecommendation(null, { token: "one", signature: "tea-cake", lines: [line("tea"), line("cake")] }, ids).draft;
  draft = updateOrderGroupQuantity(draft, "recommendation", 2, ids).draft;
  draft = updateOrderGroupQuantity(draft, "recommendation", 1, ids).draft;
  draft = applyOrderRecommendation(draft, { token: "one", signature: "hot-cake", lines: [line("hot"), line("cake")] }, ids).draft;
  assert.deepEqual(draft.lines, [line("cake"), line("hot")]);
});

test("an absent canonical basket never resurrects a stale session mirror or writes on read", () => {
  const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
  globalThis.localStorage = memory(); globalThis.sessionStorage = memory();
  sessionStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify({ version: 1, lines: [line("tea")] }));
  assert.deepEqual(readStoredOrderDraft(ids).lines, []);
  assert.equal(localStorage.getItem(ORDER_DRAFT_KEY), null, "Reading must never race an in-flight transaction by writing");
  writeStoredOrderDraft(null, ids);
  sessionStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify({ version: 1, lines: [line("cake")] }));
  assert.deepEqual(readStoredOrderDraft(ids).lines, []);
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});

test("legacy draft snapshots remain readable when both browser storage APIs are unavailable", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  globalThis.localStorage = broken; globalThis.sessionStorage = broken;
  const draft = addOrderGroup(null, [line("tea"), line("cake")], 1, ids).draft;
  writeStoredOrderDraft(draft, ids);
  assert.deepEqual(readStoredOrderDraft(ids), draft);
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});

test("readable storage cannot roll back an edit after quota errors, and persistence recovers", () => {
  let value;
  let quota = false;
  globalThis.localStorage = {
    getItem: () => value ?? null,
    setItem: (_key, next) => { if (quota) throw new Error("quota"); value = next; }
  };
  // Both fallback storage reads and the canonical value can remain stale.
  globalThis.sessionStorage = {
    getItem: () => JSON.stringify({ version: 1, lines: [line("tea")] }),
    setItem: () => { throw new Error("blocked"); }
  };
  const original = addOrderGroup(null, [line("tea")], 1, ids).draft;
  writeStoredOrderDraft(original, ids);
  quota = true;
  const edited = addOrderGroup(original, [line("coffee"), line("cake")], 2, ids).draft;
  writeStoredOrderDraft(edited, ids);
  assert.deepEqual(readStoredOrderDraft(ids), edited, "a readable old local value must not overwrite the failed latest write");
  assert.deepEqual(JSON.parse(value), original, "the test genuinely retained stale local storage");
  quota = false;
  assert.deepEqual(readStoredOrderDraft(ids), edited);
  assert.deepEqual(JSON.parse(value), original, "Reading a recovered legacy pending edit does not mutate canonical storage");
  writeStoredOrderDraft(edited, ids);
  value = JSON.stringify(original);
  assert.deepEqual(readStoredOrderDraft(ids), original, "normal cross-tab reads resume after recovery");
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});

test("a later local read failure cannot restore stale session quantities", () => {
  let value;
  let blocked = false;
  globalThis.localStorage = {
    getItem: () => { if (blocked) throw new Error("blocked"); return value ?? null; },
    setItem: (_key, next) => { if (blocked) throw new Error("blocked"); value = next; }
  };
  globalThis.sessionStorage = {
    getItem: () => JSON.stringify({ version: 1, lines: [line("tea")] }),
    setItem: () => { throw new Error("blocked"); }
  };
  const edited = addOrderGroup(null, [line("tea"), line("cake")], 3, ids).draft;
  writeStoredOrderDraft(edited, ids);
  blocked = true;
  assert.deepEqual(readStoredOrderDraft(ids), edited);
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});

const storageMemory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
let moduleInstance = 0;
const freshDraftModule = () => import(`../src/order-draft.js?storage-regression=${moduleInstance++}`);

test("failed local writes survive a fresh module reload and commit after quota recovery", async () => {
  const canonical = storageMemory();
  let quota = false;
  globalThis.localStorage = { ...canonical, setItem(key, value) { if (quota) throw new Error("quota"); canonical.setItem(key, value); } };
  globalThis.sessionStorage = storageMemory();
  try {
    const writer = await freshDraftModule();
    const original = addOrderGroup(null, [line("tea")], 1, ids).draft;
    writer.writeStoredOrderDraft(original, ids);
    quota = true;
    const edited = addOrderGroup(original, [line("cake")], 2, ids).draft;
    writer.writeStoredOrderDraft(edited, ids);
    assert.deepEqual(JSON.parse(canonical.getItem(ORDER_DRAFT_KEY)), original);
    const reloaded = await freshDraftModule();
    assert.deepEqual(reloaded.readStoredOrderDraft(ids), edited, "session pending state survives loss of all module memory");
    assert.deepEqual(JSON.parse(canonical.getItem(ORDER_DRAFT_KEY)), original, "reads do not magically bypass the quota error");
    quota = false;
    assert.deepEqual(reloaded.readStoredOrderDraft(ids), edited);
    assert.deepEqual(JSON.parse(canonical.getItem(ORDER_DRAFT_KEY)), original, "Quota recovery cannot make a reader an unlocked writer");
    reloaded.writeStoredOrderDraft(edited, ids);
    assert.deepEqual(JSON.parse(canonical.getItem(ORDER_DRAFT_KEY)), edited);
    assert.equal(sessionStorage.getItem(`${ORDER_DRAFT_KEY}.pending`), null);
  } finally { delete globalThis.localStorage; delete globalThis.sessionStorage; }
});

test("a pending session write never rolls back a newer canonical draft from another tab", async () => {
  for (const reload of [false, true]) for (const replacement of ["new-cart", "empty-cart", "removed-key"]) {
    const canonical = storageMemory();
    let quota = false;
    globalThis.localStorage = { ...canonical, setItem(key, value) { if (quota) throw new Error("quota"); canonical.setItem(key, value); } };
    globalThis.sessionStorage = storageMemory();
    try {
      const writer = await freshDraftModule();
      const original = addOrderGroup(null, [line("tea")], 1, ids).draft;
      writer.writeStoredOrderDraft(original, ids);
      quota = true;
      writer.writeStoredOrderDraft(addOrderGroup(original, [line("cake")], 2, ids).draft, ids);
      const newer = addOrderGroup(null, [line("coffee")], 3, ids).draft;
      if (replacement === "removed-key") canonical.removeItem(ORDER_DRAFT_KEY);
      else canonical.setItem(ORDER_DRAFT_KEY, JSON.stringify(replacement === "new-cart" ? newer : normalizeOrderDraft(null, ids)));
      const reader = reload ? await freshDraftModule() : writer;
      quota = false;
      assert.deepEqual(reader.readStoredOrderDraft(ids), replacement === "new-cart" ? newer : normalizeOrderDraft(null, ids), `${replacement}, reload=${reload}`);
      assert.equal(sessionStorage.getItem(`${ORDER_DRAFT_KEY}.pending`), null);
      assert.equal(canonical.getItem(ORDER_DRAFT_KEY), replacement === "removed-key" ? null : JSON.stringify(replacement === "new-cart" ? newer : normalizeOrderDraft(null, ids)));
    } finally { delete globalThis.localStorage; delete globalThis.sessionStorage; }
  }
});


// Model-based boundary sweep: one independent tea line and an unrelated cake
// line. The oracle is the documented 1..99 cap; zero is removal on edit only.
test("MBT: cart quantity state × command × boundary preserves unrelated lines", async t => {
  const states = [0, 1, 2, 50, 98, 99];
  const inputs = [-1, 0, 1, 2, 98, 99, 100, 1.5];
  const covered = new Set();
  for (const quantity of states) {
    for (const command of ["add", "edit"]) {
      for (const input of inputs) {
        const label = `${quantity} / ${command} / ${input}`;
        await t.test(label, () => {
          let before = addOrderGroup(null, [line("cake")], 2, ids).draft;
          if (quantity) before = addOrderGroup(before, [line("tea")], quantity, ids).draft;
          const target = before.groups.find(group => group.items.some(item => item.id === "tea"));
          const valid = Number.isInteger(input) && (command === "add"
            ? input >= 1 && quantity + input <= 99
            : quantity > 0 && input >= 0 && input <= 99);
          const expected = valid ? (command === "add" ? quantity + input : input) : quantity;
          const snapshot = JSON.parse(JSON.stringify(before));
          const result = command === "add"
            ? addOrderGroup(before, [line("tea")], input, ids)
            : updateOrderGroupQuantity(before, target?.id ?? "__absent__", input, ids);
          assert.equal(result.applied, valid);
          assert.equal(result.blocked, !valid);
          assert.deepEqual(before, snapshot, "input draft must not be mutated");
          if (!valid) assert.deepEqual(result.draft, before);
          assert.deepEqual(result.draft.lines, [line("cake", 2), ...(expected ? [line("tea", expected)] : [])]);
          assert.equal(result.draft.groups.length, expected ? 2 : 1);
          assert.deepEqual(normalizeOrderDraft(JSON.parse(JSON.stringify(result.draft)), ids), result.draft);
          covered.add(label);
        });
      }
    }
  }
  assert.equal(covered.size, 96, "all declared quantity/command/input cells must execute successfully");
});


// Targeted, in-memory mutation controls. Never overwrite a runtime file.
// The original module must satisfy each oracle; a mutant only counts as killed
// by its corresponding assertion, not by a syntax/import/runtime failure.
test("MUTATION: cart business invariant oracles kill seven deliberate defects", async t => {
  const source = readFileSync(new URL("../src/order-draft.js", import.meta.url), "utf8");
  const load = code => import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  const baseline = await load(source);
  const add = (module, raw, items, quantity) => module.addOrderGroup(raw, items, quantity, ids);
  const mutations = [
    { name: "accept quantity 100", from: "export const MAX_ORDER_QUANTITY = 99;",
      to: "export const MAX_ORDER_QUANTITY = 100;",
      oracle: m => assert.equal(add(m, null, [line("tea")], 100).blocked, true) },
    { name: "reject legal quantity 99", from: "export const MAX_ORDER_QUANTITY = 99;",
      to: "export const MAX_ORDER_QUANTITY = 98;",
      oracle: m => assert.equal(add(m, null, [line("tea")], 99).applied, true) },
    { name: "accept fractional quantity", from: "Number.isInteger(value) && value > 0",
      to: "Number.isFinite(value) && value > 0",
      oracle: m => assert.equal(add(m, null, [line("tea")], 1.5).blocked, true) },
    { name: "accept zero on add", from: "value > 0 && value <= MAX_ORDER_QUANTITY",
      to: "value >= 0 && value <= MAX_ORDER_QUANTITY",
      oracle: m => assert.equal(add(m, null, [line("tea")], 0).blocked, true) },
    { name: "bypass aggregate product cap", from: "if (!positive(group.quantity) || !withinLimit(groups)) return { draft, applied: false, blocked: true };",
      to: "if (!positive(group.quantity)) return { draft, applied: false, blocked: true };",
      oracle: m => {
        const full = add(m, null, [line("tea")], 99).draft;
        const attempt = add(m, full, [line("tea"), line("cake")], 1);
        assert.equal(attempt.blocked, true);
        assert.deepEqual(attempt.draft, full);
      } },
    { name: "omit group multiplier", from: "lines.set(item.id, (lines.get(item.id) ?? 0) + item.quantity * group.quantity);",
      to: "lines.set(item.id, (lines.get(item.id) ?? 0) + item.quantity);",
      oracle: m => assert.deepEqual(add(m, null, [line("tea"), line("cake")], 3).draft.lines, [line("cake", 3), line("tea", 3)]) },
    { name: "retain removed group", from: "quantity ? [{ ...group, quantity }] : []",
      to: "quantity ? [{ ...group, quantity }] : [group]",
      oracle: m => {
        const original = add(m, add(m, null, [line("cake")], 2).draft, [line("tea")], 1).draft;
        const target = original.groups.find(group => group.items[0].id === "tea");
        const result = m.updateOrderGroupQuantity(original, target.id, 0, ids);
        assert.equal(result.applied, true);
        assert.deepEqual(result.draft.lines, [line("cake", 2)]);
      } }
  ];
  let killed = 0;
  for (const { name, from, to, oracle } of mutations) {
    await t.test(name, async () => {
      assert.doesNotThrow(() => oracle(baseline), "unmodified source must pass the same oracle");
      assert.equal(source.split(from).length, 2, "mutation anchor must occur exactly once");
      const mutatedSource = source.replace(from, to);
      assert.notEqual(mutatedSource, source);
      const mutant = await load(mutatedSource);
      assert.throws(() => oracle(mutant), { code: "ERR_ASSERTION" }, "surviving mutant or unrelated error");
      killed++;
    });
  }
  assert.equal(killed, mutations.length);
  t.diagnostic(`${killed}/${mutations.length} targeted mutants killed; not a repository-wide mutation score`);
});
