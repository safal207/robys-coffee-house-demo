import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as model from "../src/staff-model.mjs";

const source = readFileSync(new URL("../src/staff.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace("localize(); void restoreSession();", "");
class Element {
  constructor(tag = "div") { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {}; this.value = ""; this.open = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(key, listener) { this.listeners[key] = listener; }
  contains(element) { return this === element || this.children.some(child => child?.contains?.(element)); }
  querySelectorAll(selector) { return this.children.flatMap(child => typeof child === "object" ? [...(selector === "[data-order-id]" && child.dataset?.orderId ? [child] : []), ...(child.querySelectorAll?.(selector) ?? [])] : []); }
  querySelector() { return null; }
  focus() {} scrollIntoView() {} close() { this.open = false; } showModal() { this.open = true; }
}
const id = "abcdefghijklmnopABCDEFGHIJKLMN_-";
const order = status => ({ id, number: "R-0123", status, version: status === "awaiting_payment" ? 1 : 2, totalMinor: 37000, currency: "TRY", createdAt: 1000, paidAt: status === "awaiting_payment" ? null : 2000, groups: [{ quantity: 1, items: [{ name: "Latte", quantity: 1 }, { name: "Lotus", quantity: 1 }], lineTotalMinor: 37000 }] });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return data; } });
function fixture(fetch) {
  const elements = new Map(); const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const windowEvents = {}, documentEvents = {};
  const window = { addEventListener(name, callback) { windowEvents[name] = callback; } };
  const context = {
    ...model, fetch, URL, URLSearchParams, Intl, AbortController, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    location: { href: "http://localhost:8787/counter/staff.html", pathname: "/counter/staff.html" }, history: { replaceState() {} },
    matchMedia: () => ({ matches: false }), navigator: {}, window,
    document: { documentElement: { lang: "ru" }, hidden: false, activeElement: null, getElementById: element, createElement: tag => new Element(tag), createDocumentFragment: () => new Element(), querySelectorAll: () => [], addEventListener(name, callback) { documentEvents[name] = callback; } }
  };
  runInNewContext(`${source}\nthis.ui = {
    init(order, role = 'cashier') { session = { user: { username: role, role }, csrfToken: 'memory-only' }; selected = order; orders = [order]; online = true; },
    refreshQueue, submitAction, clearSession, openPayment, openOrder, logout, chooseOrder,
    attachCamera(stream) { cameraStream = stream; $("camera-video").srcObject = stream; },
    snapshot() { return { language, id: selected?.id, status: selected?.status, version: selected?.version, paidAt: selected?.paidAt, totalMinor: selected?.totalMinor, cards: orders.map(order => ({ id: order.id, status: order.status, version: order.version })), orders: orders.length, session: Boolean(session), online, actionPending, messageKey, paymentIntent }; }
  };`, context);
  return { ui: context.ui, element, windowEvents, documentEvents };
}
test("late pre-payment queue response cannot roll back the server-confirmed status", async () => {
  let releaseOldQueue, queueCalls = 0;
  const { ui } = fixture(async (path, options) => {
    if (path.includes("/queue")) {
      if (++queueCalls === 1) return new Promise(resolve => { releaseOldQueue = () => resolve(response({ orders: [order("awaiting_payment")] })); });
      return response({ orders: [order("preparing")] });
    }
    assert.match(path, /\/pay\?/); assert.equal(options.headers["X-CSRF-Token"], "memory-only");
    assert.deepEqual(JSON.parse(options.body), { version: 1 });
    return response({ order: order("preparing") });
  });
  ui.init(order("awaiting_payment"));
  const oldPoll = ui.refreshQueue();
  await ui.submitAction(order("awaiting_payment"), "pay");
  assert.equal(ui.snapshot().status, "preparing");
  releaseOldQueue(); await oldPoll;
  assert.equal(ui.snapshot().status, "preparing");
  assert.equal(ui.snapshot().actionPending, false);
});

test("a late queue v1 cannot roll back v2 opened directly by QR in the detail or cards", async () => {
  let releaseQueue;
  const { ui } = fixture(path => path.includes("/queue")
    ? new Promise(resolve => { releaseQueue = () => resolve(response({ orders: [order("awaiting_payment")] })); })
    : Promise.resolve(response({ order: order("preparing") })));
  ui.init(order("awaiting_payment"));
  const pendingQueue = ui.refreshQueue(); await ui.openOrder(id);
  assert.equal(ui.snapshot().status, "preparing");
  releaseQueue(); await pendingQueue;
  assert.equal(ui.snapshot().status, "preparing"); assert.equal(ui.snapshot().version, 2);
  assert.equal(ui.snapshot().cards[0].status, "preparing"); assert.equal(ui.snapshot().cards[0].version, 2);
});

test("a late direct QR read v1 cannot roll back queue v2 in the detail or cards", async () => {
  let releaseOrder;
  const { ui } = fixture(path => path.includes("/queue")
    ? Promise.resolve(response({ orders: [order("preparing")] }))
    : new Promise(resolve => { releaseOrder = () => resolve(response({ order: order("awaiting_payment") })); }));
  ui.init(order("awaiting_payment"));
  const pendingOrder = ui.openOrder(id); await ui.refreshQueue();
  releaseOrder(); await pendingOrder;
  assert.equal(ui.snapshot().status, "preparing"); assert.equal(ui.snapshot().version, 2);
  assert.equal(ui.snapshot().cards[0].status, "preparing"); assert.equal(ui.snapshot().cards[0].version, 2);
});

test("an issued barista order cannot reappear from an older queue snapshot", async () => {
  const issued = { ...order("issued"), version: 3 };
  const { ui } = fixture(async path => path.includes("/queue") ? response({ orders: [order("ready")] }) : response({ order: issued }));
  ui.init(order("ready"), "barista"); await ui.submitAction(order("ready"), "issued");
  assert.equal(ui.snapshot().status, undefined); assert.equal(ui.snapshot().orders, 0);
});

test("login markup cannot fall back to a GET containing credentials before JavaScript starts", () => {
  const html = readFileSync(new URL("../public/staff.html", import.meta.url), "utf8");
  const form = html.match(/<form\b[^>]*\bid="login-form"[^>]*>/)?.[0];
  assert.ok(form); assert.match(form, /\bmethod="post"/); assert.match(form, /\baction="\/api\/counter\/login"/);
  assert.match(html, /<button\b[^>]*\bid="login-submit"[^>]*\bdisabled\b/);
  assert.match(html, /http-equiv="Content-Security-Policy"[^>]*form-action 'none'/);
  assert.match(html, /http-equiv="Content-Security-Policy"[^>]*require-trusted-types-for 'script'/);
  assert.match(html, /<link\b[^>]*rel="icon"[^>]*href="\/icon\.svg"/);
});
test("failed payment never invents a paid state and disables actions until refreshed", async () => {
  const { ui } = fixture(async () => { throw new TypeError("offline"); });
  ui.init(order("awaiting_payment")); await ui.submitAction(order("awaiting_payment"), "pay");
  assert.equal(ui.snapshot().status, "awaiting_payment");
  assert.equal(ui.snapshot().online, false); assert.equal(ui.snapshot().actionPending, false);
});
test("logout cleanup defeats late requests and removes protected data and payment intent", async () => {
  let release;
  const { ui, element } = fixture(() => new Promise(resolve => { release = () => resolve(response({ orders: [order("awaiting_payment")] })); }));
  ui.init(order("awaiting_payment")); ui.openPayment();
  const pending = ui.refreshQueue(); ui.clearSession(); release(); await pending;
  assert.equal(ui.snapshot().session, false); assert.equal(ui.snapshot().orders, 0); assert.equal(ui.snapshot().status, undefined); assert.equal(ui.snapshot().paymentIntent, null);
  assert.equal(element("workspace").hidden, true); assert.equal(element("payment-dialog").open, false);
  assert.equal(element("queue").children.length, 0); assert.equal(element("detail").children.length, 0);
  assert.equal(element("payment-order").textContent, "");
});
test("a concurrent version conflict refreshes from server instead of guessing the outcome", async () => {
  const { ui } = fixture(async path => path.includes("/queue") ? response({ orders: [order("preparing")] }) : response({ error: "version_conflict" }, 409));
  ui.init(order("awaiting_payment")); await ui.submitAction(order("awaiting_payment"), "pay");
  assert.equal(ui.snapshot().status, "preparing"); assert.equal(ui.snapshot().messageKey, "conflict");
});

test("a failed QR read disables actions on retained details until the queue reconnects", async () => {
  let connected = false;
  const { ui } = fixture(async path => {
    if (!connected) throw new TypeError("network lost");
    assert.match(path, /\/queue\?/);
    return response({ orders: [order("awaiting_payment")] });
  });
  ui.init(order("awaiting_payment"));
  await ui.openOrder(id);
  assert.equal(ui.snapshot().status, "awaiting_payment", "Retain the last known order for recovery");
  assert.equal(ui.snapshot().online, false, "A failed network read must also make retained actions unsafe");
  assert.equal(ui.snapshot().messageKey, "networkError");
  ui.openPayment();
  assert.equal(ui.snapshot().paymentIntent, null, "Payment cannot start while service status is uncertain");
  connected = true;
  await ui.refreshQueue();
  assert.equal(ui.snapshot().online, true);
  ui.openPayment();
  assert.ok(ui.snapshot().paymentIntent, "A confirmed refresh restores the ordinary payment path");
});

test("changing language during sign out cannot strand the login or retry controls", async () => {
  let rejectLogout;
  const { ui, element } = fixture(() => new Promise((_resolve, reject) => { rejectLogout = reject; }));
  ui.init(order("awaiting_payment"));
  const pending = ui.logout();
  assert.equal(ui.snapshot().session, false, "Protected details disappear immediately");
  assert.equal(element("language").disabled, true, "Locale changes cannot invalidate the pending sign out");
  element("language").value = "en";
  element("language").listeners.change();
  assert.equal(ui.snapshot().language, "ru");
  assert.equal(element("language").value, "ru");
  rejectLogout(new TypeError("network lost"));
  await pending;
  assert.equal(element("login-submit").disabled, false);
  assert.equal(element("logout-retry").disabled, false);
  assert.equal(element("logout-retry").hidden, false);
  assert.equal(element("language").disabled, false);
  assert.equal(ui.snapshot().messageKey, "logoutFailed");
});

test("rapid duplicate payment submissions issue one write while the first is pending", async () => {
  let releasePayment, writes = 0;
  const { ui } = fixture(path => {
    if (path.includes("/queue")) return Promise.resolve(response({ orders: [order("preparing")] }));
    writes++;
    return new Promise(resolve => { releasePayment = () => resolve(response({ order: order("preparing") })); });
  });
  ui.init(order("awaiting_payment"));
  const first = ui.submitAction(order("awaiting_payment"), "pay");
  await ui.submitAction(order("awaiting_payment"), "pay");
  assert.equal(writes, 1);
  assert.equal(ui.snapshot().actionPending, true);
  releasePayment(); await first;
  assert.equal(writes, 1);
  assert.equal(ui.snapshot().status, "preparing");
  assert.equal(ui.snapshot().version, 2);
});

test("a payment dialog becomes unsubmitable when polling observes another cashier's payment", async () => {
  let writes = 0;
  const { ui, element } = fixture(async (path, options) => {
    if (options.method === "POST") writes++;
    assert.match(path, /\/queue\?/);
    return response({ orders: [order("preparing")] });
  });
  ui.init(order("awaiting_payment")); ui.openPayment();
  element("payment-confirmed").checked = true;
  element("payment-confirmed").listeners.change();
  assert.equal(element("payment-submit").disabled, false);
  await ui.refreshQueue();
  assert.equal(ui.snapshot().status, "preparing");
  assert.equal(element("payment-submit").disabled, true);
  assert.equal(element("payment-confirmed").disabled, true);
  assert.equal(element("payment-error").hidden, false);
  element("payment-form").listeners.submit({ preventDefault() {} });
  assert.equal(writes, 0, "A stale checked dialog cannot issue a second payment");
});

for (const choice of ["queue card", "second QR"]) {
  test(`a delayed QR for order A cannot replace order B selected by ${choice}`, async () => {
    const other = { ...order("preparing"), id: "B".repeat(32), number: "R-0124" };
    let releaseFirst;
    const { ui } = fixture(path => path.includes(`/orders/${id}?`)
      ? new Promise(resolve => { releaseFirst = () => resolve(response({ order: order("awaiting_payment") })); })
      : Promise.resolve(response({ order: other })));
    ui.init(order("awaiting_payment"));
    const first = ui.openOrder(id);
    if (choice === "queue card") ui.chooseOrder(other); else await ui.openOrder(other.id);
    assert.equal(ui.snapshot().id, other.id);
    releaseFirst(); await first;
    assert.equal(ui.snapshot().id, other.id);
    assert.equal(ui.snapshot().status, "preparing");
    assert.equal(ui.snapshot().paymentIntent, null);
  });
}

for (const transition of [
  { action: "pay", from: "awaiting_payment", to: "preparing", role: "cashier", version: 1 },
  { action: "ready", from: "preparing", to: "ready", role: "barista", version: 2 },
  { action: "issued", from: "ready", to: "issued", role: "barista", version: 3 }
]) for (const committed of [false, true]) {
  test(`lost ${transition.action} response reconciles ${committed ? "a committed transition" : "an undelivered transition"} by reading, without an automatic second write`, async () => {
    let releaseRead, writes = 0;
    const before = { ...order(transition.from), version: transition.version };
    const serverOrder = committed ? { ...order(transition.to), version: transition.version + 1 } : before;
    const { ui, element } = fixture((path, options) => {
      if (options.method === "POST") { writes++; return Promise.reject(new TypeError("response lost")); }
      assert.match(path, /\/queue\?/);
      return new Promise(resolve => { releaseRead = () => resolve(response({ orders: serverOrder.status === "issued" ? [] : [serverOrder] })); });
    });
    ui.init(before, transition.role);
    if (transition.action === "pay") { ui.openPayment(); element("payment-confirmed").checked = true; }
    const pending = ui.submitAction(before, transition.action);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.snapshot().messageKey, "actionUnknown");
    assert.equal(ui.snapshot().online, false);
    assert.equal(ui.snapshot().status, before.status, "An uncertain response must not invent a transition");
    assert.equal(ui.snapshot().paymentIntent, null);
    assert.equal(element("payment-dialog").open, false);
    await ui.submitAction(before, transition.action);
    assert.equal(writes, 1);
    releaseRead(); await pending;
    assert.equal(ui.snapshot().online, true);
    if (committed && transition.to === "issued") {
      assert.equal(ui.snapshot().id, undefined, "The issued order leaves the barista's detail and queue");
      assert.equal(ui.snapshot().orders, 0);
    } else {
      assert.equal(ui.snapshot().status, serverOrder.status);
      assert.equal(ui.snapshot().paidAt, serverOrder.paidAt);
      assert.equal(ui.snapshot().version, serverOrder.version);
    }
    assert.equal(writes, 1);
    if (!committed && transition.action === "pay") {
      ui.openPayment();
      assert.equal(element("payment-confirmed").checked, false, "Retrying an unpaid order requires a fresh explicit confirmation");
      assert.equal(element("payment-submit").disabled, true);
    }
  });
}

for (const serverRevoked of [false, true]) {
  test(`failed sign out can recover when ${serverRevoked ? "the server already revoked the session" : "the request never reached the server"}`, async () => {
    let writes = 0, reads = 0;
    const { ui, element } = fixture(async (path, options) => {
      if (options.method === "POST") {
        assert.match(path, /\/logout$/); writes++;
        if (writes === 1) throw new TypeError("response lost");
        assert.equal(options.headers["X-CSRF-Token"], "retrieved-for-retry");
        return response(null, 204);
      }
      assert.match(path, /\/session$/); reads++;
      return serverRevoked ? response({ error: "unauthorized" }, 401) : response({ csrfToken: "retrieved-for-retry" });
    });
    ui.init(order("awaiting_payment")); ui.openPayment();
    await ui.logout();
    assert.equal(ui.snapshot().session, false);
    assert.equal(ui.snapshot().orders, 0);
    assert.equal(ui.snapshot().messageKey, "logoutFailed");
    assert.equal(element("logout-retry").hidden, false);
    await ui.logout();
    assert.equal(ui.snapshot().messageKey, "loggedOut");
    assert.equal(element("logout-retry").hidden, true);
    assert.equal(element("login-submit").disabled, false);
    assert.equal(reads, 1);
    assert.equal(writes, serverRevoked ? 1 : 2);
  });
}

for (const failure of ["poll401", "write401", "writeInvalidCsrf"]) {
  test(`${failure} clears the protected workspace and payment confirmation without retrying a write`, async () => {
    let writes = 0;
    const { ui, element } = fixture(async (_path, options) => {
      if (options.method === "POST") writes++;
      return response({ error: failure === "writeInvalidCsrf" ? "invalid_csrf" : "unauthorized" }, failure === "writeInvalidCsrf" ? 403 : 401);
    });
    ui.init(order("awaiting_payment")); ui.openPayment();
    element("payment-confirmed").checked = true;
    if (failure === "poll401") await ui.refreshQueue(); else await ui.submitAction(order("awaiting_payment"), "pay");
    assert.equal(ui.snapshot().session, false);
    assert.equal(ui.snapshot().orders, 0);
    assert.equal(ui.snapshot().id, undefined);
    assert.equal(ui.snapshot().paymentIntent, null);
    assert.equal(ui.snapshot().messageKey, "expired");
    assert.equal(element("workspace").hidden, true);
    assert.equal(element("login-panel").hidden, false);
    assert.equal(element("payment-dialog").open, false);
    assert.equal(element("payment-confirmed").checked, false);
    assert.equal(writes, failure === "poll401" ? 0 : 1);
  });
}

test("pagehide cleanup stops attached camera tracks and defeats a delayed QR response", async () => {
  let releaseRead, stopped = 0;
  const { ui, element, windowEvents } = fixture(() => new Promise(resolve => { releaseRead = () => resolve(response({ order: order("preparing") })); }));
  ui.init(order("awaiting_payment")); ui.openPayment();
  element("order-input").value = id;
  element("password").value = "temporary-test-only";
  ui.attachCamera({ getTracks() { return [{ stop() { stopped++; } }, { stop() { stopped++; } }]; } });
  const read = ui.openOrder(id);
  windowEvents.pagehide(); releaseRead(); await read;
  assert.equal(stopped, 2, "Every attached track is stopped; this is not a physical camera test");
  assert.equal(element("camera-video").srcObject, null);
  assert.equal(element("camera-panel").hidden, true);
  assert.equal(element("order-input").value, "");
  assert.equal(element("password").value, "");
  assert.equal(ui.snapshot().session, false);
  assert.equal(ui.snapshot().orders, 0);
  assert.equal(ui.snapshot().paymentIntent, null);
  assert.equal(element("workspace").hidden, true);
});

for (const validSession of [false, true]) {
  test(`persisted pageshow revalidates ${validSession ? "a valid" : "an expired"} session without reviving a cached payment intent`, async () => {
    const reads = [];
    const { ui, element, windowEvents } = fixture(async path => {
      reads.push(path);
      if (path.endsWith("/session")) return validSession
        ? response({ csrfToken: "fresh-session-token", user: { username: "cashier", role: "cashier" } })
        : response({ error: "unauthorized" }, 401);
      assert.match(path, /\/queue\?/);
      return response({ orders: [order("preparing")] });
    });
    ui.init(order("awaiting_payment")); ui.openPayment();
    element("payment-confirmed").checked = true;
    windowEvents.pagehide();
    assert.equal(ui.snapshot().session, false);
    windowEvents.pageshow({ persisted: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads.filter(path => path.endsWith("/session")).length, 1);
    assert.equal(ui.snapshot().session, validSession);
    assert.equal(ui.snapshot().orders, validSession ? 1 : 0);
    assert.equal(ui.snapshot().id, undefined, "Returning from cache never revives the old detail or confirmation");
    assert.equal(ui.snapshot().paymentIntent, null);
    assert.equal(element("payment-confirmed").checked, false);
    assert.equal(element("payment-dialog").open, false);
    assert.equal(element("workspace").hidden, !validSession);
  });
}

test("a 429 queue response preserves the order and blocks writes until a successful refresh", async () => {
  let limited = true, writes = 0;
  const { ui } = fixture(async (_path, options) => {
    if (options.method === "POST") writes++;
    return limited ? response({ error: "rate_limited" }, 429) : response({ orders: [order("awaiting_payment")] });
  });
  ui.init(order("awaiting_payment")); await ui.refreshQueue();
  assert.equal(ui.snapshot().messageKey, "rateLimit");
  assert.equal(ui.snapshot().online, false);
  assert.equal(ui.snapshot().status, "awaiting_payment");
  ui.openPayment(); await ui.submitAction(order("awaiting_payment"), "pay");
  assert.equal(ui.snapshot().paymentIntent, null);
  assert.equal(writes, 0);
  limited = false; await ui.refreshQueue();
  assert.equal(ui.snapshot().online, true);
  ui.openPayment(); assert.ok(ui.snapshot().paymentIntent);
});
