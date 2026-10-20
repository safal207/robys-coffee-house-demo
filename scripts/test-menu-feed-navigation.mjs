import test from "node:test";
import assert from "node:assert/strict";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { parseFeedEntry, feedProductUrl, selectActiveFeedIndex } from "../src/menu-feed-navigation.js";

const products = feedProducts(menuCategories);
const base = "https://example.test/cafe/menu-feed.html";
const feedPaths = ["/", "/cafe/"].flatMap(directory =>
  ["menu-feed", "menu-feed/", "menu-feed.html", "menu-feed.html/"].map(route => `${directory}${route}`));

test("a shared product opens its own category and explicit supported language", () => {
  const id = "cold-coffee:flavoured-iced-caffe-latte";
  const href = `${base}?item=${encodeURIComponent(id)}&lang=ru#desserts`;
  assert.deepEqual(parseFeedEntry(href, products), {
    language: "ru", category: "cold-coffee", productId: id,
  });
});

test("ordinary category links and language-only entries remain valid", () => {
  for (const language of ["tr", "en", "ru"]) {
    assert.deepEqual(parseFeedEntry(`${base}?lang=${language}#hot-coffee`, products), {
      language, category: "hot-coffee", productId: null,
    });
  }
  assert.deepEqual(parseFeedEntry(base, products), {
    language: null, category: "all", productId: null,
  });
});

test("unknown products do not invent a catalog entry or hide a valid category", () => {
  assert.deepEqual(parseFeedEntry(`${base}?item=hot-coffee%3Amissing&lang=de#desserts`, products), {
    language: null, category: "desserts", productId: null,
  });
  assert.deepEqual(parseFeedEntry(`${base}?item=%3Cscript%3E&lang=RU#missing`, products), {
    language: null, category: "all", productId: null,
  });
});

test("a product beyond the first batch resolves without relying on rendered cards", () => {
  const product = products.at(-1);
  assert.ok(products.indexOf(product) >= 8);
  assert.deepEqual(parseFeedEntry(`${base}?item=${encodeURIComponent(product.id)}`, products), {
    language: null, category: product.category.id, productId: product.id,
  });
});

test("product links preserve each recognized feed path and replace old query and hash state", () => {
  const id = "hot-coffee:espresso";
  for (const pathname of feedPaths) {
    for (const language of ["tr", "en", "ru"]) {
      const href = `https://example.test${pathname}?item=desserts%3Acookie&lang=tr&view=feed&q=tea&utm_source=table&url=https%3A%2F%2Fother.test%2F#desserts`;
      const url = new URL(feedProductUrl(href, id, language));
      assert.equal(url.origin, "https://example.test");
      assert.equal(url.pathname, pathname);
      assert.equal(url.hash, "");
      assert.deepEqual([...url.searchParams.entries()].sort(), [["item", id], ["lang", language]]);
      assert.deepEqual(parseFeedEntry(url.href, products), {
        language, category: "hot-coffee", productId: id,
      });
    }
  }
});

test("other pages fall back to the feed in their app directory", () => {
  const cases = [
    ["/", "/menu-feed.html"],
    ["/menu.html", "/menu-feed.html"],
    ["/cafe/", "/cafe/menu-feed.html"],
    ["/cafe/menu", "/cafe/menu-feed.html"],
    ["/cafe/menu.html", "/cafe/menu-feed.html"],
    ["/cafe/discover.html", "/cafe/menu-feed.html"],
    ["/cafe/not-menu-feed.html", "/cafe/menu-feed.html"],
    ["/cafe/menu-feeder", "/cafe/menu-feed.html"],
  ];
  for (const [pathname, expectedPath] of cases) {
    const url = new URL(feedProductUrl(`https://example.test:8443${pathname}?q=tea&lang=ru#desserts`, "desserts:cookie", "en"));
    assert.equal(url.origin, "https://example.test:8443");
    assert.equal(url.pathname, expectedPath);
    assert.equal(url.hash, "");
    assert.deepEqual([...url.searchParams.entries()].sort(), [["item", "desserts:cookie"], ["lang", "en"]]);
  }
});

test("share values remain query data and unsupported languages do not carry over", () => {
  const id = "//other.test/menu-feed.html?item=changed#redirect";
  for (const language of [undefined, null, "de", "RU", "https://other.test/"]) {
    const url = new URL(feedProductUrl(`${base}/?lang=ru&redirect=https://other.test/#desserts`, id, language));
    assert.equal(url.origin, "https://example.test");
    assert.equal(url.pathname, "/cafe/menu-feed.html/");
    assert.equal(url.hash, "");
    assert.deepEqual([...url.searchParams.entries()], [["item", id]]);
  }
});

test("each real product survives sharing and parsing without changing its identity", () => {
  for (const pathname of feedPaths) {
    for (const product of products) {
      for (const language of ["tr", "en", "ru"]) {
        const url = feedProductUrl(`https://example.test${pathname}`, product.id, language);
        const entry = parseFeedEntry(url, products);
        assert.equal(entry.productId, product.id);
        assert.equal(entry.category, product.category.id);
        assert.equal(entry.language, language);
      }
    }
  }
});

test("the active item excludes cards outside the unobscured viewport", () => {
  assert.equal(selectActiveFeedIndex([], 100, 700), null);
  assert.equal(selectActiveFeedIndex([
    { index: 2, top: -500, bottom: 100 },
    { index: 3, top: 700, bottom: 1300 },
    { index: 4, top: 500, bottom: 500 },
  ], 100, 700), null);
  assert.equal(selectActiveFeedIndex([
    { index: 7, top: 100, bottom: 700 },
    { index: 11, top: 700, bottom: 1300 },
  ], 100, 700), 7);
});

test("active item follows the greater visible portion during a card transition", () => {
  assert.equal(selectActiveFeedIndex([
    { index: 7, top: -260, bottom: 340 },
    { index: 11, top: 340, bottom: 940 },
  ], 100, 700), 11);
  assert.equal(selectActiveFeedIndex([
    { index: 7, top: -140, bottom: 460 },
    { index: 11, top: 460, bottom: 1060 },
  ], 100, 700), 7);
});

test("a card taller than the viewport can still be the fully visible active item", () => {
  assert.equal(selectActiveFeedIndex([
    { index: 2, top: -400, bottom: 100 },
    { index: 3, top: 100, bottom: 1400 },
    { index: 4, top: 1400, bottom: 2000 },
  ], 100, 700), 3);
});

test("equal visibility favors the card centered nearer the usable screen center", () => {
  // Both cards have 75% of their height visible, but the second center is closer.
  assert.equal(selectActiveFeedIndex([
    { index: 5, top: 25, bottom: 325 },
    { index: 6, top: 325, bottom: 825 },
  ], 100, 700), 6);
});

test("active selection uses all current bounds instead of only newly changed entries", () => {
  const unchanged = { index: 8, top: 100, bottom: 700 };
  const newlyVisible = { index: 9, top: 650, bottom: 1250 };
  assert.equal(selectActiveFeedIndex([newlyVisible, unchanged], 100, 700), 8);
});
