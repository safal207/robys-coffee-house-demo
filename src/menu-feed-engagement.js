// Personal preferences, not public popularity statistics. Each product has
// its own key so one tab cannot overwrite another product changed elsewhere.
const LIKE_PREFIX = "robys-feed-like-v1:";
const SEEN_PREFIX = "robys-feed-seen-v1:";

export function createFeedEngagement({ validIds, getStorage = () => localStorage, onChange = () => {} }) {
  const ids = new Set(validIds);
  let liked = new Set(), viewed = new Set(), persistent = true, notifying = false;
  const valid = id => typeof id === "string" && ids.has(id);

  function notify(changed) {
    if (!changed || notifying) return;
    notifying = true;
    try { onChange(); } finally { notifying = false; }
  }

  function sync(key = null, announce = true) {
    if (!persistent) return false;
    let entries;
    if (key === null) {
      entries = [...ids].flatMap(id => [[LIKE_PREFIX, id], [SEEN_PREFIX, id]]);
    } else if (typeof key === "string") {
      const prefix = [LIKE_PREFIX, SEEN_PREFIX].find(value => key.startsWith(value));
      const id = prefix ? key.slice(prefix.length) : null;
      if (!prefix || !valid(id)) return false;
      entries = [[prefix, id]];
    } else return false;

    const nextLiked = new Set(liked), nextViewed = new Set(viewed);
    let changed = false;
    try {
      const storage = getStorage();
      for (const [prefix, id] of entries) {
        const target = prefix === LIKE_PREFIX ? nextLiked : nextViewed;
        const selected = storage.getItem(prefix + id) === "1";
        if (target.has(id) !== selected) changed = true;
        if (selected) target.add(id); else target.delete(id);
      }
      // A failed read must not replace memory with a partially read snapshot.
      liked = nextLiked; viewed = nextViewed;
    } catch {
      persistent = false;
      if (announce) notify(true);
      return false;
    }
    if (announce) notify(changed);
    return changed;
  }

  function write(prefix, id, selected) {
    if (!valid(id) || typeof selected !== "boolean") return false;
    const target = prefix === LIKE_PREFIX ? liked : viewed;
    const changed = target.has(id) !== selected;
    if (selected) target.add(id); else target.delete(id);
    let persistenceChanged = false;
    if (persistent) {
      try {
        const storage = getStorage();
        // Write the explicit intent even if this tab already has that state:
        // another tab may have changed this key before its storage event arrives.
        if (selected) storage.setItem(prefix + id, "1");
        else storage.removeItem(prefix + id);
      } catch {
        persistent = false;
        persistenceChanged = true;
      }
    }
    notify(changed || persistenceChanged);
    return changed;
  }

  // Initial state is available immediately; callbacks start after construction.
  sync(null, false);
  return {
    hasLiked: id => valid(id) && liked.has(id),
    hasSeen: id => valid(id) && viewed.has(id),
    setLiked: (id, selected) => write(LIKE_PREFIX, id, selected),
    markSeen: id => write(SEEN_PREFIX, id, true),
    sync: (key = null) => sync(key),
    likes: () => liked.size,
    seen: () => viewed.size,
    get persistent() { return persistent; }
  };
}
