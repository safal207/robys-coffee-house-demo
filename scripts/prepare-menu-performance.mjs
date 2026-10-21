import { readFileSync, writeFileSync } from 'node:fs';
function replace(path, before, after) {
  const text = readFileSync(path, 'utf8');
  if (text.split(before).length !== 2) throw new Error(`Unexpected source at ${path}: ${before.slice(0,60)}`);
  writeFileSync(path, text.replace(before, after));
}
const helper = `// Warm bytes, never execute another menu or take over its native navigation.
const assets = new Set(['bootstrap-v2.js', 'menu-runtime.css', 'menu-feed.css',
  'menu-app.js', 'menu-feed.js', 'menu-view-mode.js', 'menu-product-reveal.js', 'pairing-posters.js']);
export function canWarmMenu(connection, hidden = false, online = true) {
  return !hidden && online !== false && !connection?.saveData
    && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
}
export function menuWarmAssets(html, target) {
  if (typeof html !== 'string' || html.length > 262144) return [];
  const base = new URL(target), directory = new URL('.', base).pathname;
  const found = new Set();
  // Read only quoted URLs from authored tags. No DOM injection or execution.
  for (const tag of html.matchAll(/<(?:script|link)\\b[^>]*>/gi)) {
    const value = /\\b(?:src|href)\\s*=\\s*["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (!value) continue;
    try {
      const url = new URL(value.replace(/&amp;/g, '&'), base);
      if (url.origin !== base.origin || url.username || url.password) continue;
      if (url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) !== directory) continue;
      if (!assets.has(url.pathname.slice(directory.length))) continue;
      url.hash = '';
      found.add(url.href);
      if (found.size === 6) break;
    } catch { /* Malformed optional hints cannot affect navigation. */ }
  }
  return [...found];
}
export function initMenuViewPrefetch(view) {
  if (!['list', 'feed'].includes(view) || typeof fetch !== 'function') return;
  const targetView = view === 'list' ? 'feed' : 'list';
  const selector = 'a[data-menu-view="' + targetView + '"]';
  let attempted = false, controller, timer;
  const allowed = () => canWarmMenu(navigator.connection, document.hidden, navigator.onLine);
  async function warm() {
    if (attempted || !allowed()) return;
    const link = document.querySelector(selector);
    if (!link) return;
    const url = new URL(link.href, location.href), expected = new URL(targetView === 'feed' ? 'menu-feed.html' : 'menu.html', location.href);
    if (url.origin !== location.origin || url.pathname !== expected.pathname || url.username || url.password) return;
    url.hash = '';
    attempted = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const options = { signal: controller.signal, priority: 'low', credentials: 'same-origin', redirect: 'error' };
    try {
      const response = await fetch(url.href, options);
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
      if (Number(response.headers.get('content-length')) > 262144) return;
      const html = await response.text();
      if (!allowed()) return;
      // One document and at most six local assets. No images, videos, order
      // APIs, executed modules or updates to view/like counters.
      await Promise.all(menuWarmAssets(html, url.href).map(async href => {
        const asset = await fetch(href, options);
        if (asset.ok) await asset.arrayBuffer();
      }));
    } catch { /* Native links never wait for successful prefetch. */ }
    finally { clearTimeout(timeout); }
  }
  const intent = event => { if (event.target.closest?.(selector)) void warm(); };
  for (const type of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(type, intent, { passive: true });
  const idle = () => { timer = setTimeout(() => { void warm(); }, 250); };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  window.addEventListener('pagehide', () => { clearTimeout(timer); controller?.abort(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(); });
}
`;
writeFileSync('src/menu-view-prefetch.js', helper);
replace('src/menu-feed-navigation.js', '// Compare all rendered cards against the usable viewport. IntersectionObserver\n// callbacks contain only changed entries, not a complete active-card ranking.', '// Rank complete visible candidates, not just changed IntersectionObserver entries.');
writeFileSync('src/menu-feed-navigation.js', readFileSync('src/menu-feed-navigation.js','utf8') + `
// Actual single-column geometry: O(log N + visible cards), with no height
// estimates, cached offsets or DOM removal that could cause scrolling jumps.
export function visibleFeedCardBounds(cards, top, bottom) {
  if (!(bottom > top) || !cards.length) return [];
  const measured = new Map();
  const rectAt = index => {
    if (!measured.has(index)) {
      const rect = cards[index].getBoundingClientRect();
      measured.set(index, { index: Number(cards[index].dataset.index), top: rect.top, bottom: rect.bottom });
    }
    return measured.get(index);
  };
  let low = 0, high = cards.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rectAt(middle).bottom <= top) low = middle + 1;
    else high = middle;
  }
  const visible = [];
  for (let index = low; index < cards.length; index++) {
    const rect = rectAt(index);
    if (rect.top >= bottom) break;
    if (rect.bottom > top) visible.push(rect);
  }
  return visible;
}
`);
replace('src/menu-feed.js','parseFeedEntry, feedProductUrl, selectActiveFeedIndex','parseFeedEntry, feedProductUrl, selectActiveFeedIndex, visibleFeedCardBounds');
replace('src/menu-feed.js','const money = value => `${new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], { maximumFractionDigits: 0 }).format(value)} ₺`;','const priceFormats = Object.fromEntries(Object.entries({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }).map(([key, locale]) => [key, new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })]));\nconst money = value => `${priceFormats[language].format(value)} ₺`;');
replace('src/menu-feed.js','function updateEngagement() {','function updateEngagement(cards = root.querySelectorAll(".feed-card")) {');
replace('src/menu-feed.js','root.querySelectorAll(".feed-card").forEach(card => {\n    const product','cards.forEach(card => {\n    const product');
replace('src/menu-feed.js','function updateBadges() {','function updateBadges(cards = root.querySelectorAll(".feed-card")) {');
replace('src/menu-feed.js','root.querySelectorAll(".feed-card").forEach(card => {\n    const count','cards.forEach(card => {\n    const count');
replace('src/menu-feed.js','  const index = selectActiveFeedIndex([...root.children].map(card => {\n    const rect = card.getBoundingClientRect(); return { index: Number(card.dataset.index), top: rect.top, bottom: rect.bottom };\n  }), top, bottom);','  const index = selectActiveFeedIndex(visibleFeedCardBounds(root.children, top, bottom), top, bottom);');
replace('src/menu-feed.js',`  const end = Math.min(rendered + 8, filtered.length);
  for (; rendered < end; rendered++) {
    const card = renderCard(filtered[rendered], rendered); root.append(card); cardObserver?.observe(card);
    viewObserver?.observe(card.querySelector(".feed-photo>img"));
  }
  $("#feed-more").hidden = rendered >= filtered.length;
  $("#feed-end").hidden = !filtered.length || rendered < filtered.length;
  updateBadges();
  updateEngagement();`, `  const end = Math.min(rendered + 8, filtered.length), cards = [];
  const fragment = document.createDocumentFragment();
  for (; rendered < end; rendered++) {
    const card = renderCard(filtered[rendered], rendered); fragment.append(card); cards.push(card);
  }
  root.append(fragment);
  for (const card of cards) {
    cardObserver?.observe(card);
    viewObserver?.observe(card.querySelector(".feed-photo>img"));
  }
  $("#feed-more").hidden = rendered >= filtered.length;
  $("#feed-end").hidden = !filtered.length || rendered < filtered.length;
  updateBadges(cards);
  updateEngagement(cards);`);
replace('src/menu-feed.js','window.addEventListener("pageshow", () => { syncEngagement(null); viewCandidates.forEach(scheduleView); void refreshOrder(); });','window.addEventListener("pageshow", event => { if (event.persisted) { syncEngagement(null); viewCandidates.forEach(scheduleView); void refreshOrder(); } });');
replace('src/menu-feed.js','if (entry.language) language = entry.language;','if (entry.language) language = entry.language;\nif (!entry.productId) searchInput.value = Array.from((new URL(location.href).searchParams.get("q") ?? "").replace(/[\\u0000-\\u001f\\u007f]/g, " ").trim()).slice(0, 120).join("");');
replace('src/menu-view-mode.js','if (context.hasSearch && !context.productId) {','if (context.hasSearch && !context.productId && searchInput.value !== context.search) {');
for (const path of ['src/menu-view-mode.js','src/menu-app.js']) writeFileSync(path,'import { initMenuViewPrefetch } from "./src/menu-view-prefetch.js";\n'+readFileSync(path,'utf8'));
replace('src/menu-view-mode.js','document.documentElement.dataset.menuViewReady = "true";','document.documentElement.dataset.menuViewReady = "true";\n    initMenuViewPrefetch(view);');
replace('src/menu-app.js','document.documentElement.dataset.menuViewReady = "true";','document.documentElement.dataset.menuViewReady = "true";\ninitMenuViewPrefetch("list");');
replace('src/menu-app.js','  let rendered = 0;\n  categories.forEach((category) => {','  let rendered = 0;\n  const fragment = document.createDocumentFragment();\n  categories.forEach((category) => {');
replace('src/menu-app.js','    menuRoot.append(section);\n    rendered += 1;\n  });\n\n  emptyState.hidden','    fragment.append(section);\n    rendered += 1;\n  });\n  menuRoot.append(fragment);\n\n  emptyState.hidden');
writeFileSync('scripts/test-menu-feed-navigation.mjs',readFileSync('scripts/test-menu-feed-navigation.mjs','utf8')+`
import { visibleFeedCardBounds } from '../src/menu-feed-navigation.js';
function orderedCards(rectangles) {
  let reads = 0;
  return { cards: rectangles.map(rect => ({ dataset: { index: String(rect.index) },
    getBoundingClientRect() { reads++; return rect; } })), reads: () => reads };
}
test('visible geometry matches exhaustive ranking across variable heights, gaps and jumps', () => {
  let position = -400;
  const rects = Array.from({length: 63}, (_, index) => {
    const height = 160 + (index * 131 % 850);
    const rect = {index, top: position, bottom: position + height};
    position += height + 24;
    return rect;
  });
  for (const top of [-1000, -400, 0, 175, 900, 18500, position + 100]) {
    for (const height of [1, 200, 700, 1200]) {
      const {cards, reads} = orderedCards(rects);
      const visible = visibleFeedCardBounds(cards, top, top + height);
      assert.deepEqual(visible, rects.filter(r => r.bottom > top && r.top < top + height));
      assert.equal(selectActiveFeedIndex(visible, top, top + height), selectActiveFeedIndex(rects, top, top + height));
      assert.ok(reads() <= Math.ceil(Math.log2(cards.length)) + visible.length + 1);
    }
  }
});
test('a long feed never scans historical cards and rereads fresh geometry after resizing', () => {
  const rectangles = Array.from({length:1024}, (_, index) => ({index,top:index*600,bottom:index*600+580}));
  let sample = orderedCards(rectangles);
  assert.equal(visibleFeedCardBounds(sample.cards, 999*600, 999*600+500)[0].index, 999);
  assert.ok(sample.reads() <= 12);
  rectangles.forEach(r => { r.top *= 2; r.bottom *= 2; });
  sample = orderedCards(rectangles);
  assert.equal(visibleFeedCardBounds(sample.cards, 999*1200, 999*1200+500)[0].index, 999);
  assert.ok(sample.reads() <= 12);
  assert.deepEqual(visibleFeedCardBounds([], 0, 500), []);
  assert.deepEqual(visibleFeedCardBounds(sample.cards, 500, 0), []);
});
`);
writeFileSync('scripts/test-menu-view-mode.mjs',readFileSync('scripts/test-menu-view-mode.mjs','utf8')+`
import { canWarmMenu, menuWarmAssets } from '../src/menu-view-prefetch.js';
test('speculative menu bytes respect data saving, offline, hidden tabs and slow connections', () => {
  assert.equal(canWarmMenu(undefined), true);
  assert.equal(canWarmMenu({effectiveType:'4g'}), true);
  for (const connection of [{saveData:true}, {effectiveType:'slow-2g'}, {effectiveType:'2g'}, {effectiveType:'3g'}]) assert.equal(canWarmMenu(connection), false);
  assert.equal(canWarmMenu(undefined,true), false);
  assert.equal(canWarmMenu(undefined,false,false), false);
});
test('prefetch only reads bounded critical assets beside the menu, not remote URLs or markup', () => {
  const target = 'https://example.test/cafe/menu-feed.html?view=feed&lang=ru';
  const html = '<script src="bootstrap-v2.js?v=1"></script><link rel="stylesheet" href="menu-feed.css?v=2&amp;x=3"><script src="menu-feed.js?v=4"></script><script src="menu-feed.js?v=4"></script><script src="https://other.test/cafe/menu-app.js"></script><script src="https://user:password@example.test/cafe/menu-app.js"></script><script src="../menu-app.js"></script><script src="/cafe/order-storage.js"></script><img src="src/products/huge.webp">';
  assert.deepEqual(menuWarmAssets(html,target), ['https://example.test/cafe/bootstrap-v2.js?v=1','https://example.test/cafe/menu-feed.css?v=2&x=3','https://example.test/cafe/menu-feed.js?v=4']);
  assert.deepEqual(menuWarmAssets(' '.repeat(262145),target), []);
  const files = ['bootstrap-v2.js','menu-runtime.css','menu-feed.css','menu-app.js','menu-feed.js','menu-view-mode.js','pairing-posters.js'];
  assert.equal(menuWarmAssets(files.map(f=>'<script src="'+f+'"></script>').join(''),target).length,6);
});
test('warming preserves native navigation and runs only once on repeated intent', async () => {
  const listeners = new Map(), requests = [], timers = [];
  const link = {href:'https://example.test/cafe/menu-feed.html?view=feed&lang=ru#desserts'};
  const doc = {hidden:false, readyState:'loading',querySelector:()=>link,addEventListener:(name,fn)=>listeners.set(name,fn)};
  const ctx = {URL,Set,AbortController,document:doc,navigator:{onLine:true},location:{origin:'https://example.test',href:base},window:{addEventListener:(name,fn)=>listeners.set(name,fn)},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,headers:new Map([['content-type','text/html']]),text:async()=>'<script src="menu-feed.js?v=abcdef"></script>',arrayBuffer:async()=>new ArrayBuffer(0)};}};
  const authored = readFileSync(new URL('../src/menu-view-prefetch.js',import.meta.url),'utf8').replaceAll('export function','function');
  runInNewContext(authored+'\\ninitMenuViewPrefetch("list");',ctx);
  const original=link.href;
  const event={target:{closest:()=>link},preventDefault:()=>assert.fail('Native navigation must not be intercepted')};
  listeners.get('pointerover')(event);listeners.get('pointerover')(event);listeners.get('focusin')(event);
  await new Promise(r=>setImmediate(r));
  assert.equal(requests.length,2);assert.equal(requests[0].url,original.split('#')[0]);
  assert.equal(requests[1].url,'https://example.test/cafe/menu-feed.js?v=abcdef');
  assert.equal(requests[0].options.priority,'low');assert.equal(requests[0].options.redirect,'error');
  assert.equal(link.href,original);listeners.get('pagehide')();assert.equal(requests[0].options.signal.aborted,true);
});
`);
replace('scripts/measure-menu-responsiveness.mjs',"import { createServer } from 'node:https';","import assert from 'node:assert/strict';\nimport { createServer } from 'node:https';");
replace('scripts/measure-menu-responsiveness.mjs',"const repo = resolve(new URL('..', import.meta.url).pathname);","const repo = resolve(process.env.ROBYS_PERF_ROOT ?? new URL('..', import.meta.url).pathname);");
replace('scripts/measure-menu-responsiveness.mjs','   report.samples.push({width,cycle,target,...data});','   assert.ok(Number.isFinite(data.switchMs) && data.switchMs > 0, "A completed real navigation must have a positive click-to-ready sample");\n   report.samples.push({width,cycle,target,...data});');
replace('scripts/measure-menu-responsiveness.mjs',' report.scroll.push({width,...scroll});report.samples.push({width,errors});',' report.scroll.push({width,...scroll});report.samples.push({width,errors});\n assert.deepEqual(errors, [], "Application errors invalidate performance measurements");');
console.log('Authored performance changes and regression tests prepared; canonical build required.');
