import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  stdin: { contents: `export * from './src/smart-choice/helpful-options.ts';
    export { SMART_CHOICE_CATALOG } from './src/smart-choice/catalog.ts';
    export { orderProducts } from './src/smart-choice/shared-order.ts';`, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", target: "node20", write: false, legalComments: "none"
});
const { findHelpfulOptions, SMART_CHOICE_CATALOG, orderProducts } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const base = { intent: "coffee", temperature: "hot", taste: "sweet", partySize: "two",
  budget: { maxMinor: 25_000 }, locale: "ru" };

let requests = 0;
let checkedOptions = 0;
for (const intent of ["coffee", "breakfast", "snack", "dessert", "refresh"])
for (const temperature of ["hot", "cold", "any"])
for (const taste of ["sweet", "neutral", "any"])
for (const locale of ["tr", "en", "ru"])
for (const budget of [{ maxMinor: 25_000 }, { minMinor: 25_001, maxMinor: 40_000 },
  { minMinor: 40_001, maxMinor: 60_000 }, { maxMinor: 60_000 }])
for (const quantity of [1, 2, 3, 4, 5, 6]) {
  const partySize = quantity === 1 ? "one" : quantity === 2 ? "two" : "family";
  const input = { intent, temperature, taste, partySize, budget, locale };
  const before = JSON.stringify(input);
  const options = findHelpfulOptions(input, partySize === "family" ? quantity : undefined);
  requests += 1;
  assert.ok(options.length > 0 && options.length <= 3, `${before}: must offer actual menu options`);
  assert.equal(new Set(options.map(option => option.productId)).size, options.length, "No duplicated alternatives");
  assert.equal(JSON.stringify(input), before, "Guest answers must not be silently rewritten");
  assert.deepEqual(findHelpfulOptions(input, quantity), options, "Same input must produce the same choices");
  for (const option of options) {
    checkedOptions += 1;
    const source = orderProducts.get(option.productId);
    assert.ok(source, "Every alternative must open an existing menu product");
    assert.notEqual(source.categoryId, "pairing-offers", "Quantity describes individual items, not a relabeled offer");
    assert.equal(option.quantity, quantity, "Never silently reduce the guest count to meet a budget");
    assert.equal(option.unitPriceMinor, source.unitPriceMinor);
    assert.equal(option.totalPriceMinor, source.unitPriceMinor * quantity, "Price must include every guest's item");
    assert.equal(option.overBudgetMinor, Math.max(0, option.totalPriceMinor - budget.maxMinor));
    assert.equal(option.differences.includes("budget"), option.totalPriceMinor > budget.maxMinor);
    assert.equal(option.differences.includes("temperature"), temperature !== "any" && temperature !== option.temperature);
    assert.equal(option.differences.includes("taste"), taste !== "any" && taste !== option.taste);
    assert.equal(option.differences.includes("intent"), !option.intents.includes(intent));
    assert.deepEqual(option.name, source.name);
    assert.equal(option.image, source.image);
  }
  const sameIntent = options.filter(option => !option.differences.includes("intent"));
  assert.ok(sameIntent.length, `${before}: requested kind must remain visible`);
  assert.ok(!options[0].differences.includes("intent"), "An unrelated cheap product must not displace the requested kind");
}

const coffee = findHelpfulOptions(base);
assert.ok(coffee[0].totalPriceMinor <= base.budget.maxMinor, "Two affordable real coffees should be offered");
assert.ok(coffee[0].differences.includes("taste"), "The neutral coffee tradeoff must be disclosed");
assert.ok(coffee.some(option => option.taste === "sweet" && option.differences.includes("budget")),
  "Also show the requested sweet coffee with the full above-budget price");
assert.ok(coffee.every(option => !option.intents.includes("coffee") || !/tea|milkshake/.test(option.productId)),
  "Tea and milkshake must never be presented as coffee");

const familyCoffee = findHelpfulOptions({ ...base, partySize: "family" }, 4);
assert.ok(familyCoffee.some(option => option.taste === "sweet" && option.temperature === "hot" &&
  option.intents.includes("coffee") && option.totalPriceMinor === 80_000), "Keep the requested sweet coffees visible");
assert.ok(familyCoffee.some(option => option.productId === "brew-hot:black-tea" && option.totalPriceMinor === 20_000),
  "Keep the affordable four-person drink alternative visible with its tradeoffs");
assert.ok(familyCoffee.some(option => option.productId === "brew-hot:turkish-coffee" &&
  option.totalPriceMinor === 36_000 && option.overBudgetMinor === 11_000 &&
  option.differences.includes("taste") && !option.differences.includes("intent") &&
  !option.differences.includes("temperature")),
"Use the third slot for cheaper hot coffee instead of another equally expensive flavour");

const tea = findHelpfulOptions({ ...base, intent: "breakfast", taste: "neutral" });
assert.ok(tea.some(option => option.productId === "brew-hot:black-tea" && option.totalPriceMinor === 10_000),
  "Use the full public menu, including two black teas for 100 TRY");
const refresh = findHelpfulOptions({ ...base, intent: "refresh", partySize: "one" });
assert.ok(refresh.some(option => option.intents.includes("refresh") && option.temperature === "cold" &&
  option.differences.includes("temperature")), "Contradictory hot refresh preferences need a labeled concrete alternative");
const neutralHotRefresh = findHelpfulOptions({ ...base, intent: "refresh", partySize: "one", taste: "neutral" });
assert.ok(neutralHotRefresh.some(option => option.intents.includes("refresh") && option.temperature === "cold" &&
  option.differences.includes("temperature")), "Keep the refreshing choice and disclose its temperature difference");
assert.ok(neutralHotRefresh.some(option => option.productId === "brew-hot:black-tea" &&
  option.temperature === "hot" && option.taste === "neutral" && option.totalPriceMinor === 5_000 &&
  option.differences.includes("intent") && !option.differences.includes("temperature") &&
  !option.differences.includes("taste") && !option.differences.includes("budget")),
  "Also offer a hot drink that preserves temperature and taste, clearly disclosing the changed intent");
const lowBudget = findHelpfulOptions({ ...base, budget: { maxMinor: 1 } });
assert.ok(lowBudget.length && lowBudget.every(option => option.overBudgetMinor > 0 && option.differences.includes("budget")),
  "An impossible budget must expose actual prices, never invent an affordable item");

for (const invalid of [null, {}, { ...base, intent: "tea" }, { ...base, temperature: "warm" },
  { ...base, locale: "de" }, { ...base, taste: "unknown" }, { ...base, partySize: "zero" },
  { ...base, budget: { maxMinor: NaN } }, { ...base, budget: { maxMinor: 0 } },
  { ...base, budget: { maxMinor: 250.5 } }, { ...base, budget: { minMinor: 300, maxMinor: 250 } },
  { ...base, timeOfDay: "tomorrow" }, { ...base, activeExclusions: [""] }]) {
  assert.deepEqual(findHelpfulOptions(invalid), [], "Invalid input must not create an order suggestion");
}
for (const count of [undefined, null, 0, 1, 2, 3.5, 7, NaN, Infinity, "3"]) {
  assert.deepEqual(findHelpfulOptions({ ...base, partySize: "family" }, count), [],
    "Family must have an explicit supported integer guest count");
}

// Exercise both reviewed-catalog and public-menu blocks, including entries
// outside the old sixteen-item subset. Restore the shared fixture afterwards.
const blockedIds = new Set();
const originalReviewed = SMART_CHOICE_CATALOG.items.map(item => ({ item, availability: item.availability, sourceStatus: item.sourceStatus }));
const originalSource = [];
for (const { item } of originalReviewed) {
  item.availability = "unavailable";
  blockedIds.add([...orderProducts.values()].find(product => product.sourceId === item.sourceId)?.id);
}
const blackTea = orderProducts.get("brew-hot:black-tea");
originalSource.push({ item: blackTea.item, availability: blackTea.item.availability, sourceStatus: blackTea.item.sourceStatus });
blackTea.item.sourceStatus = "provisional";
blockedIds.add(blackTea.id);
for (const intent of ["coffee", "breakfast", "snack", "dessert", "refresh"]) {
  const available = findHelpfulOptions({ ...base, intent });
  assert.ok(available.length, "Other confirmed public-menu products remain available");
  assert.ok(available.every(option => !blockedIds.has(option.productId)), "Never relax an availability/source block");
}
for (const product of orderProducts.values()) {
  if (product === blackTea) continue;
  originalSource.push({ item: product.item, availability: product.item.availability, sourceStatus: product.item.sourceStatus });
  product.item.availability = "unavailable";
}
assert.deepEqual(findHelpfulOptions(base), [], "Do not invent choices when every actual product is unavailable");
for (const { item, availability, sourceStatus } of originalReviewed) Object.assign(item, { availability, sourceStatus });
for (const { item, availability, sourceStatus } of originalSource) {
  if (availability === undefined) delete item.availability; else item.availability = availability;
  if (sourceStatus === undefined) delete item.sourceStatus; else item.sourceStatus = sourceStatus;
}

console.log(`✅ SMART-CHOICE-HELPFUL-OPTIONS passed: ${requests} questionnaire inputs, ${checkedOptions} actual-priced options, explicit tradeoffs, guest counts and availability blocks.`);
