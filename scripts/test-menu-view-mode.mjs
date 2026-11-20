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
    location: { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash,
      replace: destination => redirects.push(destination) },
    history: { state, replaceState: next => historyWrites.push(JSON.parse(JSON.stringify(next))) },
    performance: timing,
    localStorage: { getItem() { if (deniedStorage) throw new Error("Storage unavailable"); return preference; } },
    document: new Proxy({}, { get() { startupReads++; throw boundary; } })
  };
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
    { preference: "list" },
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
  assert.equal(shouldOpenPreferredFeed(base, null, "navigate"), true, "First visits open the feed");
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
  assert.equal(storeMenuViewPreference(storage, "grid"), true);
  assert.equal(readMenuViewPreference(storage), "grid");
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
test('speculative menu bytes respect data saving, offline, hidden tabs and slow connections', () => {
  assert.equal(canWarmMenu(undefined), true);
  assert.equal(canWarmMenu({effectiveType:'4g'}), true);
  for (const connection of [{saveData:true}, {effectiveType:'slow-2g'}, {effectiveType:'2g'}, {effectiveType:'3g'}]) assert.equal(canWarmMenu(connection), false);
  assert.equal(canWarmMenu(undefined,true), false);
  assert.equal(canWarmMenu(undefined,false,false), false);
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


test("fresh visitors start in feed and a saved photo grid opens without rendering the list", () => {
  for (const preference of [null, "invalid"]) {
    assert.deepEqual(observeListStartup({ preference }).redirects, ["menu-feed.html?view=feed"]);
  }
  const grid = observeListStartup({ preference: "grid" });
  assert.deepEqual(grid, { redirects: ["menu-grid.html?view=grid"], historyWrites: [], startupReads: 0 });
});

test("photo-grid URLs preserve safe language, category, search and product context", () => {
  const context = { language: "ru", category: "desserts", search: "Чизкейк" };
  const grid = new URL(menuViewUrl(base, "grid", context, categories));
  assert.equal(grid.pathname, "/cafe/menu-grid.html");
  assert.equal(grid.searchParams.get("view"), "grid");
  assert.equal(grid.searchParams.get("lang"), "ru");
  assert.equal(grid.searchParams.get("q"), "Чизкейк");
  assert.equal(grid.hash, "#desserts");
  const product = new URL(menuViewUrl(base, "grid", { language: "en", productId: "hot-coffee:espresso" }, categories));
  assert.equal(product.searchParams.get("product"), "hot-coffee:espresso");
  assert.equal(product.searchParams.has("item"), false);
});

test("all menu surfaces present feed, photos and list in the requested order", () => {
  for (const [file, current] of [["menu-feed.html", "feed"], ["menu-grid.html", "grid"], ["menu.html", "list"]]) {
    const html = readFileSync(file, "utf8");
    const nav = html.match(/<nav[^>]*class="(?:feed-view-switch|menu-view-switch)"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, file);
    assert.deepEqual([...nav.matchAll(/data-menu-view="([a-z]+)"/g)].map(match => match[1]), ["feed", "grid", "list"], file);
    assert.match(nav, new RegExp(`data-menu-view="${current}"[^>]*aria-current="page"`));
  }
  const grid = readFileSync("menu-grid.html", "utf8");
  assert.match(grid, /class="menu-page menu-photo-grid"/);
  const list = readFileSync("menu.html", "utf8");
  assert.equal(grid.replace(' menu-photo-grid', '').replace('data-menu-view="grid" aria-current="page"', 'data-menu-view="grid"')
    .replace('data-menu-view="list"', 'data-menu-view="list" aria-current="page"')
    .replace(/<link rel="stylesheet" href="menu-grid\.css\?v=[a-f0-9]+" \/>/, ''), list,
    "Grid is generated from the final list document and uses its exact catalog/runtime/cache revisions");
  const sw = readFileSync("sw-core-v64.js", "utf8");
  for (const file of ["menu-grid.html", "menu-grid.css"]) assert.ok(sw.includes(`./${file}`));
  assert.match(sw, /if \(isMenuGrid\) return cachedPage\("menu-grid.html"\)/);
});


// Deterministic strength-2 covering array. Validate coverage independently
// against every value pair in the factor domains, not just the selected rows.
function coveringRows(factors) {
  const all = factors.reduce((rows, values) =>
    rows.flatMap(row => values.map(value => [...row, value])), [[]]);
  const key = (i, value, j, other) => JSON.stringify([i, value, j, other]);
  const keys = row => row.flatMap((value, i) =>
    row.slice(i + 1).map((other, j) => key(i, value, i + j + 1, other)));
  const required = new Set();
  for (let i = 0; i < factors.length; i++) for (let j = i + 1; j < factors.length; j++)
    for (const value of factors[i]) for (const other of factors[j]) required.add(key(i, value, j, other));
  const remaining = new Set(required);
  const candidates = all.map(row => ({ row, keys: keys(row) }));
  const selected = [];
  while (remaining.size) {
    let best, score = 0;
    for (const candidate of candidates) {
      const gain = candidate.keys.filter(pair => remaining.has(pair)).length;
      if (gain > score) { best = candidate; score = gain; }
    }
    assert.ok(best, "covering array cannot leave any pair uncovered");
    selected.push(best.row);
    for (const pair of best.keys) remaining.delete(pair);
  }
  assert.deepEqual(new Set(selected.flatMap(keys)), required);
  return { rows: selected, full: all.length, pairs: required.size };
}

test("PAIRWISE: fresh menu entry respects explicit intent, history, preference and timing", async t => {
  const factors = [
    ["generic", "lang", "search", "anchor"], ["feed", "list", "grid", null],
    ["navigate", "reload", "back_forward", null], ["new", "visited"], ["list", "alias", "feed"]
  ];
  const { rows, full, pairs } = coveringRows(factors);
  assert.equal(full, 384);
  assert.equal(pairs, 114);
  assert.equal(rows.length, 18);
  const suffixes = { generic: "", lang: "?lang=ru", search: "?q=coffee", anchor: "#desserts" };
  const paths = { list: "menu.html", alias: "menu", feed: "menu-feed.html" };
  let positive = 0, negative = 0;
  for (const [entry, preference, timing, history, path] of rows) {
    await t.test(JSON.stringify([entry, preference, timing, history, path]), () => {
      const href = new URL(paths[path] + suffixes[entry], base).href;
      const historyState = history === "visited" ? { robysMenuViewEntry: "list" } : null;
      // Expected by product contract: only a fresh, unqualified list entry can redirect.
      const expected = entry === "generic" && ["feed", null].includes(preference)
        && timing === "navigate" && history === "new" && path !== "feed";
      assert.equal(shouldOpenPreferredFeed(href, preference, timing, historyState), expected);
      if (expected) positive++; else negative++;
    });
  }
  assert.ok(positive > 0 && negative > 0, "positive and denial controls are required");
  t.diagnostic(`${rows.length}/${full} combinations; ${pairs}/${pairs} distinct factor pairs`);
});

test("PAIRWISE: language, view, category, Unicode search and product intent survive URL roundtrip", async t => {
  const { rows, full, pairs } = coveringRows([
    ["tr", "en", "ru"], ["feed", "grid", "list"], ["all", "desserts", "hot-coffee"],
    ["", "Чай & кофе", "tatlı"], [null, "hot-coffee:espresso", "desserts:brownie"]
  ]);
  assert.equal(full, 243);
  assert.equal(pairs, 90);
  assert.equal(rows.length, 15);
  const paths = { feed: "/cafe/menu-feed.html", grid: "/cafe/menu-grid.html", list: "/cafe/menu.html" };
  for (const [language, view, category, search, productId] of rows) {
    await t.test(JSON.stringify([language, view, category, search, productId]), () => {
      const url = new URL(menuViewUrl(base, view, { language, category, search, productId }, categories));
      const productCategory = productId?.split(":")[0];
      const keepProduct = !search && productId !== null && (category === "all" || category === productCategory);
      assert.equal(url.origin, new URL(base).origin);
      assert.equal(url.pathname, paths[view]);
      assert.equal(url.searchParams.get("view"), view);
      assert.equal(url.searchParams.get("lang"), language);
      assert.equal(url.searchParams.get("q"), search || null);
      assert.equal(url.hash, category === "all" ? "" : "#" + category);
      assert.equal(url.searchParams.get(view === "feed" ? "item" : "product"), keepProduct ? productId : null);
      assert.equal(url.searchParams.has(view === "feed" ? "product" : "item"), false);
      const restored = readMenuViewContext(url.href, categories);
      assert.equal(restored.language, language);
      assert.equal(restored.search, search);
      assert.equal(restored.hasSearch, Boolean(search));
      assert.equal(restored.category, keepProduct ? productCategory : category);
      assert.equal(restored.productId, keepProduct ? productId : null);
    });
  }
  t.diagnostic(`${rows.length}/${full} combinations; ${pairs}/${pairs} distinct factor pairs`);
});


test("QA runner isolates loopback and validates exact head and allowlisted selection", async t => {
  const { createWorkbenchServer } = await import("../.github/qa/local-runner.mjs");
  const head="a".repeat(40), calls=[];
  const server=createWorkbenchServer({getHead:()=>head,run:async(check,revision)=>{
    calls.push([check,revision]);return {check,head:revision,status:"PASS",artifact:".artifacts/test-only"};
  }});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.()}));
  const origin="http://127.0.0.1:"+server.address().port;
  const config=await (await fetch(origin+"/api/config")).json();
  assert.equal(config.head,head);
  const graphResponse=await fetch(origin+"/api/graph");
  assert.equal(graphResponse.status,200);
  assert.equal(await graphResponse.text(),readFileSync(new URL("../qa/causal-regression-graph.json",import.meta.url),"utf8"));

  const post=(data,token=config.token,source=origin)=>fetch(origin+"/api/run",{method:"POST",headers:{"Content-Type":"application/json","X-QA-Token":token,Origin:source},body:JSON.stringify(data)});
  assert.equal((await post({check:"counter-contracts",head},"wrong")).status,403);
  assert.equal((await post({check:"counter-contracts",head},config.token,"https://evil.test")).status,403);
  assert.equal((await post({check:"arbitrary-command",head})).status,400);
  assert.equal((await post({check:"counter-contracts",head,command:"not allowed"})).status,400);
  assert.equal((await post({check:"counter-contracts",head:"b".repeat(40)})).status,409);
  assert.deepEqual(calls,[]);
  const good=await post({check:"counter-contracts",head});
  assert.equal(good.status,200);assert.equal((await good.json()).status,"PASS");
  assert.deepEqual(calls,[["counter-contracts",head]]);
});


test("QA history: durable snapshots, deterministic diff, and corrupt-record rejection",async t=>{
  const {mkdtempSync,rmSync,readFileSync,writeFileSync}=await import("node:fs");
  const {tmpdir}=await import("node:os");
  const {join}=await import("node:path");
  const {createHistoryStore,compareHistorySnapshots}=await import("../.github/qa/history-store.mjs");
  const dir=mkdtempSync(join(tmpdir(),"robys-qa-history-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const store=createHistoryStore(dir),h1="a".repeat(40),h2="b".repeat(40),digest="c".repeat(64);
  const sample={head:h1,registrySha256:digest,checks:[{id:"counter-contracts",status:"PASS"}],
    cases:[{id:"PAG-01",status:"PASS"},{id:"PAG-03",status:"FAIL"}]};
  const first=store.save(sample);
  assert.equal(first.id.length,64);
  assert.equal(store.save(sample).id,first.id,"same snapshot cannot be duplicated");
  assert.equal(createHistoryStore(dir).list().length,1,"persistent after reopening store");
  const second=store.save({...sample,head:h2,checks:[{id:"counter-contracts",status:"FAIL"}],
    cases:[{id:"PAG-01",status:"FAIL"},{id:"PAG-03",status:"PASS"}]});
  const delta=compareHistorySnapshots(first,second);
  assert.equal(delta.regressions,2);assert.equal(delta.recovered,1);assert.equal(delta.registryChanged,false);
  assert.deepEqual(delta.rows.map(row=>[row.kind,row.id,row.change]),[
    ["checks","counter-contracts","REGRESSION"],["cases","PAG-01","REGRESSION"],["cases","PAG-03","RECOVERED"]]);
  assert.throws(()=>store.save({...sample,checks:[...sample.checks,...sample.checks]}),/invalid_checks/);
  assert.throws(()=>store.save({...sample,head:"../escape"}),/invalid_snapshot/);
  assert.throws(()=>store.save({...sample,cases:[{id:"PAG-03",status:"NOT_RUN"}]}),/invalid_cases/);
  const filename=`snapshot-${first.head}-${first.id}.json`;
  const data=JSON.parse(readFileSync(join(dir,filename),"utf8"));
  writeFileSync(join(dir,filename),JSON.stringify({...data,checks:[{id:"counter-contracts",status:"FAIL"}]}));
  assert.throws(()=>store.list(),/history_digest_mismatch/);
  writeFileSync(join(dir,filename),JSON.stringify({...data,trust:"CI_ATTESTED"}));
  assert.throws(()=>store.list(),/corrupt_history/);
});


test("QA history HTTP: token/origin, bounded writes, dedupe and cross-run listing",async t=>{
  const {mkdtempSync,rmSync}=await import("node:fs");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
  const {createWorkbenchServer}=await import("../.github/qa/local-runner.mjs");
  const dir=mkdtempSync(join(tmpdir(),"robys-qa-http-history-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const head="a".repeat(40);
  const server=createWorkbenchServer({getHead:()=>head,historyDir:dir,run:async()=>{throw Error("should not execute")}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections?.();server.close(resolve)}));
  const origin="http://127.0.0.1:"+server.address().port;
  const cfg=await(await fetch(origin+"/api/config")).json();
  const headers={"Content-Type":"application/json","X-QA-Token":cfg.token,Origin:origin};
  const payload={head,registrySha256:null,checks:[],cases:[{id:"PAG-03",status:"FAIL"}]};
  assert.equal((await fetch(origin+"/api/history")).status,403);
  assert.equal((await fetch(origin+"/api/history",{method:"POST",headers:{...headers,Origin:"https://evil.test"},body:JSON.stringify(payload)})).status,403);
  assert.equal((await fetch(origin+"/api/history",{method:"POST",headers,body:JSON.stringify({...payload,head:"b".repeat(40)})})).status,409);
  const post=()=>fetch(origin+"/api/history",{method:"POST",headers,body:JSON.stringify(payload)});
  const one=await post();assert.equal(one.status,201);const stored=(await one.json()).snapshot;
  assert.equal((await post()).status,201);
  assert.equal((await fetch(origin+"/api/history",{method:"POST",headers,body:"{"})).status,400);
  assert.equal((await fetch(origin+"/api/run",{method:"POST",headers,body:"{"})).status,400);
  const history=await fetch(origin+"/api/history",{headers:{"X-QA-Token":cfg.token}});
  assert.equal(history.status,200);const list=(await history.json()).history;
  assert.equal(list.length,1);assert.equal(list[0].id,stored.id);assert.equal(list[0].trust,"LOCAL_UNVERIFIED_IMPORT");
  assert.equal((await fetch(origin+"/api/history",{method:"POST",headers,body:JSON.stringify({...payload,cases:[{id:"PAG-03",status:"BOGUS"}]})})).status,400);
});


test("QA regression cards: exact PASS-to-FAIL only; graph links stay hypothetical",async()=>{
  const {buildRegressionCards}=await import("../.github/qa/regression-cards.mjs");
  const {readFileSync}=await import("node:fs");
  const {createHash}=await import("node:crypto");
  const graphText=readFileSync(new URL("../qa/causal-regression-graph.json",import.meta.url));
  const digest=createHash("sha256").update(graphText).digest("hex"),graph=JSON.parse(graphText);
  const make=(head,checks,cases,sha=digest)=>({head,registrySha256:sha,checks,cases,
    id:createHash("sha256").update(JSON.stringify({head,checks,cases,sha})).digest("hex"),
    trust:"LOCAL_UNVERIFIED_IMPORT"});
  const first=make("a".repeat(40),[{id:"counter-contracts",status:"PASS"},
    {id:"source-contracts",status:"FAIL"}],[{id:"PAG-03",status:"PASS"},{id:"PAG-01",status:"FAIL"}]);
  const second=make("b".repeat(40),[{id:"counter-contracts",status:"FAIL"},
    {id:"source-contracts",status:"PASS"}],[{id:"PAG-03",status:"FAIL"},{id:"PAG-01",status:"NOT_RUN"}].filter(x=>x.status!=="NOT_RUN"));
  const result=buildRegressionCards(first,second,graph,digest);
  assert.equal(result.registryCompatible,true);
  assert.equal(result.cards.length,2);
  assert.deepEqual(result.cards.map(x=>x.testId),["counter-contracts","PAG-03"]);
  const suiteCard=result.cards[0],caseCard=result.cards[1];
  assert.deepEqual(caseCard.linkedComponents,["menu-feed"]);
  assert(suiteCard.linkedComponents.includes("counter-service"));
  assert(caseCard.potentialDownstream.length>0);
  assert(result.cards.every(x=>x.severity==="UNASSESSED"&&x.review==="NEEDS_TRIAGE"
    &&x.componentLinks==="HYPOTHESIS_ONLY"&&x.evidence.provenance==="LOCAL_UNVERIFIED_IMPORT"));
  const mismatched=buildRegressionCards(first,{...second,registrySha256:"f".repeat(64)},graph,digest);
  assert.equal(mismatched.registryCompatible,false);
  assert(mismatched.cards.every(x=>!x.linkedComponents.length&&!x.potentialDownstream.length&&!x.relatedJourneys.length));
  const noGraph=buildRegressionCards(first,second,null,null);
  assert.equal(noGraph.registryCompatible,false);
  assert.equal(noGraph.cards.length,2);
  assert.throws(()=>buildRegressionCards({...first,trust:"CI_ATTESTED"},second,graph,digest),/untrusted_history_record/);
  assert.deepEqual(buildRegressionCards(second,first,graph,digest).cards.map(x=>x.testId),["source-contracts"]);
  const same=buildRegressionCards(first,first,graph,digest);
  assert.equal(same.cards.length,0);
});
