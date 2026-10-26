import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { request as httpRequest } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createCounterServer, provisionUser } from "../server.mjs";
import { encodeOrderTicket, getOrCreateOrderTicket, ORDER_TICKET_CATALOG_REVISION, quoteOrderTicket } from "../../src/order-ticket.js";
import { menuCategories } from "../../menu-catalog.js";

const secret = () => randomBytes(32).toString("base64url");
const product = menuCategories.flatMap(category => (category.items ?? category.groups.flatMap(group => group.items))
  .map(item => ({ category, item }))).find(({ item }) => item.id && !item.variants?.length);
const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const productId = product ? `${product.category.id}:${product.item.id}` : `${menuCategories[0].id}:${slug(menuCategories[0].items[0].name.en)}`;
const makeTicket = (quantity = 1) => getOrCreateOrderTicket({ version: 1, groups: [{ quantity, items: [{ id: productId, quantity: 1 }] }] });

async function fixture(t, options = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "robys-counter-"));
  const rootDir = resolve(directory, "public");
  const dbPath = resolve(directory, "private", "orders.sqlite");
  mkdirSync(resolve(rootDir, "counter/public"), { recursive: true });
  mkdirSync(resolve(rootDir, "counter/data"), { recursive: true });
  writeFileSync(resolve(rootDir, "index.html"), "<!doctype html><title>Local menu</title>");
  writeFileSync(resolve(rootDir, "menu.html"), "<!doctype html><title>Menu</title>");
  writeFileSync(resolve(rootDir, "script.js"), "export const menu = true;");
  writeFileSync(resolve(rootDir, "private.txt"), "private");
  writeFileSync(resolve(rootDir, "counter/data/secret.json"), '{"private":true}');
  for (const name of ["guest.html", "guest.js", "guest.css", "staff.html", "staff.js", "staff.css"]) writeFileSync(resolve(rootDir, "counter/public", name), `public ${name}`);
  writeFileSync(resolve(rootDir, "integrity-manifest.json"), JSON.stringify({ files: ["index.html", "menu.html", "script.js", "counter/data/secret.json"].map(path => ({ path })) }));
  const credentials = { cashier: secret(), barista: secret() };
  let server, origin;
  const start = async (extra = {}) => {
    server = createCounterServer({ dbPath, rootDir, ...options, ...extra });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    if (!server) return;
    await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    server = null;
  };
  t.after(async () => {
    await stop();
    const resolved = realpathSync(directory);
    assert(resolved.startsWith(`${realpathSync(tmpdir())}${sep}robys-counter-`));
    rmSync(resolved, { recursive: true, force: true });
  });
  await provisionUser({ dbPath, username: "cashier", password: credentials.cashier, role: "cashier" });
  await provisionUser({ dbPath, username: "barista", password: credentials.barista, role: "barista" });
  await start();
  const api = async (path, { method = "GET", body, headers = {}, auth, guestKey } = {}) => {
    const requestOptions = {
      method, headers: { ...(options.publicOrigin ? { Host: new URL(options.publicOrigin).host } : {}),
        ...(method === "POST" ? { "Content-Type": "application/json", Origin: options.publicOrigin ?? origin } : {}),
        ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken } : {}),
        ...(guestKey ? { Authorization: `Bearer ${guestKey}` } : {}), ...headers },
      ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {})
    };
    // Model a TLS-terminating proxy's backend request without fetch rewriting Host.
    if (options.publicOrigin) return new Promise((resolveResponse, reject) => {
      const request = httpRequest(`${origin}/api/counter${path}`, requestOptions, response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8"), responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            for (const entry of Array.isArray(value) ? value : [value]) if (entry !== undefined) responseHeaders.append(name, entry);
          }
          resolveResponse({ status: response.statusCode, headers: responseHeaders, body: text ? JSON.parse(text) : null });
        });
        response.on("error", reject);
      });
      request.on("error", reject);
      request.end(requestOptions.body);
    });
    const response = await fetch(`${origin}/api/counter${path}`, requestOptions);
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  };
  const login = async role => {
    const response = await api("/login", { method: "POST", body: { username: role, password: credentials[role] } });
    assert.equal(response.status, 200);
    return { ...response.body, cookie: response.headers.get("set-cookie").split(";")[0], setCookie: response.headers.get("set-cookie") };
  };
  const create = async (ticket = makeTicket(), guestKey = secret(), language = "en") => {
    const response = await api(`/orders?lang=${language}`, { method: "POST", body: { ticketPayload: encodeOrderTicket(ticket, language), guestKey } });
    return { ...response, ticket, guestKey, order: response.body.order };
  };
  return { api, login, create, credentials, dbPath, rootDir, start, stop, get server() { return server; }, get origin() { return origin; } };
}

test("HTTP login uses hashed credentials, HttpOnly strict cookies, CSRF, revocation and expiry", async t => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, sessionTtlMs: 60000 });
  assert.equal((await f.api("/session")).status, 401);
  const bad = await f.api("/login", { method: "POST", body: { username: "cashier", password: secret() } });
  assert.deepEqual(bad.body, { error: "invalid_credentials" });
  assert.equal(bad.status, 401);
  const auth = await f.login("cashier");
  assert.match(auth.setCookie, /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(auth.setCookie, /Secure/);
  assert.equal((await f.api("/session", { auth })).body.csrfToken, auth.csrfToken);
  assert.equal((await f.api("/logout", { method: "POST", auth, body: {}, headers: { "X-CSRF-Token": "wrong" } })).status, 403);
  assert.equal((await f.api("/logout", { method: "POST", auth, body: {} })).status, 204);
  assert.equal((await f.api("/session", { auth })).status, 401);
  const expiring = await f.login("barista");
  time += 60001;
  assert.equal((await f.api("/session", { auth: expiring })).status, 401);
  const database = new DatabaseSync(f.dbPath);
  const hashes = database.prepare("SELECT password_hash FROM users").all();
  assert(hashes.every(row => row.password_hash.startsWith("scrypt$32768$8$1$")));
  assert(hashes.every(row => !Object.values(f.credentials).some(password => row.password_hash.includes(password))));
  assert(hashes.every(row => row.password_hash !== hashes.find(other => other !== row)?.password_hash));
  database.close();
});

test("origin, JSON bounds, host and CSRF protect all write paths", async t => {
  const f = await fixture(t), auth = await f.login("cashier");
  for (const Origin of ["", "null", "https://attacker.invalid"]) {
    assert.equal((await f.api("/login", { method: "POST", body: { username: "cashier", password: f.credentials.cashier }, headers: { Origin } })).status, 403);
    assert.equal((await f.api("/orders", { method: "POST", body: {}, headers: { Origin } })).status, 403);
  }
  assert.equal((await f.api("/logout", { method: "POST", auth, body: {}, headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal((await f.api("/orders", { method: "POST", body: {}, headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await f.api("/orders", { method: "POST", body: "{" })).status, 400);
  assert.equal((await f.api("/orders", { method: "POST", body: JSON.stringify({ value: "x".repeat(9000) }) })).status, 413);
  const hostStatus = await new Promise((resolveStatus, reject) => {
    const request = httpRequest(`${f.origin}/api/counter/health`, { headers: { Host: "attacker.invalid" } }, response => { response.resume(); resolveStatus(response.statusCode); });
    request.on("error", reject); request.end();
  });
  assert.equal(hostStatus, 403);
  assert.throws(() => createCounterServer({ dbPath: f.dbPath, rootDir: f.rootDir, host: "0.0.0.0", secureCookies: false }), /loopback/);
});

test("explicit secure-cookie mode uses the secure Host cookie prefix", async t => {
  const f = await fixture(t, { secureCookies: true });
  const response = await f.api("/login", { method: "POST", body: { username: "cashier", password: f.credentials.cashier },
    headers: { Origin: f.origin.replace("http:", "https:") } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /^__Host-roby-counter-session=/);
  assert.match(response.headers.get("set-cookie"), /; Secure$/);
});

test("platform healthcheck hostname grants only the exact read-only health route", async t => {
  const f = await fixture(t, { host: "0.0.0.0", publicOrigin: "https://counter.example.test", healthcheckHost: "healthcheck.railway.app" });
  const headers = { Host: "healthcheck.railway.app" };
  const health = await f.api("/health", { headers });
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true });
  assert.equal(health.headers.get("cache-control"), "no-store");
  for (const path of ["/session", "/queue", "/health?lang=en", "/health/", "/%68ealth"]) {
    assert.equal((await f.api(path, { headers })).status, 403, path);
  }
  assert.equal((await f.api("/health", { method: "POST", headers, body: {} })).status, 403);
  assert.equal((await f.api("/login", { method: "POST", headers, body: { username: "cashier", password: f.credentials.cashier } })).status, 403);
  assert.equal((await f.api("/health", { headers: { Host: "attacker.invalid", "X-Forwarded-Host": "healthcheck.railway.app" } })).status, 403);
  const auth = await f.login("cashier");
  assert.match(auth.setCookie, /^__Host-roby-counter-session=.*; Secure$/);
});

test("canonical quote, server timestamps and opaque IDs ignore no client price or state", async t => {
  const time = Date.now(), f = await fixture(t, { now: () => time });
  const ticket = makeTicket(2); ticket.createdAt = 1577836800000;
  const result = await f.create(ticket);
  assert.equal(result.status, 201);
  const order = result.order;
  assert.match(order.id, /^[A-Za-z0-9_-]{32}$/);
  assert.match(order.number, /^R-\d{6}$/);
  assert.equal(order.status, "awaiting_payment");
  assert.equal(order.version, 1);
  assert.equal(order.paidAt, null);
  assert.equal(order.createdAt, time);
  assert.deepEqual(order.groups, quoteOrderTicket(ticket, "en").groups);
  assert.equal(order.totalMinor, quoteOrderTicket(ticket).totalMinor);
  assert.equal(order.currency, "TRY");
  const body = { ticketPayload: encodeOrderTicket(makeTicket()), guestKey: secret() };
  for (const extra of [{ status: "preparing" }, { totalMinor: 1 }, { paidAt: time }, { currency: "USD" }]) {
    assert.equal((await f.api("/orders", { method: "POST", body: { ...body, ...extra } })).status, 400);
  }
  for (const lang of ["tr", "en", "ru"]) {
    const read = await f.api(`/orders/${order.id}?lang=${lang}`, { guestKey: result.guestKey });
    assert.deepEqual(read.body.order.groups, quoteOrderTicket(ticket, lang).groups);
  }
  const db = new DatabaseSync(f.dbPath);
  const stored = db.prepare("SELECT guest_hash,quotes FROM orders WHERE id=?").get(order.id);
  assert(!stored.guest_hash.includes(result.guestKey));
  assert.match(stored.guest_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(JSON.parse(stored.quotes)).sort(), ["en", "ru", "tr"]);
  db.close();
});

test("malformed, unknown catalog/variant and extra wire data are rejected", async t => {
  const f = await fixture(t), guestKey = secret(), ticket = makeTicket();
  const valid = encodeOrderTicket(ticket);
  const cases = ["", "bad payload", "a".repeat(2001)];
  const altered = Buffer.from(valid, "base64url");
  const fingerprint = Buffer.from(altered); fingerprint[28] ^= 1; cases.push(fingerprint.toString("base64url"));
  const unknown = Buffer.from(altered); unknown[35] = 255; cases.push(unknown.toString("base64url"));
  const variant = Buffer.from(altered); variant[37] = 255; cases.push(variant.toString("base64url"));
  cases.push(Buffer.concat([altered, Buffer.from([0])]).toString("base64url"));
  const legacy = [1, ticket.id, ticket.createdAt, "tr", ORDER_TICKET_CATALOG_REVISION, [[100, [[0, 1]]]]];
  cases.push(Buffer.from(JSON.stringify(legacy)).toString("base64url"));
  for (const ticketPayload of cases) {
    const response = await f.api("/orders", { method: "POST", body: { ticketPayload, guestKey } });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "invalid_ticket" });
  }
  assert.equal((await f.api("/orders", { method: "POST", body: { ticketPayload: valid, guestKey: "x".repeat(43) } })).status, 400);
});

test("guest isolation, ticket idempotency, concurrent retries and conflicts disclose no existing data", async t => {
  const f = await fixture(t), ticket = makeTicket(), guestKey = secret();
  const results = await Promise.all(Array.from({ length: 5 }, () => f.create(ticket, guestKey)));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert(results.every(result => [200, 201].includes(result.status)));
  assert.equal(new Set(results.map(result => result.order.id)).size, 1);
  const order = results[0].order;
  for (const key of [undefined, secret()]) {
    const response = await f.api(`/orders/${order.id}`, { guestKey: key });
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: "order_not_found" });
  }
  const wrongKey = await f.create(ticket, secret());
  assert.equal(wrongKey.status, 409);
  assert.deepEqual(wrongKey.body, { error: "order_conflict" });
  const changed = { ...ticket, groups: [{ ...ticket.groups[0], quantity: 2 }] };
  const wrongComposition = await f.create(changed, guestKey);
  assert.equal(wrongComposition.status, 409);
  assert.deepEqual(wrongComposition.body, { error: "order_conflict" });
  const other = await f.create();
  assert.notEqual(other.order.id, order.id);
  assert.notEqual(other.order.number, order.number);
});

test("only cashier acknowledges payment; queues hide unpaid orders from barista", async t => {
  const f = await fixture(t), cashier = await f.login("cashier"), barista = await f.login("barista");
  const created = await f.create(), id = created.order.id;
  assert.equal((await f.api("/queue")).status, 401);
  assert.equal((await f.api("/queue", { auth: cashier })).body.orders.length, 1);
  assert.deepEqual((await f.api("/queue", { auth: barista })).body.orders, []);
  assert.equal((await f.api(`/orders/${id}`, { auth: barista })).status, 404);
  assert.equal((await f.api(`/orders/${id}/pay`, { method: "POST", body: { version: 1 }, guestKey: created.guestKey })).status, 401);
  assert.equal((await f.api(`/orders/${id}/pay`, { method: "POST", auth: barista, body: { version: 1 } })).status, 403);
  assert.equal((await f.api(`/orders/${id}/status`, { method: "POST", auth: cashier, body: { version: 1, status: "ready" } })).status, 409);
  const paid = await f.api(`/orders/${id}/pay`, { method: "POST", auth: cashier, body: { version: 1 } });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.order.status, "preparing");
  assert.equal(paid.body.order.version, 2);
  assert.equal(typeof paid.body.order.paidAt, "number");
  assert.equal((await f.api("/queue", { auth: barista })).body.orders[0].id, id);
  assert.equal((await f.api(`/orders/${id}`, { guestKey: created.guestKey })).body.order.status, "preparing");
});

test("payment/status workflow is sequential and concurrent stale writes are atomic/idempotent", async t => {
  const f = await fixture(t), cashier = await f.login("cashier"), barista = await f.login("barista");
  const { order } = await f.create(), id = order.id;
  const pay = () => f.api(`/orders/${id}/pay`, { method: "POST", auth: cashier, body: { version: 1 } });
  const paid = await Promise.all([pay(), pay()]);
  assert(paid.every(result => result.status === 200 && result.body.order.version === 2));
  assert.equal((await f.api(`/orders/${id}/pay`, { method: "POST", auth: cashier, body: { version: 2 } })).status, 409);
  const status = (version, next) => f.api(`/orders/${id}/status`, { method: "POST", auth: barista, body: { version, status: next } });
  assert.equal((await status(2, "issued")).status, 409);
  const raced = await Promise.all([status(2, "ready"), status(2, "issued")]);
  assert.equal(raced[0].status, 200);
  assert.equal(raced[1].status, 409);
  assert.equal((await status(2, "ready")).body.order.version, 3);
  assert.equal((await status(3, "preparing")).status, 400);
  assert.equal((await status(3, "issued")).body.order.version, 4);
  assert.equal((await status(3, "issued")).body.order.version, 4);
  assert.equal((await pay()).body.order.status, "issued");
  assert.deepEqual((await f.api("/queue", { auth: barista })).body.orders, []);
  assert.equal((await f.api("/queue", { auth: cashier })).body.orders[0].status, "issued");
  const db = new DatabaseSync(f.dbPath);
  const audit = db.prepare("SELECT action,actor_username,actor_role,from_version FROM audit WHERE order_id=? ORDER BY id").all(id);
  assert.deepEqual(audit.map(row => row.action), ["pay", "ready", "issued"]);
  assert.equal(audit[0].actor_role, "cashier");
  assert.equal(audit[1].actor_role, "barista");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM orders WHERE paid_at IS NOT NULL").get().count, 1);
  db.close();
});

test("orders, immutable quotes, sessions and audit survive restart; reprovisioning revokes sessions", async t => {
  const f = await fixture(t), auth = await f.login("cashier"), created = await f.create();
  const paid = await f.api(`/orders/${created.order.id}/pay?lang=en`, { method: "POST", auth, body: { version: 1 } });
  await f.stop();
  await f.start();
  assert.deepEqual((await f.api(`/orders/${created.order.id}?lang=en`, { guestKey: created.guestKey })).body.order, paid.body.order);
  assert.equal((await f.api("/session", { auth })).status, 200);
  assert.equal((await f.create(created.ticket, created.guestKey)).status, 200);
  assert.equal((await f.api(`/orders/${created.order.id}/pay`, { method: "POST", auth, body: { version: 1 } })).body.order.version, 2);
  const replacement = secret();
  await f.server.provisionUser({ username: "cashier", password: replacement, role: "cashier" });
  assert.equal((await f.api("/session", { auth })).status, 401);
  assert.equal((await f.api("/login", { method: "POST", body: { username: "cashier", password: f.credentials.cashier } })).status, 401);
  assert.equal((await f.api("/login", { method: "POST", body: { username: "cashier", password: replacement } })).status, 200);
});

test("rate limits protect login, creation and polling and expire without trusting proxy headers", async t => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, rateLimits: { login: { max: 2 }, create: { max: 2 }, api: { max: 40 } } });
  for (let i = 0; i < 2; i++) assert.equal((await f.api("/login", { method: "POST", body: { username: "cashier", password: secret() } })).status, 401);
  const limited = await f.api("/login", { method: "POST", body: { username: "cashier", password: f.credentials.cashier }, headers: { "X-Forwarded-For": "192.0.2.1" } });
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal((await f.create()).status, 201);
  assert.equal((await f.create()).status, 201);
  assert.equal((await f.create()).status, 429);
  time += 60001;
  assert.equal((await f.login("cashier")).user.role, "cashier");
  assert.equal((await f.create()).status, 201);
  await f.stop();
  await f.start({ rateLimits: { api: { max: 2 } } });
  assert.equal((await f.api("/health")).status, 200);
  assert.equal((await f.api("/health")).status, 200);
  assert.equal((await f.api("/health")).status, 429);
});

test("authenticated polling limits are independent for different guests on one address", async t => {
  const f = await fixture(t, { rateLimits: { read: { max: 2 } } });
  const one = await f.create(), two = await f.create();
  for (let count = 0; count < 2; count++) assert.equal((await f.api(`/orders/${one.order.id}`, { guestKey: one.guestKey })).status, 200);
  assert.equal((await f.api(`/orders/${one.order.id}`, { guestKey: one.guestKey })).status, 429);
  assert.equal((await f.api(`/orders/${two.order.id}`, { guestKey: two.guestKey })).status, 200);
});

test("forty guest pollers behind one proxy do not consume the default address budget for counter actions", async t => {
  let time = Date.now();
  const f = await fixture(t, { host: "0.0.0.0", publicOrigin: "https://counter.example.test", now: () => time });
  const guests = [];
  for (let index = 0; index < 40; index++) {
    // Existing orders may arrive over several minutes; preserve creation's
    // default 30/minute guard while testing one later minute of normal polls.
    if (index === 30) time += 60000;
    const created = await f.create(); assert.equal(created.status, 201); guests.push(created);
  }
  const cashier = await f.login("cashier"), barista = await f.login("barista");
  assert.match(cashier.setCookie, /; Secure$/);
  for (let poll = 0; poll < 30; poll++) {
    for (const guest of guests) assert.equal((await f.api(`/orders/${guest.order.id}`, { guestKey: guest.guestKey })).status, 200);
    for (const auth of [cashier, barista]) {
      assert.equal((await f.api("/queue", { auth })).status, 200);
      assert.equal((await f.api("/session", { auth })).status, 200);
    }
  }
  assert.equal((await f.api("/health")).status, 200, "1320 valid polls must not starve health checks");
  await f.login("cashier");
  const created = await f.create(); assert.equal(created.status, 201);
  const paid = await f.api(`/orders/${created.order.id}/pay`, { method: "POST", auth: cashier, body: { version: 1 } });
  assert.equal(paid.status, 200);
  assert.equal((await f.api(`/orders/${created.order.id}/status`, { method: "POST", auth: barista,
    body: { version: 2, status: "ready" } })).status, 200);
});

test("only verified polling bypasses the address quota and principal-limit failures never consume it", async t => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, sessionTtlMs: 1000 });
  const cashier = await f.login("cashier"), first = await f.create(), second = await f.create();
  await f.stop();
  await f.start({ rateLimits: { api: { max: 2 }, read: { max: 2 } } });
  for (let count = 0; count < 2; count++) assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).status, 200);
  for (let count = 0; count < 5; count++) assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).status, 429);
  assert.equal((await f.api("/queue", { auth: cashier })).status, 200);
  assert.equal((await f.api("/session?lang=ru", { auth: cashier })).status, 200);
  assert.equal((await f.api(`/orders/${first.order.id}`, { auth: cashier })).status, 429,
    "Queue, session and order reads share the same staff-session allowance");
  assert.equal((await f.api("/health")).status, 200);
  assert.equal((await f.api("/health")).status, 200);
  assert.equal((await f.api("/health")).status, 429, "Anonymous traffic remains address-limited");
  assert.equal((await f.api(`/orders/${second.order.id}`, { guestKey: second.guestKey })).status, 200,
    "A full anonymous bucket must not block another valid capability");
  const invalid = [
    [`/orders/${first.order.id}`, { guestKey: secret() }],
    [`/orders/${first.order.id}`, { guestKey: second.guestKey }],
    [`/orders/${first.order.id}`, {}],
    ["/session", { headers: { Cookie: `roby-counter-session=${secret()}` } }],
    ["/unknown", { auth: cashier }],
    ["/queue", { method: "POST", auth: cashier, body: {} }],
    ["/session?lang=invalid", { auth: cashier }],
    ["/queue", { auth: cashier, headers: { "Sec-Fetch-Site": "cross-site" } }]
  ];
  for (const [index, [path, options]] of invalid.entries()) {
    const result = await f.api(path, { ...options, headers: { ...options.headers,
      "X-Forwarded-For": `192.0.2.${index + 1}`, Forwarded: "for=198.51.100.1;proto=https" } });
    assert.equal(result.status, 429, `An invalid or non-polling request cannot obtain an exemption: ${path}`);
    assert.equal(result.body.error, "rate_limited");
  }
  time += 1001;
  assert.equal((await f.api("/session", { auth: cashier })).status, 429, "An expired session also consumes the address budget");
  time += 60000;
  assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).status, 200);
  assert.equal((await f.api("/health")).status, 200);
  assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: secret() })).status, 404);
  assert.equal((await f.api("/health")).status, 429, "A wrong capability spends the recovered anonymous budget");
});

test("queue is bounded and oldest first; issued history leaves the queue after 24 hours", async t => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, rateLimits: { create: { max: 300 } } });
  const cashier = await f.login("cashier"), first = await f.create();
  const action = (path, body) => f.api(`/orders/${first.order.id}/${path}`, { method: "POST", auth: cashier, body });
  assert.equal((await action("pay", { version: 1 })).status, 200);
  assert.equal((await action("status", { version: 2, status: "ready" })).status, 200);
  assert.equal((await action("status", { version: 3, status: "issued" })).status, 200);
  time += 24 * 60 * 60 * 1000 + 1;
  const freshCashier = await f.login("cashier");
  for (let count = 0; count < 205; count++) {
    time += 1;
    assert.equal((await f.create()).status, 201);
  }
  const queued = await f.api("/queue", { auth: freshCashier });
  assert.equal(queued.status, 200);
  assert.equal(queued.body.orders.length, 200);
  assert(!queued.body.orders.some(order => order.id === first.order.id));
  assert(queued.body.orders.every((order, index, rows) => !index || order.createdAt >= rows[index - 1].createdAt));
  assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).body.order.status, "issued");
});

test("more than 200 older issued orders cannot hide fresh unpaid or preparing work", async t => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, rateLimits: { create: { max: 300 } } });
  const cashier = await f.login("cashier");
  // Seed one completed order through its full HTTP workflow, then a large
  // historical backlog in the real SQLite database to exercise queue selection.
  const first = await f.create();
  for (const [path, body] of [["pay", { version: 1 }], ["status", { version: 2, status: "ready" }], ["status", { version: 3, status: "issued" }]]) {
    assert.equal((await f.api(`/orders/${first.order.id}/${path}`, { method: "POST", auth: cashier, body })).status, 200);
  }
  const db = new DatabaseSync(f.dbPath);
  const completed = db.prepare("SELECT * FROM orders WHERE id=?").get(first.order.id);
  const insert = db.prepare(`INSERT INTO orders(id,client_id,guest_hash,composition_hash,quotes,status,version,created_at,updated_at,paid_at,paid_by,total_minor)
    VALUES(?,?,?,?,?,'issued',4,?,?,?,?,?)`);
  db.exec("BEGIN IMMEDIATE");
  for (let count = 0; count < 200; count++) {
    insert.run(randomBytes(24).toString("base64url"), secret(), completed.guest_hash, completed.composition_hash,
      completed.quotes, time, time, completed.paid_at, completed.paid_by, completed.total_minor);
  }
  db.exec("COMMIT"); db.close();
  time += 1;
  const unpaid = await f.create();
  time += 1;
  const preparing = await f.create();
  assert.equal((await f.api(`/orders/${preparing.order.id}/pay`, { method: "POST", auth: cashier, body: { version: 1 } })).status, 200);
  const result = await f.api("/queue", { auth: cashier });
  assert.equal(result.status, 200);
  assert.equal(result.body.orders.filter(order => order.status === "issued").length, 30);
  assert.equal(result.body.orders.length, 32);
  assert(result.body.orders.some(order => order.id === unpaid.order.id && order.status === "awaiting_payment"));
  assert(result.body.orders.some(order => order.id === preparing.order.id && order.status === "preparing"));
  assert(result.body.orders.every((order, index, rows) => !index || order.createdAt >= rows[index - 1].createdAt));
});

test("static server exposes only manifest plus six exact counter assets and local enabled config", async t => {
  const f = await fixture(t);
  for (const path of ["/", "/menu.html", "/script.js", "/counter/guest.html", "/counter/staff.js", "/counter/guest.css"]) {
    const response = await fetch(f.origin + path); assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  for (const path of ["/private.txt", "/counter/data/secret.json", "/counter/server.mjs", "/counter/public/guest.html", "/.git/config", "/%2e%2e/private/orders.sqlite"]) {
    assert.equal((await fetch(f.origin + path)).status, 404, path);
  }
  const config = await fetch(`${f.origin}/counter-config.json`);
  assert.deepEqual(await config.json(), { enabled: true, checkoutUrl: "/counter/guest.html" });
  assert.equal(config.headers.get("cache-control"), "no-store");
  const health = await f.api("/health"); assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("access-control-allow-origin"), null);
  const staffPage = await fetch(`${f.origin}/counter/staff.html`);
  assert.match(staffPage.headers.get("permissions-policy"), /camera=\(self\)/);
  assert.match(staffPage.headers.get("content-security-policy"), /require-trusted-types-for 'script'/);
  const guestPage = await fetch(`${f.origin}/counter/guest.html`);
  assert.match(guestPage.headers.get("permissions-policy"), /camera=\(\)/);
  assert.equal((await fetch(f.origin)).headers.get("content-security-policy"), null, "Existing main page CSP must remain in its own markup");
  const range = await fetch(`${f.origin}/script.js`, { headers: { Range: "bytes=0-5" } });
  assert.equal(range.status, 206); assert.equal(await range.text(), "export");
  const head = await fetch(`${f.origin}/script.js`, { method: "HEAD" });
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
});

test("committed creation and payment survive discarded HTTP response bodies across a second cashier session", async t => {
  const f = await fixture(t), ticket = makeTicket(2), guestKey = secret();
  const discardResponseBody = (path, body, auth) => new Promise((resolveStatus, reject) => {
    const bytes = JSON.stringify(body);
    const request = httpRequest(`${f.origin}/api/counter${path}`, { method: "POST", headers: {
      Origin: f.origin, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bytes),
      ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken } : {})
    } }, incoming => {
      // Receiving headers proves the server committed, but the client never
      // consumes the JSON containing the order. This is a transport test,
      // distinct from the guest/staff VM tests of the recovery messages.
      incoming.destroy(); resolveStatus(incoming.statusCode);
    });
    request.on("error", reject); request.end(bytes);
  });
  assert.equal(await discardResponseBody("/orders?lang=en", { ticketPayload: encodeOrderTicket(ticket, "en"), guestKey }), 201);
  const retry = await f.create(ticket, guestKey, "en");
  assert.equal(retry.status, 200);
  assert.equal(retry.order.status, "awaiting_payment");
  assert.equal(retry.order.version, 1);
  const cashierA = await f.login("cashier"), cashierB = await f.login("cashier");
  assert(cashierA.csrfToken !== cashierB.csrfToken, "The retry uses a distinct valid staff session");
  const path = `/orders/${retry.order.id}/pay?lang=en`;
  assert.equal(await discardResponseBody(path, { version: 1 }, cashierA), 200);
  const observed = await f.api(`/orders/${retry.order.id}?lang=en`, { guestKey });
  assert.equal(observed.body.order.status, "preparing");
  const repeated = await f.api(path, { method: "POST", auth: cashierB, body: { version: 1 } });
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body.order, observed.body.order);
  assert.equal(observed.body.order.version, 2);
  assert.equal(observed.body.order.totalMinor, retry.order.totalMinor);
  const db = new DatabaseSync(f.dbPath);
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM orders").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit WHERE order_id=? AND action='pay'").get(retry.order.id).count, 1);
  } finally { db.close(); }
});

test("expired, revoked and invalid-CSRF payment writes preserve the exact unpaid order and audit", async t => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, sessionTtlMs: 1000 });
  const auth = await f.login("cashier"), created = await f.create();
  const path = `/orders/${created.order.id}/pay`;
  const before = (await f.api(`/orders/${created.order.id}?lang=en`, { guestKey: created.guestKey })).body.order;
  const invalid = await f.api(path, { method: "POST", auth, body: { version: 1 }, headers: { "X-CSRF-Token": "invalid-test-token" } });
  assert.equal(invalid.status, 403); assert.equal(invalid.body.error, "invalid_csrf");
  time += 1001;
  assert.equal((await f.api(path, { method: "POST", auth, body: { version: 1 } })).status, 401);
  const renewed = await f.login("cashier"), replacement = secret();
  await f.server.provisionUser({ username: "cashier", password: replacement, role: "cashier" });
  assert.equal((await f.api(path, { method: "POST", auth: renewed, body: { version: 1 } })).status, 401);
  const after = (await f.api(`/orders/${created.order.id}?lang=en`, { guestKey: created.guestKey })).body.order;
  assert.deepEqual(after, before);
  const db = new DatabaseSync(f.dbPath);
  try { assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit WHERE order_id=?").get(created.order.id).count, 0); }
  finally { db.close(); }
  assert.equal((await f.api("/login", { method: "POST", body: { username: "cashier", password: replacement } })).status, 200);
});

test("read throttles recover at their window boundary and isolate staff sessions as well as guests", async t => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, rateLimits: { read: { windowMs: 100, max: 2 } } });
  const cashierA = await f.login("cashier"), cashierB = await f.login("cashier");
  const first = await f.create(), second = await f.create();
  for (let count = 0; count < 2; count++) assert.equal((await f.api("/queue", { auth: cashierA })).status, 200);
  assert.equal((await f.api("/queue", { auth: cashierA })).status, 429);
  assert.equal((await f.api("/queue", { auth: cashierB })).status, 200);
  for (let count = 0; count < 2; count++) assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).status, 200);
  assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).status, 429);
  assert.equal((await f.api(`/orders/${second.order.id}`, { guestKey: second.guestKey })).status, 200);
  time += 100;
  assert.equal((await f.api("/queue", { auth: cashierA })).status, 200);
  assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).status, 200);
});

test("both roles retain the oldest 200 active orders and only the latest 30 issued through the exact 24h boundary", async t => {
  const base = Date.now(); let time = base;
  const f = await fixture(t, { now: () => time });
  const cashier = await f.login("cashier"), barista = await f.login("barista"), first = await f.create();
  for (const [path, body] of [["pay", { version: 1 }], ["status", { version: 2, status: "ready" }], ["status", { version: 3, status: "issued" }]]) {
    assert.equal((await f.api(`/orders/${first.order.id}/${path}`, { method: "POST", auth: cashier, body })).status, 200);
  }
  const active = [], issued = [], db = new DatabaseSync(f.dbPath);
  try {
    const template = db.prepare("SELECT * FROM orders WHERE id=?").get(first.order.id);
    const insert = db.prepare(`INSERT INTO orders(id,client_id,guest_hash,composition_hash,quotes,status,version,created_at,updated_at,paid_at,paid_by,total_minor)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.exec("BEGIN IMMEDIATE");
    for (let count = 0; count < 205; count++) {
      const id = randomBytes(24).toString("base64url"), status = count % 2 ? "ready" : "preparing";
      active.push(id);
      insert.run(id, secret(), template.guest_hash, template.composition_hash, template.quotes, status,
        status === "ready" ? 3 : 2, base + count + 1, base + count + 1, base, template.paid_by, template.total_minor);
    }
    for (let count = 0; count < 35; count++) {
      const id = randomBytes(24).toString("base64url"), at = base + 1000 + count;
      issued.push({ id, at });
      insert.run(id, secret(), template.guest_hash, template.composition_hash, template.quotes, "issued", 4,
        base + 500 + count, at, base, template.paid_by, template.total_minor);
    }
    db.exec("COMMIT");
  } finally { db.close(); }
  time = base + 2000;
  const cashierOrders = (await f.api("/queue", { auth: cashier })).body.orders;
  const baristaOrders = (await f.api("/queue", { auth: barista })).body.orders;
  assert.equal(cashierOrders.length, 230);
  assert.deepEqual(cashierOrders.filter(order => order.status !== "issued").map(order => order.id), active.slice(0, 200));
  assert.deepEqual(baristaOrders.map(order => order.id), active.slice(0, 200));
  assert.deepEqual(cashierOrders.filter(order => order.status === "issued").map(order => order.id), issued.slice(5).map(order => order.id));
  time = issued[5].at + 24 * 60 * 60 * 1000;
  const renewed = await f.login("cashier");
  assert.equal((await f.api("/queue", { auth: renewed })).body.orders.filter(order => order.status === "issued").length, 30);
  time++;
  const aged = (await f.api("/queue", { auth: renewed })).body.orders;
  assert.equal(aged.filter(order => order.status === "issued").length, 29);
  assert(!aged.some(order => order.id === issued[5].id));
  assert.equal((await f.api(`/orders/${issued[5].id}`, { auth: renewed })).body.order.status, "issued");
  assert.equal((await f.api(`/orders/${first.order.id}`, { guestKey: first.guestKey })).body.order.status, "issued");
});
