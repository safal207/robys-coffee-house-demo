export function isHotDrink(product) {
  return ["hot-coffee", "brew-hot", "herbal-tea"].includes(product?.category?.id);
}

function isSweetProduct(product) {
  return product?.category?.id === "desserts" && product.id !== "desserts:savoury-cookie"
    || product?.category?.id === "food" && product.id === "food:nutella-croissant";
}

export function getSweetProducts(index) {
  return Array.from(index.values()).filter(isSweetProduct);
}

function validSelection(products) {
  return Array.isArray(products) && products.length > 0 && products.length <= 2
    && products.every((product) => typeof product?.id === "string"
      && typeof product.category?.id === "string"
      && product.id.startsWith(`${product.category.id}:`)
      && Number.isFinite(product.item?.price) && product.item.price > 0)
    && new Set(products.map((product) => product.id)).size === products.length
    && (products.length === 1 || products.some(isHotDrink) && products.some(isSweetProduct));
}

export function quoteMenuSelection(cart, products, requestedQty, max = 99) {
  if (!(cart instanceof Map) || !validSelection(products)) {
    return { availableQuantity: 0, quantity: 0, unitTotal: 0, total: 0 };
  }
  const unitTotal = products.reduce((sum, product) => sum + product.item.price, 0);
  const availableQuantity = Number.isInteger(max) && max > 0
    ? Math.min(...products.map((product) => {
      const current = cart.get(product.id) ?? 0;
      return Number.isInteger(current) && current >= 0 && current <= max ? max - current : 0;
    }))
    : 0;
  const quantity = availableQuantity === 0 ? 0
    : Math.max(1, Math.min(Number.isInteger(requestedQty) ? requestedQty : 1, availableQuantity));
  return { availableQuantity, quantity, unitTotal, total: unitTotal * quantity };
}

export function applyMenuSelection(cart, products, quantity, max = 99) {
  const quote = quoteMenuSelection(cart, products, quantity, max);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > quote.availableQuantity) {
    return { applied: false, blocked: true, cart, quote };
  }
  const next = new Map(cart);
  products.forEach((product) => next.set(product.id, (next.get(product.id) ?? 0) + quantity));
  return { applied: true, blocked: false, cart: next, quote };
}
