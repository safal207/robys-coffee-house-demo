import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { counterCheckoutUrl, readCounterConfiguration } from "../../src/counter-checkout.js";
import { decodeOrderTicket, getOrCreateOrderTicket } from "../../src/order-ticket.js";

const ticket = getOrCreateOrderTicket({ version: 1, groups: [
  { quantity: 2, items: [{ id: "brew-hot:black-tea", quantity: 1 }, { id: "desserts:macaron", quantity: 1 }] }
] });

test("server checkout preserves the exact grouped ticket and language", () => {
  for (const root of ["http://localhost:8787/", "https://example.test/cafe/"]) {
    const url = new URL(counterCheckoutUrl({ enabled: true, checkoutUrl: "counter/guest.html" }, ticket, "ru", root));
    assert.equal(url.origin, new URL(root).origin);
    const decoded = decodeOrderTicket(new URLSearchParams(url.hash.slice(1)).get("ticket"));
    assert.deepEqual(decoded.ticket, ticket);
    assert.equal(decoded.language, "ru");
    assert.equal(url.search, "");
  }
});

test("static disabled mode and untrusted handoff locations never navigate", () => {
  assert.equal(counterCheckoutUrl(JSON.parse(readFileSync("counter-config.json", "utf8")), ticket, "ru", "https://example.test/"), null);
  for (const checkoutUrl of ["https://evil.test/counter/guest.html", "//evil.test/counter/guest.html", "javascript:alert(1)",
    "data:text/html,hello", "/other.html", "/counter/guest.html?leak=1", "/counter/guest.html#other", "https://user:pass@example.test/counter/guest.html"]) {
    assert.equal(counterCheckoutUrl({ enabled: true, checkoutUrl }, ticket, "ru", "https://example.test/"), null, checkoutUrl);
  }
  assert.equal(counterCheckoutUrl({ enabled: true, checkoutUrl: "/counter/guest.html" }, ticket, "ru", "http://public.example/"), null);
});

test("configuration reads bypass caches; unavailable or corrupt configuration retains static checkout", async () => {
  const seen = [];
  const config = await readCounterConfiguration("https://example.test/cafe/", { fetcher: async (url, options) => {
    seen.push([url.href, options.cache, options.credentials]);
    return new Response(JSON.stringify({ enabled: true, checkoutUrl: "counter/guest.html" }));
  } });
  assert.equal(config.enabled, true);
  assert.deepEqual(seen, [["https://example.test/cafe/counter-config.json", "no-store", "same-origin"]]);
  for (const fetcher of [async () => { throw new Error("offline"); }, async () => new Response("missing", { status: 404 }), async () => new Response("invalid")]) {
    assert.equal(await readCounterConfiguration("https://example.test/", { fetcher }), null);
  }
  assert.equal(await readCounterConfiguration("https://example.test/", { timeout: 5, fetcher: (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })) }), null);
});

test("installed menu worker never intercepts staff sessions, status, counter pages or configuration", () => {
  const source = readFileSync("sw-core-v64.js", "utf8");
  for (const scope of ["https://example.test/", "https://example.test/cafe/"]) {
    const handlers = new Map();
    runInNewContext(source, { URL, self: {
      registration: { scope }, location: { origin: new URL(scope).origin },
      addEventListener(name, handler) { handlers.set(name, handler); }
    } });
    for (const path of ["api/counter/session", "api/counter/queue?lang=ru", "api/counter/orders/id", "counter-config.json",
      "counter/staff.html", "counter/guest.html", "counter/staff.js"]) {
      for (const mode of ["cors", "navigate"]) {
        let intercepted = false;
        handlers.get("fetch")({ request: { url: new URL(path, scope).href, method: "GET", mode }, respondWith() { intercepted = true; } });
        assert.equal(intercepted, false, `${scope}${path} (${mode})`);
      }
    }
  }
});
