import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, firefox } from "playwright";
import { expect } from "@playwright/test";
import { menuCategories } from "../menu-catalog.js";
import { verifyMenuCustomPairing } from "./test-menu-custom-pairing-browser.mjs";

const port = Number(process.env.CHOICE_FUNNEL_PORT ?? 4189);
const base = `http://127.0.0.1:${port}/`;
const browserName = process.env.CHOICE_FUNNEL_BROWSER ?? "chromium";
assert.ok(["chromium", "firefox"].includes(browserName), "CHOICE_FUNNEL_BROWSER must be chromium or firefox");
const directory = `.artifacts/choice-funnel/${browserName}`;
const sourceHead = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const drinkId = "hot-coffee:caffe-latte";
const dessertId = "desserts:lotus-cheesecake";
const drink = menuCategories.find(category => category.id === "hot-coffee").items.find(item => item.name.en === "Caffè Latte");
const sweet = menuCategories.find(category => category.id === "desserts").items.find(item => item.name.en === "Lotus Cheesecake");
const unitTotal = drink.price + sweet.price;
const money = (text) => Number(String(text).replace(/\D/g, ""));
const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v1")));
const committedLines = (value) => value.lines.map(line => [line.id, line.quantity]).sort();

// Reach controls through real Tab navigation, including modal focus traps.
async function tabTo(page, control) {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  // Firefox can restore the sequential navigation position below the cart.
  // Use both keyboard directions: Tab can leave the document at its last link,
  // so a test cannot assume it wraps through browser chrome back to the first.
  const limit = await page.locator("a[href],button,input,select,textarea,[tabindex]").count() + 2;
  for (let count = 0; count <= limit; count++) {
    if (await control.evaluate(node => document.activeElement === node)) {
      await expect(control).toHaveAccessibleName(/\S/);
      return;
    }
    const key = await control.evaluate(node =>
      document.activeElement.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING ? "Shift+Tab" : "Tab");
    await page.keyboard.press(key);
  }
  assert.fail(`Keyboard cannot reach ${control}`);
}
async function activate(page, control) {
  await tabTo(page, control);
  await page.keyboard.press("Enter");
}

mkdirSync(directory, { recursive: true });
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
const report = { browser: browserName, sourceHead: sourceHead(), startedAt: new Date().toISOString(),
  playwrightVersion: JSON.parse(readFileSync("node_modules/playwright/package.json", "utf8")).version,
  nodeVersion: process.version, platform: `${process.platform}/${process.arch}`, status: "RUNNING",
  runtimeOptions: { firefoxContentSandboxDisabled: process.env.MOZ_DISABLE_CONTENT_SANDBOX === "1" },
  contextOptions: { reducedMotion: "reduce", serviceWorkers: "block", responsiveViewportsOnly: true },
  integritySha256: sha256("integrity-manifest.json"),
  testDefinitions: Object.fromEntries(["scripts/test-choice-funnel-browser.mjs", "scripts/test-menu-custom-pairing-browser.mjs",
    "scripts/verify-pairing-cta-static.mjs", "package.json", "package-lock.json", ".github/workflows/adversarial-browser.yml"].map(file => [file, sha256(file)])),
  checks: [] };
// Interrupted runs must not leave a previous PASS report at the output path.
writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2) + "\n");
let browser;
let activeContext;
let activePage;
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1_000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "isolated local server must be ready");
  browser = await ({ chromium, firefox })[browserName].launch({ headless: true });
  report.browserVersion = browser.version();
  for (const width of [320, 360, 390, 768, 1440]) for (const language of ["tr", "en", "ru"]) {
    const height = width === 360 ? 640 : 900;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
    activeContext = context;
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.stack ?? error.message));
    await page.addInitScript(({ lang, origin }) => {
      // This fixture owns the local page, not sandboxed third-party frames.
      if (window === window.top && location.origin === origin) localStorage.setItem("robys-language", lang);
    }, { lang: language, origin: new URL(base).origin });
    await page.goto(`${base}index.html?entry=off`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    assert.equal(await page.locator(".hero-actions .button-primary").count(), 1);
    assert.equal(await page.locator(".hero-actions .button-primary").getAttribute("href"), "smart-choice/");
    assert.deepEqual(await page.locator(".coffee-path").evaluateAll(nodes => nodes.map(node => node.getAttribute("href"))),
      ["menu.html#hot-coffee", "menu.html#cold-coffee", "menu.html#pairing-offers"]);
    const paths = page.locator("#your-break");
    await paths.scrollIntoViewIfNeeded();
    await expect.poll(() => paths.locator("img").evaluateAll(images =>
      images.every(image => image.complete && image.naturalWidth > 0)),
    { message: "all three entry images must finish loading before decoding" }).toBe(true);
    await paths.locator("img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const geometry = await paths.evaluate(root => {
      const nodes = [...root.querySelectorAll(".coffee-path,.coffee-order-steps li")];
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
        clipping: nodes.some(node => node.scrollWidth > node.clientWidth + 1),
        photos: [...root.querySelectorAll("img")].every(image => image.naturalWidth > 0) };
    });
    assert.deepEqual(geometry, { overflow: false, clipping: false, photos: true }, `${width}/${language}: entry layout`);
    assert.deepEqual(errors, [], `${width}/${language}: no application exceptions`);
    report.checks.push({ type: "landing", width, height, language, ...geometry });
    if (width === 390 && language === "ru" || width === 1440 && language === "en") {
      await paths.screenshot({ path: `${directory}/paths-${width}-${language}.png` });
      await page.locator(".hero").screenshot({ path: `${directory}/hero-${width}-${language}.png` });
    }
    if (width === 360 && language === "ru") await page.locator(".hero").screenshot({ path: `${directory}/hero-short-ru.png` });
    // The native route must select its intended catalog category, not merely scroll.
    await page.locator('.coffee-path[href="menu.html#hot-coffee"]').click();
    await page.locator('#menu-root[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#menu-category-nav [data-category="hot-coffee"]').getAttribute("aria-pressed"), "true");
    if (width === 390 || width === 1440) {
      const product = page.locator(`[data-product-id="${drinkId}"] .full-menu-item-media`);
      await activate(page, product);
      await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
      assert.equal(await page.locator('.menu-pairing-option:not([hidden])').count(), 4, "three desserts and drink-only");
      assert.equal(await page.locator('input[name="menu-dessert"][value=""]').isChecked(), true, "no paid addition by default");
      const toggle = page.locator(".menu-pairing-expand");
      await activate(page, toggle);
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator('.menu-pairing-option:not([hidden])').count(), 13, "all twelve desserts remain available");
      const lotus = page.locator(`input[name="menu-dessert"][value="${dessertId}"]`);
      await tabTo(page, page.locator('input[name="menu-dessert"][value=""]'));
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(lotus).toBeChecked();
      await expect(lotus).toBeFocused();
      assert.equal(await lotus.locator("..").evaluate(node => getComputedStyle(node).outlineStyle !== "none"), true, "dessert keyboard focus is visible");
      await activate(page, toggle);
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await lotus.locator("..").isVisible(), true, "collapsed list retains the explicitly chosen dessert");
      assert.equal(await lotus.isChecked(), true);
      assert.equal(await page.locator('.menu-pairing-option:not([hidden])').count(), 4);
      assert.equal(money(await page.locator("#menu-add-to-cart").textContent()), unitTotal);
      if (language === "ru") await page.locator("#menu-product-dialog").screenshot({ path: `${directory}/pairing-${width}-ru.png` });
      await activate(page, page.locator("#menu-quantity-increase"));
      assert.equal(await page.locator("#menu-product-quantity").textContent(), "2");
      assert.equal(money(await page.locator("#menu-add-to-cart").textContent()), unitTotal * 2);
      await activate(page, page.locator("#menu-add-to-cart"));
      await page.locator("#menu-cart-dialog[open]").waitFor();
      assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), unitTotal * 2);
      const row = page.locator(".menu-cart-line");
      await expect(row).toHaveCount(1);
      // Cart editing must update both members of the pair and the complete sum.
      await activate(page, row.locator(".menu-cart-step").last());
      assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), unitTotal * 3);
      await activate(page, row.locator(".menu-cart-step").first());
      assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), unitTotal * 2);
      const committed = await draft(page);
      assert.deepEqual(committedLines(committed), [[dessertId, 2], [drinkId, 2]].sort());
      assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0, "adding does not silently open checkout");
      assert.match(await page.locator("#menu-checkout-trigger").textContent(), /QR/);
      await activate(page, page.locator("#menu-checkout-trigger"));
      await page.locator(".order-checkout-dialog[open]").waitFor();
      assert.equal(money(await page.locator(".order-ticket-total").textContent()), unitTotal * 2);
      assert.equal(await page.locator(".order-ticket-qr").count(), 1);
      await expect(page.locator(".order-ticket-qr")).toBeVisible();
      await expect(page.locator(".order-ticket-qr")).toHaveAccessibleName(/\S/);
      await expect(page.locator(".order-checkout-close")).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator(".order-checkout-actions button")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.locator(".order-checkout-close")).toBeFocused();
      if (language === "ru") await page.locator(".order-checkout-dialog").screenshot({ path: `${directory}/qr-${width}-ru.png` });
      await page.keyboard.press("Escape");
      await expect(page.locator(".order-checkout-dialog")).toBeHidden();
      assert.equal(await page.locator("#menu-checkout-trigger").evaluate(node => node === document.activeElement), true);
      if (language === "ru") await page.locator("#menu-cart-dialog").screenshot({ path: `${directory}/cart-${width}-ru.png` });
      assert.deepEqual(await draft(page), committed, "opening/closing QR preserves every committed position");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('#menu-root[data-ready="true"]').waitFor();
      assert.deepEqual(await draft(page), committed, "reload preserves both pair members and quantity");
      await activate(page, page.locator("#menu-cart-trigger"));
      await expect(row).toHaveCount(1);
      assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), unitTotal * 2);
      await activate(page, page.locator("#menu-checkout-trigger"));
      await page.locator(".order-checkout-dialog[open]").waitFor();
      assert.equal(money(await page.locator(".order-ticket-total").textContent()), unitTotal * 2);
      await expect(page.locator(".order-ticket-qr")).toBeVisible();
      assert.deepEqual(errors, [], `${width}/${language}: complete order has no application exceptions`);
      report.checks.push({ type: "pair-to-QR", width, height, language, total: unitTotal * 2,
        noAutomaticAddition: true, expandedChoices: 12, focusRestored: true, keyboardOnlyOrder: true,
        cartIncreaseDecrease: true, reloadPreserves: true, restoredOrderReachesQR: true, lines: committed.lines });
    }
    await context.tracing.stop();
    await context.close();
    console.log(`PASS: ${browserName} ${width}x${height} ${language}${width === 390 || width === 1440 ? " keyboard order, reload and QR" : " landing and menu route"}`);
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  activeContext = noJs;
  const fallback = await noJs.newPage();
  activePage = fallback;
  await fallback.goto(`${base}index.html?entry=off`);
  assert.equal(await fallback.locator(".coffee-path").count(), 3);
  assert.equal(await fallback.locator(".hero-order-note").isVisible(), true);
  assert.equal(await fallback.locator('.hero-actions a[href="menu.html"]').isVisible(), true);
  report.checks.push({ type: "no-JS", links: 3, menuFallback: true });
  await noJs.close();
  const pairingContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  activeContext = pairingContext;
  await pairingContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const pairingChecks = [];
  await verifyMenuCustomPairing(pairingContext, base, (id, passed, message, evidence) => {
    pairingChecks.push({ id, passed, message, evidence });
    report.checks.push({ type: "pairing-regression", id, passed, message });
    if (passed) console.log(`PASS: ${browserName} ${id}: ${message}`);
    if (!passed) console.error(message, evidence);
  }, { directory: `${directory}/custom-pairing` });
  writeFileSync(`${directory}/pairing-report.json`, JSON.stringify(pairingChecks, null, 2) + "\n");
  await pairingContext.tracing.stop(pairingChecks.some(check => !check.passed) ? { path: `${directory}/pairing-failure-trace.zip` } : {});
  await pairingContext.close();
  assert.equal(pairingChecks.filter(check => !check.passed).length, 0, "existing pairing regression scenarios must pass");
  assert.equal(sourceHead(), report.sourceHead, "source commit must stay fixed during the run");
  assert.equal(sha256("integrity-manifest.json"), report.integritySha256, "protected runtime bytes must stay fixed during the run");
  for (const [file, digest] of Object.entries(report.testDefinitions)) assert.equal(sha256(file), digest, `${file}: tested definitions must stay fixed`);
  report.status = "PASS";
  console.log(`PASS: ${report.checks.length} ${browserName} choice-funnel scenarios`);
} catch (error) {
  report.status = "FAIL";
  report.error = String(error?.stack ?? error);
  await activePage?.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  await activeContext?.tracing.stop({ path: `${directory}/failure-trace.zip` }).catch(() => {});
  throw error;
} finally {
  report.finalHead = sourceHead();
  report.completedAt = new Date().toISOString();
  writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  server.kill();
}
