import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION_SCHEMA_VERSION, CAMPAIGN_SESSION_KEY, CAMPAIGN_TTL_MS,
  parseUtm, makeUtmLink, resolveUtm, clearUtm, makeClientFunnelEvent
} from "./marketing-attribution-v0.js";

const url = "https://safal207.github.io/robys-coffee-house-demo/menu-feed.html?utm_source=Instagram&utm_medium=Social&utm_campaign=November_Menu&utm_content=Story_01&lang=ru";
function storage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
    map
  };
}

test("parses case-insensitive UTM codes without inventing missing fields", () => {
  assert.deepEqual(parseUtm(url), {
    source: "instagram", medium: "social", campaign: "november_menu", content: "story_01"
  });
  assert.equal(parseUtm("https://example.com/?utm_medium=social"), null);
  assert.equal(parseUtm("javascript:alert(1)?utm_source=test"), null);
});
test("rejects duplicated, personal or unbounded UTM fields", () => {
  assert.equal(parseUtm("https://x.test/?utm_source=ig&utm_source=tiktok"), null);
  assert.equal(parseUtm("https://x.test/?utm_source=alex%40mail.com"), null);
  assert.equal(parseUtm("https://x.test/?utm_source=ig&utm_campaign=" + "x".repeat(65)), null);
  assert.equal(parseUtm("https://x.test/?utm_source=%3Cscript%3E"), null);
});
test("builds HTTPS links without overwriting product ID or language", () => {
  const link = makeUtmLink("https://x.test/menu-feed.html?item=desserts:cookie&lang=ru&utm_source=old",
    { source: "instagram", medium: "social", campaign: "winter", content: "story_01" });
  const result = new URL(link);
  assert.equal(result.searchParams.get("item"), "desserts:cookie");
  assert.equal(result.searchParams.get("lang"), "ru");
  assert.equal(result.searchParams.get("utm_source"), "instagram");
  assert.equal(result.searchParams.getAll("utm_source").length, 1);
  assert.throws(() => makeUtmLink("http://x.test/", { source: "ig" }), /HTTPS/);
  assert.throws(() => makeUtmLink("https://x.test/", { source: "alice@example.com" }), /Invalid/);
});
test("no consent means no storage read or write", () => {
  const blocked = {
    getItem() { throw Error("read forbidden"); },
    setItem() { throw Error("write forbidden"); }
  };
  assert.equal(resolveUtm({ url, storage: blocked, consent: false }).source, "instagram");
  assert.equal(resolveUtm({ url: "https://x.test/", storage: blocked, consent: false }), null);
});
test("consented attribution persists per-tab and expires", () => {
  const s = storage(), now = 1794310000000;
  const first = resolveUtm({ url, storage: s, consent: true, now });
  assert.equal(JSON.parse(s.map.get(CAMPAIGN_SESSION_KEY)).schemaVersion, ATTRIBUTION_SCHEMA_VERSION);
  assert.deepEqual(resolveUtm({ url: "https://x.test/menu.html", storage: s, consent: true, now: now + 1000 }), first);
  assert.equal(resolveUtm({ url: "https://x.test/", storage: s, consent: true, now: now + CAMPAIGN_TTL_MS }), null);
  clearUtm(s);
  assert.equal(s.map.has(CAMPAIGN_SESSION_KEY), false);
});
test("storage failure does not block and malformed cached payload is rejected", () => {
  const denied = {getItem() {throw Error("denied");}, setItem() {throw Error("denied");}};
  assert.equal(resolveUtm({url, consent:true, storage:denied}).source, "instagram");
  const s = storage();
  s.setItem(CAMPAIGN_SESSION_KEY, '{"schemaVersion":"robys.attribution.v0","campaign":{"source":"alex@mail.com"},"expiresAt":9999999999999}');
  assert.equal(resolveUtm({ url:"https://x.test/", consent:true, storage:s, now:1 }), null);
});
test("client events are consent gated and cannot claim payment or contain PII", () => {
  assert.equal(makeClientFunnelEvent("cart_item_added", { productId:"desserts:cookie" }), null);
  const result = makeClientFunnelEvent("cart_item_added",
    { productId:"desserts:cookie", viewMode:"feed", lang:"ru" },
    { consent:true, campaign:parseUtm(url), now:1794310000000 });
  assert.equal(result.name, "cart_item_added");
  assert.equal(result.data.productId, "desserts:cookie");
  assert.equal(result.campaign.source, "instagram");
  assert.throws(() => makeClientFunnelEvent("payment_confirmed", {}, {consent:true}), /server-only/);
  assert.throws(() => makeClientFunnelEvent("cart_item_added", {email:"private@x.test"}, {consent:true}), /Unapproved/);
  assert.throws(() => makeClientFunnelEvent("menu_item_view", {productId:"private@example.com"}, {consent:true}), /Invalid/);
});
