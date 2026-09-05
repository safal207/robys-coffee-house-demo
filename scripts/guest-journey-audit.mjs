import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const source = 'a2fbce66f716b1b99e924239d5dd118cf37c5eef';
const base = 'https://safal207.github.io/robys-coffee-house-demo/';
const out = '.artifacts/guest-journey-audit';
mkdirSync(out, { recursive: true });
const report = { source, diagnosticHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), startedAt: new Date().toISOString(), scope: 'Read-only public-site journey audit. Green workflow means observations collected, not product acceptance. No order, message or payment sent. Fresh sessions do not reproduce the owner device cache.', files: [], observations: [], errors: [] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ headless: true });
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bypassCSP: false, serviceWorkers: 'allow' };
async function observe(name, action) {
  try { report.observations.push({ name, ...(await action()) }); }
  catch (error) { report.errors.push({ name, error: String(error.stack) }); }
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
}
async function state(page) {
  return page.evaluate(() => ({ url: location.href, heading: document.querySelector('#smart-choice-app h1')?.textContent, selected: !!document.querySelector('.selected-card'), cartBuilders: document.querySelectorAll('.cart-builder').length, flow: sessionStorage.getItem('robys-smart-choice-session.v1'), smartCart: sessionStorage.getItem('robys-smart-choice-cart.v1'), menuCart: sessionStorage.getItem('robys-menu-order.v1') }));
}
try {
  for (const file of ['smart-choice/index.html', 'smart-choice/app-v2.js', 'smart-choice/cart-v2.js', 'menu-app.js']) {
    const response = await fetch(base + file, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const actual = hash(Buffer.from(await response.arrayBuffer()));
    report.files.push({ file, status: response.status, exactSource: actual === hash(readFileSync(file)) });
  }
  for (const language of ['tr', 'en', 'ru']) await observe(`single-item-selected-to-menu-${language}`, async () => {
    const context = await browser.newContext(mobile), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base + 'smart-choice/#welcome', { waitUntil: 'domcontentloaded' });
      await page.locator('.primary-button').first().waitFor({ state: 'visible' });
      await page.locator('[data-lang="en"]').click();
      const welcome = await state(page);
      await page.locator('.primary-button').first().click();
      for (const label of ['Coffee', 'Hot', 'Sweet', 'One', '250']) {
        await page.locator('.option-button').filter({ hasText: label }).first().click();
        await page.locator('.primary-button').click();
      }
      await page.locator('.result-card').first().waitFor();
      await page.locator(`[data-lang="${language}"]`).click();
      await page.locator('.result-card .primary-button').first().click();
      await page.locator('.selected-card').waitFor();
      await page.waitForTimeout(300);
      const selected = await state(page);
      await page.screenshot({ path: `${out}/selected-single-${language}.png` });
      await page.goto(base + 'smart-choice/#welcome', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);
      const explicitWelcome = await state(page);
      await page.goto(base + 'menu.html', { waitUntil: 'domcontentloaded' });
      await page.locator('.full-menu-item--product').first().waitFor();
      const menuCount = (await page.locator('#menu-cart-count').innerText()).trim();
      await page.screenshot({ path: `${out}/menu-after-choice-${language}.png` });
      return { welcome, selected, explicitWelcome, menuCount, pageErrors: errors, defects: { selectedWithoutCart: selected.cartBuilders === 0, recommendationNotInMenuCart: menuCount === '0', welcomeHashShowsSelected: explicitWelcome.selected } };
    } finally { await context.close(); }
  });
  await observe('native-history-forward', async () => {
    const context = await browser.newContext(mobile), page = await context.newPage();
    try {
      await page.goto(base + 'smart-choice/#welcome', { waitUntil: 'domcontentloaded' });
      await page.locator('[data-lang="en"]').click();
      await page.locator('.primary-button').first().click();
      await page.locator('.option-button').filter({ hasText: 'Coffee' }).first().click();
      await page.locator('.primary-button').click();
      const before = await state(page);
      await page.goBack(); await page.waitForTimeout(150); const back = await state(page);
      await page.goForward(); await page.waitForTimeout(150); const forward = await state(page);
      return { before, back, forward, forwardRestoresStep2: forward.heading === before.heading };
    } finally { await context.close(); }
  });
  for (const width of [390, 1440]) await observe(`pairing-image-layout-${width}`, async () => {
    const context = await browser.newContext({ ...mobile, viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 }), page = await context.newPage();
    const pages = [];
    try {
      for (const path of ['menu.html', 'discover.html']) {
        await page.goto(base + path + '?entry=off', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
        const imageInfo = await page.evaluate(async () => {
          const images = Array.from(document.images).filter(image => /sets-v1|pairing|taste-journey|menu-set/i.test(image.src));
          for (const image of images) { image.loading = 'eager'; await image.decode().catch(() => {}); }
          return images.map(image => {
            const b = image.getBoundingClientRect(), s = getComputedStyle(image);
            return { src: image.src, natural: [image.naturalWidth, image.naturalHeight], displayed: [b.width, b.height], objectFit: s.objectFit, objectPosition: s.objectPosition, transform: s.transform, classes: image.className, parent: image.parentElement.className };
          });
        });
        pages.push({ path, images: imageInfo });
        await page.screenshot({ path: `${out}/${path.replace('.html', '')}-${width}.png` });
      }
      return { pages };
    } finally { await context.close(); }
  });
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ observations: report.observations.length, errors: report.errors.length, report: `${out}/report.json` }));
  if (report.errors.length) process.exitCode = 1;
}
