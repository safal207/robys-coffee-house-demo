import test from "node:test";
import assert from "node:assert/strict";
import { createFeedEngagement } from "../src/menu-feed-engagement.js";

const ids = new Set(["hot-coffee:espresso", "desserts:cookie", "cold-coffee:iced-latte"]);
const [espresso, cookie, latte] = ids;
const likeKey = id => `robys-feed-like-v1:${id}`;
const seenKey = id => `robys-feed-seen-v1:${id}`;
const viewsKey = id => `robys-feed-views-v1:${id}`;
function memoryStorage(initial = []) {
  const values = new Map(initial);
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }
  };
}
const create = (storage, options = {}) => createFeedEngagement({ validIds: ids, getStorage: () => storage, ...options });

test("likes and unique viewed products survive recreation without notifying during construction", () => {
  const storage = memoryStorage();
  const first = create(storage);
  assert.equal(first.setLiked(espresso, true), true);
  assert.equal(first.markSeen(espresso), true);
  assert.equal(first.markSeen(espresso), false);
  first.markSeen(cookie);
  let notifications = 0;
  const restored = create(storage, { onChange: () => notifications++ });
  assert.equal(restored.hasLiked(espresso), true);
  assert.equal(restored.hasSeen(espresso), true);
  assert.equal(restored.hasSeen(cookie), true);
  assert.equal(restored.likes(), 1);
  assert.equal(restored.seen(), 2);
  assert.equal(restored.persistent, true);
  assert.equal(notifications, 0);
});

test("tabs retain disjoint writes and sync current storage rather than stale event payloads", () => {
  const storage = memoryStorage();
  const first = create(storage), second = create(storage);
  first.setLiked(espresso, true);
  second.setLiked(cookie, true);
  first.markSeen(latte);
  second.markSeen(cookie);
  first.sync(); second.sync();
  for (const state of [first, second]) {
    assert.equal(state.hasLiked(espresso), true);
    assert.equal(state.hasLiked(cookie), true);
    assert.equal(state.likes(), 2);
    assert.equal(state.seen(), 2);
  }
  // A delayed event for an earlier like must read the newer unlike value.
  first.setLiked(espresso, false);
  second.sync(likeKey(espresso));
  assert.equal(second.hasLiked(espresso), false);
  assert.equal(second.hasLiked(cookie), true);
  assert.equal(storage.values.has(likeKey(espresso)), false);
});

test("explicit writes override unseen changes and clearing storage resets both kinds", () => {
  const storage = memoryStorage();
  const first = create(storage), second = create(storage);
  first.setLiked(espresso, true);
  // The second tab has not received the like but its explicit unlike still wins.
  assert.equal(second.setLiked(espresso, false), false);
  first.sync(likeKey(espresso));
  assert.equal(first.hasLiked(espresso), false);
  first.setLiked(cookie, true); first.markSeen(latte);
  storage.values.clear();
  first.sync(null);
  assert.equal(first.likes(), 0);
  assert.equal(first.seen(), 0);
});

test("only exact stored values and catalog IDs are accepted", () => {
  const storage = memoryStorage([
    [likeKey(espresso), "true"], [likeKey(cookie), "1"], [seenKey(latte), "{\"count\":4}"],
    [likeKey("unknown"), "1"], [seenKey("unknown"), "1"]
  ]);
  const state = create(storage);
  assert.equal(state.likes(), 1);
  assert.equal(state.hasLiked(espresso), false);
  assert.equal(state.seen(), 0);
  const before = [...storage.values];
  for (const id of ["unknown", null, undefined, {}, 1]) {
    assert.equal(state.hasLiked(id), false);
    assert.equal(state.hasSeen(id), false);
    assert.equal(state.setLiked(id, true), false);
    assert.equal(state.markSeen(id), false);
  }
  assert.equal(state.setLiked(espresso, "false"), false);
  assert.equal(state.sync(likeKey("unknown")), false);
  assert.equal(state.sync("robys-language"), false);
  assert.equal(state.sync({}), false);
  assert.deepEqual([...storage.values], before);
  storage.values.set(likeKey(cookie), "0");
  state.sync(likeKey(cookie));
  assert.equal(state.likes(), 0);
});

test("unavailable storage at construction supports memory-only choices without later resurrection", () => {
  let attempts = 0, unavailable = true;
  const storage = memoryStorage([[likeKey(cookie), "1"]]);
  const state = createFeedEngagement({ validIds: ids, getStorage: () => {
    attempts++;
    if (unavailable) throw new Error("blocked");
    return storage;
  } });
  assert.equal(state.persistent, false);
  state.setLiked(espresso, true); state.markSeen(latte);
  unavailable = false;
  state.sync(); state.setLiked(espresso, false);
  assert.equal(attempts, 1);
  assert.equal(state.hasLiked(cookie), false);
  assert.equal(state.likes(), 0);
  assert.equal(state.hasSeen(latte), true);
});

test("partial failed synchronization keeps the last complete state and notifies once", () => {
  const storage = memoryStorage([[likeKey(espresso), "1"], [seenKey(cookie), "1"]]);
  let notifications = 0;
  const state = create(storage, { onChange: () => notifications++ });
  storage.values.delete(likeKey(espresso));
  storage.values.set(likeKey(latte), "1");
  const originalRead = storage.getItem;
  let reads = 0;
  storage.getItem = key => {
    if (++reads === 3) throw new Error("read denied mid-snapshot");
    return originalRead(key);
  };
  state.sync();
  assert.equal(state.persistent, false);
  assert.equal(state.hasLiked(espresso), true);
  assert.equal(state.hasLiked(latte), false);
  assert.equal(state.hasSeen(cookie), true);
  assert.equal(notifications, 1);
  storage.getItem = originalRead;
  state.sync();
  assert.equal(state.hasLiked(espresso), true);
  assert.equal(notifications, 1);
});

test("failed writes retain the requested memory state and cannot resurrect a removed like", () => {
  const storage = memoryStorage([[likeKey(espresso), "1"]]);
  let notifications = 0;
  const state = create(storage, { onChange: () => notifications++ });
  storage.removeItem = () => { throw new Error("write denied"); };
  state.setLiked(espresso, false);
  assert.equal(state.hasLiked(espresso), false);
  assert.equal(state.persistent, false);
  assert.equal(notifications, 1);
  state.sync(); state.markSeen(cookie); state.setLiked(latte, true);
  assert.equal(state.hasLiked(espresso), false);
  assert.equal(state.hasLiked(latte), true);
  assert.equal(state.hasSeen(cookie), true);
  assert.equal(storage.values.get(likeKey(espresso)), "1");
  assert.equal(storage.values.has(likeKey(latte)), false);
  assert.equal(notifications, 3);
});

test("write failure notifies even for an unchanged selection; no-ops and reentrant sync do not loop", () => {
  const storage = memoryStorage([[likeKey(espresso), "1"]]);
  let notifications = 0, state;
  state = create(storage, { onChange: () => { notifications++; state.sync(); } });
  state.setLiked(espresso, true); state.sync();
  assert.equal(notifications, 0);
  state.markSeen(cookie);
  assert.equal(notifications, 1);
  state.markSeen(cookie); state.sync(seenKey(cookie));
  assert.equal(notifications, 1);
  storage.setItem = () => { throw new Error("quota exceeded"); };
  assert.equal(state.setLiked(espresso, true), false);
  assert.equal(state.persistent, false);
  assert.equal(state.hasLiked(espresso), true);
  assert.equal(notifications, 2);
  state.sync(); state.setLiked(espresso, true);
  assert.equal(notifications, 2);
});

test("qualified views count once per product per visit and survive a new visit", () => {
  const storage = memoryStorage();
  let notifications = 0;
  const first = create(storage, { onChange: () => notifications++ });
  assert.equal(first.viewCount(espresso), 0);
  assert.equal(first.hasViewedThisVisit(espresso), false);
  assert.equal(first.recordView(espresso), true);
  assert.equal(first.recordView(espresso), false);
  assert.equal(first.viewCount(espresso), 1);
  assert.equal(first.hasViewedThisVisit(espresso), true);
  assert.equal(first.hasSeen(espresso), true);
  assert.equal(first.seen(), 1);
  assert.equal(notifications, 1);
  assert.equal(storage.values.get(viewsKey(espresso)), "1");
  assert.equal(storage.values.get(seenKey(espresso)), "1");

  const nextVisit = create(storage, { onChange: () => notifications++ });
  assert.equal(notifications, 1, "Restoring history does not announce or count a view");
  assert.equal(nextVisit.viewCount(espresso), 1);
  assert.equal(nextVisit.hasViewedThisVisit(espresso), false);
  assert.equal(nextVisit.recordView(espresso), true);
  assert.equal(nextVisit.viewCount(espresso), 2);
  assert.equal(nextVisit.markSeen(espresso), false);
  assert.equal(nextVisit.recordView(espresso), false);
  assert.equal(storage.values.get(viewsKey(espresso)), "2");
  assert.equal(notifications, 2);
  nextVisit.recordView(cookie);
  assert.equal(nextVisit.viewCount(cookie), 1);
  assert.equal(nextVisit.seen(), 2, "The existing summary remains a unique-product count");
});

test("legacy viewed markers provide a truthful minimum without counting a new view on restore", () => {
  const storage = memoryStorage([[seenKey(cookie), "1"]]);
  const state = create(storage);
  assert.equal(state.viewCount(cookie), 1);
  assert.equal(state.hasViewedThisVisit(cookie), false);
  assert.equal(state.markSeen(cookie), false);
  assert.equal(storage.values.has(viewsKey(cookie)), false);
  assert.equal(state.recordView(cookie), true);
  assert.equal(state.viewCount(cookie), 2);
  assert.equal(storage.values.get(viewsKey(cookie)), "2");
});

test("view counts accept only canonical bounded integers and valid catalog IDs", () => {
  for (const value of ["0", "01", "-1", "+1", "1.0", "1e3", "1000000000", "Infinity", "NaN", " 4", "4\n", {}, 4]) {
    const state = create(memoryStorage([[viewsKey(espresso), value]]));
    assert.equal(state.viewCount(espresso), 0, `Reject ${JSON.stringify(value)}`);
    assert.equal(state.hasSeen(espresso), false);
  }
  const storage = memoryStorage([[viewsKey(espresso), "12"], [viewsKey(cookie), "999999999"], [viewsKey("unknown"), "40"]]);
  const state = create(storage);
  assert.equal(state.viewCount(espresso), 12);
  assert.equal(state.hasSeen(espresso), true, "A persisted counter also restores the viewed marker");
  assert.equal(state.viewCount(cookie), 999999999);
  assert.equal(state.recordView(cookie), false, "A saturated counter cannot overflow");
  assert.equal(state.hasViewedThisVisit(cookie), true);
  assert.equal(storage.values.get(viewsKey(cookie)), "999999999");
  const before = [...storage.values];
  for (const id of ["unknown", null, undefined, {}, 1]) {
    assert.equal(state.viewCount(id), 0);
    assert.equal(state.recordView(id), false);
    assert.equal(state.hasViewedThisVisit(id), false);
  }
  assert.equal(state.sync(viewsKey("unknown")), false);
  assert.deepEqual([...storage.values], before);
});

test("sequential same-product visits in stale tabs read and merge the latest count", () => {
  const storage = memoryStorage();
  const first = create(storage), second = create(storage);
  first.recordView(espresso);
  assert.equal(second.viewCount(espresso), 0, "The second tab has not received a storage event");
  second.recordView(espresso);
  assert.equal(second.viewCount(espresso), 2);
  assert.equal(storage.values.get(viewsKey(espresso)), "2");
  assert.equal(first.sync(viewsKey(espresso)), true);
  assert.equal(first.viewCount(espresso), 2);
  assert.equal(first.recordView(espresso), false);
  assert.equal(first.hasViewedThisVisit(espresso), true);
});

test("view synchronization preserves known counts against stale/corrupt data and honors history removal", () => {
  const storage = memoryStorage();
  let notifications = 0;
  const state = create(storage, { onChange: () => notifications++ });
  state.recordView(espresso);
  storage.values.set(viewsKey(espresso), "6");
  assert.equal(state.sync(viewsKey(espresso)), true);
  assert.equal(state.viewCount(espresso), 6);
  for (const value of ["2", "bad"]) {
    storage.values.set(viewsKey(espresso), value);
    assert.equal(state.sync(viewsKey(espresso)), false);
    assert.equal(state.viewCount(espresso), 6);
  }
  storage.values.delete(seenKey(espresso));
  storage.values.set(viewsKey(espresso), "6");
  state.sync(seenKey(espresso));
  assert.equal(state.hasSeen(espresso), true, "The numeric history remains even without its legacy marker");
  storage.values.clear();
  assert.equal(state.sync(null), true);
  assert.equal(state.viewCount(espresso), 0);
  assert.equal(state.seen(), 0);
  assert.equal(state.hasViewedThisVisit(espresso), true, "Clearing history does not fabricate another exposure in this visit");
  assert.equal(state.recordView(espresso), false);
  assert.equal(notifications, 3);
});

test("view recording works in memory when storage is unavailable and never resurrects stale history", () => {
  const storage = memoryStorage([[viewsKey(cookie), "8"]]);
  let attempts = 0, notifications = 0;
  const state = createFeedEngagement({ validIds: ids, getStorage: () => {
    attempts++; throw new Error("blocked");
  }, onChange: () => notifications++ });
  assert.equal(state.recordView(espresso), true);
  assert.equal(state.viewCount(espresso), 1);
  assert.equal(state.hasViewedThisVisit(espresso), true);
  assert.equal(state.recordView(espresso), false);
  assert.equal(state.viewCount(cookie), 0);
  state.sync(viewsKey(cookie));
  assert.equal(state.persistent, false);
  assert.equal(attempts, 1);
  assert.equal(notifications, 1);
  assert.equal(storage.values.get(viewsKey(cookie)), "8");
});

test("failed counter reads and writes retain the qualified memory view and notify once", () => {
  for (const failure of ["read", "write"]) {
    const storage = memoryStorage([[viewsKey(espresso), "2"], [seenKey(espresso), "1"]]);
    let notifications = 0;
    const state = create(storage, { onChange: () => notifications++ });
    if (failure === "read") storage.getItem = () => { throw new Error("read denied"); };
    else storage.setItem = () => { throw new Error("quota exceeded"); };
    assert.equal(state.recordView(espresso), true);
    assert.equal(state.viewCount(espresso), 3);
    assert.equal(state.hasSeen(espresso), true);
    assert.equal(state.hasViewedThisVisit(espresso), true);
    assert.equal(state.persistent, false);
    assert.equal(state.recordView(espresso), false);
    state.sync();
    assert.equal(state.viewCount(espresso), 3);
    assert.equal(notifications, 1);
  }
});

test("a persisted numeric view remains restorable if its legacy-marker write fails", () => {
  const storage = memoryStorage();
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.startsWith("robys-feed-seen-v1:")) throw new Error("partial write");
    write(key, value);
  };
  const first = create(storage);
  first.recordView(espresso);
  assert.equal(first.persistent, false);
  assert.equal(first.viewCount(espresso), 1);
  assert.equal(storage.values.get(viewsKey(espresso)), "1");
  assert.equal(storage.values.has(seenKey(espresso)), false);
  const restored = create(storage);
  assert.equal(restored.viewCount(espresso), 1);
  assert.equal(restored.hasSeen(espresso), true);
});

test("a partial failed snapshot does not commit newer view counts or likes", () => {
  const storage = memoryStorage([[viewsKey(espresso), "3"], [likeKey(espresso), "1"]]);
  let notifications = 0;
  const state = create(storage, { onChange: () => notifications++ });
  storage.values.set(viewsKey(espresso), "8");
  storage.values.set(likeKey(cookie), "1");
  const read = storage.getItem;
  let reads = 0;
  storage.getItem = key => {
    if (++reads === 4) throw new Error("read denied after staged count");
    return read(key);
  };
  state.sync();
  assert.equal(state.viewCount(espresso), 3);
  assert.equal(state.hasLiked(cookie), false);
  assert.equal(state.hasLiked(espresso), true);
  assert.equal(state.persistent, false);
  assert.equal(notifications, 1);
});
