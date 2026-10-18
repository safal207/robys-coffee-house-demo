import assert from "node:assert/strict";
import test from "node:test";
import { menuCategories } from "../menu-catalog.js";
import { addOrderGroup, normalizeOrderDraft } from "../src/order-draft.js";
import { comboRecipes, MAX_COMBO_QUANTITY, quoteComboSelection, stageComboSelection } from "../src/menu-combos.js";

const index = new Map();
for (const category of menuCategories) for (const item of category.items ?? category.groups.flatMap(group => group.items)) {
  const slug = item.name.en.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `${category.id}:${item.id ?? slug}`;
  index.set(id, { id, category, item });
}
const validIds = new Set(index.keys());
const empty = () => normalizeOrderDraft({}, validIds);
const recipe = id => comboRecipes.find(entry => entry.id === id);

test("all 12 editorial selections reference current products and reviewed translated names", () => {
  assert.equal(comboRecipes.length, 12);
  assert.equal(new Set(comboRecipes.map(entry => entry.id)).size, 12);
  const totals = [85, 350, 300, 165, 220, 550, 750, 125, 195, 350, 280, 340];
  comboRecipes.forEach((entry, position) => {
    for (const locale of ["tr", "en", "ru"]) {
      assert.ok(entry.name[locale] && entry.eyebrow[locale]);
      assert.doesNotMatch(entry.name[locale], /<[^>]*>/);
    }
    assert.match(entry.image, /^src\/products\/occasion-sets-v1\/[a-z]+\.webp$/);
    assert.equal(Object.hasOwn(entry, "price"), false);
    const quote = quoteComboSelection(entry.id, entry.items, index);
    assert.equal(quote.valid, true);
    assert.equal(quote.total, totals[position]);
  });
  assert.equal(comboRecipes.filter(entry => entry.filters.includes("takeaway")).length, 4);
  assert.equal(comboRecipes.filter(entry => entry.filters.includes("together")).length, 2);
});

test("family and together quantities persist as independently editable ordinary product lines", () => {
  const family = recipe("family");
  const result = stageComboSelection(empty(), family.id, family.items, index, validIds);
  assert.equal(result.applied, true);
  assert.equal(result.quote.total, 750);
  assert.equal(result.draft.groups.length, 4);
  assert.equal(result.draft.lines.length, 4);
  assert.ok(result.draft.groups.every(group => group.source === "menu" && group.items.length === 1 && group.items[0].quantity === 1 && group.quantity === 2));
  assert.equal(result.draft.lines.reduce((sum, line) => sum + line.quantity, 0), 8);
  const together = recipe("together");
  const pair = stageComboSelection(empty(), together.id, together.items, index, validIds);
  assert.equal(pair.draft.lines.find(line => line.id === "hot-coffee:caffe-latte").quantity, 2);
  assert.equal(pair.draft.lines.find(line => line.id === "desserts:san-sebastian-cheesecake").quantity, 1);
  assert.equal(JSON.stringify(pair.draft).includes("price"), false);
});

test("remove, change quantities and add another ordinary menu product recomputes the catalog total", () => {
  const selected = [{ id: "brew-hot:black-tea", quantity: 0 }, { id: "food:sesame-simit", quantity: 2 }, { id: "desserts:brownie", quantity: 1 }];
  const quote = quoteComboSelection("student", selected, index);
  assert.equal(quote.valid, true);
  assert.equal(quote.total, 220);
  assert.equal(quote.products.length, 2);
  const result = stageComboSelection(empty(), "student", selected, index, validIds);
  assert.deepEqual(result.draft.lines, [{ id: "desserts:brownie", quantity: 1 }, { id: "food:sesame-simit", quantity: 2 }]);
  const changed = new Map(index);
  const simit = index.get("food:sesame-simit");
  changed.set(simit.id, { ...simit, item: { ...simit.item, price: 40 } });
  assert.equal(quoteComboSelection("student", selected, changed).total, 230);
});

test("invalid edits reject the entire mutation and leave the original draft identity and bytes intact", () => {
  const draft = stageComboSelection(empty(), "student", recipe("student").items, index, validIds).draft;
  const before = structuredClone(draft);
  const invalid = [null, [], [{ id: "brew-hot:black-tea", quantity: 0 }],
    [{ id: "brew-hot:black-tea", quantity: 1 }, { id: "brew-hot:black-tea", quantity: 2 }],
    [{ id: "brew-hot:black-tea", quantity: -1 }], [{ id: "brew-hot:black-tea", quantity: 1.5 }],
    [{ id: "brew-hot:black-tea", quantity: "2" }], [{ id: "brew-hot:black-tea", quantity: NaN }],
    [{ id: "brew-hot:black-tea", quantity: MAX_COMBO_QUANTITY + 1 }],
    [{ id: "unknown:juice", quantity: 1 }], [{ id: "pairing-offers:cool-lime-macaron-pairing", quantity: 1 }],
    [{ id: "cold-coffee:milkshake", quantity: 1 }]];
  for (const selected of invalid) {
    const result = stageComboSelection(draft, "student", selected, index, validIds);
    assert.equal(result.applied, false);
    assert.strictEqual(result.draft, draft);
    assert.deepEqual(draft, before);
  }
  assert.equal(stageComboSelection(draft, "unknown", recipe("student").items, index, validIds).applied, false);
});

test("a component already at the cart cap rolls back earlier staged components atomically", () => {
  const draft = addOrderGroup(empty(), [{ id: "desserts:cookie", quantity: 1 }], 98, validIds).draft;
  const before = structuredClone(draft);
  const result = stageComboSelection(draft, "family", recipe("family").items, index, validIds);
  assert.equal(result.applied, false);
  assert.strictEqual(result.draft, draft);
  assert.deepEqual(draft, before);
  assert.equal(result.draft.lines.length, 1);
});

test("each staging operation builds on the latest draft without changing unrelated or prior lines", () => {
  const first = stageComboSelection(empty(), "student", recipe("student").items, index, validIds).draft;
  const withOtherItem = addOrderGroup(first, [{ id: "hot-coffee:espresso", quantity: 1 }], 1, validIds).draft;
  const second = stageComboSelection(withOtherItem, "local", recipe("local").items, index, validIds);
  assert.equal(second.applied, true);
  assert.equal(second.draft.lines.find(line => line.id === "food:sesame-simit").quantity, 2);
  assert.equal(second.draft.lines.find(line => line.id === "hot-coffee:espresso").quantity, 1);
  assert.equal(second.draft.lines.find(line => line.id === "brew-hot:black-tea").quantity, 1);
  assert.equal(second.draft.lines.find(line => line.id === "brew-hot:turkish-coffee").quantity, 1);
});
