import assert from "node:assert/strict";
import test from "node:test";
import { menuCategories } from "../menu-catalog.js";
import { addOrderGroup, normalizeOrderDraft } from "../src/order-draft.js";
import { familyRecipes, quoteFamilySelection, stageFamilySelection } from "../src/menu-family.js";

const index = new Map();
for (const category of menuCategories) for (const item of category.items ?? category.groups.flatMap(group => group.items)) {
  const slug = item.name.en.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `${category.id}:${item.id ?? slug}`;
  index.set(id, { id, category, item });
}
const validIds = new Set(index.keys());
const empty = () => normalizeOrderDraft({}, validIds);

test("family recipes reference real menu products and current ordinary prices in all three languages", () => {
  assert.equal(familyRecipes.length, 3);
  const totals = [160, 195, 230];
  familyRecipes.forEach((recipe, position) => {
    for (const locale of ["tr", "en", "ru"]) assert.ok(recipe.name[locale]);
    assert.ok(recipe.productIds.length >= 2 && recipe.productIds.length <= 3);
    const quote = quoteFamilySelection(recipe.id, recipe.productIds, index);
    assert.equal(quote.valid, true);
    assert.equal(quote.total, totals[position]);
    assert.ok(quote.products.every(product => validIds.has(product.id)));
  });
});

test("unchecking components uses catalog prices and preserves the remaining independent products", () => {
  const recipe = familyRecipes[1];
  const chosen = ["brew-hot:milk", "food:sesame-simit"];
  assert.equal(quoteFamilySelection(recipe.id, chosen, index).total, 95);
  const result = stageFamilySelection(empty(), recipe.id, chosen, index, validIds);
  assert.equal(result.applied, true);
  assert.equal(result.draft.groups.length, 2);
  assert.ok(result.draft.groups.every(group => group.items.length === 1));
  assert.deepEqual(result.draft.lines, [{ id: "brew-hot:milk", quantity: 1 }, { id: "food:sesame-simit", quantity: 1 }]);
});

test("a changed catalog price is reflected immediately without a stored recipe price", () => {
  const changed = new Map(index);
  const milk = index.get("brew-hot:milk");
  changed.set(milk.id, { ...milk, item: { ...milk.item, price: 70 } });
  assert.equal(quoteFamilySelection("milk-cookie", familyRecipes[0].productIds, changed).total, 170);
});

test("empty, duplicate, unknown and unrelated selections never mutate or normalize the input draft", () => {
  const draft = empty();
  const original = structuredClone(draft);
  for (const [recipeId, selected] of [["milk-cookie", []], ["unknown", ["brew-hot:milk"]],
    ["milk-cookie", ["brew-hot:milk", "brew-hot:milk"]], ["milk-cookie", ["unknown:juice"]],
    ["milk-cookie", ["hot-coffee:espresso"]], ["milk-cookie", null]]) {
    const result = stageFamilySelection(draft, recipeId, selected, index, validIds);
    assert.equal(result.applied, false);
    assert.strictEqual(result.draft, draft);
    assert.deepEqual(draft, original);
  }
});

test("a later component at capacity rolls back every staged earlier addition", () => {
  for (const atLimit of ["food:sesame-simit", "desserts:cookie"]) {
    const draft = addOrderGroup(empty(), [{ id: atLimit }], 99, validIds).draft;
    const before = structuredClone(draft);
    const result = stageFamilySelection(draft, "simit-break", familyRecipes[1].productIds, index, validIds);
    assert.equal(result.applied, false);
    assert.strictEqual(result.draft, draft);
    assert.deepEqual(draft, before);
    assert.equal(result.draft.lines.some(line => line.id === "brew-hot:milk"), false);
  }
});

test("ordinary existing lines are incremented independently and capped across a grouped pair", () => {
  let draft = addOrderGroup(empty(), [{ id: "brew-hot:milk" }, { id: "desserts:cookie" }], 98, validIds).draft;
  const added = stageFamilySelection(draft, "milk-cookie", familyRecipes[0].productIds, index, validIds);
  assert.equal(added.applied, true);
  assert.equal(added.draft.groups.length, 3);
  assert.deepEqual(added.draft.lines, [{ id: "brew-hot:milk", quantity: 99 }, { id: "desserts:cookie", quantity: 99 }]);
  const blocked = stageFamilySelection(added.draft, "milk-cookie", familyRecipes[0].productIds, index, validIds);
  assert.equal(blocked.applied, false);
  assert.strictEqual(blocked.draft, added.draft);
  assert.deepEqual(draft.lines, [{ id: "brew-hot:milk", quantity: 98 }, { id: "desserts:cookie", quantity: 98 }]);
});

test("a missing or corrupt catalog component blocks the recipe rather than inventing a price", () => {
  for (const replacement of [undefined, { ...index.get("brew-hot:milk"), item: { price: NaN } }]) {
    const changed = new Map(index);
    changed.set("brew-hot:milk", replacement);
    const draft = empty();
    const result = stageFamilySelection(draft, "milk-cookie", familyRecipes[0].productIds, changed, validIds);
    assert.equal(result.applied, false);
    assert.strictEqual(result.draft, draft);
  }
});
