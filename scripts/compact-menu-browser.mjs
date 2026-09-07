import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.env.COMPACT_RESULTS_DIR ?? '.artifacts/compact-menu';
mkdirSync(out, { recursive: true });
const port = 4237, base = `http://127.0.0.1:${port}/`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const files = ['compact-menu.html', 'compact-menu.js', 'compact-menu.css', 'menu-app.js', 'order-store.js', 'order-shell.js', 'menu-catalog.js'];
const report = { passed: false, cases: [], files: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])), boundary: 'Browser evidence only; no physical Android, Telegram-client, POS delivery, order acceptance or payment claim.' };
let browser;
async function capture(page, path) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = [...document.images].filter(img => { const r = img.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    await Promise.all(visible.map(img => img.decode()));
  });
  await page.screenshot({ path });
}
async function openOrder(page, minor) {
  await page.locator('#menu-cart-trigger').click();
  await page.locator('#robys-order-dialog').waitFor({ state: 'visible' });
  const summary = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map(e => e.name).filter(name => new URL(name).pathname.endsWith('/order-store.js'));
    return (await import(urls.at(-1))).order.summary();
  });
  assert.equal(summary.totalMinor, minor);
}
async function layout(page) {
  const result = await page.evaluate(() => {
    const button = document.querySelector('#menu-cart-trigger').getBoundingClientRect();
    const dock = document.querySelector('.compact-order-dock').getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      button: { width: button.width, height: button.height, top: button.top, bottom: button.bottom },
      dock: { height: dock.height, top: dock.top, bottom: dock.bottom },
      reserved: parseFloat(getComputedStyle(document.body).paddingBottom),
      duplicateDock: [...document.querySelectorAll('.order-bar')].some(node => node.getClientRects().length > 0)
    };
  });
  assert.ok(result.overflow <= 1, `Horizontal overflow: ${JSON.stringify(result)}`);
  assert.ok(result.button.height >= 44 && result.button.width >= 44);
  assert.ok(result.reserved >= result.dock.height);
  assert.equal(result.duplicateDock, false);
  return result;
}
try {
  let ready = false;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready, 'Local server must become ready');
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const language of ['tr', 'en', 'ru']) for (const width of [320, 390, 768, 1440]) {
    const result = { language, width, passed: false }; report.cases.push(result);
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700, reducedMotion: 'reduce', serviceWorkers: 'block', bypassCSP: false });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + 'compact-menu.html');
      await page.locator(`[data-lang="${language}"]`).click();
      await page.locator('.compact-product-choice').first().waitFor();
      assert.equal(await page.locator('.compact-product-choice').count(), await page.locator('.full-menu-item--product').count());
      await capture(page, `${out}/${language}-${width}-entry.png`);
      result.layout = await layout(page);
      await page.locator('[data-category="hot-coffee"]').click();
      const espresso = page.locator('[data-product-id="hot-coffee:espresso"]');
      await espresso.locator('.compact-product-choice').waitFor();
      await capture(page, `${out}/${language}-${width}-coffee.png`);
      await espresso.locator('.compact-product-choice').focus(); await page.keyboard.press('Enter');
      await page.locator('#menu-product-dialog').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      assert.equal(await espresso.locator('.compact-product-choice').evaluate(node => node === document.activeElement), true, 'Escape returns focus to explicit choice');
      await espresso.locator('.compact-product-choice').click();
      await page.locator('#menu-quantity-increase').click();
      await page.locator('#menu-add-to-cart').click();
      await page.locator('#menu-cart-count').filter({ hasText: /^2$/ }).waitFor();
      await openOrder(page, 22000);
      await page.locator('#robys-order-handoff').click();
      await page.locator('.order-dialog--handoff').waitFor();
      assert.equal(await page.locator('.order-controls:visible').count(), 0);
      await capture(page, `${out}/${language}-${width}-barista.png`);
      await page.locator('#robys-order-edit').click();
      await page.locator('.order-step').last().click();
      await page.keyboard.press('Escape');
      await layout(page);
      await page.reload(); await page.locator('#menu-cart-count').filter({ hasText: /^3$/ }).waitFor();
      await openOrder(page, 33000); await page.keyboard.press('Escape');
      // Cross-route preservation uses the same session, never a second draft.
      await page.locator('.menu-page-back').click();
      assert.equal(new URL(page.url()).pathname, '/menu.html');
      await page.locator('#menu-cart-count').filter({ hasText: /^3$/ }).waitFor();
      await page.goto(base + 'compact-menu.html'); await openOrder(page, 33000); await page.keyboard.press('Escape');
      await page.locator('[data-category="hot-coffee"]').click();
      await page.locator('#menu-search').fill('Macaron');
      await page.locator('[data-product-id="desserts:macaron"] .compact-product-choice').waitFor();
      assert.equal(await page.locator('[data-category="all"]').getAttribute('aria-pressed'), 'true');
      await page.locator('#menu-search').fill('no-such-product-98231');
      await page.locator('#menu-empty').waitFor({ state: 'visible' });
      await page.locator('[data-category="hot-coffee"]').click();
      assert.equal(await page.locator('#menu-search').inputValue(), '');
      // Re-rendering in every supported language must not duplicate actions.
      for (const next of ['en', 'ru', 'tr', language]) await page.locator(`[data-lang="${next}"]`).click();
      await espresso.locator('.compact-product-choice').waitFor();
      assert.equal(await page.locator('.compact-product-choice').count(), await page.locator('.full-menu-item--product').count());
      await page.locator('[data-category="pairing-offers"]').click();
      assert.equal(await page.locator('.full-menu-item--visual .compact-product-choice').count(), 0);
      await page.locator('.pairing-view-set').first().click();
      await page.locator('#menu-product-dialog').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await layout(page);
      assert.deepEqual(errors, []);
      result.passed = true;
    } catch (error) { result.error = String(error.stack); await page.screenshot({ path: `${out}/${language}-${width}-failure.png` }).catch(() => {}); throw error; }
    finally { await context.close(); }
  }
  // Text-only zoom: translated dock grows; measured clearance must follow it.
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage(); await page.goto(base + 'compact-menu.html'); await page.locator('[data-lang="ru"]').click();
  await page.locator('.compact-product-choice').first().waitFor();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.body).paddingBottom) >= document.querySelector('.compact-order-dock').getBoundingClientRect().height);
  report.zoom = await layout(page); await capture(page, `${out}/ru-320-text-zoom.png`); await context.close();
  report.passed = report.cases.length === 12 && report.cases.every(c => c.passed);
} catch (error) { report.error = String(error.stack); process.exitCode = 1; }
finally { await browser?.close(); server.kill(); writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2)); }
