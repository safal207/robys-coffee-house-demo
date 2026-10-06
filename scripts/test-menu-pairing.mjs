import assert from "node:assert/strict";
import test from "node:test";
import { menuCategories } from "../menu-catalog.js";
import { isHotDrink, getSweetProducts, quoteMenuSelection, applyMenuSelection } from "../src/menu-pairing.js";

// Match the existing product-index shape, using actual catalog items and prices.
const index = new Map();
for (const category of menuCategories) {
  for (const item of category.items ?? category.groups.flatMap((group) => group.items)) {
    const slug = item.name.en.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `${category.id}:${item.id ?? slug}`;
    index.set(id, { id, category, item, image: item.image ?? `src/products/menu-v1/${category.id}--${slug}.webp` });
  }
}
const hotCategories = new Set(["hot-coffee", "brew-hot", "herbal-tea"]);
const hot = Array.from(index.values()).filter((product) => hotCategories.has(product.category.id));
const sweets = getSweetProducts(index);
const drink = index.get("hot-coffee:espresso");
const sweet = index.get("desserts:san-sebastian-cheesecake");
const other = index.get("refreshers:cool-lime");
const zeroQuote = { availableQuantity: 0, quantity: 0, unitTotal: 0, total: 0 };

function assertBlocked(cart, products, quantity, max) {
  const before = cart instanceof Map ? Array.from(cart.entries()) : cart;
  const result = applyMenuSelection(cart, products, quantity, max);
  assert.equal(result.applied, false);
  assert.equal(result.blocked, true);
  assert.strictEqual(result.cart, cart, "Blocked selection returns the original cart");
  assert.deepEqual(cart instanceof Map ? Array.from(cart.entries()) : cart, before, "Blocked pair cannot partially add a line");
  return result;
}

test("hot eligibility covers all three hot categories and excludes every other catalog category", () => {
  assert.ok(hot.length > 20, "Exercise the complete hot catalog rather than a single coffee");
  for (const product of index.values()) {
    assert.equal(isHotDrink(product), hotCategories.has(product.category.id), product.id);
  }
  assert.equal(isHotDrink(null), false);
  assert.equal(isHotDrink(undefined), false);
  assert.equal(isHotDrink({}), false);
});

test("sweets are exactly eleven desserts and Nutella croissant, preserving catalog objects and order", () => {
  assert.deepEqual(sweets.map((product) => product.id), [
    "desserts:san-sebastian-cheesecake", "desserts:lotus-cheesecake", "desserts:raspberry-cheesecake",
    "desserts:chocolate-cake", "desserts:almond-tart", "desserts:cake-roll", "desserts:mosaic-cake",
    "desserts:tiramisu", "desserts:brownie", "desserts:cookie", "desserts:macaron", "food:nutella-croissant"
  ]);
  for (const product of sweets) assert.strictEqual(product, index.get(product.id));
  assert.deepEqual(getSweetProducts(new Map()), []);
});

test("every catalog hot × sweet combination quotes and atomically adds actual menu prices", () => {
  let combinations = 0;
  for (const coffee of hot) {
    for (const dessert of sweets) {
      const cart = new Map();
      const unitTotal = coffee.item.price + dessert.item.price;
      const quote = quoteMenuSelection(cart, [coffee, dessert], 3);
      assert.deepEqual(quote, { availableQuantity: 99, quantity: 3, unitTotal, total: unitTotal * 3 }, `${coffee.id} + ${dessert.id}`);
      assert.deepEqual(quoteMenuSelection(cart, [dessert, coffee], 3), quote, "Pair order does not alter price or eligibility");
      const applied = applyMenuSelection(cart, [coffee, dessert], 3);
      assert.equal(applied.applied, true);
      assert.equal(applied.blocked, false);
      assert.deepEqual(applied.quote, quote);
      assert.notStrictEqual(applied.cart, cart);
      assert.deepEqual(Array.from(applied.cart.entries()), [[coffee.id, 3], [dessert.id, 3]]);
      assert.equal(cart.size, 0, "Pure domain operations leave the input cart intact");
      combinations++;
    }
  }
  assert.equal(combinations, hot.length * 12);
  console.log(`Catalog pair prices and atomic additions: ${combinations} combinations.`);
});

test("real coffee/tea examples sum ordinary prices without introducing a combo discount", () => {
  assert.equal(quoteMenuSelection(new Map(), [drink, sweet], 1).total, 300);
  assert.equal(quoteMenuSelection(new Map(), [index.get("brew-hot:black-tea"), index.get("desserts:macaron")], 2).total, 160);
  assert.equal(quoteMenuSelection(new Map(), [index.get("hot-coffee:cappuccino"), index.get("food:nutella-croissant")], 1).total, 350);
});

test("either existing line can cap the complete pair, with no partial addition", () => {
  for (const [drinkQuantity, sweetQuantity] of [[99, 0], [0, 99], [99, 99]]) {
    const cart = new Map([[drink.id, drinkQuantity], [sweet.id, sweetQuantity], [other.id, 7]]);
    assert.deepEqual(quoteMenuSelection(cart, [drink, sweet], 4), {
      availableQuantity: 0, quantity: 0, unitTotal: 300, total: 0
    });
    assertBlocked(cart, [drink, sweet], 1);
  }
});

test("quote clamps to the tighter remaining line, while apply refuses an oversized request", () => {
  for (const [drinkQuantity, sweetQuantity] of [[98, 96], [92, 98]]) {
    const cart = new Map([[drink.id, drinkQuantity], [sweet.id, sweetQuantity]]);
    const quote = quoteMenuSelection(cart, [drink, sweet], 8);
    assert.deepEqual(quote, { availableQuantity: 1, quantity: 1, unitTotal: 300, total: 300 });
    assertBlocked(cart, [drink, sweet], 8);
    const result = applyMenuSelection(cart, [drink, sweet], quote.quantity);
    assert.equal(result.applied, true);
    assert.equal(result.cart.get(drink.id), drinkQuantity + 1);
    assert.equal(result.cart.get(sweet.id), sweetQuantity + 1);
  }
});

test("repeated pairs preserve existing unequal quantities and unrelated products", () => {
  const cart = new Map([[drink.id, 2], [sweet.id, 3], [other.id, 7]]);
  const first = applyMenuSelection(cart, [drink, sweet], 2);
  const second = applyMenuSelection(first.cart, [drink, sweet], 3);
  assert.deepEqual(Array.from(cart.entries()), [[drink.id, 2], [sweet.id, 3], [other.id, 7]]);
  assert.deepEqual(Array.from(first.cart.entries()), [[drink.id, 4], [sweet.id, 5], [other.id, 7]]);
  assert.deepEqual(Array.from(second.cart.entries()), [[drink.id, 7], [sweet.id, 8], [other.id, 7]]);
});

test("a full sweet line still permits adding only the drink", () => {
  const cart = new Map([[sweet.id, 99]]);
  assert.equal(quoteMenuSelection(cart, [drink, sweet], 1).availableQuantity, 0);
  assert.deepEqual(quoteMenuSelection(cart, [drink], 2), { availableQuantity: 99, quantity: 2, unitTotal: 110, total: 220 });
  const result = applyMenuSelection(cart, [drink], 2);
  assert.equal(result.applied, true);
  assert.deepEqual(Array.from(result.cart.entries()), [[sweet.id, 99], [drink.id, 2]]);
  assert.deepEqual(Array.from(cart.entries()), [[sweet.id, 99]]);
});

test("ordinary single-product ordering remains available for the entire existing catalog", () => {
  for (const product of index.values()) {
    const result = applyMenuSelection(new Map(), [product], 1);
    assert.equal(result.applied, true, product.id);
    assert.equal(result.quote.total, product.item.price, product.id);
    assert.deepEqual(Array.from(result.cart.entries()), [[product.id, 1]]);
  }
});

test("unknown, duplicate and ineligible pairs are rejected before any cart change", () => {
  const cart = new Map([[other.id, 7]]);
  const rejected = [[], [undefined], [index.get("unknown:product")], [drink, undefined], [drink, drink],
    [drink, { ...sweet, id: "unknown" }], [drink, { ...sweet, item: { price: NaN } }],
    [drink, index.get("desserts:savoury-cookie")], [drink, index.get("food:three-cheese-croissant")],
    [other, sweet], [drink, index.get("brew-hot:black-tea")], [sweet, sweets[1]], [drink, sweet, sweets[1]]];
  for (const products of rejected) {
    assert.deepEqual(quoteMenuSelection(cart, products, 1), zeroQuote);
    assertBlocked(cart, products, 1);
  }
});

test("apply rejects nonpositive, fractional and malformed quantities even when quote can display a safe quantity", () => {
  const cart = new Map([[other.id, 7]]);
  for (const quantity of [0, -1, 1.5, NaN, Infinity, "2", undefined, null]) {
    assert.equal(quoteMenuSelection(cart, [drink, sweet], quantity).quantity, 1);
    assertBlocked(cart, [drink, sweet], quantity);
  }
  assertBlocked(cart, [drink, sweet], 100);
});

test("custom limits and malformed selected cart lines cannot overflow either product", () => {
  const cart = new Map([[drink.id, 2], [sweet.id, 3]]);
  assert.deepEqual(quoteMenuSelection(cart, [drink, sweet], 5, 4), { availableQuantity: 1, quantity: 1, unitTotal: 300, total: 300 });
  assertBlocked(cart, [drink, sweet], 2, 4);
  assert.equal(applyMenuSelection(cart, [drink, sweet], 1, 4).cart.get(sweet.id), 4);
  for (const max of [0, -1, 1.5, Infinity, "99"]) assertBlocked(cart, [drink, sweet], 1, max);
  for (const corrupt of [-1, 1.5, 100, NaN, "1"]) {
    const malformed = new Map([[drink.id, corrupt], [sweet.id, 0]]);
    assert.equal(quoteMenuSelection(malformed, [drink, sweet], 1).quantity, 0);
    assertBlocked(malformed, [drink, sweet], 1);
  }
  assert.deepEqual(quoteMenuSelection(null, [drink, sweet], 1), zeroQuote);
  assertBlocked(null, [drink, sweet], 1);
});
