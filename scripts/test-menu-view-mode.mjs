import test from "node:test";
import assert from "node:assert/strict";
import { MENU_VIEW_STORAGE_KEY, normalizeMenuSearch, readMenuViewContext, menuViewUrl,
  readMenuViewPreference, storeMenuViewPreference, readMenuNavigationType, shouldOpenPreferredFeed } from "../menu-view-mode.js";

const base = "https://example.test/cafe/menu.html";
const categories = ["all", "hot-coffee", "cold-coffee", "desserts", "food"];

test("remembered feed applies only to a fresh generic list entry", () => {
  assert.equal(shouldOpenPreferredFeed(base, "feed", "navigate"), true);
  assert.equal(shouldOpenPreferredFeed(base.replace("menu.html", "menu"), "feed", "navigate"), true);
  assert.equal(shouldOpenPreferredFeed(base.replace("menu.html", ""), "feed", "navigate"), false);
  for (const suffix of ["?view=list", "?view=feed", "?lang=ru", "?q=latte", "?product=hot-coffee:espresso",
    "?utm_source=qr", "#desserts", "#menu-family", "#kids-menu", "#menu-combos", "#menu-combos-takeaway", "#combo-family"]) {
    assert.equal(shouldOpenPreferredFeed(base + suffix, "feed", "navigate"), false, suffix);
  }
  for (const navigation of ["back_forward", "reload", "prerender", null, undefined, "unknown"]) {
    assert.equal(shouldOpenPreferredFeed(base, "feed", navigation), false, navigation);
  }
  assert.equal(shouldOpenPreferredFeed(base, "feed"), false, "Missing timing never implies a new visit");
  assert.equal(shouldOpenPreferredFeed(base, "list", "navigate"), false);
  assert.equal(shouldOpenPreferredFeed(base, "invalid", "navigate"), false);
  assert.equal(shouldOpenPreferredFeed(base.replace("menu.html", "menu-feed.html"), "feed", "navigate"), false);
});

test("reload and Back remain list entries when the modern timing entry is delayed or disagrees", () => {
  for (const [legacyType, expected] of [[1, "reload"], [2, "back_forward"]]) {
    for (const entries of [[], [{ type: "navigate" }], [{ type: expected }]]) {
      const timing = { getEntriesByType: () => entries, navigation: { type: legacyType } };
      const navigation = readMenuNavigationType(timing);
      assert.equal(navigation, expected);
      assert.equal(shouldOpenPreferredFeed(base, "feed", navigation), false);
    }
  }
  for (const type of ["reload", "back_forward"]) {
    assert.equal(readMenuNavigationType({ getEntriesByType: () => [{ type }], navigation: { type: 0 } }), type);
  }
});

test("preference routing requires positive fresh-navigation evidence and tolerates unavailable timing", () => {
  const modern = { getEntriesByType: () => [{ type: "navigate" }] };
  const legacy = { getEntriesByType: () => [], navigation: { type: 0 } };
  for (const timing of [modern, legacy]) {
    assert.equal(shouldOpenPreferredFeed(base, "feed", readMenuNavigationType(timing)), true);
  }
  const denied = { getEntriesByType() { throw new Error("unavailable"); }, get navigation() { throw new Error("unavailable"); } };
  for (const timing of [undefined, {}, { getEntriesByType: () => [] }, { navigation: { type: 255 } }, denied]) {
    assert.equal(readMenuNavigationType(timing), null);
    assert.equal(shouldOpenPreferredFeed(base, "feed", readMenuNavigationType(timing)), false);
  }
  assert.equal(readMenuNavigationType({ getEntriesByType() { throw new Error("unavailable"); }, navigation: { type: 1 } }), "reload");
});

test("an already visited generic list history entry remains list even if timing reports navigate", () => {
  const originalEntry = { unrelated: "preserved", robysMenuViewEntry: "list" };
  assert.equal(shouldOpenPreferredFeed(base, "feed", "navigate", originalEntry), false);
  assert.equal(shouldOpenPreferredFeed(base, "feed", "navigate", null), true, "A separate fresh entry still uses the saved choice");
  assert.equal(shouldOpenPreferredFeed(base, "feed", "navigate", { unrelated: "state" }), true);
  assert.deepEqual(originalEntry, { unrelated: "preserved", robysMenuViewEntry: "list" });
});

test("language, category and Unicode search survive both direction switches", () => {
  const context = { language: "ru", category: "desserts", search: "Чизкейк & кофе" };
  const feed = new URL(menuViewUrl(base, "feed", context, categories));
  assert.equal(feed.pathname, "/cafe/menu-feed.html");
  assert.equal(feed.searchParams.get("view"), "feed");
  assert.equal(feed.hash, "#desserts");
  const restored = readMenuViewContext(feed.href, categories);
  assert.equal(restored.language, context.language);
  assert.equal(restored.search, context.search);
  assert.equal(restored.category, context.category);
  const list = new URL(menuViewUrl(feed.href, "list", restored, categories));
  assert.equal(list.pathname, "/cafe/menu.html");
  assert.equal(list.searchParams.get("view"), "list");
  assert.equal(list.searchParams.get("lang"), "ru");
  assert.equal(list.searchParams.get("q"), context.search);
  assert.equal(list.hash, "#desserts");
  assert.equal(shouldOpenPreferredFeed(list.href, "feed", "navigate"), false);
});

test("valid product entries translate between the existing product URL formats", () => {
  const context = readMenuViewContext(`${base}?product=hot-coffee:espresso&lang=en`, categories);
  assert.equal(context.category, "hot-coffee");
  const feed = new URL(menuViewUrl(base, "feed", context, categories));
  assert.equal(feed.searchParams.get("item"), "hot-coffee:espresso");
  assert.equal(feed.searchParams.has("product"), false);
  const list = new URL(menuViewUrl(feed.href, "list", readMenuViewContext(feed.href, categories), categories));
  assert.equal(list.searchParams.get("product"), "hot-coffee:espresso");
  assert.equal(list.searchParams.has("item"), false);
  assert.equal(new URL(menuViewUrl(base, "feed", { ...context, search: "cake" }, categories)).searchParams.has("item"), false);
  assert.equal(new URL(menuViewUrl(base, "feed", { ...context, category: "desserts" }, categories)).searchParams.has("item"), false);
});

test("untrusted URL values stay bounded data and cannot choose a navigation destination", () => {
  const query = new URLSearchParams({ lang: "<script>", q: "\u0000" + "🍰".repeat(200), item: "javascript:alert(1)", next: "https://evil.test/" });
  const context = readMenuViewContext(`${base}?${query}#unknown`, categories);
  assert.equal(context.language, null);
  assert.equal(context.category, "all");
  assert.equal(context.productId, null);
  assert.equal(Array.from(context.search).length, 120);
  assert.equal(normalizeMenuSearch(null), "");
  const target = new URL(menuViewUrl(base, "https://evil.test/", context, categories));
  assert.equal(target.origin, "https://example.test");
  assert.equal(target.pathname, "/cafe/menu.html");
  assert.deepEqual([...target.searchParams.keys()], ["view", "q"]);
  assert.equal(target.hash, "");
});

test("preference writes only known modes and tolerates unavailable storage", () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  assert.equal(readMenuViewPreference(storage), null);
  assert.equal(storeMenuViewPreference(storage, "feed"), true);
  assert.equal(map.get(MENU_VIEW_STORAGE_KEY), "feed");
  assert.equal(readMenuViewPreference(storage), "feed");
  assert.equal(storeMenuViewPreference(storage, "list"), true);
  assert.equal(storeMenuViewPreference(storage, "unknown"), false);
  assert.equal(readMenuViewPreference(storage), "list");
  map.set(MENU_VIEW_STORAGE_KEY, "corrupted");
  assert.equal(readMenuViewPreference(storage), null);
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  for (const unavailable of [undefined, denied]) {
    assert.equal(readMenuViewPreference(unavailable), null);
    assert.equal(storeMenuViewPreference(unavailable, "feed"), false);
  }
});
