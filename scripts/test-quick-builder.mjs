import assert from "node:assert/strict";
import { build } from "esbuild";
import { menuCategories } from "../menu-catalog.js";
import { existsSync, readFileSync } from "node:fs";
import { decodeOrderTicket, encodeOrderTicket, getOrCreateOrderTicket, quoteOrderTicket, validateTicketDraft } from "../src/order-ticket.js";

async function load(source) {
  const result = await build({ entryPoints: [source], bundle: true, platform: "node", format: "esm", target: "node20", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const domain = await load("src/smart-choice/quick-builder-domain.ts");
const shared = await load("src/smart-choice/shared-order.ts");
const draft = await load("src/order-draft.js");
const expectedItems = menuCategories.flatMap(category => category.items ?? category.groups.flatMap(group => group.items));
assert.equal(domain.quickProducts.length, expectedItems.length, "Quick builder must expose the complete live catalog");
assert.equal(new Set(domain.quickProducts.map(product => product.id)).size, expectedItems.length);

const tea = domain.quickProducts.find(product => product.id === "brew-hot:black-tea");
assert(tea);
for (const query of ["чай", "чай черный", "black tea", "siyah cay", "ÇAY"]) {
  assert(domain.matchesQuickProduct(tea, query), `Tea should be searchable in all languages: ${query}`);
}
assert.equal(domain.matchesQuickProduct(tea, "", "cold-coffee"), false);
assert.equal(domain.matchesQuickProduct(tea, "americano"), false);

const flavoured = domain.quickProducts.find(product => product.id === "cold-coffee:flavoured-iced-caffe-latte");
const variants = domain.variantsFor(flavoured);
assert(variants.length > 1, "Flavoured products need explicit choices");
const variant = variants[0];
assert(domain.matchesQuickProduct(flavoured, variant.name.ru));

const ids = shared.orderProductIds;
for (const [id, count] of [["hot-coffee:cappuccino", 2], ["hot-coffee:caffe-latte", 6], ["cold-coffee:iced-caffe-latte", 6]]) {
  const choices = domain.drinkChoicesFor(shared.orderProducts.get(id));
  assert.equal(choices.length, count, `Canonical drink choices: ${id}`);
  assert.equal(domain.drinkChoiceLabel(choices[0], "ru"), "Классический", "The plain drink button uses a compact label");
  for (const choice of choices) {
    assert(!domain.drinkChoiceLabel(choice, "ru").includes("латте"), "Family labels avoid repeating the full drink name on mobile");
    assert.deepEqual(domain.drinkChoicesFor(choice.product), choices, "Every member must expose the same menu family");
    const items = [{ id: choice.product.id, quantity: 1, ...(choice.variant ? { variant: choice.variant.id } : {}) }, { id: "desserts:macaron", quantity: 1 }];
    const selection = draft.addOrderGroup(null, items, 2, ids).draft;
    assert.equal(domain.needsOrderVariant(selection.groups), false);
    const ticket = getOrCreateOrderTicket(selection);
    const restored = decodeOrderTicket(encodeOrderTicket(ticket, "ru"));
    assert.deepEqual(restored.ticket, ticket, "Drink family choices preserve canonical IDs and flavours in QR");
    assert.equal(quoteOrderTicket(restored.ticket, "ru").totalMinor,
      (choice.product.item.price + shared.orderProducts.get("desserts:macaron").item.price) * 200,
      "Family choices use full catalog prices instead of invented syrup surcharges");
  }
}
assert.deepEqual(domain.drinkChoicesFor(shared.orderProducts.get("hot-coffee:americano")), [], "Drink families must not invent generic add-ons for other drinks");
const pairItems = [{ id: tea.id, quantity: 1 }, { id: "desserts:macaron", quantity: 1 }];
let result = draft.addOrderGroup(null, pairItems, 2, ids);
assert(result.applied);
assert.equal(result.draft.groups.length, 1, "One pair must remain one editable group");
let pair = result.draft.groups[0];
assert.equal(domain.orderGroupTotal(pair), (tea.unitPriceMinor + shared.orderProducts.get("desserts:macaron").unitPriceMinor) * 2);
assert.equal(domain.orderGroupName(pair, "ru"), "Чёрный чай + Макарон");
result = draft.updateOrderGroupQuantity(result.draft, pair.id, 3, ids);
pair = result.draft.groups[0];
assert.deepEqual(result.draft.lines.map(line => line.quantity), [3, 3], "Quantity edits must update both members");
assert.equal(domain.orderGroupTotal(pair), 24000);

// A second tab can change storage before its queued storage event redraws this tab.
const renderedOne = draft.addOrderGroup(null, pairItems, 1, ids).draft;
const renderedId = renderedOne.groups[0].id;
const latestTwo = draft.updateOrderGroupQuantity(renderedOne, renderedId, 2, ids).draft;
const afterStalePlus = domain.stepQuickGroupQuantity(latestTwo, renderedId, 1);
assert(afterStalePlus.applied);
assert.equal(afterStalePlus.draft.groups[0].quantity, 3, "Stale + must increment latest two pairs to three");
assert(afterStalePlus.draft.lines.every(line => line.quantity === 3), "The relative step must update every pair component");
const latestOne = draft.updateOrderGroupQuantity(latestTwo, renderedId, 1, ids).draft;
const afterStaleMinus = domain.stepQuickGroupQuantity(latestOne, renderedId, -1);
assert.equal(afterStaleMinus.applied, false);
assert.deepEqual(afterStaleMinus.draft, latestOne, "Stale − at the latest minimum must not remove the group");
const deletedElsewhere = draft.removeOrderGroup(latestTwo, renderedId, ids);
const afterRemovedPlus = domain.stepQuickGroupQuantity(deletedElsewhere, renderedId, 1);
assert.equal(afterRemovedPlus.applied, false);
assert.deepEqual(afterRemovedPlus.draft, deletedElsewhere, "A stale step must never resurrect a removed group");
const latestMax = draft.updateOrderGroupQuantity(latestTwo, renderedId, 99, ids).draft;
const afterStaleMax = domain.stepQuickGroupQuantity(latestMax, renderedId, 1);
assert.equal(afterStaleMax.applied, false);
assert.deepEqual(afterStaleMax.draft, latestMax, "A stale step must respect the latest maximum atomically");
const originalSingle = draft.addOrderGroup(null, [pairItems[0]], 2, ids).draft;
const originalGroup = originalSingle.groups[0];
const replaced = domain.replaceQuickGroup(originalSingle, originalGroup, pairItems, 2);
assert(replaced.applied);
assert.equal(replaced.draft.groups.length, 1);
assert.deepEqual(replaced.draft.lines.map(line => line.quantity), [2, 2], "Editing a drink into a pair preserves quantities without duplicating the drink");
const unrelatedLatest = draft.addOrderGroup(originalSingle, [{ id: "hot-coffee:americano", quantity: 1 }], 3, ids).draft;
const preservingUnrelated = domain.replaceQuickGroup(unrelatedLatest, originalGroup, pairItems, 2);
assert(preservingUnrelated.applied);
assert.equal(preservingUnrelated.draft.lines.find(line => line.id === "hot-coffee:americano").quantity, 3, "Editing uses the latest unrelated basket contents");
const dessertAtLimit = draft.addOrderGroup(originalSingle, [pairItems[1]], 99, ids).draft;
const rejectedReplacement = domain.replaceQuickGroup(dessertAtLimit, originalGroup, pairItems, 2);
assert.equal(rejectedReplacement.applied, false);
assert.deepEqual(rejectedReplacement.draft, dessertAtLimit, "A failed replacement must retain the original drink atomically");
const removedOriginal = draft.removeOrderGroup(originalSingle, originalGroup.id, ids);
assert.deepEqual(domain.replaceQuickGroup(removedOriginal, originalGroup, pairItems, 2).draft, removedOriginal, "A stale editor cannot resurrect a removed selection");
const changedOriginal = draft.updateOrderGroupQuantity(originalSingle, originalGroup.id, 3, ids).draft;
assert.equal(domain.replaceQuickGroup(changedOriginal, originalGroup, pairItems, 2).applied, false, "A stale editor cannot overwrite the latest quantity");
const recommendationSelection = { token: "editable-pair", signature: "first", lines: pairItems.map(({ id, quantity }) => ({ id, quantity })) };
const ownedPair = draft.applyOrderRecommendation(null, recommendationSelection, ids).draft;
const ownedGroup = ownedPair.groups[0];
assert.deepEqual(domain.replaceQuickGroup(ownedPair, ownedGroup, pairItems, 1).draft, ownedPair,
  "Saving an unchanged recommendation must preserve its source and metadata");
const changedOwnedQuantity = domain.replaceQuickGroup(ownedPair, ownedGroup, pairItems, 2).draft;
assert.equal(changedOwnedQuantity.groups[0].source, "recommendation");
assert.equal(changedOwnedQuantity.groups[0].quantity, 2);
assert.equal(changedOwnedQuantity.recommendation.removed, undefined);
const ownedDrinkOnly = domain.replaceQuickGroup(ownedPair, ownedGroup, [pairItems[0]], 1).draft;
assert.equal(ownedDrinkOnly.groups[0].source, "recommendation");
assert.deepEqual(ownedDrinkOnly.recommendation.removedLines, [{ id: "desserts:macaron", quantity: 1 }]);
const changedAdvisorOption = draft.applyOrderRecommendation(ownedDrinkOnly, { ...recommendationSelection, signature: "changed-drink",
  lines: [{ id: "hot-coffee:americano", quantity: 1 }, pairItems[1]] }, ids).draft;
assert.equal(changedAdvisorOption.groups[0].items[0].id, "hot-coffee:americano", "Editing a recommendation must not disable later advisor options");
assert(!changedAdvisorOption.lines.some(line => line.id === "desserts:macaron"), "Changing an advisor option must not re-add a dessert explicitly removed in the editor");
const explicitlyRestored = domain.replaceQuickGroup(ownedDrinkOnly, ownedDrinkOnly.groups[0], pairItems, 1).draft;
assert.deepEqual(explicitlyRestored.recommendation.removedLines, [], "Explicitly adding a dessert back must clear its removal marker");
assert(draft.applyOrderRecommendation(explicitlyRestored, { ...recommendationSelection, signature: "after-restore" }, ids).draft.lines.some(line => line.id === "desserts:macaron"),
  "A later advisor update must preserve an explicitly restored dessert");
const builderSource = readFileSync("src/smart-choice/quick-builder.ts", "utf8");
assert(builderSource.includes("stepQuickGroupQuantity(readDraft(), group.id, delta)"), "The UI must apply the step to freshly read storage");
assert(!builderSource.includes("updateOrderGroupQuantity(readDraft(), group.id, next"), "The UI must not write the stale rendered absolute quantity");

result = draft.addOrderGroup(result.draft, [{ id: flavoured.id, variant: variant.id, quantity: 1 }], 1, ids);
const flavourGroup = result.draft.groups.find(group => group.items[0].variant === variant.id);
assert(domain.orderGroupName(flavourGroup, "ru").includes(variant.name.ru));
const payload = shared.buildSharedOrderPayload(result.draft);
const message = shared.buildSharedWhatsAppMessage(payload, "ru");
assert(message.includes("3 × Чёрный чай + Макарон"));
assert(message.includes(variant.name.ru), "A flavour must survive the shared order export");
const removed = draft.removeOrderGroup(result.draft, pair.id, ids);
assert.equal(removed.groups.length, 1);
assert.equal(removed.groups[0].items[0].variant, variant.id, "Removing a pair must preserve a separate flavored drink");

assert.equal(domain.needsOrderVariant([]), false, "Empty orders have no unresolved flavours");
const legacyPair = draft.addOrderGroup(null, [{ id: flavoured.id, quantity: 1 }, pairItems[1]], 2, ids).draft;
assert(domain.needsOrderVariant(legacyPair.groups), "Legacy drinks without flavours must be actionable before checkout");
const editedPair = domain.updateQuickGroupVariant(legacyPair, legacyPair.groups[0].id, 0, variant.id);
assert.equal(domain.needsOrderVariant(editedPair.groups), false);
assert.equal(editedPair.groups.length, 1);
assert.equal(editedPair.groups[0].quantity, 2);
assert.deepEqual(editedPair.lines, legacyPair.lines, "Flavour edits must preserve item quantities and the accompanying dessert");
assert.equal(domain.orderGroupTotal(editedPair.groups[0]), domain.orderGroupTotal(legacyPair.groups[0]));
assert.deepEqual(domain.updateQuickGroupVariant(legacyPair, legacyPair.groups[0].id, 0, "unknown"), legacyPair, "Invalid flavours must not change the basket");
assert.deepEqual(domain.updateQuickGroupVariant(legacyPair, "removed-group", 0, variant.id), legacyPair, "A stale control must not modify another group");

const recommended = draft.applyOrderRecommendation(null, { token: "flavour-recommendation", signature: "original",
  lines: [{ id: flavoured.id, quantity: 2 }, { id: "desserts:macaron", quantity: 2 }] }, ids).draft;
const recommendationIndex = recommended.groups[0].items.findIndex(item => item.id === flavoured.id);
const editedRecommendation = domain.updateQuickGroupVariant(recommended, "recommendation", recommendationIndex, variant.id);
assert.equal(editedRecommendation.groups[0].source, "recommendation");
assert.deepEqual(editedRecommendation.recommendation, recommended.recommendation, "Choosing a flavour must preserve recommendation ownership");
assert.equal(domain.needsOrderVariant(editedRecommendation.groups), false);

const twoFlavours = draft.addOrderGroup(null, [{ id: flavoured.id, variant: variants[0].id, quantity: 1 },
  { id: flavoured.id, variant: variants[1].id, quantity: 1 }], 1, ids).draft;
const sameFlavour = domain.updateQuickGroupVariant(twoFlavours, twoFlavours.groups[0].id, 1, variants[0].id);
assert.equal(sameFlavour.groups[0].items.length, 1, "Matching flavour edits should merge duplicate components");
assert.equal(sameFlavour.groups[0].items[0].quantity, 2, "Merging flavours must preserve both drinks");

const hotMocha = domain.quickProducts.find(product => product.id === "hot-coffee:white-chocolate-mocha");
const coldMocha = domain.quickProducts.find(product => product.id === "cold-coffee:white-chocolate-mocha");
assert(hotMocha && coldMocha, "Stable mocha IDs must remain available");
assert.notEqual(hotMocha.sourceId, coldMocha.sourceId);
for (const language of ["tr", "en", "ru"]) assert.notEqual(hotMocha.name[language], coldMocha.name[language]);
assert.equal(hotMocha.image, "src/products/menu-v1/hot-coffee--white-chocolate-mocha.webp");
assert.equal(coldMocha.image, "src/products/menu-v1/cold-coffee--white-chocolate-mocha.webp");

// Enumerate the same choices exposed by the composer. The independent oracle is
// the source menu price; compare it at the builder, shared basket, and cashier.
const recipes = [];
for (const product of domain.quickProducts) {
  assert(existsSync(product.image), `Missing actual product photo: ${product.id}`);
  for (const language of ["tr", "en", "ru"]) {
    assert(product.name[language]?.trim(), `Missing ${language} product name: ${product.id}`);
    assert(domain.matchesQuickProduct(product, product.name[language]), `Cannot find ${language} product name: ${product.id}`);
  }
  const choices = domain.variantsFor(product);
  for (const variant of choices.length ? choices : [null]) {
    const main = { id: product.id, quantity: 1, ...(variant ? { variant: variant.id } : {}) };
    recipes.push({ items: [main], priceMinor: product.item.price * 100 });
    if (domain.drinkCategories.has(product.categoryId)) for (const dessert of domain.sweetProducts) {
      recipes.push({ items: [main, { id: dessert.id, quantity: 1 }], priceMinor: (product.item.price + dessert.item.price) * 100 });
    }
  }
}

// Independently enumerate from the source catalog, rather than accepting a
// missing product, flavour, or dessert in the builder's own helper lists.
const sourceSlug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sourceProducts = menuCategories.flatMap(category =>
  (category.items ?? category.groups.flatMap(group => group.items)).map(item => ({
    ...item, categoryId: category.id, id: `${category.id}:${item.id ?? sourceSlug(item.name.en)}`
  })));
const sourceDrinkCategories = new Set(["hot-coffee", "brew-hot", "cold-coffee", "refreshers", "herbal-tea"]);
const sourceDesserts = sourceProducts.filter(product =>
  product.categoryId === "desserts" && product.id !== "desserts:savoury-cookie" || product.id === "food:nutella-croissant");
const recipeKey = items => JSON.stringify(items.map(item => [item.id, item.variant ?? ""]).sort());
const sourceRecipes = sourceProducts.flatMap(product => (product.variants?.length ? product.variants : [null]).flatMap(variant => {
  const main = { id: product.id, ...(variant ? { variant: variant.id } : {}) };
  return [[main], ...(sourceDrinkCategories.has(product.categoryId) ? sourceDesserts.map(dessert => [main, { id: dessert.id }]) : [])];
}));
assert.deepEqual(recipes.map(recipe => recipeKey(recipe.items)).sort(), sourceRecipes.map(recipeKey).sort(),
  "Every source product, flavour and permitted drink/dessert combination must be covered exactly once");

let quantityCases = 0;
let qrRoundTrips = 0;
for (const recipe of recipes) {
  let maxDraft;
  for (let quantity = 1; quantity <= 99; quantity++) {
    const added = draft.addOrderGroup(null, recipe.items, quantity, ids);
    const context = `${recipe.items.map(item => `${item.id}/${item.variant ?? ""}`).join(" + ")} × ${quantity}`;
    assert(added.applied && !added.blocked, context);
    assert.equal(added.draft.groups.length, 1, context);
    assert.equal(added.draft.groups[0].quantity, quantity, context);
    assert.equal(domain.needsOrderVariant(added.draft.groups), false, context);
    const expected = recipe.priceMinor * quantity;
    assert.equal(domain.orderGroupTotal(added.draft.groups[0]), expected, `Builder: ${context}`);
    assert.equal(shared.buildSharedOrderPayload(added.draft).pricing.totalMinor, expected, `Shared cart: ${context}`);
    const normalized = draft.normalizeOrderDraft(JSON.parse(JSON.stringify(added.draft)), ids);
    assert.deepEqual(normalized, added.draft, `Reload: ${context}`);
    const ticketGroups = validateTicketDraft(normalized);
    assert.equal(quoteOrderTicket({ groups: ticketGroups }, "ru").totalMinor, expected, `Cashier: ${context}`);
    if (quantity === 1 || quantity === 99) {
      const ticket = getOrCreateOrderTicket(normalized);
      for (const language of ["tr", "en", "ru"]) {
        const restored = decodeOrderTicket(encodeOrderTicket(ticket, language));
        assert.deepEqual(restored.ticket, ticket, `QR composition: ${context}/${language}`);
        assert.equal(restored.language, language);
        const quote = quoteOrderTicket(restored.ticket, language);
        assert.equal(quote.totalMinor, expected, `QR price: ${context}/${language}`);
        for (const item of quote.groups[0].items) {
          const product = shared.orderProducts.get(item.id);
          assert.equal(item.name, product.name[language]);
          assert.equal(item.variantName, domain.variantsFor(product).find(entry => entry.id === item.variant)?.name[language] ?? "");
        }
        qrRoundTrips++;
      }
    }
    if (quantity === 99) maxDraft = added.draft;
    quantityCases++;
  }
  const group = maxDraft.groups[0];
  for (const invalid of [-1, 0, 100, 1.5, NaN, Infinity, null, "2"]) {
    const rejected = draft.addOrderGroup(maxDraft, recipe.items, invalid, ids);
    assert(rejected.blocked && !rejected.applied);
    assert.deepEqual(rejected.draft, maxDraft, "A rejected add must leave the entire basket untouched");
  }
  const overflow = draft.addOrderGroup(maxDraft, recipe.items, 1, ids);
  assert(overflow.blocked && !overflow.applied);
  assert.deepEqual(overflow.draft, maxDraft, "The 100th unit must not partly add a pair");
  const invalidEdit = draft.updateOrderGroupQuantity(maxDraft, group.id, 100, ids);
  assert(invalidEdit.blocked && !invalidEdit.applied);
  assert.deepEqual(invalidEdit.draft, maxDraft);
  const decreased = draft.updateOrderGroupQuantity(maxDraft, group.id, 1, ids).draft;
  assert(decreased.lines.every(line => line.quantity === 1), "Decreasing a pair must decrease each component");
  const repeated = draft.addOrderGroup(decreased, [...recipe.items].reverse(), 1, ids).draft;
  assert.equal(repeated.groups.length, 1, "Reversed same composition must merge");
  assert.equal(repeated.groups[0].quantity, 2);
  const companion = domain.quickProducts.find(product => !recipe.items.some(item => item.id === product.id));
  const companionVariant = domain.variantsFor(companion)[0];
  const mixed = draft.addOrderGroup(repeated, [{ id: companion.id, quantity: 1,
    ...(companionVariant ? { variant: companionVariant.id } : {}) }], 3, ids).draft;
  const remaining = draft.removeOrderGroup(mixed, group.id, ids);
  assert.equal(remaining.groups.length, 1);
  assert.equal(remaining.groups[0].items[0].id, companion.id);
  assert.equal(remaining.groups[0].quantity, 3, "Removing a pair must keep the independent item");
}
console.log(`Quick builder PASS: ${recipes.length} complete recipes, ${quantityCases} quantity cases (1–99), ${qrRoundTrips} TR/EN/RU QR round trips, atomic limits, removal, multilingual search and product photos.`);
await import("./test-quick-builder-ui.mjs");
