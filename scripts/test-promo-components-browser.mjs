import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, createReadStream, rmSync } from "node:fs";
import { resolve, join, extname, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { buildSync } from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime, compileMenuOrderRuntime, compileOrderStorageRuntime } from "./menu-runtime-source.mjs";
import { addOrderGroup, updateOrderGroupQuantity } from "../src/order-draft.js";
import { menuCategories } from "../menu-catalog.js";

const repo = resolve(new URL("..", import.meta.url).pathname);
process.chdir(repo);
const output = resolve(process.env.ROBYS_PROMO_QA_DIR ?? ".artifacts/promo-components");
mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-promo-https-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const compiled = new Map([
  ["/order-storage.js", compileOrderStorageRuntime()],
  ["/menu-app.js", compileMenuRuntime()],
  ["/menu-order-ui.js", compileMenuOrderRuntime()],
  ["/menu-pairing.js", buildSync({ entryPoints: ["src/menu-pairing-view.js"], bundle: true, write: false,
    format: "esm", target: "es2020", minify: true, logLevel: "silent" }).outputFiles[0].text]
]);
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  if (compiled.has(path)) { response.writeHead(200, { "content-type": "application/javascript" }).end(compiled.get(path)); return; }
  const file = resolve(repo, "." + decodeURIComponent(path));
  if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" }); createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const storageKey = "robys-menu-order.v1";
const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ids = new Set(menuCategories.flatMap(category => (category.items ?? category.groups?.flatMap(group => group.items) ?? [])
  .map(item => `${category.id}:${item.id ?? slug(item.name.en)}`)));
const offers = [
  { id: "pairing-offers:cool-lime-macaron-pairing", drink: "refreshers:cool-lime", sweet: "desserts:macaron", total: 220, drinkPrice: 190 },
  { id: "pairing-offers:iced-san-sebastian-pairing", drink: "cold-coffee:iced-caffe-latte", sweet: "desserts:san-sebastian-cheesecake", total: 370, drinkPrice: 180 }
];
const browserName = process.env.ROBYS_PROMO_BROWSER ?? "chromium";
const type = { chromium, firefox, webkit }[browserName];
if (!type) throw new Error(`Unknown browser ${browserName}`);
const report = { head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(), mode: "Local source fixture; browser engine with phone-sized viewport, not a physical handset",
  browser: browserName, sourceHashes: Object.fromEntries(["src/menu-app.js", "src/order-storage.js", "src/order-storage-notice.js", "src/menu-order-ui.js", "src/menu-pairing.js", "src/menu-pairing-view.js", "src/menu-promo-pair.js", "src/order-draft.js", "menu-catalog.js"]
    .map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])), cases: [] };
const stored = page => page.evaluate(async productIds => {
  const orders = await import("/src/order-draft.js");
  return orders.readLatestStoredOrderDraft(new Set(productIds));
}, [...ids]);
let browser;
async function run(id, callback) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
    reducedMotion: "reduce", serviceWorkers: "block", ignoreHTTPSErrors: true });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  try { const facts = await callback(page, context); assert.deepEqual(errors, []); report.cases.push({ id, status: "PASS", facts }); console.log(`PASS ${id}`); }
  catch (error) { await page.screenshot({ path: join(output, `${id}-failure.png`) }).catch(() => {});
    report.cases.push({ id, status: "FAIL", error: error.stack, uncaught: errors }); console.error(`FAIL ${id}: ${error.stack}`); }
  finally { await context.close(); writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n"); }
}
async function openMenu(page, language, draft = null, suppressStorage = false) {
  await page.addInitScript(({ key, language, draft, suppressStorage }) => {
    localStorage.setItem("robys-language", language); if (draft) localStorage.setItem(key, JSON.stringify(draft));
    if (suppressStorage) window.addEventListener("storage", event => event.stopImmediatePropagation(), true);
  }, { key: storageKey, language, draft, suppressStorage });
  await page.goto(`${origin}/menu.html?entry=off`); await page.locator('#menu-root[data-ready="true"]').waitFor();
}
async function openEditor(page) {
  await page.locator(".menu-cart-edit").click(); await page.locator("#menu-product-dialog[open]").waitFor();
  await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
}
async function justDrink(page) { await page.locator('input[name="menu-dessert"][value=""]').locator("..").click(); }
try {
  browser = await type.launch({ headless: true }); report.version = browser.version();
  for (const language of ["tr", "en", "ru"]) for (const [index, offer] of offers.entries()) await run(`promo-${language}-${index}`, async page => {
    await openMenu(page, language);
    const before = await stored(page);
    await page.locator(`[data-product-id="${offer.id}"] .full-menu-item-media`).click();
    await page.locator(".pairing-discovery-choose").click();
    await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
    assert.equal(await page.locator(`input[name="menu-dessert"][value="${offer.sweet}"]`).isChecked(), true);
    assert.deepEqual(await stored(page), before, "opening a ready pair does not add anything");
    assert.match(await page.locator("#menu-add-to-cart").textContent(), new RegExp(String(offer.total)));
    await page.locator("#menu-add-to-cart").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
    const saved = await stored(page);
    assert.deepEqual(saved.lines, [{ id: offer.drink, quantity: 1 }, { id: offer.sweet, quantity: 1 }].sort((a, b) => a.id.localeCompare(b.id, "en")));
    assert.equal(saved.groups.length, 1); assert.equal(saved.groups[0].items.length, 2);
    await openEditor(page); await justDrink(page); await page.keyboard.press("Escape");
    await page.locator("#menu-cart-dialog[open]").waitFor(); assert.deepEqual(await stored(page), saved, "cancel preserves both components");
    await openEditor(page); await justDrink(page);
    assert.match(await page.locator("#menu-add-to-cart").textContent(), new RegExp(String(offer.drinkPrice)));
    assert.deepEqual(await stored(page), saved, "component choice remains a draft until Save");
    await page.locator("#menu-add-to-cart").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
    const drinkOnly = await stored(page);
    assert.deepEqual(drinkOnly.lines, [{ id: offer.drink, quantity: 1 }]);
    assert.match(await page.locator("#menu-cart-dialog-total").textContent(), new RegExp(String(offer.drinkPrice)));
    await page.locator("#menu-checkout-trigger").click(); await page.locator(".order-checkout-dialog[open]").waitFor();
    assert.match(await page.locator(".order-ticket-total").textContent(), new RegExp(String(offer.drinkPrice)));
    return { language, offer: offer.id, before: offer.total, afterRemovingDessert: offer.drinkPrice, cancelPreserves: true, qrUsesUpdatedComponents: true };
  });
  for (const [index, offer] of offers.entries()) await run(`legacy-promo-${index}`, async page => {
    const initial = addOrderGroup(null, [{ id: offer.id }], 2, ids).draft;
    await openMenu(page, "ru", initial); await page.locator("#menu-cart-trigger").click(); await openEditor(page);
    assert.equal(await page.locator("#menu-product-quantity").textContent(), "2");
    await justDrink(page); await page.locator("#menu-add-to-cart").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.deepEqual((await stored(page)).lines, [{ id: offer.drink, quantity: 2 }], "legacy promo SKU is replaced rather than duplicated");
    return { offer: offer.id, quantityPreserved: 2, legacySkuRemoved: true };
  });
  await run("legacy-promo-stale-editor", async (page, context) => {
    const offer = offers[0]; const initial = addOrderGroup(null, [{ id: offer.id }], 1, ids).draft;
    await openMenu(page, "ru", initial, true); await page.locator("#menu-cart-trigger").click(); await openEditor(page); await justDrink(page);
    const latest = updateOrderGroupQuantity(initial, initial.groups[0].id, 3, ids).draft;
    const other = await context.newPage(); await other.goto(`${origin}/404.html`);
    await other.evaluate(async ({ productIds, groupId }) => {
      const orders = await import("/src/order-draft.js");
      const ids = new Set(productIds);
      await orders.transactStoredOrderDraft(current => orders.updateOrderGroupQuantity(current, groupId, 3, ids), ids);
    }, { productIds: [...ids], groupId: initial.groups[0].id });
    await page.locator("#menu-add-to-cart").click(); await page.locator("#menu-product-edit-error:not([hidden])").waitFor();
    assert.deepEqual(await stored(page), latest); await other.close();
    return { staleOriginalPromoRejected: true, latestQuantityPreserved: 3 };
  });
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); rmSync(certificate, { recursive: true, force: true }); }
report.finishedAt = new Date().toISOString(); writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
if (report.cases.some(test => test.status !== "PASS")) process.exitCode = 1;
