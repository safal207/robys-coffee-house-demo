// Personal likes and view history, not public popularity statistics. Each product has
// its own key so one tab cannot overwrite another product changed elsewhere.
const LIKE_PREFIX = "robys-feed-like-v1:";
const SEEN_PREFIX = "robys-feed-seen-v1:";
const VIEWS_PREFIX = "robys-feed-views-v1:";
const MAX_VIEWS = 999999999;

function storedViews(value) {
  return typeof value === "string" && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : 0;
}

export function createFeedEngagement({ validIds, getStorage = () => localStorage, onChange = () => {} }) {
  const ids = new Set(validIds);
  let liked = new Set(), viewed = new Set(), counts = new Map(), persistent = true, notifying = false;
  const recorded = new Set();
  const valid = id => typeof id === "string" && ids.has(id);
  const viewCount = id => valid(id) ? Math.max(counts.get(id) ?? 0, viewed.has(id) ? 1 : 0) : 0;

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
      const prefix = [LIKE_PREFIX, SEEN_PREFIX, VIEWS_PREFIX].find(value => key.startsWith(value));
      const id = prefix ? key.slice(prefix.length) : null;
      if (!prefix || !valid(id)) return false;
      entries = [[prefix, id]];
    } else return false;

    const nextLiked = new Set(liked), nextViewed = new Set(viewed), nextCounts = new Map(counts);
    let changed = false;
    try {
      const storage = getStorage();
      for (const [prefix, id] of entries) {
        if (prefix === LIKE_PREFIX) {
          const selected = storage.getItem(prefix + id) === "1";
          if (nextLiked.has(id) !== selected) changed = true;
          if (selected) nextLiked.add(id); else nextLiked.delete(id);
        } else {
          // Both keys describe the same history. A missing legacy marker must
          // not hide a successfully persisted counter, or the reverse.
          const seenValue = storage.getItem(SEEN_PREFIX + id);
          const countValue = storage.getItem(VIEWS_PREFIX + id);
          const stored = Math.max(storedViews(countValue), seenValue === "1" ? 1 : 0);
          // Explicit removal of both keys clears history. Otherwise a stale
          // lower or corrupt snapshot cannot roll back an already known count.
          const count = seenValue === null && countValue === null ? 0 : Math.max(viewCount(id), stored);
          if (viewCount(id) !== count) changed = true;
          if (count) { nextCounts.set(id, count); nextViewed.add(id); }
          else { nextCounts.delete(id); nextViewed.delete(id); }
        }
      }
      // A failed read must not replace memory with a partially read snapshot.
      liked = nextLiked; viewed = nextViewed; counts = nextCounts;
    } catch {
      persistent = false;
      if (announce) notify(true);
      return false;
    }
    if (announce) notify(changed);
    return changed;
  }

  // The caller qualifies a continuous loaded/visible exposure; this model only
  // records it once per product in this page's store instance.
  function recordView(id) {
    if (!valid(id) || recorded.has(id)) return false;
    let count = viewCount(id), storage, persistenceChanged = false;
    if (persistent) {
      try {
        storage = getStorage();
        // Read the current value rather than a delayed storage-event payload.
        // This merges sequential visits from other tabs. localStorage has no
        // transaction across this read and write: simultaneous increments of
        // the same product in separate tabs can still coalesce.
        count = Math.max(count, storedViews(storage.getItem(VIEWS_PREFIX + id)),
          storage.getItem(SEEN_PREFIX + id) === "1" ? 1 : 0);
      } catch {
        persistent = false;
        persistenceChanged = true;
      }
    }
    count = Math.min(MAX_VIEWS, count + 1);
    const changed = viewCount(id) !== count;
    recorded.add(id); counts.set(id, count); viewed.add(id);
    if (persistent) {
      try {
        storage.setItem(VIEWS_PREFIX + id, String(count));
        storage.setItem(SEEN_PREFIX + id, "1");
      } catch {
        persistent = false;
        persistenceChanged = true;
      }
    }
    notify(changed || persistenceChanged);
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
    viewCount,
    recordView,
    hasViewedThisVisit: id => valid(id) && recorded.has(id),
    setLiked: (id, selected) => write(LIKE_PREFIX, id, selected),
    markSeen: id => write(SEEN_PREFIX, id, true),
    sync: (key = null) => sync(key),
    likes: () => liked.size,
    seen: () => viewed.size,
    get persistent() { return persistent; }
  };
}
