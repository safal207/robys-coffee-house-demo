// These menu-total offers have verified ordinary menu components. Keep the
// price check at the expansion boundary so a future special offer cannot be
// silently repriced as two ordinary products.
const components = new Map([
  ["pairing-offers:cool-lime-macaron-pairing", ["refreshers:cool-lime", "desserts:macaron"]],
  ["pairing-offers:iced-san-sebastian-pairing", ["cold-coffee:iced-caffe-latte", "desserts:san-sebastian-cheesecake"]]
]);
const hotCategories = new Set(["hot-coffee", "brew-hot", "herbal-tea"]);
const coldDrinks = new Map([
  ["refreshers:cool-lime", "refreshers"],
  ["cold-coffee:iced-caffe-latte", "cold-coffee"]
]);
const validPrice = price => Number.isSafeInteger(price) && price > 0;

export function isEditablePairDrink(product) {
  return hotCategories.has(product?.category?.id)
    || Boolean(product?.id && coldDrinks.get(product.id) === product.category?.id);
}

export function promoPairProducts(productIndex, promoId) {
  const ids = components.get(promoId);
  const promo = productIndex?.get(promoId);
  if (!ids || promo?.id !== promoId || promo.category?.id !== "pairing-offers"
      || promo.item?.pricingMode !== "menu-total" || !validPrice(promo.item.price)) return null;
  const products = ids.map(id => productIndex.get(id));
  if (products.some((product, index) => product?.id !== ids[index]
      || product.category?.id !== ids[index].split(":")[0] || !validPrice(product.item?.price))) return null;
  return products.reduce((sum, product) => sum + product.item.price, 0) === promo.item.price ? products : null;
}
