import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, createReadStream, rmSync } from "node:fs";
import { dirname, resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { compileMenuRuntime, compileMenuOrderRuntime, compileOrderStorageRuntime } from "./menu-runtime-source.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repo);
const output = resolve(process.env.ROBYS_NAVIGATION_QA_DIR ?? join(repo, ".artifacts/mobile-navigation"));
mkdirSync(output, { recursive: true });
const fixture = mkdtempSync(join(tmpdir(), "robys-navigation-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(fixture, "key.pem"), "-out", join(fixture, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
// Source mode supports focused development before a coordinated build. The
// release run serves actual emitted files and never compiles a replacement.
const useBuiltRuntime = process.env.ROBYS_NAVIGATION_USE_BUILT === "1";
const compiled = useBuiltRuntime ? new Map() : new Map([["/order-storage.js", compileOrderStorageRuntime()], ["/menu-app.js", compileMenuRuntime()], ["/menu-order-ui.js", compileMenuOrderRuntime()], ["/menu-family-ui.js", compileMenuRuntime(readFileSync("src/menu-family-ui.js", "utf8"))]]);
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
let origin;
const server = createServer({ key: readFileSync(join(fixture, "key.pem")), cert: readFileSync(join(fixture, "cert.pem")) }, (request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (compiled.has(pathname)) { response.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }).end(compiled.get(pathname)); return; }
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
const files = ["menu-premium.css", "menu-catalog.js", "smart-choice/style.css", "index.html", "coffee-paths.css", "src/menu-app.js"];
const report = { startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), mode: "Local HTTPS Chromium with touch viewport emulation; not physical OEM phone testing", useBuiltRuntime,
  runtimeAssets: Object.fromEntries(["menu-app.js", "menu-order-ui.js", "menu-family-ui.js"].map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")])),
  sourceHashes: Object.fromEntries(files.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")])), cases: [] };
const boxesOverlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  report.browserVersion = browser.version();
  for (const variant of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }, { width: 390, height: 844, fallback: true }]) for (const language of ["tr", "en", "ru"]) {
    const { width, height, fallback = false } = variant;
    const viewport = { width, height };
    const id = `${language}-${width}x${height}${fallback ? '-fallback' : ''}`;
    if (process.env.ROBYS_NAVIGATION_FILTER && !id.includes(process.env.ROBYS_NAVIGATION_FILTER)) continue;
    const context = await browser.newContext({ viewport, hasTouch: width < 1000, ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.addInitScript(({ language, fallback }) => {
        localStorage.setItem("robys-language", language);
        if (fallback) HTMLDialogElement.prototype.showModal = undefined;
      }, { language, fallback });
      await page.goto(`${origin}/menu.html?entry=off`);
      await page.locator('#menu-root[data-ready="true"]').waitFor();
      const initial = await page.evaluate(() => {
        const back = document.querySelector(".menu-page-back");
        const copy = back.querySelector("[data-menu-copy]");
        const logo = document.querySelector(".menu-page-brand .brand-copy");
        const first = document.querySelector(".full-menu-panel");
        return { backText: copy.textContent, backWidth: back.clientWidth, backScrollWidth: back.scrollWidth, textWidth: copy.getBoundingClientRect().width, logoWidth: logo.getBoundingClientRect().width, logoHeight: logo.getBoundingClientRect().height, firstCategoryTop: first.getBoundingClientRect().top, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(initial.overflow, false, "menu has no horizontal page overflow");
      assert(initial.backScrollWidth <= initial.backWidth + 1, "home link is not clipped");
      if (language === "ru") assert.equal(initial.backText, "На главную");
      if (viewport.width < 700) { assert(initial.firstCategoryTop < 600, `first menu category appears within the initial mobile viewport (${initial.firstCategoryTop}px)`); assert(initial.logoWidth >= 170 && initial.logoHeight >= 40, "approved wordmark remains legible"); }
      await page.screenshot({ path: join(output, `${id}-menu.png`) });
      await page.locator('[data-product-id="brew-hot:milk"] .full-menu-item-media').click();
      await page.locator('#menu-product-dialog[open]').waitFor();
      await page.locator('#menu-add-to-cart').click();
      await page.locator('#menu-cart-dialog[open]').waitFor();
      if (fallback) await page.locator('#menu-cart-dialog .menu-dialog-close').click();
      else await page.keyboard.press("Escape");
      await page.locator('#menu-cart-trigger.has-items').waitFor();
      await page.evaluate(() => scrollTo(0, 2250));
      const cart = await page.locator('#menu-cart-trigger').boundingBox();
      assert.match(await page.locator('#menu-cart-total').textContent(), /60 ₺/);
      assert.equal(await page.locator('#menu-cart-count').textContent(), "1");
      if (viewport.width < 1000) {
        assert(cart.y >= 0 && cart.y + cart.height <= viewport.height, "nonempty cart stays reachable after a long scroll");
        assert(cart.height >= 44, "persistent cart has a full touch target");
        await page.locator('#menu-cart-total').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#menu-cart-total').isVisible(), true, "persistent cart includes its sum");
        await page.screenshot({ path: join(output, `${id}-cart.png`) });
        await page.locator('#menu-cart-trigger').click();
        await page.locator('#menu-cart-dialog[open]').waitFor();
        assert.equal(await page.locator('#menu-cart-trigger').isVisible(), false, "floating cart is hidden behind dialog/fallback");
        if (fallback) await page.locator('#menu-cart-dialog .menu-dialog-close').click();
        else await page.keyboard.press("Escape");
        await page.locator('#menu-search').focus();
        assert.equal(await page.locator('#menu-cart-trigger').isVisible(), false, "floating cart is hidden during search input focus");
        await page.locator('#menu-search').blur();
        assert.equal(await page.locator('#menu-cart-trigger').isVisible(), true, "cart returns after search focus ends");
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        const footer = await page.locator('.menu-page-footer').boundingBox();
        const endCart = await page.locator('#menu-cart-trigger').boundingBox();
        assert(footer.y + footer.height <= endCart.y, "final footer content can be scrolled above the persistent cart");
      }
      const before = await page.evaluate(() => localStorage.getItem("robys-menu-order.v2"));
      await page.goto(`${origin}/smart-choice/`);
      await page.locator(`[data-static-copy="fullMenu"]`).waitFor();
      const link = page.locator('[data-static-copy="fullMenu"]');
      await page.waitForFunction(language => document.documentElement.lang === language, language);
      assert.equal(await link.isVisible(), true, "full menu is visible in Smart Choice on every viewport");
      const linkBox = await link.boundingBox();
      const langBox = await page.locator('.language-switcher').boundingBox();
      const brandBox = await page.locator('.smart-header .brand').boundingBox();
      assert(!boxesOverlap(linkBox, langBox) && !boxesOverlap(linkBox, brandBox), "full-menu link does not overlap brand or language controls");
      await page.screenshot({ path: join(output, `${id}-smart-choice.png`) });
      await link.click();
      await page.locator('#menu-root[data-ready="true"]').waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), language, "one-tap menu link preserves language");
      assert.equal(await page.evaluate(() => localStorage.getItem("robys-menu-order.v2")), before, "navigation preserves cart contents");
      await page.goto(`${origin}/index.html`);
      const homeFamily = page.locator('.hero-family-link');
      await homeFamily.waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "home family entry creates no horizontal overflow");
      assert.equal(await homeFamily.getAttribute('href'), 'menu.html#menu-family');
      assert.match(await homeFamily.textContent(), language === 'ru' ? /С ребёнком/ : language === 'en' ? /With kids/ : /Çocuklarla/);
      await page.screenshot({ path: join(output, `${id}-home-family.png`) });
      await homeFamily.click();
      await page.locator('#menu-family:not([hidden]) .menu-family-card').first().waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), language, "home family shortcut preserves language");
      assert.equal(await page.locator('#menu-cart-count').textContent(), '1', "family shortcut preserves cart");
      assert.deepEqual(errors, [], "no uncaught runtime errors");
      report.cases.push({ id, status: "PASS", initial, cart, fullMenuLink: linkBox, languageAndCartPreserved: true, homeFamilyShortcut: true });
      console.log(`PASS ${id}`);
    } catch (error) {
      await page.screenshot({ path: join(output, `${id}-failure.png`) }).catch(() => {});
      const diagnostics = await page.locator('#menu-cart-total').evaluate(node => ({ total: node.textContent, style: { display: getComputedStyle(node).display, visibility: getComputedStyle(node).visibility }, bodyClass: document.body.className, activeElement: document.activeElement?.outerHTML, parent: node.parentElement.outerHTML })).catch(() => null);
      report.cases.push({ id, status: "FAIL", error: error.stack, runtimeErrors: errors, diagnostics });
      console.error(`FAIL ${id}: ${error.message}`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(fixture, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
assert.equal(report.cases.filter(entry => entry.status === 'FAIL').length, 0, 'mobile navigation checks failed');
console.log(`PASS: ${report.cases.length} mobile navigation scenarios`);
