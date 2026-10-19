import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { counterCheckoutUrl, readCounterConfiguration } from "../../src/counter-checkout.js";
import { decodeOrderTicket, getOrCreateOrderTicket, quoteOrderTicket } from "../../src/order-ticket.js";

const ticket = getOrCreateOrderTicket({ version: 1, groups: [
  { quantity: 2, items: [{ id: "brew-hot:black-tea", quantity: 1 }, { id: "desserts:macaron", quantity: 1 }] }
] });

const checkoutSource = readFileSync("src/order-checkout.js", "utf8");
const checkoutContinuation = checkoutSource.slice(checkoutSource.indexOf("export async function openOrderCheckout("))
  .replace("export async function", "async function");
const staleDraft = { version: 1, groups: [{ quantity: 1, items: [{ id: "brew-hot:black-tea", quantity: 1 }] }] };
const currentDraft = { version: 1, groups: [{ quantity: 3, items: [{ id: "brew-hot:milk", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }] }] };
const defer = () => {
  let resolve;
  const promise = new Promise(accept => { resolve = accept; });
  return { promise, resolve };
};

function checkoutFixture({ configuration = async () => ({ enabled: true, checkoutUrl: "counter/guest.html" }),
  latest = async () => currentDraft, legacyConflict = false } = {}) {
  const calls = { tickets: [], redirects: [], reads: 0 };
  const readStarted = defer();
  class Element extends EventTarget {
    constructor(tag, className = "", text = "") {
      super(); this.tagName = tag; this.className = className; this.textContent = text;
      this.children = []; this.attributes = new Map();
      const classes = new Set(className.split(" "));
      this.classList = { contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key) };
    }
    get isConnected() { return this === document.body || Boolean(this.parent?.isConnected); }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    prepend(...children) { children.forEach(child => { child.parent = this; }); this.children.unshift(...children); }
    replaceChildren(...children) { this.children.forEach(child => { child.parent = null; }); this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    querySelector(selector) {
      for (const child of this.children) {
        if (selector.startsWith(".") && child.className.split(" ").includes(selector.slice(1))) return child;
        const nested = child.querySelector(selector); if (nested) return nested;
      }
      return null;
    }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() { document.activeElement = this; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  }
  const document = Object.assign(new EventTarget(), { activeElement: null, body: new Element("body"), visibilityState: "visible" });
  const window = Object.assign(new EventTarget(), { location: { assign: url => calls.redirects.push(url) } });
  class OrderLegacyConflictError extends Error { constructor() { super("legacy conflict"); this.name = "OrderLegacyConflictError"; } }
  const validIds = new Set(["brew-hot:black-tea", "brew-hot:milk", "desserts:cookie"]);
  const stored = new Map();
  const context = {
    document, window, activeDismiss: null, activeDialog: null, orderProductIds: validIds, ORDER_DRAFT_KEY: "robys-menu-order.v1",
    ticketStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    checkoutCopy: { en: { title: "Your order", loading: "Reading your current order", legacyConflict: "Choose which cart to keep",
      close: "Close", change: "Edit", regenerate: "Create current QR", draftChanged: "Order changed", draftCheck: "Check order" } },
    siteRootUrl: () => "https://example.test/cafe/", readCounterConfiguration: configuration,
    readLatestStoredOrderDraft(ids) { assert.equal(ids, validIds); calls.reads += 1; readStarted.resolve(); return latest(); },
    getOrderStorageState: () => ({ legacyConflict: legacyConflict ? { token: "unresolved" } : undefined }),
    OrderLegacyConflictError,
    getOrCreateOrderTicket(draft, options) { calls.tickets.push(draft); return getOrCreateOrderTicket(draft, options); },
    counterCheckoutUrl, element: (tag, className, text) => new Element(tag, className, text),
    checkoutErrorMessage: error => error.name === "OrderLegacyConflictError" ? "Choose which cart to keep" : "Unavailable"
  };
  const open = runInNewContext(`${checkoutContinuation}\nopenOrderCheckout`, context);
  return { open, calls, document, readStarted: readStarted.promise };
}

test("enabled counter handoff encodes the latest authoritative cart, never the caller preview", async () => {
  const fixture = checkoutFixture();
  const result = await fixture.open({ draft: staleDraft, language: "en" });
  assert.equal(result.redirected, true);
  assert.equal(fixture.calls.reads, 1);
  assert.equal(fixture.calls.tickets.length, 1);
  assert.equal(fixture.calls.tickets[0], currentDraft);
  assert.notEqual(fixture.calls.tickets[0], staleDraft);
  const url = new URL(fixture.calls.redirects[0]);
  const decoded = decodeOrderTicket(new URLSearchParams(url.hash.slice(1)).get("ticket"));
  assert.deepEqual(decoded.ticket.groups, currentDraft.groups);
  assert.equal(quoteOrderTicket(decoded.ticket, "en").totalMinor, 48000);
});

test("abandoning config or canonical-read waits issues no ticket and performs no navigation", async () => {
  for (const stage of ["configuration", "latest"]) {
    const blocked = defer();
    let current = true;
    const fixture = checkoutFixture(stage === "configuration" ? { configuration: () => blocked.promise } : { latest: () => blocked.promise });
    const pending = fixture.open({ draft: staleDraft, language: "en", shouldOpen: () => current });
    if (stage === "latest") await fixture.readStarted;
    assert.equal(fixture.calls.reads, stage === "latest" ? 1 : 0);
    current = false;
    blocked.resolve(stage === "configuration" ? { enabled: true, checkoutUrl: "counter/guest.html" } : currentDraft);
    assert.equal((await pending).cancelled, true);
    assert.equal(fixture.calls.tickets.length, 0);
    assert.equal(fixture.calls.redirects.length, 0);
    assert.equal(fixture.document.body.children.length, 0, "Cancellation leaves no static dialog behind");
  }
});

test("an unresolved legacy fork enters static recovery without issuing a counter ticket", async () => {
  const fixture = checkoutFixture({ legacyConflict: true });
  const result = await fixture.open({ draft: staleDraft, language: "en" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.calls.tickets.length, 0);
  assert.equal(fixture.calls.redirects.length, 0);
  assert.equal(result.ticket, null);
  assert.equal(result.error.name, "OrderLegacyConflictError");
  assert.equal(result.dialog.open, true);
  assert.equal(result.dialog.isConnected, true);
  assert.equal(result.dialog.querySelector(".order-ticket-error").textContent, "Choose which cart to keep");
  assert.equal(result.dialog.querySelector(".order-ticket-button-primary").disabled, true,
    "A conflict cannot be bypassed through the ordinary QR regeneration action");
  result.dialog.querySelector(".order-checkout-close").dispatchEvent(new Event("click"));
  assert.equal(result.dialog.isConnected, false);
});

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
