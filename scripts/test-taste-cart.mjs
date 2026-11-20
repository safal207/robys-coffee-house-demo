import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { chooseTasteCartExtra } from "../taste-cart-policy.js";
import { addOrderGroup } from "../src/order-draft.js";
import { quoteOrderTicket } from "../src/order-ticket.js";

const catalog = new Map(feedProducts(menuCategories).map(item => [item.id, item]));
const ids = new Set(catalog.keys());

test("cart recommends only products previously liked by the guest or paired to a liked selection", () => {
  const selectedIds = new Set(["cold-coffee:iced-caffe-latte"]);
  const direct = chooseTasteCartExtra({ catalog, selectedIds, likedIds: new Set(["desserts:san-sebastian-cheesecake"]) });
  assert.equal(direct?.product.id, "desserts:san-sebastian-cheesecake");
  assert.equal(direct.reason, "remembered");
  const fromDrink = chooseTasteCartExtra({ catalog, selectedIds, likedIds: selectedIds });
  assert.equal(fromDrink?.product.id, "desserts:san-sebastian-cheesecake");
  assert.equal(fromDrink?.reason, "pair");
  assert.equal(chooseTasteCartExtra({ catalog, selectedIds, likedIds: new Set() }), null);
  assert.equal(chooseTasteCartExtra({ catalog, selectedIds: new Set([...selectedIds, "desserts:san-sebastian-cheesecake"]),
    likedIds: new Set(["desserts:san-sebastian-cheesecake"]) }), null);
});

test("personal additions preserve the shared draft and Turkish cashier quote without a discount", () => {
  const selected = addOrderGroup(null, [{ id: "cold-coffee:iced-caffe-latte" }], 1, ids);
  const recommend = chooseTasteCartExtra({ selectedIds: new Set(selected.draft.lines.map(line => line.id)),
    likedIds: new Set(["desserts:san-sebastian-cheesecake"]), catalog });
  assert.ok(recommend);
  assert.ok(existsSync(recommend.product.image));
  assert.equal(recommend.product.item.variants?.length || 0, 0);
  const added = addOrderGroup(selected.draft, [{ id: recommend.product.id, quantity: 1 }], 1, ids);
  assert.equal(added.applied, true);
  const ticket = { version: 1, groups: added.draft.groups };
  const tr = quoteOrderTicket(ticket, "tr"), en = quoteOrderTicket(ticket, "en"), ru = quoteOrderTicket(ticket, "ru");
  assert.equal(tr.totalMinor, en.totalMinor);
  assert.equal(en.totalMinor, ru.totalMinor);
  assert.ok(tr.groups.some(group => group.items.some(item => item.name === recommend.product.item.name.tr)));
  assert.equal(tr.totalMinor, 37000);
});

test("all three menu views install the optional visual cart and cashier stays Turkish", () => {
  for (const htmlName of ["menu.html", "menu-grid.html", "menu-feed.html"]) {
    const html = readFileSync(htmlName, "utf8");
    assert.match(html, /<script type="module" src="taste-cart-entry\.js\?v=1"><\/script>/);
    if (htmlName === "menu-feed.html") assert.match(html, /taste-cart\.css\?v=1/);
    else {
      assert.doesNotMatch(html, /rel="stylesheet" href="taste-cart\.css/);
      assert.equal((html.match(/<link rel="stylesheet"/g) || []).length,
        htmlName === "menu-grid.html" ? 2 : 1, "menu keeps one critical CSS bundle");
    }
    assert.match(html, /require-trusted-types-for 'script'/);
  }
  const cashier = readFileSync("cashier.html", "utf8");
  const runtime = readFileSync("cashier-visual.js", "utf8");
  assert.match(cashier, /cashier-visual\.js\?v=1/);
  assert.match(cashier, /cashier-visual\.css\?v=1/);
  assert.match(runtime, /quoteOrderTicket\(decoded\.ticket, "tr"\)/);
  assert.match(runtime, /trButton\.click\(\)/);
  assert.match(runtime, /photos\.get\(item\.id\)/);
  assert.doesNotMatch(runtime, /\bfetch\s*\(/);
});

test("taste cart does not invent a new price, write an independent basket or auto-charge", () => {
  const js = readFileSync("taste-cart.js", "utf8");
  const css = readFileSync("taste-cart.css", "utf8");
  const entry = readFileSync("taste-cart-entry.js", "utf8");
  assert.match(entry, /dialog\.open/);
  assert.match(entry, /style\.href = "taste-cart\.css\?v=1"/);
  assert.match(entry, /new URL\("\.\/taste-cart\.js\?v=1", import\.meta\.url\)/);
  assert.match(entry, /await import\(url\.href\)/);
  assert.match(js, /transactStoredOrderDraft/);
  assert.match(js, /storage\.addOrderGroup/);
  assert.match(js, /origin: "taste-cart"/);
  assert.match(js, /currentIds\.has\(match\.sourceId\)/);
  assert.match(js, /requestAnimationFrame\(\(\) =>/);
  assert.match(js, /document\.querySelector\("#menu-checkout-trigger"\)\?\.focus/);
  assert.match(js, /dismissed\.add\(product\.id\)/);
  assert.doesNotMatch(js, /(?:Math\.random|fetch\s*\(|new\s+WebSocket|PaymentRequest)/);
  assert.match(css, /max-width:390px/);
  assert.match(css, /min-height:44px/);
});
