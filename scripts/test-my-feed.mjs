import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { makeMyFeedPlan, MY_FEED_LIMIT } from "../src/my-feed-policy.js";

const products = feedProducts(menuCategories);
const byId = new Map(products.map(product => [product.id, product]));
const ids = results => results.map(entry => entry.id);

test("cold start shows actual, diverse, unviewed catalog photos without pretending to know the visitor", () => {
  const result = makeMyFeedPlan({ products, seed: 7 });
  assert.equal(result.length, MY_FEED_LIMIT);
  assert.equal(new Set(ids(result)).size, result.length);
  assert.ok(new Set(result.map(entry => entry.product.category.id)).size >= 4);
  for (const entry of result) {
    assert.equal(entry.kind, "discover");
    assert.equal(entry.product, byId.get(entry.id));
    assert.ok(entry.product.item.price > 0);
    assert.match(entry.product.image, /^src\/products\//);
  }
});

test("liked products, real menu pairings and unseen items form a stable, deduplicated mix", () => {
  const likedIds = new Set(["cold-coffee:iced-caffe-latte", "desserts:cookie"]);
  const viewedIds = new Set(["cold-coffee:iced-caffe-latte", "desserts:cookie"]);
  const views = new Map([["cold-coffee:iced-caffe-latte", 9], ["desserts:cookie", 2]]);
  const args = { products, likedIds, viewedIds, views, seed: 23 };
  const first = makeMyFeedPlan(args), second = makeMyFeedPlan(args);
  assert.deepEqual(first, second);
  assert.equal(first.length, MY_FEED_LIMIT);
  assert.equal(new Set(ids(first)).size, first.length);
  assert.equal(first.filter(entry => entry.kind === "favorite").length, 2);
  assert.equal(first.filter(entry => entry.kind === "pair").length, 1);
  const pair = first.find(entry => entry.kind === "pair");
  assert.equal(pair?.id, "desserts:san-sebastian-cheesecake");
  assert.equal(pair?.sourceId, "cold-coffee:iced-caffe-latte");
  assert.ok(first.some(entry => entry.kind === "discover"));
  assert.notDeepEqual(ids(first), ids(makeMyFeedPlan({ ...args, seed: 24 })));
});

test("view history is not mislabeled new; unlike and unknown IDs do not become favorites", () => {
  const result = makeMyFeedPlan({ products, likedIds: new Set(["missing:product"]),
    viewedIds: new Set(products.slice(0, 20).map(product => product.id)), seed: 5 });
  assert.equal(result.some(entry => entry.kind === "favorite"), false);
  for (const entry of result) if (entry.kind === "discover")
    assert.equal(new Set(products.slice(0, 20).map(product => product.id)).has(entry.id), false);
});

test("when every product is liked, continue showing choices without repeating or inventing items", () => {
  const likedIds = new Set(products.map(product => product.id));
  const result = makeMyFeedPlan({ products, likedIds, seed: 88 });
  assert.equal(result.length, MY_FEED_LIMIT);
  assert.equal(new Set(ids(result)).size, result.length);
  assert.ok(result.every(entry => byId.has(entry.id) && entry.kind === "favorite"));
  assert.deepEqual(makeMyFeedPlan({ products, limit: 0 }), []);
  assert.equal(makeMyFeedPlan({ products: null }).length, 0);
});

test("My Feed is opt-in, mounted only on intent, and cannot mutate the core scroll feed", () => {
  const html = readFileSync("menu-feed.html", "utf8");
  const entry = readFileSync("my-feed-entry.js", "utf8");
  const ui = readFileSync("my-feed.js", "utf8");
  const stylesheet = readFileSync("my-feed.css", "utf8");
  assert.match(html, /id="my-feed-stage" class="my-feed-stage" aria-labelledby="my-feed-title" hidden/);
  assert.match(html, /id="my-feed-track" class="my-feed-track" role="list"/);
  assert.match(html, /aria-controls="my-feed-stage" aria-expanded="false" aria-pressed="false"/);
  assert.match(html, /my-feed-entry\.js\?v=[a-f0-9]{12}/);
  // The personal-deck entry stays available; its optional history dependency
  // must not compete with the first full-size product photograph.
  assert.match(entry, /photo\.decode\(\)/);
  assert.match(entry, /requestIdleCallback/);
  assert.match(entry, /import\("\.\/taste-memory\.js\?v=[a-f0-9]{12}"\)/);
  const feedCss = readFileSync("menu-feed.css", "utf8");
  assert.ok(feedCss.endsWith(stylesheet), "Personal feed CSS must retain its original last-in-cascade position");
  assert.doesNotMatch(html, /href="my-feed\\.css\\?v=/, "Personal CSS must not delay the first feed photograph");
  assert.match(entry, /import\(url\.href\)/);
  assert.match(entry, /retry \+= 1/);
  assert.match(entry, /Could not open\. Tap to retry\./);
  assert.match(ui, /card\.setAttribute\("role", "listitem"\)/);
  assert.match(ui, /export function mountMyFeed\(\)/);
  assert.match(ui, /makeMyFeedPlan\(/);
  assert.match(ui, /new PopStateEvent\("popstate"\)/);
  assert.match(ui, /const opened = stage\.hidden/);
  assert.match(ui, /refreshes \+= 1/);
  assert.match(ui, /Language is presentation only\. Preserve the six SKUs, DOM and scroll position/);
  assert.doesNotMatch(ui, /\bfetch\s*\(|\bXMLHttpRequest\b|navigator\.sendBeacon|Math\.random/);
  assert.doesNotMatch(ui, /\.feed-cards\b|#feed-more|root\.replaceChildren/);
  assert.match(stylesheet, /scroll-snap-type:x proximity/);
  assert.match(stylesheet, /@media\(max-width:360px\)/);
  assert.match(stylesheet, /min-height:44px/);
});

test("every requested language has honest labels and an existing product link", () => {
  const html = readFileSync("menu-feed.html", "utf8");
  const ui = readFileSync("my-feed.js", "utf8");
  for (const [lang, title] of [["tr", "Benim akışım"], ["en", "My feed"], ["ru", "Моя лента"]]) {
    assert.ok(html.includes(`data-${lang}="${title}"`));
    assert.ok(ui.includes(`${lang}: {`));
  }
  assert.match(ui, /url\.searchParams\.set\("item", id\)/);
  assert.match(ui, /url\.searchParams\.set\("lang", lang\(\)\)/);
  assert.match(ui, /location\.href/);
});
