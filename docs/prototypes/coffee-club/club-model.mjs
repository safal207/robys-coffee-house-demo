export const passportIds = Object.freeze([
  "hot-coffee:espresso", "hot-coffee:americano", "hot-coffee:flat-white",
  "hot-coffee:cappuccino", "brew-hot:turkish-coffee"
]);
const prefix = "robys-club-demo-tasted-v1:";

// Views and likes are not tastings, payments, or verified visits.
export function personalSections(products, engagement) {
  return {
    favorites: products.filter(product => engagement.hasLiked(product.id)),
    seen: products.filter(product => engagement.hasSeen(product.id))
  };
}

// A separate namespace records only explicit tasting marks. No identity or PII.
export function createPassport(getStorage) {
  const marks = new Set();
  let persistent = true;
  function sync() {
    if (!persistent) return;
    try {
      const storage = getStorage();
      const next = passportIds.filter(id => storage.getItem(prefix + id) === "1");
      marks.clear();
      next.forEach(id => marks.add(id));
    } catch { persistent = false; }
  }
  function set(id, selected) {
    if (!passportIds.includes(id) || typeof selected !== "boolean") return false;
    if (selected) marks.add(id); else marks.delete(id);
    if (persistent) {
      try {
        const storage = getStorage();
        if (selected) storage.setItem(prefix + id, "1");
        else storage.removeItem(prefix + id);
      } catch { persistent = false; }
    }
    return true;
  }
  sync();
  return { has: id => marks.has(id), count: () => marks.size, set, sync,
    clear: () => passportIds.forEach(id => set(id, false)),
    get persistent() { return persistent; } };
}
