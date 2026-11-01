import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";
import { MENU_VIEW_STORAGE_KEY, normalizeMenuSearch, readMenuViewContext, menuViewUrl,
  readMenuViewPreference, storeMenuViewPreference, readMenuNavigationType, shouldOpenPreferredFeed } from "../menu-view-mode.js";

const base = "https://example.test/cafe/menu.html";
const categories = ["all", "hot-coffee", "cold-coffee", "desserts", "food"];

// Execute the actual list entry body, stopping at its first DOM operation.
// Static search/help helpers are excluded; browser journeys cover their wiring.
const listEntrySource = readFileSync(new URL("../src/menu-app.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replaceAll("import.meta.url", JSON.stringify(base));
function observeListStartup({ suffix = "", preference = "feed", state = null,
  timing = { getEntriesByType: () => [{ type: "navigate" }] }, deniedStorage = false } = {}) {
  const url = new URL(base + suffix);
  const boundary = new Error("List DOM initialization reached");
  const redirects = [], historyWrites = [];
  let startupReads = 0;
  const context = {
    location: { href: url.href, search: url.search, hash: url.hash,
      replace: destination => redirects.push(destination) },
    history: { state, replaceState: next => historyWrites.push(JSON.parse(JSON.stringify(next))) },
    performance: timing,
    localStorage: { getItem() { if (deniedStorage) throw new Error("Storage unavailable"); return preference; } },
    document: new Proxy({}, { get() { startupReads++; throw boundary; } })
  };
  // Warming is an initial DOM operation too; the redirect must precede it.
  context.warmFeedOnIntent = () => context.document.head;
  try { runInNewContext(listEntrySource, context); }
  catch (error) { if (error !== boundary) throw error; }
  return { redirects, historyWrites, startupReads };
}

test("preferred generic feed entry skips the list's DOM, render and eager startup", () => {
  for (const timing of [{ getEntriesByType: () => [{ type: "navigate" }] },
    { getEntriesByType: () => [], navigation: { type: 0 } }]) {
    assert.deepEqual(observeListStartup({ timing }), {
      redirects: ["menu-feed.html?view=feed"], historyWrites: [], startupReads: 0
    });
  }
});

test("explicit entries and navigation safeguards still enter list initialization", () => {
  const cases = [
    ...["?view=list", "?view=feed", "?lang=ru", "?q=latte", "?product=hot-coffee:espresso", "?utm_source=qr",
      "#desserts", "#menu-family", "#kids-menu", "#menu-combos", "#menu-combos-takeaway"].map(suffix => ({ suffix })),
    ...["list", null, "invalid"].map(preference => ({ preference })),
    ...["reload", "back_forward", "prerender"].map(type => ({
      timing: { getEntriesByType: () => [{ type }], navigation: { type: 0 } }
    })),
    ...[1, 2].map(type => ({ timing: { getEntriesByType: () => [{ type: "navigate" }], navigation: { type } } })),
    { timing: {} }, { timing: { getEntriesByType: () => [] } },
    { timing: { getEntriesByType: () => [{ type: "unknown" }] } },
    { timing: { getEntriesByType() { throw new Error("Timing unavailable"); } } },
    { state: { robysMenuViewEntry: "list" } }, { deniedStorage: true }
  ];
  for (const options of cases) {
    const result = observeListStartup(options);
    assert.deepEqual(result.redirects, [], JSON.stringify(options));
    assert.equal(result.startupReads, 1, "A nonredirected entry must reach normal list startup");
  }
  assert.deepEqual(observeListStartup({ preference: "list", state: { unrelated: "kept" } }).historyWrites,
    [{ unrelated: "kept", robysMenuViewEntry: "list" }]);
});

test("shipped menu view runtime matches its authored source", () => {
  const source = readFileSync(new URL("../src/menu-view-mode.js", import.meta.url), "utf8");
  const shipped = readFileSync(new URL("../menu-view-mode.js", import.meta.url), "utf8");
  assert.equal(shipped, compileMenuRuntime(source),
    "Generated menu-view-mode.js is stale or differs from its source; run npm run build");
});

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

import { canWarmMenu } from '../src/menu-view-prefetch.js';
import { warmFeedRuntime, warmFeedOnIntent } from '../src/menu-feed-warmup.js';
test('speculative menu bytes respect data saving, offline, hidden tabs and slow connections', () => {
  assert.equal(canWarmMenu(undefined), true);
  assert.equal(canWarmMenu({effectiveType:'4g'}), true);
  for (const connection of [{saveData:true}, {effectiveType:'slow-2g'}, {effectiveType:'2g'}, {effectiveType:'3g'}]) assert.equal(canWarmMenu(connection), false);
  assert.equal(canWarmMenu(undefined,true), false);
  assert.equal(canWarmMenu(undefined,false,false), false);
});

test('alternate feed runtime warming is local, revisioned, low priority and respects connection limits', () => {
  function fixture({ supported = true, hidden = false, online = true, connection } = {}) {
    const hints = [];
    const document = { hidden, head: { append: hint => hints.push(hint) },
      createElement: () => ({ relList: { supports: value => supported && value === 'modulepreload' } }) };
    const location = { origin: 'https://example.test', href: 'https://example.test/cafe/menu.html?view=list' };
    return { environment: { document, navigator: { onLine: online, connection }, location }, hints };
  }
  const valid = './menu-feed.js?v=0123456789ab';
  const allowed = fixture({ connection: { effectiveType: '4g', saveData: false } });
  assert.equal(warmFeedRuntime(valid, allowed.environment), true);
  assert.equal(allowed.hints.length, 1);
  assert.equal(allowed.hints[0].href, 'https://example.test/cafe/menu-feed.js?v=0123456789ab');
  assert.equal(allowed.hints[0].rel, 'modulepreload');
  assert.equal(allowed.hints[0].fetchPriority, 'low');
  for (const options of [{ supported: false }, { hidden: true }, { online: false },
    { connection: { saveData: true } }, { connection: { effectiveType: 'slow-2g' } },
    { connection: { effectiveType: '2g' } }, { connection: { effectiveType: '3g' } }]) {
    const blocked = fixture(options);
    assert.equal(warmFeedRuntime(valid, blocked.environment), false, JSON.stringify(options));
    assert.equal(blocked.hints.length, 0);
  }
  for (const target of ['https://other.test/cafe/menu-feed.js?v=0123456789ab',
    'https://user:pass@example.test/cafe/menu-feed.js?v=0123456789ab',
    './order-storage.js?v=0123456789ab', './menu-feed.js', './menu-feed.js?v=old',
    './menu-feed.js?v=0123456789ab&other=1', './menu-feed.js?v=0123456789ab#other']) {
    const rejected = fixture();
    assert.equal(warmFeedRuntime(target, rejected.environment), false, target);
    assert.equal(rejected.hints.length, 0);
  }
});

test('feed runtime remains unfetched until trusted menu browsing and warms at most once', () => {
  const listeners = new Map(), hints = [];
  const document = {
    hidden: false, head: { append: hint => hints.push(hint) },
    createElement: () => ({ relList: { supports: value => value === 'modulepreload' } }),
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); }
  };
  const environment = { document, navigator: { onLine: true, connection: { effectiveType: '4g', saveData: false } },
    location: { origin: 'https://example.test', href: 'https://example.test/cafe/menu.html' } };
  const target = { closest: selector => selector.startsWith('#menu-root') ? {} : null };
  warmFeedOnIntent('./menu-feed.js?v=0123456789ab', environment);
  assert.equal(hints.length, 0, 'Initial page load must not download the alternate runtime');
  listeners.get('pointerdown')({ type: 'pointerdown', isTrusted: false, target });
  assert.equal(hints.length, 0, 'Synthetic events cannot spend speculative bytes');
  environment.navigator.connection.saveData = true;
  listeners.get('pointerdown')({ type: 'pointerdown', isTrusted: true, target });
  assert.equal(hints.length, 0, 'Data saving still blocks user-triggered warming');
  environment.navigator.connection.saveData = false;
  listeners.get('pointerdown')({ type: 'pointerdown', isTrusted: true, target });
  assert.equal(hints.length, 1);
  assert.equal(hints[0].href, 'https://example.test/cafe/menu-feed.js?v=0123456789ab');
  assert.equal(listeners.size, 0, 'A successful hint removes all warmup listeners');
});
// Native hints must remain optional and cannot change links, orders or counters.
function observeWarm({ supported = true, hidden = false, online = true, connection,
  href = 'https://example.test/cafe/menu.html?view=list&lang=ru#desserts' } = {}) {
  const listeners = new Map(), hints = [], timers = [];
  let removed = 0;
  const hint = { relList: { supports: value => supported && value === 'prefetch' }, remove: () => removed++ };
  const link = { href };
  const document = { hidden, readyState: 'loading', createElement: () => hint,
    querySelector: () => link, head: { append: node => hints.push({ ...node }) },
    addEventListener: (name, fn) => listeners.set(name, fn) };
  const context = { URL, document, navigator: { onLine: online, connection },
    location: { origin: 'https://example.test', href: 'https://example.test/cafe/menu-feed.html' },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    fetch: () => assert.fail('Warming must not fetch or parse executable assets') };
  const source = readFileSync(new URL('../src/menu-view-prefetch.js', import.meta.url), 'utf8')
    .replaceAll('export function', 'function');
  runInNewContext(source + '\ninitFeedListPrefetch();', context);
  const intent = { target: { closest: () => link }, preventDefault: () => assert.fail('Native navigation cannot be intercepted') };
  return { hints, timers, document, link, originalHref: href,
    intent: () => listeners.get('pointerover')?.(intent),
    focus: () => listeners.get('focusin')?.(intent),
    load: () => listeners.get('load')?.(),
    hide: () => { document.hidden = true; listeners.get('visibilitychange')?.(); },
    pagehide: () => listeners.get('pagehide')?.(), removed: () => removed };
}
test('one low-priority native document hint preserves navigation and does not warm assets', () => {
  const observed = observeWarm();
  observed.intent(); observed.intent(); observed.focus(); observed.load(); observed.timers.forEach(fn => fn());
  assert.equal(observed.hints.length, 1);
  assert.equal(observed.hints[0].href, 'https://example.test/cafe/menu.html?view=list&lang=ru');
  assert.equal(observed.hints[0].rel, 'prefetch');
  assert.equal(observed.hints[0].as, 'document');
  assert.equal(observed.hints[0].fetchPriority, 'low');
  assert.equal(observed.link.href, observed.originalHref);
  observed.pagehide(); assert.equal(observed.removed(), 1);
});
test('native warming respects browser support, data saving, visibility, connectivity and target identity', () => {
  for (const options of [{ supported: false }, { hidden: true }, { online: false },
    { connection: { saveData: true } }, { connection: { effectiveType: '3g' } },
    { href: 'https://other.test/cafe/menu.html' }, { href: 'https://user:pass@example.test/cafe/menu.html' },
    { href: 'https://example.test/other/menu.html' }, { href: 'https://example.test/cafe/order-storage.js' }]) {
    const observed = observeWarm(options);
    observed.intent(); observed.load(); observed.timers.forEach(fn => fn());
    assert.equal(observed.hints.length, 0, JSON.stringify(options));
    assert.equal(observed.link.href, observed.originalHref);
  }
  const observed = observeWarm(); observed.load(); observed.hide(); observed.timers.forEach(fn => fn());
  assert.equal(observed.hints.length, 0);
});
