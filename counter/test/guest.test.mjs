import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { createGuestKey, guestEntry, guestFragment, staffOrderUrl, clearCompletedTicket, validOrder, startGuestPage,
  GUEST_STORAGE_PREFIX } from "../src/guest.js";
import { getOrCreateOrderTicket, encodeOrderTicket, quoteOrderTicket, ORDER_TICKET_STORAGE_KEY } from "../../src/order-ticket.js";

const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const ticket = getOrCreateOrderTicket({ version: 1, groups: [{ quantity: 1, items: [{ id: "hot-coffee:caffe-latte", quantity: 1 }] }] }, { cryptoProvider: webcrypto });
const payload = encodeOrderTicket(ticket, "ru");
const id = "a".repeat(32);
const quote = quoteOrderTicket(ticket, "ru");
const order = { id, number: "R-000001", status: "awaiting_payment", version: 1, createdAt: 1800000000000, updatedAt: 1800000000000,
  paidAt: null, totalMinor: quote.totalMinor, currency: "TRY", groups: quote.groups };

test("guest capability uses 32 secure random bytes and survives same-ticket reload/retry", () => {
  const storage = memory();
  const first = guestEntry(`#ticket=${payload}`, [storage], webcrypto);
  const retry = guestEntry(`#ticket=${payload}`, [storage], { getRandomValues() { throw new Error("must reuse saved key"); } });
  assert.equal(Buffer.from(first.key, "base64url").length, 32);
  assert.equal(Buffer.from(first.key, "base64url").toString("base64url"), first.key);
  assert.equal(first.key, retry.key);
  assert.equal(first.ticketId, ticket.id);
  assert.equal(first.language, "ru");
  assert.notEqual(createGuestKey(webcrypto), first.key);
  assert.throws(() => createGuestKey({}), /secure_random_unavailable/);
});

test("a private pending fragment preserves the retry key even with blocked browser storage", () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const first = guestEntry(`#ticket=${payload}`, [blocked], webcrypto);
  const reloaded = guestEntry(guestFragment(first), [blocked], { getRandomValues() { throw new Error("must reuse URL key"); } });
  assert.deepEqual(reloaded, first);
  assert.equal(new URL(`https://cafe.test/counter/guest.html${guestFragment(first)}`).search, "");
});

test("cashier QR contains only same-origin order identity, never guest capability or composition", () => {
  const key = createGuestKey(webcrypto);
  const guestUrl = `https://cafe.test/counter/guest.html${guestFragment({ id, key, language: "en" })}`;
  const cashier = new URL(staffOrderUrl(id, guestUrl));
  assert.equal(cashier.origin, "https://cafe.test");
  assert.equal(cashier.pathname, "/counter/staff.html");
  assert.equal(cashier.search, "");
  assert.equal(cashier.hash, `#order=${id}`);
  assert.equal(cashier.href.includes(key), false);
  assert.equal(cashier.href.includes(payload), false);
  assert.throws(() => staffOrderUrl("../../elsewhere", guestUrl), /invalid_order/);
  assert.throws(() => staffOrderUrl(id, "file:///counter/guest.html"), /invalid_origin/);
});

test("receipt metadata is restored only for the matching guest capability", () => {
  const storage = memory();
  const key = createGuestKey(webcrypto);
  storage.setItem(`${GUEST_STORAGE_PREFIX}order:${id}`, JSON.stringify({ key, ticketId: ticket.id, order }));
  const first = guestEntry(guestFragment({ id, key, language: "ru" }), [storage]);
  assert.equal(first.ticketId, ticket.id);
  assert.deepEqual(first.saved.order, order);
  const other = guestEntry(guestFragment({ id, key: createGuestKey(webcrypto), language: "ru" }), [storage]);
  assert.equal(other.saved, null);
  assert.equal(other.ticketId, null);
  assert.throws(() => guestEntry(`#id=${id}&key=bad`), /invalid_link/);
  assert.throws(() => guestEntry(`#id=${id}&ticket=${payload}&key=${key}`), /invalid_link/);
});

test("new-order cleanup removes only the completed identity, preserving cart, receipts and newer tickets", () => {
  const persistent = memory();
  const session = memory();
  const current = JSON.stringify({ signature: "signature", ticket });
  persistent.setItem(ORDER_TICKET_STORAGE_KEY, current);
  session.setItem(ORDER_TICKET_STORAGE_KEY, current);
  session.setItem(`${ORDER_TICKET_STORAGE_KEY}.pending`, JSON.stringify({ previous: null, value: current }));
  persistent.setItem("robys-cart", "keep composition");
  persistent.setItem(`${GUEST_STORAGE_PREFIX}order:${id}`, "keep receipt");
  clearCompletedTicket([persistent, session], ticket.id);
  assert.equal(persistent.getItem(ORDER_TICKET_STORAGE_KEY), null);
  assert.equal(session.getItem(ORDER_TICKET_STORAGE_KEY), null);
  assert.equal(session.getItem(`${ORDER_TICKET_STORAGE_KEY}.pending`), null);
  assert.equal(persistent.getItem("robys-cart"), "keep composition");
  assert.equal(persistent.getItem(`${GUEST_STORAGE_PREFIX}order:${id}`), "keep receipt");
  const newer = JSON.stringify({ ticket: { ...ticket, id: "B".repeat(20) } });
  persistent.setItem(ORDER_TICKET_STORAGE_KEY, newer);
  clearCompletedTicket([persistent], ticket.id);
  assert.equal(persistent.getItem(ORDER_TICKET_STORAGE_KEY), newer);
});

test("guest accepts only documented server statuses and a bounded order shape", () => {
  assert.equal(validOrder(order), true);
  for (const status of ["paid", "cancelled", "<script>", undefined]) assert.equal(validOrder({ ...order, status }), false);
  assert.equal(validOrder({ ...order, totalMinor: -1 }), false);
  assert.equal(validOrder({ ...order, groups: [{ quantity: 1, lineTotalMinor: 10, items: [{}] }] }), false);
});

function node(tag = "div", namespaceURI = null) {
  return {
    tag, namespaceURI, dataset: {}, attributes: {}, children: [], events: {}, textContent: "", hidden: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, callback) { this.events[type] = callback; },
    querySelector(selector) { return this.children.find(child => child.tag === selector) ?? null; },
    querySelectorAll(selector) { return this.children.filter(child => child.tag === selector); }
  };
}

test("RU to EN to TR updates same-version receipt items after each localized GET", async () => {
  const localizedTicket = getOrCreateOrderTicket({ version: 1, groups: [{ quantity: 2, items: [
    { id: "brew-hot:black-tea", quantity: 1 }, { id: "desserts:macaron", quantity: 1 }
  ] }] }, { cryptoProvider: webcrypto });
  const keys = ["languages", "heading", "items", "total", "qr", "qrHelp", "pageHelp", "back", "newOrder", "numberLabel", "retry", "receipt", "progress", "paymentNote", "statusTitle", "statusHelp", "number", "status", "connection", "reconnect", "updated", "composition", "amount", "qrCode"];
  const nodes = Object.fromEntries(keys.map(key => { const value = node(); value.dataset.guest = key; return [key, value]; }));
  nodes.languages.children = ["tr", "en", "ru"].map(language => {
    const button = node("button"); button.dataset.language = language; button.closest = () => button; return button;
  });
  const document = { hidden: false, documentElement: {}, querySelectorAll: () => Object.values(nodes),
    createElement: tag => node(tag), createElementNS: (namespace, tag) => node(tag, namespace), addEventListener() {} };
  const key = createGuestKey(webcrypto);
  const hash = guestFragment({ id, key, language: "ru" });
  const location = { pathname: "/counter/guest.html", hash, href: `https://cafe.test/counter/guest.html${hash}` };
  const requests = [];
  const persistent = memory();
  persistent.setItem("robys-language", "tr");
  persistent.setItem("unrelated-setting", "preserve");
  const timers = new Map(); let timerId = 0;
  const replacements = {
    document, location, navigator: { onLine: true }, localStorage: persistent, sessionStorage: memory(),
    window: { addEventListener() {} },
    history: { replaceState(_state, _title, url) { const next = new URL(url, location.href); location.href = next.href; location.hash = next.hash; } },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; }, clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      const language = new URL(url, location.href).searchParams.get("lang");
      requests.push({ language, method: options.method });
      const localizedQuote = quoteOrderTicket(localizedTicket, language);
      return { ok: true, async json() { return { order: { ...order, totalMinor: localizedQuote.totalMinor, groups: localizedQuote.groups } }; } };
    }
  };
  const previous = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const compositionNames = () => nodes.composition.children.flatMap(group => group.children[0].children.map(item => item.children[1].textContent));
  try {
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    await startGuestPage();
    assert.equal(persistent.getItem("robys-language"), "tr", "Merely opening a localized QR does not rewrite the site preference");
    const qr = nodes.qrCode.children[0];
    assert.deepEqual(compositionNames(), ["Чёрный чай", "Макарон"]);
    for (const language of ["en", "tr"]) {
      nodes.languages.events.click({ target: nodes.languages.children.find(button => button.dataset.language === language) });
      // The click intentionally does not return refresh(); allow its GET + render to finish.
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(requests.at(-1).language, language);
      const expectedNames = quoteOrderTicket(localizedTicket, language).groups.flatMap(group => group.items.map(item => item.name));
      assert.deepEqual(compositionNames(), expectedNames, `${language}: completed GET must replace the previous locale's composition without a new order version`);
      assert.equal(document.documentElement.lang, language);
      assert.equal(persistent.getItem("robys-language"), language, "An explicit guest language choice also applies to the menu and next order");
      assert.equal(persistent.getItem("unrelated-setting"), "preserve");
      assert.equal(nodes.qrCode.children[0], qr, "Language changes retain the same cashier QR and order identity");
      const timer = Array.from(timers.values()).find(value => value.delay === 2000);
      await timer.callback();
      assert.deepEqual(compositionNames(), expectedNames, "A subsequent poll keeps the current translation");
    }
    assert.equal(requests.every(request => request.method === "GET"), true);
    const write = persistent.setItem;
    persistent.setItem = () => { throw new Error("storage blocked"); };
    nodes.languages.events.click({ target: nodes.languages.children.find(button => button.dataset.language === "en") });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(document.documentElement.lang, "en", "Blocked preference storage does not block the guest language switch");
    persistent.setItem = write;
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});

test("guest retries lost creation response without a new identity, polls server transitions and preserves QR on loss", async () => {
  const keys = ["languages", "heading", "items", "total", "qr", "qrHelp", "pageHelp", "back", "newOrder", "numberLabel", "retry", "receipt", "progress", "paymentNote", "statusTitle", "statusHelp", "number", "status", "connection", "reconnect", "updated", "composition", "amount", "qrCode"];
  const nodes = Object.fromEntries(keys.map(key => { const value = node(); value.dataset.guest = key; return [key, value]; }));
  nodes.languages.children = ["tr", "en", "ru"].map(language => { const button = node("button"); button.dataset.language = language; return button; });
  const document = { hidden: false, documentElement: {}, events: {}, querySelectorAll: () => Object.values(nodes),
    createElement: tag => node(tag), createElementNS: (namespace, tag) => node(tag, namespace),
    addEventListener(type, callback) { this.events[type] = callback; } };
  const localStorage = memory();
  const sessionStorage = memory();
  localStorage.setItem(ORDER_TICKET_STORAGE_KEY, JSON.stringify({ ticket }));
  localStorage.setItem("cart", "untouched");
  localStorage.setItem("robys-language", "tr");
  const location = { pathname: "/counter/guest.html", hash: `#ticket=${payload}`, href: `https://cafe.test/counter/guest.html#ticket=${payload}`,
    assign(url) { this.destination = url; } };
  const navigator = { onLine: true };
  const events = {};
  const timers = new Map();
  let timerId = 0;
  let currentOrder = order;
  let unavailable = false;
  let loseFirstCreateResponse = true;
  const requests = [];
  const replacements = {
    document, localStorage, sessionStorage, location, navigator,
    window: { addEventListener(type, callback) { events[type] = callback; } },
    history: { replaceState(_state, _title, url) { const next = new URL(url, location.href); location.href = next.href; location.hash = next.hash; } },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      requests.push({ url, ...options });
      if (unavailable) throw new Error("connection lost");
      if (options.method === "POST" && loseFirstCreateResponse) {
        loseFirstCreateResponse = false;
        throw new Error("server accepted the order but its response was lost");
      }
      return { ok: true, async json() { return { order: currentOrder }; } };
    }
  };
  const previous = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const poll = async () => {
    const timer = Array.from(timers.values()).find(value => value.delay === 2000);
    assert.ok(timer, "visible guest must schedule a 2-second refresh");
    await timer.callback();
  };
  try {
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    await startGuestPage();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    const requestBody = JSON.parse(requests[0].body);
    assert.deepEqual(Object.keys(requestBody).sort(), ["guestKey", "ticketPayload"]);
    assert.equal(requestBody.ticketPayload, payload);
    assert.equal(nodes.receipt.hidden, true, "No receipt or accepted status before the server confirms creation");
    assert.equal(new URLSearchParams(location.hash.slice(1)).get("key"), requestBody.guestKey);
    await poll();
    assert.equal(requests[1].method, "POST");
    assert.equal(requests[1].body, requests[0].body, "Uncertain creation must retry the exact same ticket and guest key");
    const fragment = new URLSearchParams(location.hash.slice(1));
    assert.equal(fragment.get("id"), id);
    assert.equal(fragment.get("key"), requestBody.guestKey);
    assert.equal(fragment.has("ticket"), false);
    assert.equal(nodes.newOrder.hidden, true);
    const qr = nodes.qrCode.children[0];
    assert.equal(qr.tag, "svg");
    const previousUpdate = nodes.updated.dateTime;
    unavailable = true;
    await poll();
    assert.equal(requests[2].method, "GET");
    assert.equal(requests[2].headers.Authorization, `Bearer ${requestBody.guestKey}`);
    assert.equal(requests[2].url.includes(requestBody.guestKey), false);
    assert.equal(nodes.qrCode.children[0], qr);
    assert.equal(nodes.updated.dateTime, previousUpdate);
    assert.equal(nodes.status.dataset.status, "awaiting_payment");
    assert.equal(nodes.connection.dataset.connection, "stale");
    unavailable = false;
    for (const [index, status] of ["preparing", "ready", "issued"].entries()) {
      currentOrder = { ...order, status, version: index + 2, paidAt: order.createdAt + 1000 };
      await poll();
      assert.equal(nodes.status.dataset.status, status);
      assert.equal(nodes.connection.dataset.connection, "live");
    }
    assert.equal(requests.filter(request => request.method === "POST").length, 2, "Only the original creation and its identical retry may POST");
    assert.equal(nodes.newOrder.hidden, false);
    nodes.newOrder.events.click();
    assert.equal(localStorage.getItem(ORDER_TICKET_STORAGE_KEY), null);
    assert.equal(localStorage.getItem("cart"), "untouched");
    assert.equal(location.destination, "/smart-choice/#quick");
    assert.equal(localStorage.getItem("robys-language"), "ru", "New order continues the current guest language even if the browser previously preferred Turkish");
    localStorage.setItem = () => { throw new Error("storage blocked"); };
    location.destination = null;
    nodes.newOrder.events.click();
    assert.equal(location.destination, "/smart-choice/#quick", "Blocked preference storage must not prevent starting a new order");
    document.hidden = true;
    document.events.visibilitychange();
    assert.equal(Array.from(timers.values()).some(timer => timer.delay === 2000), false);
    const requestCount = requests.length;
    navigator.onLine = false;
    events.offline();
    assert.equal(nodes.connection.dataset.connection, "offline");
    assert.equal(requests.length, requestCount);
    assert.equal(nodes.qrCode.children[0], qr);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
