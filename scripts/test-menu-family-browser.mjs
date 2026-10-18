import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, createReadStream, rmSync } from "node:fs";
import { dirname, resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { compileMenuRuntime, compileMenuOrderRuntime } from "./menu-runtime-source.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repo);
const output = resolve(process.env.ROBYS_FAMILY_QA_DIR ?? join(repo, ".artifacts/menu-family"));
mkdirSync(output, { recursive: true });
const fixture = mkdtempSync(join(tmpdir(), "robys-family-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
  "-keyout", join(fixture, "key.pem"), "-out", join(fixture, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
// Test the current sources before a coordinated build, without changing outputs.
const compiled = new Map([
  ["/menu-app.js", compileMenuRuntime()],
  ["/menu-family-ui.js", compileMenuRuntime(readFileSync("src/menu-family-ui.js", "utf8"))],
  ["/menu-order-ui.js", compileMenuOrderRuntime()]
]);
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
let origin;
const server = createServer({ key: readFileSync(join(fixture, "key.pem")), cert: readFileSync(join(fixture, "cert.pem")) }, (request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (compiled.has(pathname)) {
      response.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }).end(compiled.get(pathname));
      return;
    }
    let file = resolve(repo, "." + decodeURIComponent(pathname));
    if (!file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
origin = `https://127.0.0.1:${server.address().port}`;
const report = {
  startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  mode: "Chromium in Linux with phone-sized touch viewports; local HTTPS source fixture, not physical Android or vendor browsers",
  sourceHashes: Object.fromEntries(["src/menu-app.js", "src/menu-family-ui.js", "src/menu-family.js", "src/order-draft.js", "src/menu-order-ui.js", "menu-family.css", "menu.html", "menu-catalog.js"]
    .map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")])), cases: []
};
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
let browser;

async function run(id, callback, { width = 390, height = 844, javaScriptEnabled = true } = {}) {
  if (process.env.ROBYS_FAMILY_FILTER && !id.includes(process.env.ROBYS_FAMILY_FILTER)) return;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800,
    ignoreHTTPSErrors: true, serviceWorkers: "block", javaScriptEnabled, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort("blockedbyclient"));
  const startedAt = new Date().toISOString();
  try {
    const facts = await callback(page, context);
    assert.deepEqual(errors, [], "No uncaught runtime errors");
    report.cases.push({ id, status: "PASS", startedAt, finishedAt: new Date().toISOString(), facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    const screenshot = `${id}-failure.png`;
    await page.screenshot({ path: join(output, screenshot), fullPage: true }).catch(() => {});
    report.cases.push({ id, status: "FAIL", startedAt, finishedAt: new Date().toISOString(),
      error: error.stack, uncaughtErrors: errors, screenshot });
    console.error(`FAIL ${id}: ${error.stack}`);
  } finally { await context.close(); persist(); }
}

async function openMenu(page, language = "ru", { fallback = false, deepLink = false, reveal = true } = {}) {
  await page.addInitScript(({ language, fallback }) => {
    localStorage.setItem("robys-language", language);
    if (fallback) HTMLDialogElement.prototype.showModal = undefined;
  }, { language, fallback });
  await page.goto(`${origin}/menu.html${deepLink ? "#menu-family" : ""}`);
  await page.locator('#menu-root[data-ready="true"]').waitFor();
  if (reveal) {
    if (!deepLink) await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
  }
}

async function clearCart(page, returnButton) {
  const cart = page.locator("#menu-cart-dialog[open]");
  while (await cart.locator(".menu-cart-remove").count()) await cart.locator(".menu-cart-remove").first().click();
  await page.keyboard.press("Escape");
  assert.equal(await returnButton.evaluate(button => document.activeElement === button), true, "Cart returns focus to its recipe card");
}

try {
  browser = await chromium.launch({ headless: true });
  report.browserVersion = browser.version();
  for (const language of ["tr", "en", "ru"]) await run(`recipes-${language}`, async page => {
    await openMenu(page, language);
    assert.equal(await page.locator(".menu-family-card").count(), 3);
    assert.deepEqual(await page.locator(".menu-family-price").allTextContents(), ["160 ₺", "195 ₺", "230 ₺"]);
    const first = page.locator('[data-family-recipe="milk-cookie"] button');
    await first.click();
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Opening a recipe never adds it");
    const dialog = page.locator(".menu-family-dialog[open]");
    for (const checkbox of await dialog.locator("input").all()) await checkbox.uncheck();
    assert.equal(await dialog.locator(".menu-family-add").isDisabled(), true);
    await dialog.locator('input[value="brew-hot:milk"]').check();
    assert.match(await dialog.locator(".menu-family-total").textContent(), /60 ₺/);
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v1")).lines), [{ id: "brew-hot:milk", quantity: 1 }]);
    await clearCart(page, first);

    const second = page.locator('[data-family-recipe="simit-break"] button');
    await second.click();
    await dialog.locator('input[value="desserts:cookie"]').uncheck();
    assert.match(await dialog.locator(".menu-family-total").textContent(), /95 ₺/);
    await page.screenshot({ path: join(output, `${language}-preview-390.png`), fullPage: false });
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    const groups = await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v1")).groups);
    assert.equal(groups.length, 2);
    assert.ok(groups.every(group => group.items.length === 1), "Each component remains independently editable");
    await page.locator("#menu-cart-dialog .menu-cart-line").filter({ hasText: language === "ru" ? "Молоко" : language === "en" ? "Milk" : "Süt" })
      .locator(".menu-cart-remove").click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v1")).lines), [{ id: "food:sesame-simit", quantity: 1 }]);
    await clearCart(page, second);

    const third = page.locator('[data-family-recipe="milk-roll"] button');
    await third.click();
    await page.keyboard.press("Escape");
    assert.equal(await third.evaluate(button => document.activeElement === button), true);
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Cancel leaves the order unchanged");
    await third.click();
    assert.equal(await dialog.locator("input:checked").count(), 2);
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.equal(await page.locator("#menu-cart-dialog .menu-cart-line").count(), 2);
    assert.match(await page.locator("#menu-cart-dialog-total").textContent(), /230 ₺/);
    await clearCart(page, third);
    return { recipes: 3, completedSelections: 3, cancelPreservedDraft: true, separateComponentRemoval: true, focusRestored: true };
  });

  for (const width of [320, 1440]) await run(`layout-${width}`, async page => {
    await openMenu(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const strips = await page.locator(".menu-family-photos").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)));
    assert.equal(new Set(strips).size, 1, "Recipe image strips align despite different component counts");
    await page.screenshot({ path: join(output, `cards-${width}.png`), fullPage: false });
    await page.locator('[data-family-recipe="simit-break"] button').click();
    const bounds = await page.locator(".menu-family-dialog").evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height);
    return { viewport: { width, height: width === 1440 ? 900 : 844 }, bounds, photoStripHeights: strips };
  }, { width, height: width === 1440 ? 900 : 844 });

  await run("text-200-percent", async page => {
    await openMenu(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.locator('[data-family-recipe="simit-break"] button').click();
    const dialog = page.locator(".menu-family-dialog[open]");
    assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.equal(await page.locator("#menu-cart-dialog .menu-cart-line").count(), 3);
    return { textScale: "200%", allThreeComponentsAdded: true, noDialogHorizontalOverflow: true };
  });

  await run("dialog-fallback-keyboard", async page => {
    await openMenu(page, "ru", { fallback: true });
    const trigger = page.locator('[data-family-recipe="simit-break"] button');
    await trigger.click();
    const dialog = page.locator(".menu-family-dialog[open]");
    assert.equal(await dialog.evaluate(node => node.classList.contains("is-fallback")), true);
    await page.keyboard.press("Tab");
    assert.equal(await dialog.locator(".menu-family-close").evaluate(button => document.activeElement === button), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await dialog.locator(".menu-family-add").evaluate(button => document.activeElement === button), true);
    await page.keyboard.press("Escape");
    assert.equal(await trigger.evaluate(button => document.activeElement === button), true);
    return { showModalUnavailable: true, keyboardLoop: true, escapeReturnsFocus: true };
  }, { width: 320 });

  await run("late-capacity-atomic-and-double-click", async page => {
    await openMenu(page);
    await page.locator('[data-family-recipe="milk-cookie"] button').click();
    // A change after preview must be seen at confirmation, even without storage events.
    await page.evaluate(() => localStorage.setItem("robys-menu-order.v1", JSON.stringify({ version: 1, lines: [{ id: "desserts:cookie", quantity: 99 }] })));
    await page.locator(".menu-family-add").click();
    assert.equal(await page.locator(".menu-family-dialog[open]").count(), 1);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v1")).lines), [{ id: "desserts:cookie", quantity: 99 }]);
    await page.locator('.menu-family-dialog input[value="desserts:cookie"]').uncheck();
    await page.locator(".menu-family-add").evaluate(button => { button.click(); button.click(); });
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v1")).lines),
      [{ id: "brew-hot:milk", quantity: 1 }, { id: "desserts:cookie", quantity: 99 }]);
    return { reReadLatestDraft: true, blockedWholeSelection: true, doubleActivationAddsMilkOnce: true };
  });

  await run("lazy-load-escape-and-retry", async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/menu-family-ui.js*", async route => { requested(); await gate; await route.continue(); });
    await openMenu(page, "ru", { reveal: false });
    assert.equal(await page.locator(".menu-family-card").count(), 0, "Optional family UI stays lazy");
    await page.locator("#menu-family-trigger").click();
    await pending;
    await page.keyboard.press("Escape");
    release();
    await page.waitForFunction(() => !document.querySelector("#menu-family-trigger").hasAttribute("aria-busy"));
    assert.equal(await page.locator("#menu-family").isHidden(), true, "Escape cancels pending reveal");
    await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    return { lazyUntilIntent: true, escapeCancelsPendingReveal: true, nextClickOpensWithoutAdding: true };
  });

  await run("deep-link", async page => {
    await openMenu(page, "en", { deepLink: true });
    assert.equal(await page.locator("#menu-family-title").textContent(), "With kids");
    assert.equal(await page.locator("#menu-family-trigger").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    return { directMenuFamilyHash: true, noAutomaticAddition: true };
  });

  await run("optional-module-failure-recovery", async page => {
    const requestedUrls = [];
    await page.route("**/menu-family-ui.js*", route => {
      requestedUrls.push(route.request().url());
      return requestedUrls.length === 1 ? route.abort("failed") : route.continue();
    });
    await openMenu(page, "ru", { reveal: false });
    await page.locator("#menu-family-trigger").click();
    await page.locator("#menu-cart-status.is-visible").waitFor();
    assert.equal(await page.locator("#menu-family").isHidden(), true);
    await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator("#menu-cart-status").evaluate(node => node.classList.contains("is-visible")), false,
      "Successful recovery clears the old failure notice");
    assert.equal(requestedUrls.length, 2);
    assert.notEqual(requestedUrls[0], requestedUrls[1], "Explicit retry bypasses the failed module URL");
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    return { firstOptionalImportBlocked: true, secondIntentRecovered: true, distinctModuleUrls: true };
  });

  await run("escape-during-cart-load", async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/menu-order-ui.js*", async route => { requested(); await gate; await route.continue(); });
    await openMenu(page);
    await page.locator('[data-family-recipe="milk-cookie"] button').click();
    await page.locator(".menu-family-add").click();
    await pending;
    await page.keyboard.press("Escape");
    release();
    // This element is created only when the delayed order UI initializes.
    await page.locator("#menu-product-unit-price").waitFor({ state: "attached" });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator("#menu-cart-dialog[open]").count(), 0, "Cancelled async feedback must not reopen later");
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v1")).lines),
      [{ id: "brew-hot:milk", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }]);
    return { orderUiLoadDelayed: true, escapeCancelledPopup: true, explicitlyAddedSelectionPreserved: true };
  });

  await run("no-js-fallback", async page => {
    await page.goto(`${origin}/menu.html`);
    await page.locator("#menu-family-trigger").click();
    assert.equal(new URL(page.url()).hash, "#menu-family-fallback");
    assert.equal(await page.locator("#menu-family-fallback a").count(), 4);
    await page.locator("#menu-family-fallback a").first().click();
    assert.equal(new URL(page.url()).pathname, "/src/products/menu-v1/brew-hot--milk.webp");
    return { javaScriptDisabled: true, anchorReached: true, existingProductPhotoOpened: true };
  }, { javaScriptEnabled: false });
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(fixture, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.cases.filter(entry => entry.status === "PASS").length,
    failed: report.cases.filter(entry => entry.status === "FAIL").length };
  persist();
}
console.log(JSON.stringify(report.summary));
if (report.summary.failed) process.exitCode = 1;
