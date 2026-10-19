import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
