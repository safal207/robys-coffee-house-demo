import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.resolve(process.env.GUEST_GROUP_RESULTS_DIR ?? '.artifacts/guest-group-recovery');
const port = 4205;
const base = `http://127.0.0.1:${port}/`;
const digest = data => createHash('sha256').update(data).digest('hex');
mkdirSync(out, { recursive: true });
const report = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  testSha256: digest(readFileSync(new URL(import.meta.url))),
  boundary: 'Local Chromium, real UI actions, original CSP and production catalog; service workers blocked. Legacy flow is an explicit stored-state fixture. Barista view is local, not POS submission or payment.',
  files: Object.fromEntries(['smart-choice/app-v2.js', 'smart-choice/cart-v2.js', 'order-store.js', 'order-shell.js'].map(file => [file, digest(readFileSync(path.join(root, file)))])),
  cases: [], passed: false
};
const words = {
  tr: { coffee: 'Kahve', cold: 'Soğuk', neutral: 'Daha nötr', four: 'Dört kişi', low: "600 ₺'ye kadar", enough: "1.200 ₺'ye kadar" },
  en: { coffee: 'Coffee', cold: 'Cold', neutral: 'More neutral', four: 'Four', low: 'Up to 600 ₺', enough: 'Up to 1,200 ₺' },
  ru: { coffee: 'Кофе', cold: 'Холодное', neutral: 'Нейтральное', four: 'Четверо', low: 'До 600 ₺', enough: 'До 1 200 ₺' }
};
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
let browser;
async function answer(page, label) {
  await page.locator('.option-button').filter({ has: page.getByText(label, { exact: true }) }).click();
  await page.locator('.actions .primary-button').click();
}
const normalizedText = text => text.replace(/\s+/g, ' ').trim();
const priceText = (language, amount) => language === 'ru' ? `${amount} ₺` : `₺${amount}`;
async function expectPrice(locator, language, amount) {
  await locator.waitFor({ state: 'visible' });
  assert.equal(normalizedText(await locator.innerText()), priceText(language, amount));
}
async function expectTotal(page, amount, language) {
  const locator = page.locator('.order-total');
  await locator.waitFor({ state: 'visible' });
  const label = { tr: 'Toplam', en: 'Total', ru: 'Итого' }[language];
  assert.equal(normalizedText(await locator.innerText()), `${label}: ${priceText(language, amount)}`);
}
async function completeOrder(page, result, existingEspresso) {
  const amount = existingEspresso ? 830 : 720;
  const top = page.locator('.result-card--top');
  await top.locator('.component-list').filter({ hasText: '4 ×' }).waitFor({ state: 'visible' });
  assert.equal((await top.locator('.result-price').innerText()).replace(/\D/g, ''), '720');
  result.recommendation = await top.innerText();
  await top.locator('.primary-button').click();
  await page.locator('#smart-choice-add-order').click();
  await expectTotal(page, amount, result.language);
  const group = page.locator('.order-line').filter({ has: page.locator('.order-controls > span', { hasText: /^4$/ }) });
  assert.equal(await group.count(), 1, 'All four drinks must reach one order line');
  await expectPrice(group.locator('.order-line-price'), result.language, 720);
  assert.equal(await page.locator('.order-line').count(), existingEspresso ? 2 : 1);
  if (existingEspresso) await expectPrice(page.locator('.order-line').filter({ hasText: /Espresso|Эспрессо/ }).locator('.order-line-price'), result.language, 110);
  await page.locator('.order-extra button').last().click();
  await expectTotal(page, amount, result.language);
  await page.keyboard.press('Escape');
  await page.locator('#smart-choice-add-order').click();
  await expectTotal(page, amount, result.language);
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#smart-choice-add-order').click();
  await expectTotal(page, amount, result.language);
  assert.equal(await page.locator('.order-line').count(), existingEspresso ? 2 : 1);
  assert.equal(await page.locator('.order-extra').isVisible(), false, 'Declined extra must stay declined');
  await page.locator('#robys-order-handoff').click();
  await page.locator('.order-dialog--handoff .order-line strong').filter({ hasText: /^4 ×/ }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.order-controls:visible').count(), 0);
  result.barista = await page.locator('#robys-order-dialog').innerText();
  const geometry = await page.locator('#robys-order-dialog').evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth }));
  assert.ok(geometry.scroll <= geometry.client + 1, 'Four-person order must fit the viewport');
  await page.locator('#robys-order-dialog').evaluate(async node => {
    await Promise.all(node.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {})));
    await Promise.all([...node.querySelectorAll('img')].map(image => image.decode()));
  });
  await page.screenshot({ path: path.join(out, result.name + '-barista.png') });
  await page.locator('#robys-order-edit').click();
  await expectTotal(page, amount, result.language);
  assert.ok(await page.locator('.order-controls:visible').count() > 0);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    assert.equal(server.exitCode, null, 'Static server exited before readiness');
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* Wait for our server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Static server did not start');
  for (const [file, expected] of Object.entries(report.files)) {
    const response = await fetch(base + file);
    assert.equal(response.status, 200);
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), expected, `Served ${file} differs from checkout`);
  }
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  for (const [language, w] of Object.entries(words)) for (const legacy of [false, true]) {
    const result = { name: `${language}-${legacy ? 'legacy-family' : 'four-budget-recovery'}`, language, legacy, width: legacy ? 390 : 320, passed: false, pageErrors: [] };
    report.cases.push(result);
    const context = await browser.newContext({ viewport: { width: result.width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: legacy ? 'no-preference' : 'reduce', bypassCSP: false, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    page.on('pageerror', error => result.pageErrors.push(error.message));
    try {
      if (legacy) {
        await page.goto(base + 'menu.html?entry=off', { waitUntil: 'domcontentloaded' });
        await page.locator(`[data-lang="${language}"]`).click();
        await page.locator('[data-product-id="hot-coffee:espresso"] .full-menu-item-media').click();
        await page.locator('#menu-add-to-cart').click();
        // Restore a legacy no-match flow without manufacturing order contents.
        await page.evaluate(locale => sessionStorage.setItem('robys-smart-choice-session.v1', JSON.stringify({
          version: 1, screen: 'results', questionIndex: 4, locale,
          answers: { intent: 'coffee', temperature: 'cold', taste: 'neutral', partySize: 'family', budgetKey: 'open' }
        })), language);
        await page.goto(base + 'smart-choice/#results', { waitUntil: 'domcontentloaded' });
        await page.locator('#question-partySize').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.option-button[aria-pressed="true"]').count(), 0, 'Legacy family must not silently mean four guests');
        assert.equal(await page.locator('.result-card, #smart-choice-add-order').count(), 0);
        await answer(page, w.four);
        await page.locator('#question-budgetKey').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.option-button[aria-pressed="true"]').count(), 0, 'Retired Flexible budget requires an explicit current choice');
        assert.equal(await page.locator('.actions .primary-button').isDisabled(), true);
      } else {
        await page.goto(base + 'smart-choice/#welcome', { waitUntil: 'domcontentloaded' });
        await page.locator(`[data-lang="${language}"]`).click();
        await page.locator('.smart-card .primary-button').click();
        for (const label of [w.coffee, w.cold, w.neutral, w.four, w.low]) await answer(page, label);
        await page.locator('.no-match-card').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.result-card, #smart-choice-add-order').count(), 0, 'Insufficient budget cannot remove portions');
        result.insufficientBudget = await page.locator('.no-match-card').innerText();
        await page.locator('.no-match-card .primary-button').click();
        await page.locator('#question-budgetKey').waitFor({ state: 'visible' });
      }
      await answer(page, w.enough);
      await completeOrder(page, result, legacy);
      assert.deepEqual(result.pageErrors, []);
      result.passed = true;
    } catch (error) {
      result.error = String(error.stack);
      await page.screenshot({ path: path.join(out, result.name + '-failure.png'), fullPage: true }).catch(() => {});
    } finally { await context.close(); }
  }
  report.passed = report.cases.length === 6 && report.cases.every(result => result.passed);
} catch (error) { report.error = String(error.stack); }
finally {
  await browser?.close();
  server.kill();
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
