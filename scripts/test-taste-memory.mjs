import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { WAIT_MS, PRODUCT_COOLDOWN, GLOBAL_COOLDOWN, PAIRS,
  choosePersonalPair, chooseRememberedProduct, productIdFromShareUrl } from "../taste-memory-policy.js";

const products = feedProducts(menuCategories);
const catalog = new Map(products.map(p => [p.id, p]));
const current = new Set(["refreshers:cool-lime"]);
const base = { products, priorLiked: current, currentLiked: current,
  shown: {}, lastShown: 0, now: 1000000000, sessionStarted: 1000000000 - WAIT_MS,
  interacted: true, enabled: true, busy: false, prompted: false };

test("re-engagement requires a prior like and 90 seconds of active browsing", () => {
  assert.equal(chooseRememberedProduct({ ...base, now: base.now - 1 }), null);
  assert.equal(chooseRememberedProduct({ ...base, interacted: false }), null);
  assert.equal(chooseRememberedProduct({ ...base, enabled: false }), null);
  assert.equal(chooseRememberedProduct({ ...base, busy: true }), null);
  assert.equal(chooseRememberedProduct({ ...base, prompted: true }), null);
  assert.equal(chooseRememberedProduct({ ...base, priorLiked: new Set() }), null);
  assert.equal(chooseRememberedProduct({ ...base, currentLiked: new Set() }), null);
  assert.equal(chooseRememberedProduct(base)?.id, "refreshers:cool-lime");
});

test("one-day global and seven-day per-product cooldowns prevent repeated prompts", () => {
  assert.equal(chooseRememberedProduct({ ...base, lastShown: base.now - GLOBAL_COOLDOWN + 1 }), null);
  assert.equal(chooseRememberedProduct({ ...base, shown: { "refreshers:cool-lime": base.now - PRODUCT_COOLDOWN + 1 } }), null);
  assert.equal(chooseRememberedProduct({ ...base, shown: { "refreshers:cool-lime": base.now - PRODUCT_COOLDOWN } })?.id, "refreshers:cool-lime");
});

test("personal pairings reference real orderable photographed catalog SKUs", () => {
  for (const [likedId, targetId] of PAIRS) {
    assert.ok(catalog.has(likedId), "Source " + likedId);
    assert.ok(catalog.has(targetId), "Target " + targetId);
    const recommendation = choosePersonalPair(new Set([likedId]), catalog);
    assert.equal(recommendation?.target.id, targetId);
    assert.ok(recommendation.target.image.startsWith("src/products/"));
    assert.ok(Number.isFinite(recommendation.target.item.price));
    assert.notEqual(recommendation.target.category.id, "pairing-offers");
    assert.equal(choosePersonalPair(new Set([likedId, targetId]), catalog), null);
  }
  assert.equal(choosePersonalPair(new Set(["unknown"]), catalog), null);
});

test("social memory remains an external, scoped enhancement without inventing public popularity", () => {
  const html = readFileSync("menu-feed.html", "utf8");
  const js = readFileSync("taste-memory.js", "utf8");
  const css = readFileSync("taste-memory.css", "utf8");
  assert.match(html, /<script type="module" src="taste-memory\.js\?v=1"><\/script>/);
  assert.match(html, /require-trusted-types-for 'script'/);
  assert.match(js, /robys-feed-like-v1:/);
  assert.match(js, /robys-feed-views-v1:/);
  assert.match(js, /Bağlantı kopyalandı/);
  assert.match(js, /if \(!window\.confirm/);
  assert.match(js, /document\.querySelector\("dialog\[open\]"\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(js, /\b(?:fetch|sendBeacon|XMLHttpRequest)\s*\(/);
});

test("share counts resolve genuine static share URLs in TR, EN and RU, not empty ?item= links", () => {
  for (const language of ["tr", "en", "ru"]) {
    const id = "desserts:san-sebastian-cheesecake";
    const url = "https://safal207.github.io/robys-coffee-house-demo/share/" + language +
      "/desserts--san-sebastian-cheesecake.html";
    assert.equal(productIdFromShareUrl(url, catalog), id);
  }
  assert.equal(productIdFromShareUrl("https://example.com/menu-feed.html?item=desserts:cookie", catalog), null);
  assert.equal(productIdFromShareUrl("not a link", catalog), null);
  assert.equal(productIdFromShareUrl("https://example.com/share/ru/desserts--unknown.html", catalog), null);
  assert.equal(productIdFromShareUrl("https://example.com/share/xx/desserts--cookie.html", catalog), null);
  const ui = readFileSync("taste-memory.js", "utf8");
  assert.match(ui, /productIdFromShareUrl\(shareUrl\.value, byId\)/);
});
