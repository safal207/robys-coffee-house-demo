import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(path.join(tmpdir(), "robys-shared-order-"));
try {
  const modules = {};
  for (const [name, source] of Object.entries({
    draft: "src/order-draft.js", shared: "src/smart-choice/shared-order.ts", domain: "src/smart-choice/cart-domain.ts"
  })) {
    const outfile = path.join(temp, `${name}.mjs`);
    await build({ entryPoints: [source], bundle: true, platform: "node", format: "esm", outfile, target: "node20" });
    modules[name] = await import(pathToFileURL(outfile).href);
  }
  const { normalizeOrderDraft, updateOrderLines, applyOrderRecommendation } = modules.draft;
  const { orderProductIds: ids, syncRecommendation, buildSharedOrderPayload, buildSharedWhatsAppMessage } = modules.shared;
  const { createInitialCart, calculateCart, deriveCartRules } = modules.domain;
  const espresso = { id: "hot-coffee:espresso", quantity: 1 };
  const filter = { id: "brew-hot:filter-coffee", quantity: 1 };
  const manual = { version: 1, lines: [espresso] };
  const cart = createInitialCart("single-brew-hot--filter-coffee");
  const quote = calculateCart(cart, "one");
  const sync = (raw, token = "selection-1") => syncRecommendation(raw, cart, quote, token);
  let count = 0;
  function check(name, fn) { fn(); count++; console.log(`PASS ${name}`); }

  const combined = sync(manual);
  check("legacy menu draft + selected coffee = 270 TRY", () => {
    assert.equal(combined.applied, true);
    assert.deepEqual(combined.draft.lines, [filter, espresso]);
    assert.equal(buildSharedOrderPayload(combined.draft).pricing.totalMinor, 27000);
  });
  check("reload / locale redraw / Back cannot duplicate the recommendation", () => {
    assert.equal(sync(combined.draft).applied, false);
    assert.deepEqual(sync(combined.draft).draft, combined.draft);
  });
  check("explicitly selecting the same recommendation replaces its own contribution", () => {
    assert.deepEqual(sync(combined.draft, "selection-2").draft.lines, combined.draft.lines);
  });
  const removed = updateOrderLines(combined.draft, [espresso], ids);
  check("deleting recommendation in menu stays deleted on returning to Smart Choice", () => {
    assert.deepEqual(sync(removed).draft.lines, [espresso]);
    assert.equal(buildSharedOrderPayload(sync(removed).draft).pricing.totalMinor, 11000);
  });
  check("explicit reselection can add the deleted recommendation again", () => {
    assert.deepEqual(sync(removed, "selection-2").draft.lines, [filter, espresso]);
  });
  check("emptying the menu remains empty on reload", () => {
    const empty = updateOrderLines(combined.draft, [], ids);
    assert.deepEqual(sync(empty).draft.lines, []);
    assert.equal(buildSharedOrderPayload(empty).pricing.totalMinor, 0);
  });
  const sameManual = sync({ version: 1, lines: [filter] }).draft;
  const latteCart = createInitialCart("single-hot-coffee--caffe-latte");
  const latteQuote = calculateCart(latteCart, "one");
  const replace = raw => syncRecommendation(raw, latteCart, latteQuote, "selection-2").draft;
  check("manual and recommended quantities of the same product are preserved separately", () => {
    assert.equal(sameManual.lines[0].quantity, 2);
    assert.deepEqual(replace(sameManual).lines, [filter, { id: "hot-coffee:caffe-latte", quantity: 1 }]);
  });
  check("increasing quantity in menu retains the added portion when recommendation changes", () => {
    const increased = updateOrderLines(sameManual, [{ ...filter, quantity: 3 }], ids);
    assert.equal(replace(increased).lines.find(line => line.id === filter.id).quantity, 2);
  });
  check("deleting a shared product clamps ownership and does not remove another manual product", () => {
    const changed = updateOrderLines(sameManual, [espresso], ids);
    assert.deepEqual(replace(changed).lines, [{ id: "hot-coffee:caffe-latte", quantity: 1 }, espresso]);
  });
  check("quantity limit blocks atomically without dropping existing products", () => {
    const full = { version: 1, lines: [{ ...filter, quantity: 99 }, espresso] };
    const result = sync(full);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.draft, normalizeOrderDraft(full, ids));
  });
  check("unknown products, corrupt quantities, stale prices and malformed storage are ignored", () => {
    for (const raw of [null, [], "oops", 42, { version: 9, lines: [espresso] }]) {
      assert.deepEqual(normalizeOrderDraft(raw, ids).lines, []);
    }
    const draft = normalizeOrderDraft({ version: 1, lines: [espresso, { id: "unknown", quantity: 1 },
      { ...filter, quantity: -1 }, { ...filter, quantity: 1.5 }, { ...filter, quantity: 100 }], total: 1 }, ids);
    assert.deepEqual(draft.lines, [espresso]);
    assert.equal(buildSharedOrderPayload(draft).pricing.totalMinor, 11000);
  });
  check("invalid recommendation cannot partially replace a valid one", () => {
    const result = applyOrderRecommendation(combined.draft, { token: "new", signature: "new",
      lines: [{ id: "unknown", quantity: 1 }, filter] }, ids);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.draft, combined.draft);
  });
  check("a differing offer price blocks instead of silently changing the quoted price", () => {
    const result = syncRecommendation(manual, cart, { ...quote, totalMinor: quote.totalMinor - 100 }, "offer");
    assert.equal(result.blocked, true);
    assert.deepEqual(result.draft.lines, [espresso]);
  });
  check("unavailable recommendations do not alter the existing order", () => {
    const result = syncRecommendation(manual, cart, { ...quote, canHandoff: false }, "unavailable");
    assert.equal(result.blocked, true);
    assert.deepEqual(result.draft.lines, [espresso]);
  });
  check("combo, substitution, upgrade and bump use menu prices without losing manual espresso", () => {
    const rules = deriveCartRules();
    let combo = createInitialCart("combo-iced-san-sebastian");
    let result = syncRecommendation(manual, combo, calculateCart(combo, "two"), "combo");
    assert.equal(buildSharedOrderPayload(result.draft).pricing.totalMinor, 48000);
    combo = { ...combo, substitutionIds: [rules.substitutions[0].id], upgradeIds: [rules.upgrades[0].id], bumpDecision: "accepted" };
    result = syncRecommendation(result.draft, combo, calculateCart(combo, "two"), "combo");
    assert.equal(result.blocked, false);
    assert.equal(buildSharedOrderPayload(result.draft).pricing.totalMinor, 69000);
    assert.equal(result.draft.lines.find(line => line.id === espresso.id).quantity, 1);
    assert.equal(result.draft.lines.find(line => line.id === "hot-coffee:caffe-latte").quantity, 2);
    assert.equal(result.draft.lines.some(line => line.id === "cold-coffee:iced-caffe-latte"), false);
  });
  check("all languages share the complete draft with truthful draft flags", () => {
    const payload = buildSharedOrderPayload(combined.draft);
    for (const language of ["tr", "en", "ru"]) {
      const message = buildSharedWhatsAppMessage(payload, language);
      assert.match(message, /270/);
      assert.equal((message.match(/• 1 × /g) ?? []).length, 2);
      assert.equal(message.includes("hot-coffee:"), false);
    }
    assert.equal(payload.handoff.submitted, false);
    assert.equal(payload.handoff.paid, false);
    assert.equal(payload.handoff.acceptedByCafe, false);
    assert.equal(payload.schemaVersion, "robys.order-draft.v1");
  });
  console.log(`Shared order: ${count}/${count} passed.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
