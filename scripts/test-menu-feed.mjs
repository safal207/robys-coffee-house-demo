import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts, filterFeed, quoteFeedOrder } from "../src/menu-feed-model.js";
import { addOrderGroup, updateOrderGroupQuantity } from "../src/order-draft.js";
import { validateTicketDraft, quoteOrderTicket } from "../src/order-ticket.js";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

const products = feedProducts(menuCategories);
const index = new Map(products.map(product => [product.id, product]));
const ids = new Set(index.keys());

test("every menu item appears once and has a local photograph", () => {
  assert.equal(products.length, 63);
  assert.equal(ids.size, 63);
  assert.equal(index.get("hot-coffee:espresso").item.price, 110);
  assert.equal(index.get("cold-coffee:flavoured-iced-caffe-latte").item.price, 200);
  assert.equal(index.get("pairing-offers:iced-san-sebastian-pairing").item.price, 370);
  for (const product of products) assert.ok(existsSync(product.image), product.image);
  assert.equal(new Set(products.slice(0, 8).map(product => product.category.id)).size, 8);
});

test("search, category and empty-state filtering match real menu choices", () => {
  assert.deepEqual(filterFeed(products, "hot-coffee", "эспрессо").map(product => product.id),
    ["hot-coffee:espresso", "hot-coffee:espresso-macchiato"]);
  assert.ok(filterFeed(products, "brew-hot", "Siyah Çay").some(product => product.id === "brew-hot:black-tea"));
  assert.equal(filterFeed(products, "desserts", "espresso").length, 0);
  assert.equal(filterFeed(products, "all", "missing-zx984").length, 0);
  assert.equal(filterFeed(products, "all", "").length, 63);
});

test("feed selections share menu quantities, variants and counter QR prices", () => {
  let draft = addOrderGroup(null, [{ id: "hot-coffee:espresso" }], 2, ids).draft;
  draft = addOrderGroup(draft, [{ id: "cold-coffee:flavoured-iced-caffe-latte", variant: "vanilla" }], 1, ids).draft;
  assert.deepEqual(quoteFeedOrder(draft, index), { count: 3, total: 420 });
  const groups = validateTicketDraft(draft);
  assert.equal(groups.find(group => group.items[0].id.includes("flavoured")).items[0].variant, "vanilla");
  assert.equal(quoteOrderTicket({ groups }, "ru").totalMinor, 42000);
  draft = updateOrderGroupQuantity(draft, draft.groups.find(group => group.items[0].id === "hot-coffee:espresso").id, 0, ids).draft;
  assert.deepEqual(quoteFeedOrder(draft, index), { count: 1, total: 200 });
});

test("existing multi-item groups and the 99-item limit survive the feed view", () => {
  const draft = addOrderGroup(null, [{ id: "hot-coffee:cappuccino", quantity: 2 }, { id: "desserts:cookie", quantity: 2 }], 2, ids).draft;
  assert.deepEqual(quoteFeedOrder(draft, index), { count: 8, total: 1120 });
  const full = addOrderGroup(null, [{ id: "hot-coffee:espresso" }], 99, ids).draft;
  const blocked = addOrderGroup(full, [{ id: "hot-coffee:espresso" }], 1, ids);
  assert.equal(blocked.applied, false);
  assert.deepEqual(quoteFeedOrder(blocked.draft, index), { count: 99, total: 10890 });
});

test("shipped feed matches authored source and content-derived cache revisions", () => {
  const source = readFileSync("src/menu-feed.js", "utf8");
  assert.equal(readFileSync("menu-feed.js", "utf8"), compileMenuRuntime(source));
  const html = readFileSync("menu-feed.html", "utf8");
  for (const file of ["menu-feed.js", "menu-feed.css", "order-checkout.css"]) {
    const revision = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);
    assert.ok(html.includes(`${file}?v=${revision}`), file);
  }
  const sw = readFileSync("sw-core-v64.js", "utf8");
  assert.match(sw, /-menu-feed-[a-f0-9]{12}-/);
  for (const file of ["menu-feed.html", "menu-feed.js", "menu-feed.css"]) assert.ok(sw.includes(`./${file}`));
  assert.match(html, /require-trusted-types-for 'script'/);
  assert.match(html, /<noscript>/);
});

for (const name of ["Storage", "Checkout"]) test(`${name} retries escape a cached module failure and share successful initialization`, async () => {
  // Execute the real loader, substituting only the import boundary. The module
  // map retains rejected URLs just as a browser does after evaluation fails.
  const source = readFileSync("src/menu-feed.js", "utf8");
  const start = source.indexOf("async function loadStorage()");
  const end = source.indexOf("async function refreshOrder()", start);
  assert.ok(start >= 0 && end > start);
  const loaders = source.slice(start, end)
    .replace(/import\(("\.\/order-(?:storage|checkout)\.js\?v=[a-f0-9]+")\)/g, "loadModule($1)")
    .replaceAll("import(retryUrl.href)", "loadModule(retryUrl.href)")
    .replaceAll("import.meta.url", '"https://example.test/cafe/menu-feed.js"');
  assert.ok(!loaders.includes("import("));
  const requests = [], moduleMap = new Map();
  let notices = 0, release;
  const loaded = { createOrderStorageNotice() { notices++; return {}; } };
  const api = vm.runInNewContext(`let storage, storagePromise, storageNotice, storageRetry = 0, checkoutPromise, checkoutRetry = 0;
    ${loaders}\n({ loadStorage, loadCheckout });`, {
    URL, root: {}, validIds: ids, productIndex: index, language: "en", refreshOrder() {},
    loadModule(url) {
      const absolute = new URL(url, "https://example.test/cafe/menu-feed.js").href;
      requests.push(absolute);
      if (!moduleMap.has(absolute)) moduleMap.set(absolute, requests.length === 1
        ? Promise.reject(new Error("cached module evaluation failure"))
        : new Promise(resolve => { release = () => resolve(loaded); }));
      return moduleMap.get(absolute);
    }
  });
  const load = api[`load${name}`];
  const first = load(), concurrent = load();
  const failed = await Promise.allSettled([first, concurrent]);
  assert.ok(failed.every(result => result.status === "rejected"));
  assert.equal(requests.length, 1, "Concurrent intents share one failed request");
  const retry = load(), sharedRetry = load();
  assert.equal(requests.length, 2);
  assert.equal(requests[1], `https://example.test/cafe/order-${name.toLowerCase()}.js?retry=1`);
  release();
  assert.deepEqual(await Promise.all([retry, sharedRetry]), [loaded, loaded]);
  assert.equal(await load(), loaded);
  assert.equal(requests.length, 2, "Successful retries are reused");
  assert.equal(notices, name === "Storage" ? 1 : 0);
  await assert.rejects(moduleMap.get(requests[0]), /cached module evaluation failure/);
});

test("offline navigation opens the feed and never substitutes another asset revision", async () => {
  for (const scope of ["https://example.test/", "https://example.test/cafe/"]) {
    const cached = new Map([[scope + "menu-feed.html", "FEED"], [scope + "404.html", "NOT_FOUND"],
      [scope + "menu-feed.js?v=current", "CURRENT_JS"], [scope + "menu-feed.css?v=current", "CURRENT_CSS"]]);
    const context = { URL, Request, Response, fetch: async () => { throw new Error("offline"); },
      caches: { open: async () => ({ match: async (request, options) => {
        const key = options?.ignoreSearch ? [...cached.keys()].find(key => key.split("?")[0] === request.url.split("?")[0]) : request.url;
        return cached.has(key) ? new Response(cached.get(key)) : undefined;
      } }) }, self: { registration: { scope }, location: { origin: "https://example.test" }, addEventListener() {} } };
    vm.runInNewContext(readFileSync("sw-core-v64.js", "utf8"), context);
    assert.equal(await (await context.navigationResponse(new Request(scope + "menu-feed.html?lang=ru"))).text(), "FEED");
    assert.equal(await (await context.navigationResponse(new Request(scope + "unknown.html"))).text(), "NOT_FOUND");
    for (const extension of ["js", "css"]) {
      assert.equal(await context.cachedResponse(new Request(scope + `menu-feed.${extension}?v=old`)), undefined);
      assert.match(await (await context.cachedResponse(new Request(scope + `menu-feed.${extension}?v=current`))).text(), /CURRENT_/);
    }
  }
});
