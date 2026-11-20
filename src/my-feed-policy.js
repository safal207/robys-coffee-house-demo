// Pure taste ranking. This never changes the live photo feed or invents popularity.
import { PAIRS } from "../taste-memory-policy.js";

export const MY_FEED_LIMIT = 6;

// Stable daily variation: the same snapshot keeps the same order until an explicit refresh.
function rankingKey(id, seed) {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

export function makeMyFeedPlan({ products, likedIds = new Set(), viewedIds = new Set(),
  views = new Map(), seed = 0, limit = MY_FEED_LIMIT } = {}) {
  if (!Array.isArray(products)) return [];
  const capacity = Number.isInteger(limit) ? Math.max(0, Math.min(10, limit)) : MY_FEED_LIMIT;
  const catalog = new Map(products.filter(product =>
    typeof product?.id === "string" && typeof product?.image === "string" &&
    Number.isFinite(product?.item?.price) && product.item.price > 0
  ).map(product => [product.id, product]));
  const shuffled = array => [...array].sort((a, b) =>
    rankingKey(a.id, seed) - rankingKey(b.id, seed) || a.id.localeCompare(b.id, "en"));
  const available = [...catalog.values()].filter(product => product.category.id !== "pairing-offers");
  const favorites = shuffled(available.filter(product => likedIds.has(product.id)))
    .sort((a, b) => (views.get(b.id) || 0) - (views.get(a.id) || 0));
  const fresh = shuffled(available.filter(product => !likedIds.has(product.id) && !viewedIds.has(product.id)));
  const known = shuffled(available.filter(product => !likedIds.has(product.id) && viewedIds.has(product.id)));
  const pairs = [];
  for (const [sourceId, targetId] of PAIRS) {
    const target = catalog.get(targetId);
    if (likedIds.has(sourceId) && !likedIds.has(targetId) && target && target.category.id !== "pairing-offers" &&
        !pairs.some(entry => entry.product.id === targetId)) pairs.push({ product: target, sourceId });
  }

  const result = [], used = new Set(), categories = new Set();
  const take = (pool, kind, withSource = false) => {
    const candidates = pool.filter(entry => !used.has((withSource ? entry.product : entry).id));
    const entry = candidates.find(candidate => !categories.has((withSource ? candidate.product : candidate).category.id)) ?? candidates[0];
    if (!entry) return false;
    const product = withSource ? entry.product : entry;
    result.push({ product, id: product.id, kind,
      ...(withSource ? { sourceId: entry.sourceId } : {}) });
    used.add(product.id);
    categories.add(product.category.id);
    return true;
  };

  const discovery = () => take(fresh, "discover") || take(known, "explore");
  for (const slot of ["favorite", "discover", "pair", "discover", "favorite", "discover"]) {
    if (result.length >= capacity) break;
    if (slot === "favorite" && take(favorites, "favorite")) continue;
    if (slot === "pair" && take(pairs, "pair", true)) continue;
    discovery() || take(favorites, "favorite") || take(pairs, "pair", true);
  }
  while (result.length < capacity &&
    (discovery() || take(favorites, "favorite") || take(pairs, "pair", true))) {}
  return result;
}
