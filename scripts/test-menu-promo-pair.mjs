import assert from "node:assert/strict";
import test from "node:test";
import { menuCategories } from "../menu-catalog.js";
import { isEditablePairDrink, promoPairProducts } from "../src/menu-promo-pair.js";
import { quoteMenuSelection, applyMenuSelection } from "../src/menu-pairing.js";

const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const index = new Map(menuCategories.flatMap(category =>
  (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => {
    const id = `${category.id}:${item.id ?? slug(item.name.en)}`;
    return [id, { id, category, item }];
  })));
const offers = [
  { id: "pairing-offers:cool-lime-macaron-pairing", components: ["refreshers:cool-lime", "desserts:macaron"], total: 220 },
  { id: "pairing-offers:iced-san-sebastian-pairing", components: ["cold-coffee:iced-caffe-latte", "desserts:san-sebastian-cheesecake"], total: 370 }
];

test("verified menu-total offers expand to their actual catalog objects and ordinary prices", () => {
  for (const offer of offers) {
    const products = promoPairProducts(index, offer.id);
    assert.deepEqual(products.map(product => product.id), offer.components);
    products.forEach(product => assert.equal(product, index.get(product.id)));
    assert.equal(quoteMenuSelection(new Map(), products, 2).total, offer.total * 2);
    const capped = new Map([[offer.components[1], 99]]);
    assert.equal(applyMenuSelection(capped, products, 1).applied, false);
    assert.deepEqual([...capped], [[offer.components[1], 99]], "the entire pair is blocked atomically");
    assert.equal(quoteMenuSelection(capped, [products[0]], 1).total, products[0].item.price,
      "removing the dessert restores the ordinary drink price");
  }
});

test("missing, mismatched, repriced or special offers cannot expand silently", () => {
  assert.equal(promoPairProducts(index, "unknown"), null);
  assert.equal(promoPairProducts(null, offers[0].id), null);
  for (const offer of offers) {
    for (const mutation of ["missing", "price", "approved-offer", "category", "identity", "component-price"]) {
      const changed = new Map(index);
      const promo = index.get(offer.id);
      if (mutation === "missing") changed.delete(offer.components[1]);
      else if (mutation === "component-price") {
        const component = index.get(offer.components[0]);
        changed.set(component.id, { ...component, item: { ...component.item, price: component.item.price + 1 } });
      } else changed.set(offer.id, { ...promo,
        ...(mutation === "category" ? { category: { id: "desserts" } } : {}),
        ...(mutation === "identity" ? { id: "pairing-offers:unknown" } : {}),
        item: { ...promo.item,
          ...(mutation === "price" ? { price: promo.item.price - 1 } : {}),
          ...(mutation === "approved-offer" ? { pricingMode: "approved-offer" } : {}) }
      });
      assert.equal(promoPairProducts(changed, offer.id), null, `${offer.id}/${mutation}`);
    }
  }
});

test("only the two verified cold drinks extend the existing hot-pair eligibility", () => {
  for (const product of index.values()) {
    const expected = ["hot-coffee", "brew-hot", "herbal-tea"].includes(product.category.id)
      || offers.some(offer => offer.components[0] === product.id);
    assert.equal(isEditablePairDrink(product), expected, product.id);
  }
  assert.equal(isEditablePairDrink(null), false);
  assert.equal(isEditablePairDrink({ id: "refreshers:cool-lime", category: { id: "desserts" } }), false);
});
