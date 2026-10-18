import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { buildSync } from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime, compileMenuOrderRuntime, compileOrderStorageRuntime } from "./menu-runtime-source.mjs";
import { menuCategories } from "../menu-catalog.js";

const repo = resolve(new URL("..", import.meta.url).pathname); process.chdir(repo);
const output = resolve(process.env.ROBYS_STORAGE_QA_DIR ?? ".artifacts/order-storage-compat"); mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-storage-https-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"), "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const bundled = entry => buildSync({ entryPoints: [entry], bundle: true, write: false, format: "esm", target: "es2020", minify: true, logLevel: "silent" }).outputFiles[0].text;
const compiled = new Map([
  ["/menu-app.js", compileMenuRuntime()], ["/menu-order-ui.js", compileMenuOrderRuntime()], ["/order-storage.js", compileOrderStorageRuntime()],
  ["/menu-family-ui.js", compileMenuRuntime(readFileSync("src/menu-family-ui.js", "utf8"))],
  ["/menu-pairing.js", bundled("src/menu-pairing-view.js")], ["/order-checkout.js", bundled("src/order-checkout.js")]
]);
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  const path = new URL(request.url, "https://127.0.0.1").pathname;
  if (compiled.has(path)) { response.writeHead(200, { "content-type": "application/javascript" }).end(compiled.get(path)); return; }
  if (path === "/storage-fixture.html") { response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Storage compatibility fixture</title>"); return; }
  const file = resolve(repo, "." + decodeURIComponent(path));
  if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" }); createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `https://127.0.0.1:${server.address().port}`;
const legacyKey = "robys-menu-order.v1", projectionKey = "robys-menu-order.v2", tabKey = "robys-menu-order.tab.v1";
const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const products = new Map(menuCategories.flatMap(category => (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => [`${category.id}:${item.id ?? slug(item.name.en)}`, item])));
const ids = [...products.keys()];
const milk = "brew-hot:milk", cookie = "desserts:cookie", tea = "brew-hot:black-tea", espresso = "hot-coffee:espresso";
const lines = draft => draft.lines.slice().sort((a, b) => a.id.localeCompare(b.id, "en"));
const total = draft => draft.lines.reduce((sum, line) => sum + products.get(line.id).price * line.quantity, 0);
const flat = entries => ({ version: 1, lines: entries.map(([id, quantity]) => ({ id, quantity })) });
const typeName = process.env.ROBYS_STORAGE_BROWSER ?? "chromium";
const type = { chromium, firefox, webkit }[typeName]; if (!type) throw new Error(`Unknown browser ${typeName}`);
const sourceFiles = ["src/order-draft.js", "src/order-storage.js", "src/menu-app.js", "src/menu-order-ui.js", "src/order-checkout.js", "src/order-storage-notice.js", "scripts/test-order-storage-compat-browser.mjs"];
const report = { head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), startedAt: new Date().toISOString(), browser: typeName,
  mode: "Local source fixture with genuine browser storage and deliberate API denial/fault injection; not physical OEM certification",
  sourceHashes: Object.fromEntries(sourceFiles.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])), cases: [] };
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
let browser;
async function run(id, callback) {
  if (process.env.ROBYS_STORAGE_FILTER && !id.includes(process.env.ROBYS_STORAGE_FILTER)) return;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  try { const facts = await callback(context); report.cases.push({ id, status: "PASS", facts }); console.log(`PASS ${id}`); }
  catch (error) { report.cases.push({ id, status: "FAIL", error: error.stack }); console.error(`FAIL ${id}: ${error.stack}`); }
  finally { await context.close(); persist(); }
}
async function denial(page, mode, memory = false) {
  await page.addInitScript(({ mode, memory }) => {
    if (mode === "absent") Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    if (mode === "open-denied") IDBFactory.prototype.open = function() { throw new DOMException("denied", "SecurityError"); };
    if (mode === "store-unavailable") IDBDatabase.prototype.transaction = function() { throw new DOMException("missing store", "NotFoundError"); };
    if (memory) for (const method of ["getItem", "setItem", "removeItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function(...args) { if (this === sessionStorage) throw new DOMException("denied", "SecurityError"); return original.apply(this, args); };
    }
  }, { mode, memory });
}
async function prepare(context, { mode, memory = false, legacy } = {}) {
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  if (mode) await denial(page, mode, memory);
  if (legacy !== undefined) await page.addInitScript(({ key, legacy }) => localStorage.setItem(key, legacy), { key: legacyKey, legacy });
  await page.goto(`${origin}/storage-fixture.html`); await imports(page); return page;
}
async function imports(page) {
  await page.evaluate(async ids => { window.orders = await import("/src/order-draft.js"); window.ids = new Set(ids); await window.orders.readLatestStoredOrderDraft(window.ids); }, ids);
}
const latest = page => page.evaluate(() => window.orders.readLatestStoredOrderDraft(window.ids));
const state = page => page.evaluate(() => window.orders.getOrderStorageState());
const add = (page, id, quantity = 1, module = "orders") => page.evaluate(({ id, quantity, module }) => window[module].transactStoredOrderDraft(draft => window[module].addOrderGroup(draft, [{ id }], quantity, window.ids), window.ids), { id, quantity, module });
const writeLegacy = (page, value) => page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: legacyKey, value });
const legacyValue = page => page.evaluate(key => localStorage.getItem(key), legacyKey);
const resolveConflict = (page, choice, token) => page.evaluate(({ choice, token }) => window.orders.resolveLegacyOrderDraft(choice, window.ids, token), { choice, token });
async function rejected(operation, name) { let failure; try { await operation(); } catch (error) { failure = error; } assert.ok(failure, "the operation must be rejected"); assert.match(failure.message, new RegExp(name)); }
try {
  browser = await type.launch({ headless: true }); report.version = browser.version();
  for (const mode of ["absent", "open-denied", "store-unavailable"]) await run(`fallback-${mode}-two-tab-isolation`, async context => {
    const first = await prepare(context, { mode }), second = await prepare(context, { mode });
    assert.deepEqual(lines(await latest(first)), []); assert.deepEqual(lines(await latest(second)), []);
    await Promise.all([add(first, milk, 2), add(second, cookie, 1)]);
    assert.deepEqual(lines(await latest(first)), [{ id: milk, quantity: 2 }]);
    assert.deepEqual(lines(await latest(second)), [{ id: cookie, quantity: 1 }]);
    assert.equal((await state(first)).mode, "tab"); assert.equal((await state(second)).mode, "tab");
    assert.deepEqual(await first.evaluate(({ legacyKey, projectionKey }) => [localStorage.getItem(legacyKey), localStorage.getItem(projectionKey)], { legacyKey, projectionKey }), [null, null]);
    return { mode, independentTotals: [120, 100], noSharedOrderWrite: true };
  });
  await run("fallback-same-tab-cross-module-serialization", async context => {
    const page = await prepare(context, { mode: "absent" });
    await page.evaluate(async () => { window.otherOrders = await import("/src/order-draft.js?second-bundle"); });
    const results = await Promise.all([add(page, milk, 1), add(page, milk, 1, "otherOrders"), add(page, cookie, 1)]);
    assert.ok(results.every(result => result.applied)); const draft = await latest(page);
    assert.deepEqual(lines(draft), [{ id: milk, quantity: 2 }, { id: cookie, quantity: 1 }]); assert.equal(total(draft), 220);
    assert.deepEqual(await page.evaluate(() => window.otherOrders.readLatestStoredOrderDraft(window.ids).then(draft => draft.lines)), draft.lines);
    return { bundles: 2, successfulGestures: 3, total: 220 };
  });
  await run("fallback-session-reload-restores-own-order", async context => {
    const page = await prepare(context, { mode: "absent" }); await add(page, milk, 1); await add(page, cookie, 2);
    const before = await latest(page); assert.equal((await state(page)).hasSessionPersistence, true);
    const session = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), tabKey); assert.equal(session.version, 1);
    await page.reload(); await imports(page); assert.deepEqual(await latest(page), before); assert.equal((await state(page)).mode, "tab");
    return { restoredTotal: total(before), mode: "tab", retainedOwnSessionOnly: true };
  });
  await run("fallback-memory-only-works-and-expires-on-reload", async context => {
    const page = await prepare(context, { mode: "absent", memory: true }); await Promise.all([add(page, milk), add(page, milk)]);
    assert.deepEqual(lines(await latest(page)), [{ id: milk, quantity: 2 }]); assert.equal((await state(page)).hasSessionPersistence, false);
    await page.reload(); await imports(page); assert.deepEqual(lines(await latest(page)), []);
    return { beforeReloadTotal: 120, afterReloadTotal: 0, noFalsePersistenceClaim: true };
  });
  await run("fallback-session-write-failure-never-restores-stale-order", async context => {
    const page = await prepare(context, { mode: "absent" }); await add(page, milk);
    await page.evaluate(key => {
      window.originalSessionSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (this === sessionStorage && name === key) throw new DOMException("quota", "QuotaExceededError"); return window.originalSessionSet.call(this, name, value); };
    }, tabKey);
    await add(page, cookie); assert.equal(total(await latest(page)), 160);
    assert.equal((await state(page)).hasSessionPersistence, false);
    await page.reload(); await imports(page);
    assert.deepEqual(lines(await latest(page)), [], "a failed latest session save must not resurrect an older saved basket after reload");
    return { beforeFailureTotal: 60, memoryTotalAfterFailedSave: 160, reloadedTotal: 0, staleSavedBasketNotRestored: true };
  });
  await run("idb-put-quota-is-failure-not-tab-fallback", async context => {
    const page = await prepare(context); await add(page, milk);
    await page.evaluate(() => { window.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { if (this.name === "shared-order") throw new DOMException("quota", "QuotaExceededError"); return window.originalPut.apply(this, args); }; });
    try { await rejected(() => add(page, cookie), "OrderStorageError"); } finally { await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalPut; }); }
    assert.equal((await state(page)).mode, "shared"); assert.deepEqual(lines(await latest(page)), [{ id: milk, quantity: 1 }]);
    return { genuinePutFailureRejected: true, previousTotal: 60, mode: "shared" };
  });
  for (const failure of ["transaction-denied", "reopen-denied"]) await run(`active-shared-${failure}-never-splits-to-tab`, async context => {
    const page = await prepare(context); await add(page, milk);
    await page.evaluate(async failure => {
      window.originalTransaction = IDBDatabase.prototype.transaction;
      window.originalOpen = IDBFactory.prototype.open;
      if (failure === "transaction-denied") {
        IDBDatabase.prototype.transaction = function() { throw new DOMException("denied after activation", "SecurityError"); };
      } else {
        let current;
        IDBDatabase.prototype.transaction = function(...args) { current = this; return window.originalTransaction.apply(this, args); };
        await window.orders.readLatestStoredOrderDraft(window.ids);
        IDBDatabase.prototype.transaction = window.originalTransaction;
        current.close(); current.dispatchEvent(new Event("close"));
        IDBFactory.prototype.open = function() { throw new DOMException("reopen denied", "SecurityError"); };
      }
    }, failure);
    try { await rejected(() => add(page, cookie), "OrderStorageError"); }
    finally { await page.evaluate(() => { IDBDatabase.prototype.transaction = window.originalTransaction; IDBFactory.prototype.open = window.originalOpen; }); }
    assert.equal((await state(page)).mode, "shared"); assert.equal(await page.evaluate(key => sessionStorage.getItem(key), tabKey), null);
    assert.deepEqual(lines(await latest(page)), [{ id: milk, quantity: 1 }]); await add(page, cookie);
    assert.equal(total(await latest(page)), 160);
    return { failure, stayedShared: true, preservedCanonicalTotal: 60, recoveredTotal: 160, noHiddenTabFork: true };
  });
  await run("legacy-first-migration-does-not-rewrite-v1", async context => {
    const legacy = JSON.stringify(flat([[milk, 2]])); const page = await prepare(context, { legacy });
    assert.deepEqual(lines(await latest(page)), [{ id: milk, quantity: 2 }]); await add(page, cookie);
    assert.equal(await legacyValue(page), legacy); assert.equal((await state(page)).legacyConflict, undefined);
    assert.equal(total(await latest(page)), 220); return { migratedTotal: 120, modernTotal: 220, legacyBytesUnchanged: true };
  });
  for (const choice of ["keep-current", "use-legacy"]) await run(`legacy-fence-${choice}`, async context => {
    const page = await prepare(context); await add(page, milk, 2); const current = await latest(page);
    const old = JSON.stringify(flat([[cookie, 3]])); await writeLegacy(page, old); await latest(page);
    const conflict = (await state(page)).legacyConflict; assert.ok(conflict?.token); assert.equal(total(conflict.currentDraft), 120); assert.equal(total(conflict.legacyDraft), 300);
    await rejected(() => add(page, espresso), "OrderLegacyConflictError"); assert.deepEqual(await latest(page), current); assert.equal(await legacyValue(page), old);
    const selected = await resolveConflict(page, choice, conflict.token); assert.equal(total(selected), choice === "keep-current" ? 120 : 300);
    assert.equal((await state(page)).legacyConflict, undefined); assert.equal(await legacyValue(page), old);
    await add(page, tea); assert.equal(total(await latest(page)), choice === "keep-current" ? 170 : 350);
    return { currentTotal: 120, legacyTotal: 300, selectedTotal: choice === "keep-current" ? 120 : 300, finalTotal: choice === "keep-current" ? 170 : 350, neverRewroteLegacy: true };
  });
  await run("legacy-write-during-modern-put-is-preserved-and-fenced", async context => {
    const page = await prepare(context); await add(page, milk);
    const old = JSON.stringify(flat([[cookie, 2]]));
    await page.evaluate(({ key, old }) => {
      window.originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) { if (this.name === "shared-order") localStorage.setItem(key, old); return window.originalPut.apply(this, args); };
    }, { key: legacyKey, old });
    try { assert.equal((await add(page, tea)).applied, true); } finally { await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalPut; }); }
    assert.equal(total(await latest(page)), 110); assert.equal(await legacyValue(page), old);
    const conflict = (await state(page)).legacyConflict; assert.equal(total(conflict.legacyDraft), 200);
    await rejected(() => add(page, espresso), "OrderLegacyConflictError");
    return { committedModernTotal: 110, preservedLegacyTotal: 200, subsequentWritesFenced: true };
  });
  await run("legacy-stale-resolution-token-is-rejected", async context => {
    const page = await prepare(context); await add(page, milk); const before = await latest(page);
    await writeLegacy(page, JSON.stringify(flat([[cookie, 1]]))); await latest(page); const first = (await state(page)).legacyConflict;
    const secondRaw = JSON.stringify(flat([[tea, 2]])); await writeLegacy(page, secondRaw);
    await rejected(() => resolveConflict(page, "use-legacy", first.token), "OrderLegacyConflictError");
    assert.deepEqual(await latest(page), before); assert.equal(await legacyValue(page), secondRaw);
    const second = (await state(page)).legacyConflict; assert.notEqual(second.token, first.token);
    assert.equal(total(await resolveConflict(page, "use-legacy", second.token)), 100);
    return { staleTokenRejected: true, currentRetainedUntilExplicitFreshChoice: true, selectedTotal: 100 };
  });
  await run("legacy-invalid-order-can-only-keep-current", async context => {
    const page = await prepare(context); await add(page, milk); await writeLegacy(page, "{broken-json"); await latest(page);
    const conflict = (await state(page)).legacyConflict; assert.equal(conflict.invalid, true); assert.equal(conflict.legacyDraft, undefined);
    await rejected(() => resolveConflict(page, "use-legacy", conflict.token), "OrderLegacyConflictError");
    assert.equal(total(await resolveConflict(page, "keep-current", conflict.token)), 60); assert.equal(await legacyValue(page), "{broken-json");
    return { invalidLegacyNeverImported: true, preservedCurrentTotal: 60, malformedLegacyBytesPreserved: true };
  });
  await run("fallback-native-order-and-qr", async context => {
    const page = await context.newPage(); page.setDefaultTimeout(8000); await denial(page, "absent");
    await page.addInitScript(() => localStorage.setItem("robys-language", "ru"));
    await page.goto(`${origin}/menu.html?entry=off`); await page.locator('#menu-root[data-ready="true"]').waitFor();
    await page.locator(`[data-product-id="${milk}"] .full-menu-item-media`).click(); await page.locator("#menu-product-dialog[open]").waitFor();
    await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor(); await page.locator("#menu-add-to-cart").click();
    await page.locator("#menu-cart-dialog[open]").waitFor(); assert.match(await page.locator("#menu-cart-dialog-total").textContent(), /60/);
    await page.locator("#menu-checkout-trigger").click(); await page.locator(".order-checkout-dialog[open]").waitFor();
    assert.equal(await page.locator(".order-ticket-qr").count(), 1); assert.match(await page.locator(".order-ticket-total").textContent(), /60/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), legacyKey), null); assert.equal(await page.evaluate(key => localStorage.getItem(key), projectionKey), null);
    return { fallbackNativeAdd: true, qrTotal: 60, noSharedOrderWrite: true };
  });
  for (const choice of ["keep-current", "use-legacy"]) await run(`legacy-native-${choice}-qr-fence`, async context => {
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    await page.addInitScript(() => localStorage.setItem("robys-language", "ru"));
    await page.goto(`${origin}/menu.html?entry=off`); await page.locator('#menu-root[data-ready="true"]').waitFor();
    await page.locator(`[data-product-id="${milk}"] .full-menu-item-media`).click(); await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
    await page.locator("#menu-add-to-cart").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
    const older = await context.newPage(); await older.goto(`${origin}/storage-fixture.html`);
    const raw = JSON.stringify(flat([[cookie, 1]])); await writeLegacy(older, raw);
    await page.locator(`[data-order-storage-choice="${choice}"]`).waitFor({ state: "visible" });
    await page.locator("#menu-checkout-trigger").click(); await page.locator(".order-checkout-dialog[open]").waitFor();
    await page.locator(".order-ticket-error").waitFor({ state: "visible" });
    assert.match(await page.locator(".order-ticket-error").textContent(), /два варианта/);
    assert.equal(await page.locator(".order-ticket-qr").count(), 0, "an unresolved legacy fork cannot produce a QR");
    await page.locator(`[data-order-storage-choice="${choice}"]`).click();
    const regenerate = page.locator(".order-ticket-update .order-ticket-button-primary");
    await regenerate.waitFor({ state: "visible" });
    const deadline = Date.now() + 8000;
    while (!await regenerate.isEnabled() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(await regenerate.isEnabled(), true); await regenerate.click();
    await page.locator(".order-ticket-qr").waitFor({ state: "visible" });
    const expected = choice === "keep-current" ? 60 : 100;
    assert.match(await page.locator(".order-ticket-total").textContent(), new RegExp(String(expected)));
    assert.equal(await legacyValue(older), raw, "the explicit choice never rewrites the old tab's v1 bytes");
    return { unresolvedForkProducedNoQr: true, explicitChoice: choice, selectedQrTotal: expected, legacyBytesPreserved: true };
  });
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); rmSync(certificate, { recursive: true, force: true }); }
report.finishedAt = new Date().toISOString(); report.passed = report.cases.filter(test => test.status === "PASS").length; report.failed = report.cases.length - report.passed; persist();
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, report: join(output, "report.json") })); if (report.failed) process.exitCode = 1;
