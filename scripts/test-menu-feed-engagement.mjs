import test from "node:test";
import assert from "node:assert/strict";
import { createFeedEngagement } from "../src/menu-feed-engagement.js";

const ids = new Set(["hot-coffee:espresso", "desserts:cookie", "cold-coffee:iced-latte"]);
const [espresso, cookie, latte] = ids;
const likeKey = id => `robys-feed-like-v1:${id}`;
const seenKey = id => `robys-feed-seen-v1:${id}`;
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
