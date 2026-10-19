import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

// Focused offer-card regression. Serve emitted production bytes over HTTPS with
// the original HTML CSP; do not compile or call the app's mutation helpers.
const repo = resolve(new URL("..", import.meta.url).pathname);
process.chdir(repo);
const emitted = ["menu-app", "menu-combos-ui", "choice-help-entry", "choice-help"];
for (const name of emitted) {
  assert.equal(readFileSync(`${name}.js`, "utf8"), compileMenuRuntime(readFileSync(`src/${name}.js`, "utf8")),
    `Build ${name}.js from the current source before running browser verification`);
}
const output = resolve(process.env.ROBYS_OFFER_QA_DIR ?? ".artifacts/combo-offer-cards");
const timeout = Number(process.env.ROBYS_QA_TIMEOUT_MS ?? 10000);
assert.ok(Number.isFinite(timeout) && timeout > 0, "ROBYS_QA_TIMEOUT_MS must be a positive timeout in milliseconds");
mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-offer-qa-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
  "-keyout", join(certificate, "key.pem"), "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    let file = resolve(repo, "." + decodeURIComponent(new URL(request.url, "https://127.0.0.1").pathname));
    if (file !== repo && !file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const assets = ["menu.html", "menu-runtime.css", "menu-combos.css", "choice-help.css", "src/menu-combos.js",
  ...emitted.flatMap(name => [`${name}.js`, `src/${name}.js`])];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = { startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  mode: "Unchanged emitted runtime over local HTTPS, production CSP, blocked external requests, read-only canonical basket verification",
  viewportNote: "Desktop browser engines at touch-sized viewports; screenshots are not physical-device evidence",
  assetHashesStart: hashes(), browsers: {}, cases: [] };
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const money = text => Number(text.replace(/[^\d]/g, ""));
const sort = lines => [...lines].sort((a, b) => a.id.localeCompare(b.id, "en"));
const familyLines = sort([{ id: "hot-coffee:cappuccino", quantity: 2 }, { id: "food:sesame-simit", quantity: 2 },
  { id: "brew-hot:milk", quantity: 2 }, { id: "desserts:cookie", quantity: 2 }]);
const sweetLines = sort([{ id: "hot-coffee:caffe-latte", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }]);
const preview = page => page.locator(".menu-combos-dialog[open]");
const panel = page => page.locator(".choice-help-panel:not([hidden])");
const choose = (page, id) => page.locator(`[data-combo-recipe="${id}"] .menu-combos-choose`);

async function run(browser, id, callback, { width = 390, height = 844, language = "ru" } = {}) {
  if (process.env.ROBYS_OFFER_FILTER && !id.includes(process.env.ROBYS_OFFER_FILTER)) return;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800,
    ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  await context.addInitScript(({ language, origin }) => {
    if (location.origin === origin) localStorage.setItem("robys-language", language);
    window.__offerCspViolations = [];
    document.addEventListener("securitypolicyviolation", event => window.__offerCspViolations.push({
      directive: event.effectiveDirective, blockedURI: event.blockedURI }));
  }, { language, origin });
  const errors = [];
  context.on("page", page => {
    page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
    page.on("pageerror", error => errors.push(error.message));
  });
  try {
    const facts = await callback(context);
    assert.deepEqual(errors, [], "No uncaught application exceptions");
    for (const page of context.pages()) assert.deepEqual(await page.evaluate(() => window.__offerCspViolations), [], "Production CSP permits all offer-card behavior");
    report.cases.push({ id, status: "PASS", facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    const diagnostics = [];
    for (const [index, page] of context.pages().entries()) {
      await page.screenshot({ path: join(output, `${id}-failure-${index}.png`) }).catch(() => {});
      diagnostics.push(await page.evaluate(() => ({ url: location.href, active: document.activeElement?.outerHTML.slice(0, 250),
        openDialogs: [...document.querySelectorAll("dialog[open]")].map(node => node.className || node.id),
        text: document.body.innerText.slice(-2500), cspViolations: window.__offerCspViolations })).catch(() => ({})));
    }
    report.cases.push({ id, status: "FAIL", error: error.stack, errors, diagnostics });
    console.error(`FAIL ${id}: ${error.stack}`);
  } finally { await context.close(); persist(); }
}

async function openMenu(page, hash = "") {
  await page.goto(`${origin}/menu.html?entry=off${hash ? `#${hash}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.locator('#menu-root[data-ready="true"]').waitFor();
}
async function clock(page) {
  await page.clock.install({ time: new Date("2026-10-19T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-19T12:01:00Z"));
}
async function advance(page, ms) {
  await page.clock.runFor(ms);
  await page.waitForLoadState("networkidle");
}
async function canonical(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open("robys-order-transactions.v1", 1);
    opening.onupgradeneeded = () => { opening.transaction.abort(); reject(new Error("Order was not created by the UI")); };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction("shared-order", "readonly");
      const request = transaction.objectStore("shared-order").get("robys-menu-order.v1");
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }));
}
async function assertOrder(page, expected) {
  await page.waitForFunction(lines => {
    try { return JSON.stringify(JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines) === JSON.stringify(lines); } catch { return false; }
  }, sort(expected));
  const record = await canonical(page);
  assert.deepEqual(record.draft.lines, sort(expected));
  assert.ok(record.revision > 0);
  return record.revision;
}
async function geometry(page, selector) {
  return page.locator(selector).evaluate(root => {
    const rect = root.getBoundingClientRect();
    return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      contained: rect.left >= -1 && rect.right <= innerWidth + 1,
      dialogFits: root.tagName !== "DIALOG" || rect.top >= -1 && rect.bottom <= innerHeight + 1,
      clippedControls: [...root.querySelectorAll("button,input,select,a")].filter(node => node.getClientRects().length)
        .filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent?.trim().slice(0, 80)) };
  });
}
async function helperChoice(page, expectedId) {
  await panel(page).waitFor();
  const links = panel(page).locator(".choice-help-actions a:visible");
  assert.equal(await links.count(), 1, "The compact suggestion offers one concrete selection");
  const href = new URL(await links.first().getAttribute("href"), page.url());
  assert.equal(href.pathname, "/menu.html");
  assert.equal(href.hash, `#menu-combo-${expectedId}`);
  assert.equal(await panel(page).getAttribute("data-combo-recipe"), expectedId);
  assert.equal(money(await panel(page).locator(".choice-help-price").textContent()), expectedId === "family" ? 750 : 280);
  assert.ok((await panel(page).locator(".choice-help-audience").textContent()).trim());
  const photo = await panel(page).locator(".choice-help-photo img").evaluate(async image => {
    await image.decode(); return { path: new URL(image.currentSrc).pathname, width: image.naturalWidth };
  });
  assert.equal(photo.path, `/src/products/occasion-sets-v1/${expectedId}.webp`);
  assert.ok(photo.width > 0);
  assert.equal(await preview(page).count(), 0, "The compact suggestion does not automatically open a selection dialog");
  assert.equal(await panel(page).getAttribute("aria-modal"), null);
  return href.pathname + href.hash;
}

try {
  for (const name of (process.env.ROBYS_OFFER_BROWSERS ?? "chromium").split(",")) {
    assert.ok(["chromium", "firefox", "webkit"].includes(name));
    const browser = await ({ chromium, firefox, webkit })[name].launch({ headless: true });
    report.browsers[name] = browser.version();
    try {
      for (const [width, height, language] of [[320, 700, "ru"], [390, 844, "tr"], [1440, 1000, "en"]]) {
        await run(browser, `${name}-offer-layout-${width}-${language}`, async context => {
          const page = await context.newPage(); await openMenu(page, "menu-combos");
          const card = page.locator('[data-combo-recipe="family"]');
          await card.waitFor();
          assert.equal(await page.locator("html").getAttribute("lang"), language);
          assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
          assert.equal(money(await card.locator(".menu-combos-price strong").textContent()), 750);
          assert.equal(money(await page.locator('[data-combo-recipe="sweet"] .menu-combos-price strong').textContent()), 280);
          await choose(page, "family").click(); await preview(page).waitFor();
          assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 750);
          const photo = await preview(page).locator(".menu-combos-preview-hero > img").evaluate(async image => {
            await image.decode(); return { path: new URL(image.currentSrc).pathname, width: image.naturalWidth, height: image.naturalHeight };
          });
          assert.equal(photo.path, "/src/products/occasion-sets-v1/family.webp");
          assert.ok(photo.width > 0 && photo.height > 0, "The preview contains a decoded local selection photo");
          assert.ok((await preview(page).locator(".menu-combos-preview-audience").textContent()).trim().length > 10,
            "The offer names its audience and serving count");
          assert.equal(await card.locator(".menu-combos-contents > li").count(), 4, "The card exposes all four selected product lines");
          assert.deepEqual(await preview(page).locator("[data-combo-quantity]").evaluateAll(nodes => nodes.map(node => ({
            id: node.dataset.comboQuantity, quantity: Number(node.value) })).sort((a, b) => a.id.localeCompare(b.id, "en"))), familyLines);
          assert.equal(await preview(page).locator("video, [data-combo-video], .menu-combos-video").count(), 0,
            "No invented video control or media when the catalog has no valid video source");
          const layout = await geometry(page, ".menu-combos-dialog[open]");
          assert.deepEqual(layout, { pageOverflow: false, contained: true, dialogFits: true, clippedControls: [] });
          await preview(page).screenshot({ path: join(output, `family-dialog-${width}-${language}.png`) });
          await preview(page).locator(".menu-combos-close").focus(); await page.keyboard.press("Shift+Tab");
          assert.equal(await preview(page).locator(".menu-combos-add").evaluate(button => document.activeElement === button), true);
          await page.keyboard.press("Tab");
          assert.equal(await preview(page).locator(".menu-combos-close").evaluate(button => document.activeElement === button), true);
          await page.keyboard.press("Escape");
          assert.equal(await choose(page, "family").evaluate(button => document.activeElement === button), true);
          await card.screenshot({ path: join(output, `family-card-${width}-${language}.png`) });
          return { viewport: { width, height }, language, familyTotal: 750, sweetTotal: 280, photo, layout, escapeRestoresFocus: true };
        }, { width, height, language });
      }

      await run(browser, `${name}-deep-link-and-edit-persist`, async context => {
        const page = await context.newPage(); await openMenu(page);
        assert.equal(await preview(page).count(), 0, "A normal menu visit does not open a selection dialog");
        await openMenu(page, "menu-combo-family"); await preview(page).waitFor();
        assert.match(await preview(page).locator("h2").textContent(), /2\s*\+\s*2/);
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 750);
        await page.keyboard.press("Escape");
        assert.equal(await choose(page, "family").evaluate(button => document.activeElement === button), true);
        await openMenu(page, "menu-combo-sweet"); await preview(page).waitFor();
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 280);
        assert.deepEqual(await preview(page).locator("[data-combo-quantity]").evaluateAll(nodes => nodes.map(node => ({
          id: node.dataset.comboQuantity, quantity: Number(node.value) })).sort((a, b) => a.id.localeCompare(b.id, "en"))), sweetLines);
        await preview(page).locator('[data-combo-increase="desserts:cookie"]').click();
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 380,
          "One extra cookie at the current 100 lira catalog price changes the selection total");
        await preview(page).locator('[data-combo-product="hot-coffee:caffe-latte"] .menu-combos-remove').click();
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 200);
        const expected = [{ id: "desserts:cookie", quantity: 2 }];
        await preview(page).locator(".menu-combos-add").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        const revision = await assertOrder(page, expected);
        assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), 200);
        await page.keyboard.press("Escape");
        assert.equal(await choose(page, "sweet").evaluate(button => document.activeElement === button), true);
        await openMenu(page); await page.locator("#menu-cart-trigger").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        await assertOrder(page, expected);
        assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), 200);
        return { originalTotals: { family: 750, sweet: 280 }, editedTotal: 200, expectedLines: expected,
          canonicalRevision: revision, reloadPersists: true, normalVisitNoDialog: true };
      });

      await run(browser, `${name}-delayed-deep-link-keeps-newer-cart`, async context => {
        let release, entered;
        const gate = new Promise(resolve => { release = resolve; });
        const loading = new Promise(resolve => { entered = resolve; });
        await context.route("**/menu-combos-ui.js*", async route => { entered(); await gate; await route.continue(); });
        try {
          const page = await context.newPage(); await openMenu(page, "menu-combo-family"); await loading;
          await page.locator("#menu-cart-trigger").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
          release(); await page.waitForLoadState("networkidle");
          assert.equal(await preview(page).count(), 0, "A late recipe import cannot open a preview over a newer cart");
          assert.equal(await page.locator("#menu-cart-dialog[open]").count(), 1);
          assert.equal(await page.locator("#menu-cart-dialog").evaluate(dialog => dialog.contains(document.activeElement)), true);
          return { delayedModule: "menu-combos-ui.js", newerCartPreserved: true, noFocusSteal: true };
        } finally { release(); }
      });

      for (const [hash, recipe] of [["menu-family", "family"], ["desserts", "sweet"]]) {
        await run(browser, `${name}-contextual-${recipe}-once`, async context => {
          const page = await context.newPage(); await clock(page); await openMenu(page, hash);
          await page.locator(".choice-help-entry").waitFor();
          await page.locator("#menu-share-button").evaluate(button => button.focus({ preventScroll: true }));
          await advance(page, 44_000);
          assert.equal(await panel(page).count(), 0, "The visitor sees no automatic offer before 45 seconds");
          await advance(page, 2_000);
          const target = await helperChoice(page, recipe);
          assert.equal(await page.locator("#menu-share-button").evaluate(button => document.activeElement === button), true,
            "The automatic offer never moves keyboard focus");
          const layout = await geometry(page, ".choice-help-panel:not([hidden])");
          assert.deepEqual(layout, { pageOverflow: false, contained: true, dialogFits: true, clippedControls: [] });
          await panel(page).screenshot({ path: join(output, `${recipe}-suggestion-390-ru.png`) });
          await panel(page).locator(".choice-help-actions a:visible").click(); await preview(page).waitFor();
          assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), recipe === "family" ? 750 : 280);
          await page.keyboard.press("Escape");
          assert.equal(await choose(page, recipe).evaluate(button => document.activeElement === button), true);
          await advance(page, 60_000); assert.equal(await panel(page).count(), 0);
          await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
          await advance(page, 60_000); assert.equal(await panel(page).count(), 0, "One automatic offer per session across page navigation");
          return { hash, target, before45s: "hidden", offeredAt: 46_000, noFocusSteal: true, onceAcrossPages: true, layout };
        });
      }

      await run(browser, `${name}-dismiss-keeps-manual-help`, async context => {
        const page = await context.newPage(); await clock(page); await openMenu(page);
        await advance(page, 46_000); await panel(page).waitFor();
        await panel(page).locator(".choice-help-close").click(); await advance(page, 60_000);
        assert.equal(await panel(page).count(), 0);
        await page.reload({ waitUntil: "domcontentloaded" }); await page.locator(".choice-help-entry").waitFor();
        await advance(page, 60_000); assert.equal(await panel(page).count(), 0);
        await page.locator(".choice-help-entry").click(); await panel(page).waitFor();
        await panel(page).locator(".choice-help-close").focus(); await page.keyboard.press("Escape");
        assert.equal(await panel(page).count(), 0);
        assert.equal(await page.locator(".choice-help-entry").evaluate(button => document.activeElement === button), true);
        return { dismissedAcrossReload: true, explicitHelpAvailable: true, escapeFocusRestored: true };
      });

      await run(browser, `${name}-editing-overlay-cart-suppression`, async context => {
        const page = await context.newPage(); await clock(page); await openMenu(page);
        await page.locator("#menu-search").focus(); await advance(page, 50_000);
        assert.equal(await panel(page).count(), 0, "Editing suppresses the automatic offer");
        await page.locator("#menu-combos-trigger").click(); await choose(page, "family").click(); await preview(page).waitFor();
        await advance(page, 50_000); assert.equal(await panel(page).count(), 0, "A selection overlay suppresses the offer");
        await preview(page).locator(".menu-combos-add").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        await assertOrder(page, familyLines);
        await advance(page, 50_000); assert.equal(await panel(page).count(), 0, "The cart suppresses the offer");
        await page.keyboard.press("Escape"); await advance(page, 50_000);
        assert.equal(await panel(page).count(), 0, "An existing order also suppresses automatic suggestions after the cart closes");
        return { editing: true, selectionOverlay: true, cartOverlay: true, nonemptyCanonicalOrder: true };
      });

      await run(browser, `${name}-hidden-visible-time`, async context => {
        const page = await context.newPage(); await clock(page); await openMenu(page);
        // A deterministic visibility fixture exercises the browser's read-only
        // state boundary without waiting in wall-clock time or changing app code.
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await advance(page, 60_000); assert.equal(await panel(page).count(), 0);
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await advance(page, 44_000); assert.equal(await panel(page).count(), 0, "Hidden time is not offer eligibility time");
        await advance(page, 2_000); await panel(page).waitFor();
        return { hiddenDurationMs: 60_000, visibleBeforeOfferMs: 46_000, visibility: "simulated document.hidden boundary, real emitted handlers" };
      });
    } finally { await browser.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); report.assetHashesEnd = hashes();
  report.assetsUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.passed = report.cases.filter(test => test.status === "PASS").length;
  report.failed = report.cases.length - report.passed;
  persist();
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, assetsUnchanged: report.assetsUnchanged, report: join(output, "report.json") }));
if (!report.cases.length || report.failed || !report.assetsUnchanged) process.exitCode = 1;
