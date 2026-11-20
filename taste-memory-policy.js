// Pure, deterministic decision rules shared by Taste Memory UI and tests.
export const WAIT_MS = 90000;
export const PRODUCT_COOLDOWN = 7 * 86400000;
export const GLOBAL_COOLDOWN = 86400000;
export const PAIRS = [
  ["refreshers:cool-lime", "desserts:macaron"],
  ["cold-coffee:iced-caffe-latte", "desserts:san-sebastian-cheesecake"],
  ["hot-coffee:caffe-latte", "desserts:san-sebastian-cheesecake"],
  ["desserts:san-sebastian-cheesecake", "cold-coffee:iced-caffe-latte"]
];

export function choosePersonalPair(likedIds, catalog) {
  for (const [source, target] of PAIRS) {
    if (likedIds.has(source) && !likedIds.has(target) && catalog.has(source) && catalog.has(target)) {
      return { source: catalog.get(source), target: catalog.get(target) };
    }
  }
  return null;
}

export function chooseRememberedProduct({ products, priorLiked, currentLiked, shown = {},
  lastShown = 0, now, sessionStarted, interacted, enabled, busy, prompted }) {
  if (!enabled || !interacted || busy || prompted || now - sessionStarted < WAIT_MS ||
      now - lastShown < GLOBAL_COOLDOWN) return null;
  return products.find(product => priorLiked.has(product.id) && currentLiked.has(product.id) &&
    now - (shown[product.id] || 0) >= PRODUCT_COOLDOWN) ?? null;
}
