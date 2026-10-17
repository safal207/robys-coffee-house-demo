import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { verifyMenuCustomPairing } from "./test-menu-custom-pairing-browser.mjs";

const port = Number(process.env.CHOICE_FUNNEL_PORT ?? 4189);
const base = `http://127.0.0.1:${port}/`;
const directory = ".artifacts/choice-funnel";
mkdirSync(directory, { recursive: true });
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
const report = { baseline: "d368897", integritySha256: createHash("sha256").update(readFileSync("integrity-manifest.json")).digest("hex"), checks: [] };
let browser;
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 360, 390, 768, 1440]) for (const language of ["tr", "en", "ru"]) {
    const height = width === 360 ? 640 : 900;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(lang => localStorage.setItem("robys-language", lang), language);
    await page.goto(`${base}index.html?entry=off`, { waitUntil: "load" });
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    assert.equal(await page.locator(".hero-actions .button-primary").count(), 1);
    assert.equal(await page.locator(".hero-actions .button-primary").getAttribute("href"), "smart-choice/");
    assert.deepEqual(await page.locator(".coffee-path").evaluateAll(nodes => nodes.map(node => node.getAttribute("href"))),
      ["menu.html#hot-coffee", "menu.html#cold-coffee", "menu.html#pairing-offers"]);
    const paths = page.locator("#your-break");
    await paths.scrollIntoViewIfNeeded();
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
    if (width === 390) {
      await page.locator('[data-product-id="hot-coffee:caffe-latte"] .full-menu-item-media').click();
      await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
      assert.equal(await page.locator('.menu-pairing-option:not([hidden])').count(), 4, "three desserts and drink-only");
      assert.equal(await page.locator('input[name="menu-dessert"][value=""]').isChecked(), true, "no paid addition by default");
      const toggle = page.locator(".menu-pairing-expand");
      await toggle.focus();
      await page.keyboard.press("Enter");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator('.menu-pairing-option:not([hidden])').count(), 13, "all twelve desserts remain available");
      const lotus = page.locator('input[name="menu-dessert"][value="desserts:lotus-cheesecake"]');
      await lotus.locator("..").click();
      await toggle.click();
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await lotus.locator("..").isVisible(), true, "collapsed list retains the explicitly chosen dessert");
      assert.equal(await lotus.isChecked(), true);
      assert.equal(await page.locator('.menu-pairing-option:not([hidden])').count(), 4);
      assert.match(await page.locator("#menu-add-to-cart").textContent(), /370/);
      if (language === "ru") await page.locator("#menu-product-dialog").screenshot({ path: `${directory}/pairing-390-ru.png` });
      await page.locator("#menu-quantity-increase").click();
      assert.match(await page.locator("#menu-add-to-cart").textContent(), /740/);
      await page.locator("#menu-add-to-cart").click();
      await page.locator("#menu-cart-dialog[open]").waitFor();
      assert.match(await page.locator("#menu-cart-dialog-total").textContent(), /740/);
      assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0, "adding does not silently open checkout");
      assert.match(await page.locator("#menu-checkout-trigger").textContent(), /QR/);
      await page.locator("#menu-checkout-trigger").click();
      await page.locator(".order-checkout-dialog[open]").waitFor();
      assert.match(await page.locator(".order-ticket-total").textContent(), /740/);
      assert.equal(await page.locator(".order-ticket-qr").count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#menu-checkout-trigger").evaluate(node => node === document.activeElement), true);
      if (language === "ru") await page.locator("#menu-cart-dialog").screenshot({ path: `${directory}/cart-390-ru.png` });
      report.checks.push({ type: "pair-to-QR", width, language, total: 740, noAutomaticAddition: true, expandedChoices: 12, focusRestored: true });
    }
    await context.close();
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallback = await noJs.newPage();
  await fallback.goto(`${base}index.html?entry=off`);
  assert.equal(await fallback.locator(".coffee-path").count(), 3);
  assert.equal(await fallback.locator(".hero-order-note").isVisible(), true);
  assert.equal(await fallback.locator('.hero-actions a[href="menu.html"]').isVisible(), true);
  report.checks.push({ type: "no-JS", links: 3, menuFallback: true });
  await noJs.close();
  const pairingContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  const pairingChecks = [];
  await verifyMenuCustomPairing(pairingContext, base, (id, passed, message, evidence) => {
    pairingChecks.push({ id, passed, message, evidence });
    report.checks.push({ type: "pairing-regression", id, passed, message });
    if (!passed) console.error(message, evidence);
  });
  writeFileSync(`${directory}/pairing-report.json`, JSON.stringify(pairingChecks, null, 2) + "\n");
  await pairingContext.close();
  assert.equal(pairingChecks.filter(check => !check.passed).length, 0, "existing pairing regression scenarios must pass");
  console.log(`PASS: ${report.checks.length} choice-funnel scenarios`);
} finally {
  writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  server.kill();
}
