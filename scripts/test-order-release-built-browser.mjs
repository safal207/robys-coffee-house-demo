import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import { PNG } from "pngjs";
import jsQR from "jsqr";

// Serve the emitted release files as bytes. This test deliberately does not
// compile, replace, or import any production ordering implementation.
const repo = resolve(new URL("..", import.meta.url).pathname);
process.chdir(repo);
const output = resolve(process.env.ROBYS_BUILT_QA_DIR ?? ".artifacts/order-release-built");
mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-built-release-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const assets = ["menu.html", "menu-app.js", "menu-order-ui.js", "menu-family-ui.js", "menu-pairing.js", "menu-catalog.js",
  "menu-premium.css", "menu-family.css", "order-checkout.js", "order-checkout.css", "cashier.html", "cashier.js",
  "src/order-draft.js", "src/menu-order-ui.js", "src/menu-app.js", "src/menu-promo-pair.js", "src/order-checkout.js",
  "src/products/family-v1/milk-cookie.webp", "src/products/family-v1/simit-break.webp", "src/products/family-v1/milk-roll.webp",
  "integrity-manifest.json", "package-lock.json", "scripts/test-order-release-built-browser.mjs"];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const requests = new Map();
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    const pathname = new URL(request.url, "https://127.0.0.1").pathname;
    const file = resolve(repo, "." + decodeURIComponent(pathname));
    if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    requests.set(pathname, (requests.get(pathname) ?? 0) + 1);
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const storageKey = "robys-menu-order.v1";
const report = {
  startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirtyFilesAtStart: execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().split("\n").filter(Boolean),
  mode: "Actual emitted runtime served unchanged over local HTTPS; production CSP enforced; fresh browser engine contexts, not physical phones",
  environment: { firefoxContentSandbox: process.env.MOZ_DISABLE_CONTENT_SANDBOX ?? "default", localSelfSignedCertificate: true,
    bypassCSP: false, serviceWorkers: "blocked", externalRequests: "blocked" },
  assetHashesStart: hashes(), browsers: {}, cases: []
};
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
const expectedFamily = [{ id: "brew-hot:milk", quantity: 1 }, { id: "food:sesame-simit", quantity: 1 }];
const names = {
  tr: { milk: "Süt", simit: "Susamlı Simit", lime: "Cool Lime" },
  en: { milk: "Milk", simit: "Sesame Simit", lime: "Cool Lime" },
  ru: { milk: "Молоко", simit: "Симит с кунжутом", lime: "Cool Lime" }
};
const sortLines = lines => [...lines].sort((a, b) => a.id.localeCompare(b.id, "en"));

async function contextFor(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 },
    hasTouch: width === 390, reducedMotion: "reduce", serviceWorkers: "block", ignoreHTTPSErrors: true });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  return context;
}

async function openMenu(page, language) {
  page.setDefaultTimeout(12000);
  await page.addInitScript(language => {
    localStorage.setItem("robys-language", language);
    window.__builtPointerEvents = [];
    const remember = fact => {
      window.__builtPointerEvents.push({ at: performance.now(), ...fact });
      if (window.__builtPointerEvents.length > 100) window.__builtPointerEvents.shift();
    };
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) document.addEventListener(type, event => {
      const button = event.target?.closest?.("button");
      remember({ type, trusted: event.isTrusted, targetId: event.target?.id, targetTag: event.target?.tagName,
        buttonId: button?.id, buttonClass: button?.className, disabled: button?.disabled,
        text: button?.textContent?.slice(0, 100), x: event.clientX, y: event.clientY, focused: document.hasFocus() });
    }, true);
    document.addEventListener("DOMContentLoaded", () => {
      const button = document.querySelector("#menu-add-to-cart");
      if (!button) return;
      new MutationObserver(() => remember({ type: "add-button-change", disabled: button.disabled, text: button.textContent,
        rect: button.getBoundingClientRect().toJSON(), focused: document.hasFocus() }))
        .observe(button, { attributes: true, childList: true, subtree: true, characterData: true });
    }, { once: true });
  }, language);
  await page.goto(`${origin}/menu.html?entry=off`, { waitUntil: "domcontentloaded" });
  await page.locator('#menu-root[data-ready="true"]').waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), language);
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1, "Production CSP remains present");
}

async function waitLines(page, expected) {
  await page.waitForFunction(({ key, expected }) => {
    try { return JSON.stringify(JSON.parse(localStorage.getItem(key)).lines) === JSON.stringify(expected); } catch { return false; }
  }, { key: storageKey, expected: sortLines(expected) });
  assert.deepEqual((await stored(page)).lines, sortLines(expected));
}

async function readCanonical(page) {
  // Read the documented persistence schema independently of the app's reader.
  // No fixture seeds or resets bypass the user's native mutation handlers.
  return page.evaluate(key => new Promise((resolve, reject) => {
    const opening = indexedDB.open("robys-order-transactions.v1", 1);
    opening.onupgradeneeded = () => { opening.transaction.abort(); reject(new Error("Canonical order database was not created")); };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      try {
        const transaction = database.transaction("shared-order", "readonly");
        const request = transaction.objectStore("shared-order").get(key);
        let value;
        request.onsuccess = () => { value = request.result; };
        transaction.oncomplete = () => { database.close(); resolve(value); };
        transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Canonical read aborted")); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      } catch (error) { database.close(); reject(error); }
    };
  }), storageKey);
}

async function verifyCanonical(page, expected) {
  const record = await readCanonical(page);
  assert.equal(record?.version, 1);
  assert.ok(Number.isSafeInteger(record.revision) && record.revision > 0);
  assert.deepEqual(record.draft.lines, sortLines(expected), "The canonical IDB record preserves the exact intended composition");
  return record.revision;
}

async function pageDiagnostic(page) {
  const ui = await page.evaluate(key => {
    const button = document.querySelector("#menu-add-to-cart"), rectangle = button?.getBoundingClientRect();
    const center = rectangle ? { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 } : null;
    const hit = center ? document.elementFromPoint(center.x, center.y) : null;
    return { url: location.href, focused: document.hasFocus(), visibility: document.visibilityState,
      activeElement: { id: document.activeElement?.id, tag: document.activeElement?.tagName },
      productOpen: document.querySelector("#menu-product-dialog")?.hasAttribute("open"),
      cartOpen: document.querySelector("#menu-cart-dialog")?.hasAttribute("open"),
      cartCount: document.querySelector("#menu-cart-count")?.textContent,
      add: button ? { disabled: button.disabled, ariaBusy: button.getAttribute("aria-busy"), text: button.textContent,
        rect: rectangle.toJSON(), centerHit: { id: hit?.id, tag: hit?.tagName, text: hit?.textContent?.slice(0, 100) } } : null,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(node => ({ text: node.textContent,
        hidden: node.hidden, visible: node.getClientRects().length > 0 })),
      localProjection: localStorage.getItem(key), pointerEvents: window.__builtPointerEvents ?? [] };
  }, storageKey).catch(error => ({ error: String(error) }));
  return { ...ui, canonical: await readCanonical(page).catch(error => ({ error: String(error) })) };
}

async function clearCart(page) {
  await page.locator("#menu-cart-dialog[open]").waitFor();
  let removals = 0;
  while (await page.locator(".menu-cart-remove").count()) {
    const before = (await stored(page)).groups.length;
    await page.locator(".menu-cart-remove").first().click();
    await page.waitForFunction(({ key, before }) => JSON.parse(localStorage.getItem(key)).groups.length < before, { key: storageKey, before });
    await page.waitForFunction(before => document.querySelectorAll(".menu-cart-line").length < before, before);
    assert(++removals < 20, "Bounded cart cleanup");
  }
  await waitLines(page, []);
  await verifyCanonical(page, []);
  assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
  await page.locator('[data-menu-dialog-close="cart"]').first().click();
  await page.locator("#menu-cart-dialog[open]").waitFor({ state: "hidden" });
}

async function verifyQrAndCashier(page, context, language, expectedTotal, expectedNames, id) {
  assert.equal((await page.locator("#menu-cart-dialog-total").textContent()).trim(), `${expectedTotal} ₺`);
  await page.locator("#menu-checkout-trigger").click();
  const checkout = page.locator(".order-checkout-dialog[open]");
  await checkout.waitFor();
  assert.equal((await checkout.locator(".order-ticket-total strong").textContent()).trim(), `${expectedTotal} ₺`);
  const bytes = await checkout.locator(".order-ticket-qr").screenshot({ path: join(output, `${id}-qr.png`) });
  const png = PNG.sync.read(bytes);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, { inversionAttempts: "attemptBoth" });
  assert.ok(decoded?.data, "The actual rendered QR pixels decode");
  const link = await checkout.locator(".order-checkout-actions a").getAttribute("href");
  assert.equal(decoded.data, link, "Rendered QR and visible cashier link carry the same URL");
  assert.equal(new URL(decoded.data).origin, origin);
  assert.equal(new URL(decoded.data).pathname, "/cashier.html");
  const cashier = await context.newPage();
  cashier.setDefaultTimeout(12000);
  try {
    await cashier.goto(decoded.data, { waitUntil: "domcontentloaded" });
    await cashier.locator("#cashier-ticket .order-ticket-line").first().waitFor();
    assert.equal(await cashier.locator("html").getAttribute("lang"), language);
    assert.equal((await cashier.locator(".order-ticket-total strong").textContent()).trim(), `${expectedTotal} ₺`);
    const lines = await cashier.locator(".order-ticket-item-name").allTextContents();
    assert.equal(lines.length, expectedNames.length);
    for (const name of expectedNames) assert.ok(lines.some(line => line.includes(name)), `Cashier includes ${name}`);
    assert.equal(await cashier.locator(".order-ticket-error").count(), 0);
    await cashier.screenshot({ path: join(output, `${id}-cashier.png`) });
    await checkout.screenshot({ path: join(output, `${id}-checkout.png`) });
    return { total: expectedTotal, decodedQrMatchesCashierLink: true, cashierLanguage: language, cashierLines: lines };
  } finally {
    await cashier.close();
    await checkout.locator(".order-checkout-close").click();
    await checkout.waitFor({ state: "detached" });
  }
}

async function runCase(id, context, callback) {
  const errors = [];
  const handlers = new Map();
  const attach = page => {
    const handler = error => errors.push(error.message);
    handlers.set(page, handler); page.on("pageerror", handler);
  };
  context.pages().forEach(attach); context.on("page", attach);
  try {
    const facts = await callback();
    assert.deepEqual(errors, [], "No uncaught browser errors");
    report.cases.push({ id, status: "PASS", facts }); console.log(`PASS ${id}`);
    return true;
  } catch (error) {
    const diagnostics = await Promise.all(context.pages().map(pageDiagnostic));
    for (const [index, page] of context.pages().entries()) await page.screenshot({ path: join(output, `${id}-failure-${index}.png`) }).catch(() => {});
    report.cases.push({ id, status: "FAIL", error: error.stack, uncaughtErrors: errors, diagnostics }); console.error(`FAIL ${id}: ${error.stack}`);
    return false;
  } finally {
    context.off("page", attach);
    for (const [page, handler] of handlers) page.off("pageerror", handler);
    persist();
  }
}

const selected = (process.env.ROBYS_RELEASE_BUILT_BROWSERS ?? process.env.ROBYS_BUILT_BROWSERS ?? "chromium,firefox,webkit").split(",");
const widths = (process.env.ROBYS_BUILT_WIDTHS ?? "390,1440").split(",").map(Number);
const languages = (process.env.ROBYS_BUILT_LANGUAGES ?? "tr,en,ru").split(",");
const collisionCount = Number(process.env.ROBYS_BUILT_COLLISIONS ?? 10);
assert.ok(selected.length > 0 && selected.every(name => ["chromium", "firefox", "webkit"].includes(name)), "Known browser engines required");
assert.ok(widths.length > 0 && widths.every(width => Number.isSafeInteger(width) && width >= 320), "Valid viewport widths required");
assert.ok(languages.length > 0 && languages.every(language => Object.hasOwn(names, language)), "Known languages required");
assert.ok(Number.isSafeInteger(collisionCount) && collisionCount >= 0, "A nonnegative integer collision count is required");
try {
  for (const [engine, type] of Object.entries({ chromium, firefox, webkit }).filter(([name]) => selected.includes(name))) {
    const browser = await type.launch({ headless: true, timeout: 30000 });
    report.browsers[engine] = browser.version();
    try {
      for (const width of widths) for (const language of languages) {
        const context = await contextFor(browser, width);
        try {
          await runCase(`${engine}-${language}-${width}-family`, context, async () => {
            const page = await context.newPage(); await openMenu(page, language);
            await page.locator("#menu-family-trigger").click();
            await page.locator('[data-family-recipe="simit-break"] button').click();
            const preview = page.locator(".menu-family-dialog[open]");
            assert.match(await preview.locator(".menu-family-total").textContent(), /195 ₺/);
            await preview.locator('input[value="desserts:cookie"]').uncheck();
            assert.match(await preview.locator(".menu-family-total").textContent(), /95 ₺/);
            assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Preview changes do not add items");
            await preview.locator(".menu-family-add").click();
            await page.locator("#menu-cart-dialog[open]").waitFor(); await waitLines(page, expectedFamily);
            const canonicalRevision = await verifyCanonical(page, expectedFamily);
            const qr = await verifyQrAndCashier(page, context, language, 95, [names[language].milk, names[language].simit], `${engine}-${language}-${width}-family`);
            await clearCart(page); await page.close();
            return { width, language, removedCookie: true, exactLines: expectedFamily, canonicalRevision, clearedAfterQr: true, ...qr };
          });
          await runCase(`${engine}-${language}-${width}-promo`, context, async () => {
            const page = await context.newPage(); await openMenu(page, language);
            await page.locator('[data-product-id="pairing-offers:cool-lime-macaron-pairing"] .full-menu-item-media').click();
            await page.locator(".pairing-discovery-choose").click();
            await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
            assert.equal(await page.locator('input[name="menu-dessert"][value="desserts:macaron"]').isChecked(), true);
            await page.locator("#menu-add-to-cart").click();
            await page.locator("#menu-cart-dialog[open]").waitFor();
            await waitLines(page, [{ id: "refreshers:cool-lime", quantity: 1 }, { id: "desserts:macaron", quantity: 1 }]);
            assert.equal((await page.locator("#menu-cart-dialog-total").textContent()).trim(), "220 ₺");
            await page.locator(".menu-cart-edit").click();
            await page.locator('#menu-product-dialog[open] #menu-pairing-picker[data-ready="true"]').waitFor();
            await page.locator('input[name="menu-dessert"][value=""]').locator("..").click();
            await page.locator("#menu-add-to-cart").click();
            await page.locator("#menu-cart-dialog[open]").waitFor();
            await waitLines(page, [{ id: "refreshers:cool-lime", quantity: 1 }]);
            const canonicalRevision = await verifyCanonical(page, [{ id: "refreshers:cool-lime", quantity: 1 }]);
            const qr = await verifyQrAndCashier(page, context, language, 190, [names[language].lime], `${engine}-${language}-${width}-promo`);
            await clearCart(page); await page.close();
            return { width, language, removedMacaron: true, retainedDrinkQuantity: 1, canonicalRevision, ...qr };
          });
        } finally { await context.close(); }
      }
      if (collisionCount > 0) {
        const context = await contextFor(browser, 390);
        try {
          const left = await context.newPage(), right = await context.newPage();
          await Promise.all([openMenu(left, "ru"), openMenu(right, "ru")]);
          for (let index = 0; index < collisionCount; index++) {
            const passed = await runCase(`${engine}-native-two-tab-add-${index}`, context, async () => {
            await Promise.all([left, right].map(page => page.evaluate(() => { window.__builtPointerEvents = []; })));
            const same = index % 2 === 0;
            const ids = ["hot-coffee:espresso", same ? "hot-coffee:espresso" : "hot-coffee:americano"];
            await Promise.all([left, right].map(async (page, side) => {
              if (await page.locator("#menu-cart-dialog[open]").count()) await page.locator('[data-menu-dialog-close="cart"]').first().click();
              await page.locator(`[data-product-id="${ids[side]}"] .full-menu-item-media`).click();
              await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
              await page.locator('input[name="menu-dessert"][value=""]').locator("..").click();
            }));
            await Promise.all([left, right].map(page => page.locator("#menu-add-to-cart").click()));
            await Promise.all([left, right].map(page => page.locator("#menu-cart-dialog[open]").waitFor()));
            const acceptedClicks = await Promise.all([left, right].map(page => page.evaluate(() => window.__builtPointerEvents
              .filter(event => event.type === "click" && event.buttonId === "menu-add-to-cart" && event.trusted).length)));
            assert.deepEqual(acceptedClicks, [1, 1], "Each browser page received exactly one trusted native Add click");
            const expected = same ? [{ id: ids[0], quantity: 2 }] : ids.map(id => ({ id, quantity: 1 }));
            await Promise.all([waitLines(left, expected), waitLines(right, expected)]);
            const canonicalRevision = await verifyCanonical(left, expected);
            await Promise.all([left, right].map(page => page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2")));
            // A third page must recover the persisted order through the actual
            // lazy cart loader, rather than sharing either writer's memory.
            const reopened = await context.newPage();
            try {
              await openMenu(reopened, "ru");
              await reopened.locator("#menu-cart-trigger").click();
              await reopened.locator("#menu-cart-dialog[open]").waitFor();
              await reopened.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2");
              await waitLines(reopened, expected);
              assert.equal(await reopened.locator(".menu-cart-line").count(), same ? 1 : 2);
            } finally { await reopened.close(); }
            await clearCart(left); await waitLines(right, []);
            return { actualNativeAddHandlers: 2, sameProduct: same, bothPreserved: true, canonicalRevision,
              acceptedTrustedClicks: acceptedClicks, coldPageReopenedPersistedCart: true, expectedLines: expected };
            });
            if (!passed) break;
          }
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve)); rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); report.assetHashesEnd = hashes();
  report.assetsUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.requests = Object.fromEntries([...requests.entries()].sort(([a], [b]) => a.localeCompare(b)));
  report.passed = report.cases.filter(test => test.status === "PASS").length;
  report.failed = report.cases.length - report.passed;
  persist();
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, assetsUnchanged: report.assetsUnchanged, report: join(output, "report.json") }));
if (report.failed || !report.assetsUnchanged) process.exitCode = 1;
