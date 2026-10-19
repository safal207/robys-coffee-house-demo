import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { kidsCombos, kidsComboForItems } from "../src/kids-menu.js";
import { menuCategories } from "../menu-catalog.js";
import { addOrderGroup, normalizeOrderDraft, removeOrderGroup, updateOrderGroupQuantity } from "../src/order-draft.js";
import { decodeOrderTicket, encodeOrderTicket, getOrCreateOrderTicket, quoteOrderTicket, validateTicketDraft } from "../src/order-ticket.js";

// Load the real shared TypeScript catalog in memory; no generated files or HTTP.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/smart-choice/shared-order.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", target: "node20", write: false
});
const { orderProducts, orderProductIds, buildSharedOrderPayload } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);

const expected = new Map([
  ["kids-mini", { totalMinor: 16000, ids: ["brew-hot:milk", "desserts:cookie"] }],
  ["kids-big", { totalMinor: 33000, ids: ["brew-hot:milk", "food:three-cheese-croissant", "desserts:cookie"] }]
]);
const line = (id, quantity = 1) => ({ id, quantity });
const totalFor = items => items.reduce((sum, item) => sum + orderProducts.get(item.id).unitPriceMinor * item.quantity, 0);
const quantities = draft => new Map(draft.lines.map(item => [item.id, item.quantity]));
const sentinel = addOrderGroup(null, [line("hot-coffee:espresso")], 2, orderProductIds).draft;
const combo = id => kidsCombos.find(item => item.id === id);
const mini = combo("kids-mini");
const big = combo("kids-big");

test("children's sets contain only existing regular products at their canonical summed prices", () => {
  assert.deepEqual(kidsCombos.map(item => item.id).sort(), [...expected.keys()].sort());
  const publicItems = menuCategories.flatMap(category => category.items ?? category.groups.flatMap(group => group.items));
  assert.equal(orderProducts.size, publicItems.length, "curated choices must not create extra orderable SKUs");
  for (const set of kidsCombos) {
    assert.equal(orderProductIds.has(set.id), false, `${set.id} is a collection, not a SKU`);
    assert.equal([...orderProductIds].some(id => id.startsWith(`${set.id}:`) || id.startsWith("kids-menu:")), false);
    assert.equal(Object.hasOwn(set, "price"), false, "the current menu supplies all prices");
    assert.equal(Object.hasOwn(set, "priceMinor"), false);
    assert.deepEqual(set.items.map(item => item.id), expected.get(set.id).ids);
    assert.equal(new Set(set.items.map(item => item.id)).size, set.items.length);
    for (const item of set.items) {
      const product = orderProducts.get(item.id);
      assert.ok(product, `unknown component ${item.id}`);
      assert.equal(item.quantity, 1, "each component is one regular menu portion");
      assert.equal(product.item.variants?.length ?? 0, 0, "a preset cannot omit a required flavour choice");
      for (const language of ["tr", "en", "ru"]) assert.ok(set.name[language]?.trim());
    }
    assert.equal(totalFor(set.items), expected.get(set.id).totalMinor);
    assert.throws(() => validateTicketDraft({ version: 1, groups: [{ quantity: 1, items: [line(set.id)] }] }),
      error => error.code === "unknown-product", "checkout must reject a collection ID used as a SKU");
  }
});

test("each set adds atomically, repeated adds merge, and +/- and removal preserve unrelated products", () => {
  for (const set of kidsCombos) {
    const snapshot = structuredClone(sentinel);
    const first = addOrderGroup(sentinel, set.items, 1, orderProductIds);
    assert.equal(first.applied, true, set.id);
    assert.deepEqual(sentinel, snapshot, "adding cannot mutate the previous basket");
    assert.equal(first.draft.groups.length, 2);
    const repeat = addOrderGroup(first.draft, [...set.items].reverse(), 1, orderProductIds);
    assert.equal(repeat.applied, true);
    assert.equal(repeat.draft.groups.length, 2, "repeating the same composition merges its group");
    const group = repeat.draft.groups.find(entry => entry.items.length === set.items.length);
    assert.equal(group.quantity, 2);
    assert.deepEqual(group.items, set.items, "reordered additions retain the original display order");
    const increased = updateOrderGroupQuantity(repeat.draft, group.id, 3, orderProductIds);
    assert.equal(increased.applied, true);
    for (const item of set.items) assert.equal(quantities(increased.draft).get(item.id), 3);
    assert.equal(buildSharedOrderPayload(increased.draft).pricing.totalMinor,
      totalFor(sentinel.groups[0].items) * 2 + expected.get(set.id).totalMinor * 3);
    const decreased = updateOrderGroupQuantity(increased.draft, group.id, 1, orderProductIds);
    assert.equal(decreased.applied, true);
    for (const item of set.items) assert.equal(quantities(decreased.draft).get(item.id), 1);
    assert.deepEqual(removeOrderGroup(decreased.draft, group.id, orderProductIds), sentinel);
    assert.deepEqual(normalizeOrderDraft(JSON.parse(JSON.stringify(repeat.draft)), orderProductIds), repeat.draft,
      "a reload keeps the full composition and quantity");
  }
});

test("Mini and Big stay independent while their shared products enforce the aggregate cap of 99", () => {
  let draft = addOrderGroup(sentinel, mini.items, 49, orderProductIds).draft;
  draft = addOrderGroup(draft, big.items, 50, orderProductIds).draft;
  assert.equal(draft.groups.length, 3);
  assert.equal(quantities(draft).get("brew-hot:milk"), 99);
  assert.equal(quantities(draft).get("desserts:cookie"), 99);
  assert.equal(quantities(draft).get("food:three-cheese-croissant"), 50);
  const bigGroup = draft.groups.find(group => group.items.length === 3);
  for (const result of [
    addOrderGroup(draft, mini.items, 1, orderProductIds),
    addOrderGroup(draft, big.items, 1, orderProductIds),
    updateOrderGroupQuantity(draft, bigGroup.id, 51, orderProductIds)
  ]) {
    assert.equal(result.applied, false);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.draft, draft, "overflow must not add a companion or lose an existing group");
  }
  const withoutBig = removeOrderGroup(draft, bigGroup.id, orderProductIds);
  assert.equal(quantities(withoutBig).get("brew-hot:milk"), 49);
  assert.equal(quantities(withoutBig).get("desserts:cookie"), 49);
  assert.equal(quantities(withoutBig).has("food:three-cheese-croissant"), false);
  assert.equal(addOrderGroup(withoutBig, big.items, 50, orderProductIds).applied, true);
  for (const set of kidsCombos) {
    const atLimit = addOrderGroup(null, set.items, 99, orderProductIds);
    assert.equal(atLimit.applied, true);
    assert.equal(validateTicketDraft(atLimit.draft)[0].quantity, 99);
    assert.deepEqual(addOrderGroup(atLimit.draft, set.items, 1, orderProductIds).draft, atLimit.draft);
  }
});

test("invalid component IDs or quantities reject the entire set without changing the basket", () => {
  for (const items of [
    [...big.items, line("kids-menu:invented-item")],
    big.items.map((item, index) => index === 1 ? { ...item, quantity: 0 } : item),
    big.items.map((item, index) => index === 1 ? { ...item, quantity: 0.5 } : item)
  ]) {
    const result = addOrderGroup(sentinel, items, 1, orderProductIds);
    assert.equal(result.applied, false);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.draft, sentinel);
  }
});

test("set labels are derived only from the exact component composition", () => {
  for (const set of kidsCombos) {
    assert.equal(kidsComboForItems([...set.items].reverse())?.id, set.id);
    assert.equal(kidsComboForItems(set.items.map(({ id }) => ({ id })))?.id, set.id);
    assert.equal(kidsComboForItems(set.items.map((item, index) => index ? item : { ...item, quantity: 2 })), undefined);
    assert.equal(kidsComboForItems(set.items.map((item, index) => index ? item : { ...item, variant: "invented" })), undefined);
  }
  assert.equal(kidsComboForItems([]), undefined);
  assert.equal(kidsComboForItems([line("brew-hot:milk")]), undefined);
});

test("both sets retain canonical composition, names and prices through QR in all three languages", () => {
  const drafts = kidsCombos.flatMap(set => [1, 2, 99].map(quantity => ({
    label: `${set.id} x${quantity}`, draft: addOrderGroup(null, set.items, quantity, orderProductIds).draft,
    totalMinor: expected.get(set.id).totalMinor * quantity
  })));
  const combined = addOrderGroup(addOrderGroup(sentinel, mini.items, 2, orderProductIds).draft, big.items, 3, orderProductIds).draft;
  drafts.push({ label: "both sets and a separate product", draft: combined,
    totalMinor: 2 * 16000 + 3 * 33000 + orderProducts.get("hot-coffee:espresso").unitPriceMinor * 2 });
  for (const { label, draft, totalMinor } of drafts) {
    const ticket = getOrCreateOrderTicket(draft, { now: Date.UTC(2026, 9, 17, 12) });
    assert.deepEqual(ticket.groups, validateTicketDraft(draft), label);
    assert.equal(buildSharedOrderPayload(draft).pricing.totalMinor, totalMinor, label);
    for (const language of ["tr", "en", "ru"]) {
      const restored = decodeOrderTicket(encodeOrderTicket(ticket, language));
      assert.equal(restored.language, language, label);
      assert.deepEqual(restored.ticket, ticket, label);
      const quote = quoteOrderTicket(restored.ticket, language);
      assert.equal(quote.totalMinor, totalMinor, label);
      for (const group of quote.groups) for (const item of group.items) {
        const canonical = orderProducts.get(item.id);
        assert.ok(canonical, label);
        assert.equal(item.name, canonical.name[language], label);
        assert.equal(item.unitPriceMinor, canonical.unitPriceMinor, label);
        assert.equal(item.variantName, "", label);
      }
    }
  }
});
