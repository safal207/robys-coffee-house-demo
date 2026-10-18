import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, statSync, createReadStream, rmSync } from "node:fs";
import { resolve, join, extname, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { buildSync } from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime, compileMenuOrderRuntime, compileOrderStorageRuntime } from "./menu-runtime-source.mjs";
import { menuCategories } from "../menu-catalog.js";
import { addOrderGroup, normalizeOrderDraft } from "../src/order-draft.js";

const repo = resolve(new URL("..", import.meta.url).pathname); process.chdir(repo);
const output = resolve(process.env.ROBYS_TRANSACTION_QA_DIR ?? ".artifacts/order-transactions-stress"); mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-transactions-https-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const compiled = new Map([
  ["/menu-app.js", compileMenuRuntime()], ["/menu-order-ui.js", compileMenuOrderRuntime()], ["/order-storage.js", compileOrderStorageRuntime()],
  ["/menu-pairing.js", buildSync({ entryPoints: ["src/menu-pairing-view.js"], bundle: true, write: false, format: "esm", target: "es2020", minify: true, logLevel: "silent" }).outputFiles[0].text]
]);
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (compiled.has(path)) { response.writeHead(200, { "content-type": "application/javascript" }).end(compiled.get(path)); return; }
  if (path === "/transaction-fixture.html") { response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Order transaction fixture</title>"); return; }
  const file = resolve(repo, "." + decodeURIComponent(path));
  if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" }); createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `https://127.0.0.1:${server.address().port}`;
// This variable is used only for localStorage projection probes. The production
// IndexedDB record key and fenced legacy localStorage key remain v1.
const key = "robys-menu-order.v2";
const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ids = new Set(menuCategories.flatMap(category => (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => `${category.id}:${item.id ?? slug(item.name.en)}`)));
const latte = "hot-coffee:caffe-latte", cookie = "desserts:cookie", macaron = "desserts:macaron", espresso = "hot-coffee:espresso", flavoured = "cold-coffee:flavoured-iced-caffe-latte";
const browserName = process.env.ROBYS_TRANSACTION_BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unknown browser ${browserName}`);
const report = { startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  mode: "Local source fixture with two real browser pages sharing one origin; engine test, not physical OEM certification", browser: browserName,
  sourceHashes: Object.fromEntries(["src/order-draft.js", "src/order-storage.js", "src/order-storage-notice.js", "src/menu-order-ui.js", "src/menu-app.js", "src/menu-promo-pair.js"]
    .map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])), cases: [] };
let browser, context, left, right;
const uiPages = [];
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
async function run(id, callback) {
  if (process.env.ROBYS_TRANSACTION_FILTER && !id.includes(process.env.ROBYS_TRANSACTION_FILTER)) return;
  try { const facts = await callback(); report.cases.push({ id, status: "PASS", facts }); console.log(`PASS ${id}`); }
  catch (error) { const ui = await Promise.all(uiPages.map(page => page.evaluate(() => ({
      dialogs: [...document.querySelectorAll("dialog[open]")].map(dialog => dialog.id), title: document.querySelector("#menu-product-title")?.textContent,
      add: document.querySelector("#menu-add-to-cart")?.textContent, disabled: document.querySelector("#menu-add-to-cart")?.disabled,
      error: document.querySelector("#menu-product-edit-error")?.textContent,
      draftProjection: localStorage.getItem("robys-menu-order.v2"), legacyDraft: localStorage.getItem("robys-menu-order.v1")
    })).catch(error => ({ error: error.message }))));
    report.cases.push({ id, status: "FAIL", error: error.stack, ui }); console.error(`FAIL ${id}: ${error.stack}`); }
  persist();
}
async function setupPage(page, probe = true) {
  await page.goto(`${origin}/transaction-fixture.html`);
  await page.evaluate(async ({ productIds, probe }) => {
    window.orders = await import("/src/order-draft.js"); window.productIds = new Set(productIds);
    if (probe) await Promise.race([
      window.orders.transactStoredOrderDraft(draft => ({ draft, applied: false, blocked: false }), window.productIds),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Browser transaction storage did not become ready within 7 seconds")), 7000))
    ]);
  }, { productIds: [...ids], probe });
}
async function seed(draft = normalizeOrderDraft(null, ids)) {
  await mutation(left, { kind: "seed", draft });
  await Promise.all([left, right].map(page => page.evaluate(async () => { sessionStorage.clear(); await window.orders.readLatestStoredOrderDraft(window.productIds); })));
}
const stored = async () => {
  let observations;
  for (let retry = 0; retry < 25; retry++) {
    observations = await Promise.all([left, right].map(page => page.evaluate(async () => {
      const latest = await window.orders.readLatestStoredOrderDraft(window.productIds);
      return { latest, read: window.orders.readStoredOrderDraft(window.productIds) };
    })));
    const serialized = observations.flatMap(observation => [JSON.stringify(observation.latest), JSON.stringify(observation.read)]);
    if (serialized.every(value => value === serialized[0])) return observations[0].latest;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Both authoritative and cached draft readers must converge: ${JSON.stringify(observations)}`);
};
async function mutation(page, operation) {
  return page.evaluate(async operation => {
    let input;
    const result = await window.orders.transactStoredOrderDraft(draft => {
    input = JSON.parse(JSON.stringify(draft));
    const { orders, productIds } = window;
    switch (operation.kind) {
      case "seed": return { draft: orders.normalizeOrderDraft(operation.draft, productIds), applied: true, blocked: false };
      case "add": return orders.addOrderGroup(draft, operation.items, operation.quantity, productIds);
      case "step": { const group = draft.groups.find(group => group.id === operation.id); return orders.updateOrderGroupQuantity(draft, operation.id, (group?.quantity ?? 0) + operation.delta, productIds); }
      case "remove": return orders.updateOrderGroupQuantity(draft, operation.id, 0, productIds);
      case "replace": return orders.replaceOrderGroup(draft, operation.original, operation.items, operation.quantity, productIds);
      case "variant": return orders.updateOrderGroupVariant(draft, operation.id, 0, operation.variant, productIds);
      case "recommend": return orders.applyOrderRecommendation(draft, operation.selection, productIds);
      default: throw new Error("Unknown operation");
    }
    }, window.productIds);
    return { ...result, input };
  }, operation);
}
async function concurrent(one, two) { return Promise.all([mutation(left, one), mutation(right, two)]); }
async function seedUi(page, draft) {
  await page.evaluate(async draft => {
    const orders = await import("/src/order-draft.js");
    const ids = new Set((await import("/menu-catalog.js")).menuCategories.flatMap(category =>
      (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => `${category.id}:${item.id ?? item.name.en.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`)));
    await orders.transactStoredOrderDraft(() => ({ draft, applied: true, blocked: false }), ids);
  }, draft);
  const expected = String(draft.groups.reduce((sum, group) => sum + group.quantity, 0));
  await Promise.all(uiPages.map(page => page.waitForFunction(expected => document.querySelector("#menu-cart-count")?.textContent === expected, expected)));
}
const latestUi = page => page.evaluate(async ids => {
  const orders = await import("/src/order-draft.js");
  return orders.readLatestStoredOrderDraft(new Set(ids));
}, [...ids]);
try {
  browser = await browserType.launch({ headless: true }); report.version = browser.version();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block", ignoreHTTPSErrors: true });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  left = await context.newPage(); right = await context.newPage(); await Promise.all([setupPage(left), setupPage(right)]);

  for (let index = 0; index < 60; index++) await run(`simultaneous-add-${index}`, async () => {
    await seed(); const same = index % 2 === 0; const firstId = index % 3 === 0 ? espresso : latte;
    const results = await concurrent({ kind: "add", items: [{ id: firstId }], quantity: 1 }, { kind: "add", items: [{ id: same ? firstId : macaron }], quantity: 1 });
    assert.ok(results.every(result => result.applied));
    assert.ok(results.some(result => result.draft.lines.reduce((sum, line) => sum + line.quantity, 0) === 2), `one committed result contains both Add intents: ${JSON.stringify(results)}`);
    const draft = await stored();
    assert.equal(draft.lines.find(line => line.id === firstId).quantity, same ? 2 : 1);
    if (!same) assert.equal(draft.lines.find(line => line.id === macaron).quantity, 1);
    assert.equal(draft.lines.reduce((sum, line) => sum + line.quantity, 0), 2);
    return { sameProduct: same, preservedBothIntents: true };
  });
  for (let index = 0; index < 10; index++) await run(`quantity-step-${index}`, async () => {
    const initial = addOrderGroup(null, [{ id: latte }], 5, ids).draft; await seed(initial);
    const results = await concurrent({ kind: "step", id: initial.groups[0].id, delta: 1 }, { kind: "step", id: initial.groups[0].id, delta: -1 });
    assert.ok(results.every(result => result.applied));
    assert.ok(results.some(result => result.draft.lines[0]?.quantity === 5), `a committed result preserves both steps: ${JSON.stringify(results)}`);
    assert.equal((await stored()).lines[0].quantity, 5); return { bothStepsPreserved: true };
  });
  for (let index = 0; index < 10; index++) await run(`remove-unrelated-add-${index}`, async () => {
    const initial = addOrderGroup(null, [{ id: latte }], 1, ids).draft; await seed(initial);
    const results = await concurrent({ kind: "remove", id: initial.groups[0].id }, { kind: "add", items: [{ id: macaron }], quantity: 1 });
    assert.ok(results.every(result => result.applied));
    assert.ok(results.some(result => JSON.stringify(result.draft.lines) === JSON.stringify([{ id: macaron, quantity: 1 }])), `a committed result preserves removal and Add: ${JSON.stringify(results)}`);
    assert.deepEqual((await stored()).lines, [{ id: macaron, quantity: 1 }]);
    return { removalPreserved: true, unrelatedAdditionPreserved: true };
  });
  for (let index = 0; index < Number(process.env.ROBYS_TRANSACTION_EDIT_ROUNDS ?? 10); index++) await run(`edit-recommendation-${index}`, async () => {
    const initial = addOrderGroup(null, [{ id: latte }, { id: cookie }], 2, ids).draft; await seed(initial);
    const results = await concurrent({ kind: "replace", original: initial.groups[0], items: [{ id: latte }], quantity: 2 },
      { kind: "recommend", selection: { token: `bounded-${index}`, signature: "espresso-macaron", lines: [{ id: espresso, quantity: 1 }, { id: macaron, quantity: 1 }] } });
    assert.ok(results.every(result => result.applied));
    const expected = [{ id: macaron, quantity: 1 }, { id: espresso, quantity: 1 }, { id: latte, quantity: 2 }].sort((a, b) => a.id.localeCompare(b.id, "en"));
    // Distinguish observer lag in a third task from a genuinely stale read
    // inside the mutation boundary: the final committed result must contain
    // both intents, independently of queued storage notifications.
    assert.ok(results.some(result => JSON.stringify(result.draft.lines) === JSON.stringify(expected)),
      `one committed result must contain both intents: ${JSON.stringify(results)}`);
    let draft = await stored();
    for (let retry = 0; retry < 20 && JSON.stringify(draft.lines) !== JSON.stringify(expected); retry++) {
      await new Promise(resolve => setTimeout(resolve, 10)); draft = await stored();
    }
    assert.deepEqual(draft.lines, expected, `committed results: ${JSON.stringify(results)}`);
    assert.equal(draft.groups.filter(group => group.source === "recommendation").length, 1); return { editAndAdvisorPreserved: true };
  });
  for (let index = 0; index < 5; index++) await run(`variant-stale-edit-${index}`, async () => {
    const initial = addOrderGroup(null, [{ id: flavoured, variant: "vanilla" }, { id: cookie }], 1, ids).draft; await seed(initial);
    const results = await concurrent({ kind: "variant", id: initial.groups[0].id, variant: "caramel" },
      { kind: "replace", original: initial.groups[0], items: [{ id: flavoured, variant: "vanilla" }], quantity: 1 });
    assert.equal(results.filter(result => result.applied).length, 1, "identity-changing concurrent edits accept one original only");
    const draft = await stored(); assert.equal(draft.lines.find(line => line.id === flavoured).quantity, 1); assert.equal(draft.groups.length, 1);
    return { acceptedMutations: 1, noDuplicateDrink: true };
  });
  for (let index = 0; index < 5; index++) await run(`capacity-99-${index}`, async () => {
    const initial = addOrderGroup(null, [{ id: latte }], 98, ids).draft; await seed(initial);
    const results = await concurrent({ kind: "add", items: [{ id: latte }], quantity: 1 }, { kind: "add", items: [{ id: latte }, { id: macaron }], quantity: 1 });
    assert.equal(results.filter(result => result.applied).length, 1); const draft = await stored();
    assert.equal(draft.lines.find(line => line.id === latte).quantity, 99);
    assert.ok(draft.lines.every(line => line.quantity <= 99));
    assert.equal(draft.lines.find(line => line.id === macaron)?.quantity ?? 0, results[1].applied ? 1 : 0, "blocked pair cannot partially add dessert");
    return { capRespected: 99, atomicPair: true };
  });
  await run("idb-quota-write-fails-without-false-success", async () => {
    const initial = addOrderGroup(null, [{ id: latte }], 1, ids).draft; await seed(initial);
    const outcome = await right.evaluate(async () => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) { if (this.name === "shared-order") throw new DOMException("quota", "QuotaExceededError"); return original.apply(this, args); };
      try { await window.orders.transactStoredOrderDraft(draft => window.orders.addOrderGroup(draft, [{ id: "desserts:macaron" }], 1, window.productIds), window.productIds); return { saved: true }; }
      catch (error) { return { saved: false, name: error.name }; }
      finally { IDBObjectStore.prototype.put = original; }
    });
    assert.deepEqual(outcome, { saved: false, name: "OrderStorageError" }); assert.deepEqual(await stored(), initial);
    const recovered = await mutation(right, { kind: "add", items: [{ id: macaron }], quantity: 1 }); assert.equal(recovered.applied, true);
    return { failedSaveRejected: true, canonicalUnchanged: true, lockReleasedForRetry: true };
  });
  await run("closing-waiting-tab-releases-lock", async () => {
    await seed();
    await left.evaluate(async () => {
      const request = indexedDB.open("robys-order-transactions.v1", 1);
      const database = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const transaction = database.transaction("shared-order", "readwrite"); window.heldOrderTransaction = transaction;
      const store = transaction.objectStore("shared-order");
      const hold = () => { const request = store.get("keep-alive"); request.onsuccess = hold; }; hold();
      window.heldOrderDatabase = database;
    });
    const doomed = await context.newPage(); await setupPage(doomed, false);
    const waiting = mutation(doomed, { kind: "add", items: [{ id: latte }], quantity: 1 }).catch(error => ({ closed: true, error: error.message }));
    await doomed.close(); await waiting;
    await left.evaluate(() => { window.heldOrderTransaction.abort(); window.heldOrderDatabase.close(); });
    const result = await mutation(right, { kind: "add", items: [{ id: macaron }], quantity: 1 }); assert.equal(result.applied, true);
    assert.deepEqual((await stored()).lines, [{ id: macaron, quantity: 1 }]); return { closedWaitingTab: true, nextTransactionCompletes: true };
  });
  await run("invalid-updater-aborts-and-releases-lock", async () => {
    await seed(); const rejected = await right.evaluate(async () => {
      try { await window.orders.transactStoredOrderDraft(async draft => ({ draft, applied: true }), window.productIds); return false; }
      catch (error) { return error.name === "OrderStorageError"; }
    }); assert.equal(rejected, true); assert.deepEqual((await stored()).lines, []);
    assert.equal((await mutation(left, { kind: "add", items: [{ id: macaron }], quantity: 1 })).applied, true);
    return { asyncUpdaterRejected: true, lockReleased: true };
  });
  await run("abort-before-canonical-commit-preserves-order", async () => {
    await seed();
    const result = await right.evaluate(async () => {
      const originalPut = IDBObjectStore.prototype.put;
      let writes = 0;
      IDBObjectStore.prototype.put = function(...args) {
        const request = originalPut.apply(this, args);
        if (this.name === "shared-order") { writes += 1; request.addEventListener("success", () => this.transaction.abort()); }
        return request;
      };
      try {
        await window.orders.transactStoredOrderDraft(draft => window.orders.addOrderGroup(draft, [{ id: "desserts:macaron" }], 1, window.productIds), window.productIds);
        return { applied: true, writes };
      } catch (error) { return { applied: false, error: error.name, writes }; }
      finally { IDBObjectStore.prototype.put = originalPut; }
    });
    assert.deepEqual(result, { applied: false, error: "OrderStorageError", writes: 1 });
    assert.deepEqual((await stored()).lines, []);
    return { abortedPutNeverReportsSuccess: true, canonicalOrderPreserved: true };
  });
  await run("localstorage-mirror-failure-keeps-authoritative-order", async () => {
    await seed();
    const result = await right.evaluate(async key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (this === localStorage && name === key) throw new DOMException("quota", "QuotaExceededError"); return original.call(this, name, value); };
      try { return await window.orders.transactStoredOrderDraft(draft => window.orders.addOrderGroup(draft, [{ id: "desserts:macaron" }], 1, window.productIds), window.productIds); }
      finally { Storage.prototype.setItem = original; }
    }, key);
    assert.equal(result.applied, true); assert.deepEqual((await stored()).lines, [{ id: macaron, quantity: 1 }]);
    return { committedDespiteUnavailableMirror: true, authoritativeOrderRetained: true };
  });
  await run("stale-localstorage-projection-never-becomes-mutation-input", async () => {
    await seed(); await mutation(left, { kind: "add", items: [{ id: macaron }], quantity: 1 });
    await right.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value: JSON.stringify(normalizeOrderDraft(null, ids)) });
    const result = await mutation(right, { kind: "add", items: [{ id: latte }], quantity: 1 });
    const expected = [{ id: macaron, quantity: 1 }, { id: latte, quantity: 1 }];
    assert.equal(result.applied, true); assert.deepEqual(result.input.lines, [{ id: macaron, quantity: 1 }]);
    assert.deepEqual(result.draft.lines, expected); assert.deepEqual((await stored()).lines, expected);
    const fresh = await context.newPage();
    try { await setupPage(fresh); assert.deepEqual(await fresh.evaluate(() => window.orders.readLatestStoredOrderDraft(window.productIds).then(draft => draft.lines)), expected); }
    finally { await fresh.close(); }
    return { staleProjectionIgnored: true, freshPageRecoveredAuthority: true };
  });
  await run("delayed-older-completion-projects-newest-canonical-order", async () => {
    await seed();
    await left.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
      const put = IDBObjectStore.prototype.put;
      window.restoreCompletionProbe = () => {
        Object.defineProperty(IDBTransaction.prototype, "oncomplete", descriptor);
        IDBObjectStore.prototype.put = put;
      };
      Object.defineProperty(IDBTransaction.prototype, "oncomplete", { ...descriptor,
        set(callback) {
          descriptor.set.call(this, typeof callback !== "function" ? callback : function(event) {
            if (this.qaHoldCompletion) {
              window.olderCompletionHeld = true;
              window.releaseOlderCompletion = () => {
                window.releaseOlderCompletion = undefined;
                this.qaHoldCompletion = false;
                return callback.call(this, event);
              };
              return;
            }
            return callback.call(this, event);
          });
        }
      });
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === "shared-order") this.transaction.qaHoldCompletion = true;
        return put.apply(this, args);
      };
      window.olderMutation = window.orders.transactStoredOrderDraft(draft => window.orders.addOrderGroup(draft,
        [{ id: "desserts:cookie" }], 1, window.productIds), window.productIds);
    });
    try {
      await left.waitForFunction(() => window.olderCompletionHeld === true, undefined, { timeout: 5000 });
      // The first transaction has committed, but its completion callback has
      // not run. A second document can commit and project the newer revision.
      const newer = await mutation(right, { kind: "add", items: [{ id: latte }], quantity: 1 });
      const expected = [{ id: cookie, quantity: 1 }, { id: latte, quantity: 1 }];
      assert.deepEqual(newer.input.lines, [{ id: cookie, quantity: 1 }], "the newer writer reads the held transaction's actual commit");
      assert.deepEqual(newer.draft.lines, expected);
      const older = await left.evaluate(async () => {
        await window.releaseOlderCompletion();
        return window.olderMutation;
      });
      assert.equal(older.applied, true);
      assert.ok(older.committedRevision < newer.committedRevision, "completion callbacks really arrived in reverse revision order");
      assert.deepEqual(older.draft.lines, expected, "late success returns the newest authoritative snapshot");
      assert.deepEqual((await stored()).lines, expected);
      const cold = await context.newPage();
      try {
        await cold.goto(`${origin}/transaction-fixture.html`);
        const pages = [left, right, cold];
        let projections;
        for (let attempt = 0; attempt < 25; attempt++) {
          projections = await Promise.all(pages.map(page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)));
          if (projections.every(draft => JSON.stringify(draft?.lines) === JSON.stringify(expected))) break;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(projections.every(draft => JSON.stringify(draft?.lines) === JSON.stringify(expected)),
          `both live documents and a cold document retain the newest projection: ${JSON.stringify(projections)}`);
      } finally { await cold.close(); }
      return { reversedCompletions: true, olderCommittedRevision: older.committedRevision,
        newerCommittedRevision: newer.committedRevision, canonicalAndThreeProjectionsAgree: true };
    } finally {
      await left.evaluate(() => { window.releaseOlderCompletion?.(); window.restoreCompletionProbe?.(); });
    }
  });
  await run("database-clear-reopens-without-resurrection", async () => {
    await seed(addOrderGroup(null, [{ id: latte }], 3, ids).draft);
    await mutation(left, { kind: "add", items: [{ id: cookie }], quantity: 2 });
    await Promise.all([left, right].map(page => page.evaluate(() => window.orders.readLatestStoredOrderDraft(window.productIds))));
    const beforeRevision = await left.evaluate(() => window.orders.transactStoredOrderDraft(draft => ({ draft, applied: false, blocked: false }), window.productIds).then(result => result.revision));
    assert.ok(beforeRevision > 0, "the old modules really hold a populated, revisioned order");
    await Promise.all([left, right].map(page => page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); })));
    await left.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("robys-order-transactions.v1");
      const timeout = setTimeout(() => reject(new Error("Database deletion stayed blocked after versionchange")), 5000);
      request.onsuccess = () => { clearTimeout(timeout); resolve(); };
      request.onerror = () => { clearTimeout(timeout); reject(request.error); };
    }));
    const reopened = await Promise.all([left, right].map(page => page.evaluate(() =>
      window.orders.transactStoredOrderDraft(draft => ({ draft, applied: false, blocked: false }), window.productIds))));
    assert.ok(reopened.every(result => result.revision === 0 && result.draft.lines.length === 0), `reopen must reset old cache epochs: ${JSON.stringify(reopened)}`);
    const added = await mutation(right, { kind: "add", items: [{ id: macaron }], quantity: 1 });
    assert.equal(added.applied, true); assert.ok(added.revision > 0);
    assert.deepEqual((await stored()).lines, [{ id: macaron, quantity: 1 }]);
    return { priorRevision: beforeRevision, reopenedRevision: 0, oldBasketNotRestored: true, newBasketContainsOnlyNewItem: true };
  });

  // Exercise actual native Add handlers in two pages, rather than only calling
  // the shared mutation API. A separate context prevents fixture module state
  // or seeded session fallbacks from helping the production UI.
  const uiContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block", ignoreHTTPSErrors: true });
  await uiContext.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  const first = await uiContext.newPage(), second = await uiContext.newPage();
  uiPages.push(first, second);
  await Promise.all([first, second].map(async page => {
    page.setDefaultTimeout(8000); await page.addInitScript(() => localStorage.setItem("robys-language", "ru"));
    await page.goto(`${origin}/menu.html?entry=off`); await page.locator('#menu-root[data-ready="true"]').waitFor();
  }));
  for (let index = 0; index < 5; index++) await run(`native-add-same-drink-${index}`, async () => {
    await seedUi(first, normalizeOrderDraft(null, ids));
    await Promise.all([first, second].map(async page => {
      if (await page.locator("#menu-cart-dialog[open]").count()) await page.keyboard.press("Escape");
      await page.locator(`[data-product-id="${espresso}"] .full-menu-item-media`).click();
      await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
    }));
    await Promise.all([first, second].map(page => page.locator("#menu-add-to-cart").click()));
    await Promise.all([first, second].map(page => page.locator("#menu-cart-dialog[open]").waitFor()));
    const projectionAtCommit = await first.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const draft = await latestUi(first); assert.deepEqual(draft.lines, [{ id: espresso, quantity: 2 }]);
    await Promise.all([first, second].map(page => page.waitForFunction(() =>
      document.querySelector("#menu-cart-count")?.textContent === "2"
      && document.querySelector(".menu-cart-line-controls > span")?.textContent === "2"
      && document.querySelector("#menu-cart-dialog-total")?.textContent.includes("220"), null, { timeout: 1200 })));
    return { actualNativeAddHandlers: 2, finalQuantity: 2, bothDomCartsConverged: true,
      projectionQuantityAtCommit: projectionAtCommit?.lines?.find(line => line.id === espresso)?.quantity ?? 0 };
  });
  await run("native-pending-add-new-product", async () => {
    for (const page of [first, second]) if (await page.locator("#menu-cart-dialog[open]").count()) await page.keyboard.press("Escape");
    await seedUi(first, normalizeOrderDraft(null, ids));
    await first.locator('[data-product-id="desserts:cookie"] .full-menu-item-media').click();
    await first.locator("#menu-product-dialog[open]").waitFor();
    await second.evaluate(async () => {
      const request = indexedDB.open("robys-order-transactions.v1", 1);
      const database = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const transaction = database.transaction("shared-order", "readwrite"); window.heldOrderTransaction = transaction; window.heldOrderDatabase = database;
      const store = transaction.objectStore("shared-order"); const hold = () => { const request = store.get("keep-alive"); request.onsuccess = hold; }; hold();
    });
    try {
      await first.locator("#menu-add-to-cart").click();
      assert.equal(await first.locator("#menu-add-to-cart").isDisabled(), true);
      await first.keyboard.press("Escape");
      await first.locator('[data-product-id="desserts:cake-roll"] .full-menu-item-media').click();
    } finally { await second.evaluate(() => { window.heldOrderTransaction.abort(); window.heldOrderDatabase.close(); }); }
    await first.locator("#menu-product-dialog[open]").waitFor();
    assert.ok((await latestUi(first)).lines.some(line => line.id === "desserts:cookie"));
    assert.equal(await first.locator("#menu-cart-dialog[open]").count(), 0, "the old Add cannot take over the newer product intent");
    await first.waitForFunction(() => !document.querySelector("#menu-add-to-cart").disabled);
    assert.match(await first.locator("#menu-product-title").textContent(), /рулет/i);
    await first.locator("#menu-add-to-cart").click(); await first.locator("#menu-cart-dialog[open]").waitFor();
    const draft = await latestUi(first);
    assert.deepEqual(draft.lines, [{ id: "desserts:cake-roll", quantity: 1 }, { id: cookie, quantity: 1 }]);
    return { oldAddCommitted: true, newerIntentPreserved: true, newAddReenabled: true };
  });
  await run("native-quota-error-is-visible-and-retryable", async () => {
    for (let attempt = 0; attempt < 2 && await first.locator(".menu-dialog[open]").count(); attempt++) await first.keyboard.press("Escape");
    await seedUi(first, normalizeOrderDraft(null, ids));
    await first.locator('[data-product-id="desserts:cookie"] .full-menu-item-media').click(); await first.locator("#menu-product-dialog[open]").waitFor();
    await first.evaluate(() => {
      window.originalIdbPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) { if (this.name === "shared-order") throw new DOMException("quota", "QuotaExceededError"); return window.originalIdbPut.apply(this, args); };
    });
    try {
      await first.locator("#menu-add-to-cart").click(); await first.locator("#menu-product-edit-error:not([hidden])").waitFor();
      assert.equal(await first.locator("#menu-cart-dialog[open]").count(), 0);
      assert.deepEqual((await latestUi(first)).lines, []);
      assert.equal(await first.locator("#menu-add-to-cart").isEnabled(), true);
    } finally { await first.evaluate(() => { IDBObjectStore.prototype.put = window.originalIdbPut; }); }
    await first.locator("#menu-add-to-cart").click(); await first.locator("#menu-cart-dialog[open]").waitFor();
    assert.deepEqual((await latestUi(first)).lines, [{ id: cookie, quantity: 1 }]);
    return { failureVisible: true, failedAddPreservedCart: true, retryAddedExactlyOnce: true };
  });
  await run("native-pending-step-preserves-new-cart-focus", async () => {
    for (let attempt = 0; attempt < 2 && await first.locator(".menu-dialog[open]").count(); attempt++) await first.keyboard.press("Escape");
    await seedUi(first, addOrderGroup(null, [{ id: cookie }], 1, ids).draft);
    await first.locator("#menu-cart-trigger").click(); await first.locator("#menu-cart-dialog[open]").waitFor();
    await second.evaluate(async () => {
      const request = indexedDB.open("robys-order-transactions.v1", 1);
      const database = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const transaction = database.transaction("shared-order", "readwrite"); window.heldOrderTransaction = transaction; window.heldOrderDatabase = database;
      const store = transaction.objectStore("shared-order"); const hold = () => { const request = store.get("keep-alive"); request.onsuccess = hold; }; hold();
    });
    try {
      await first.locator(".menu-cart-line-controls .menu-cart-step").nth(1).click();
      await first.keyboard.press("Escape"); await first.locator("#menu-cart-trigger").click();
    } finally { await second.evaluate(() => { window.heldOrderTransaction.abort(); window.heldOrderDatabase.close(); }); }
    await first.locator("#menu-cart-dialog[open]").waitFor();
    assert.equal((await latestUi(first)).lines.find(line => line.id === "desserts:cookie")?.quantity, 2);
    await first.waitForFunction(() => document.querySelector(".menu-cart-line-controls > span")?.textContent === "2"
      && document.activeElement?.id === "menu-cart-title", null, { timeout: 1200 });
    return { oldStepCommitted: true, currentCartTitleKeepsFocus: true, finalQuantity: 2 };
  });
  await uiContext.close();
} finally { await context?.close(); await browser?.close(); await new Promise(resolve => server.close(resolve)); rmSync(certificate, { recursive: true, force: true }); }
report.finishedAt = new Date().toISOString(); report.passed = report.cases.filter(test => test.status === "PASS").length;
report.failed = report.cases.length - report.passed; persist();
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, report: join(output, "report.json") }));
if (report.failed) process.exitCode = 1;
