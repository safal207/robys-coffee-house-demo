import assert from "node:assert/strict";
import { test } from "node:test";
import { createLazyFeedViewer } from "../src/menu-feed-viewer-entry.js";
class Node {
  constructor(tag = "div") { this.tag = tag; this.dataset = {}; this.children = []; this.attributes = {}; this.listeners = {}; this.isConnected = true; this.textContent = ""; }
  append(...nodes) { this.children.push(...nodes.flatMap(node => node.tag === "fragment" ? node.children : [node])); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelectorAll(selector) { return selector === ".feed-story" ? this.children.filter(node => node.className === "feed-story") : []; }
}
function fixture(lead) {
  const stories = new Node(), reels = new Node("button"), status = new Node(), events = {}, lifecycle = {};
  let language = "en", filtered = [], dialogs = [], loads = 0, factories = 0, resolve, reject;
  const opens = [], attempts = [], seen = new Set();
  const doc = globalThis.document, win = globalThis.window;
  globalThis.document = { hidden: false, body: new Node(), createElement: tag => new Node(tag), createDocumentFragment: () => new Node("fragment"),
    querySelector: selector => ({ "#feed-stories": stories, "#feed-reels-open": reels, "#feed-status": status, ".feed-photo>img": lead })[selector],
    querySelectorAll: () => dialogs, addEventListener: (type, fn) => { (events[type] ??= []).push(fn); } };
  globalThis.window = { addEventListener: (type, fn) => { lifecycle[type] = fn; } };
  const products = [{ id: "coffee:a", category: { id: "coffee" }, image: "a.webp" }];
  const viewer = createLazyFeedViewer({ products, categories: [{ id: "coffee", name: { en: "Coffee", ru: "Кофе", tr: "Kahve" } }],
    engagement: { hasSeen: id => seen.has(id) }, getLanguage: () => language, getFiltered: () => filtered }, {
    loadModule: attempt => { loads++; attempts.push(attempt); return new Promise((yes, no) => { resolve = yes; reject = no; }); }
  });
  return { viewer, stories, reels, status, seen, opens, attempts,
    event: (type, value = {}) => (events[type] ?? []).forEach(fn => fn(value)), lifecycle,
    filter: () => { filtered = []; }, language: value => { language = value; }, cover: () => { dialogs = [{ id: "menu-product-dialog" }]; },
    resolve: () => resolve({ createFeedViewer(config) { factories++; assert.equal(config.manageEntries, false); return {
      openStories: (id, trigger) => { opens.push({ mode: "stories", id, trigger }); return true; },
      openReels: options => { opens.push({ mode: "reels", options }); return true; }, refresh() {}, isOpen: () => opens.length > 0
    }; } }), reject: () => reject(Error("offline")), counts: () => ({ loads, factories }),
    cleanup: () => { globalThis.document = doc; globalThis.window = win; } };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
test("story covers wait for the visible photo and recover if it fails", () => {
  for (const event of ["load", "error"]) {
    const lead = new Node("img"); lead.complete = false;
    const f = fixture(lead); try {
      f.viewer.renderStories();
      const cover = f.stories.children[0].children[0].children[0];
      assert.equal(cover.src, undefined);
      lead.listeners[event].forEach(listener => listener());
      assert.equal(cover.src, "a.webp");
    } finally { f.cleanup(); }
  }
});
test("localized story entries and seen state render without downloading or building the viewer", () => {
  const f = fixture(); try {
    f.viewer.renderStories();
    assert.equal(f.stories.attributes["aria-label"], "Stories");
    assert.equal(f.stories.children[0].attributes["aria-label"], "Coffee · 1 items");
    assert.equal(f.stories.children[0].children[0].children[0].src, "a.webp");
    assert.equal(f.stories.children[0].dataset.seen, "false"); f.seen.add("coffee:a"); f.viewer.refresh();
    assert.equal(f.stories.children[0].dataset.seen, "true");
    f.language("ru"); f.viewer.renderStories(); assert.equal(f.stories.children[0].attributes["aria-label"], "Кофе · 1 позиций");
    assert.deepEqual(f.counts(), { loads: 0, factories: 0 });
  } finally { f.cleanup(); }
});
test("concurrent opening intents share a download and only the last opens with its own opener", async () => {
  const f = fixture(); try {
    const a = new Node("button"), b = new Node("button");
    const first = f.viewer.openStories("coffee", a); const second = f.viewer.openReels({ trigger: b, productId: "coffee:a" });
    await turn(); assert.equal(f.counts().loads, 1); f.resolve();
    assert.equal(await first, false); assert.equal(await second, true);
    assert.deepEqual(f.opens, [{ mode: "reels", options: { trigger: b, productId: "coffee:a" } }]);
    assert.equal(a.attributes["aria-busy"], undefined); assert.equal(b.attributes["aria-busy"], undefined);
    await f.viewer.openStories("coffee", a); assert.equal(f.counts().loads, 1);
  } finally { f.cleanup(); }
});
for (const cause of ["escape", "filter", "language", "dialog", "input", "other-click", "pagehide"]) test(`pending viewer cannot open after ${cause}`, async () => {
  const f = fixture(); try {
    const trigger = new Node("button"), open = f.viewer.openStories("coffee", trigger); await turn();
    if (cause === "escape") f.event("keydown", { key: "Escape" });
    if (cause === "filter") f.filter();
    if (cause === "language") f.language("ru");
    if (cause === "dialog") f.cover();
    if (cause === "input") f.event("input");
    if (cause === "other-click") f.event("click", { target: { closest: () => null } });
    if (cause === "pagehide") f.lifecycle.pagehide();
    f.resolve(); assert.equal(await open, false); assert.equal(f.opens.length, 0);
    assert.equal(trigger.attributes["aria-busy"], undefined); assert.equal(f.status.textContent, "");
  } finally { f.cleanup(); }
});
test("a failed module load reports a retryable status, then retries a new module attempt", async () => {
  const f = fixture(); try {
    const first = f.viewer.openReels(); await turn(); f.reject(); assert.equal(await first, false);
    assert.match(f.status.textContent, /could not load/);
    const retry = f.viewer.openReels(); await turn(); f.resolve(); assert.equal(await retry, true);
    assert.deepEqual(f.attempts, [0, 1]); assert.equal(f.opens.length, 1);
  } finally { f.cleanup(); }
});
