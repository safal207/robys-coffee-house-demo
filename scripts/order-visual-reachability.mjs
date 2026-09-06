import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { captureDocumentRegion } from './capture-document-region.mjs';

const out = process.env.ORDER_VISUAL_RESULTS_DIR || '.artifacts/order-visual';
mkdirSync(out, { recursive: true });
const report = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Document crops and independent ordinary input; enforcing CSP, blocked service workers and external network. No physical-device, deployed-site or third-party delivery claim.',
  cases: [], passed: false };
const port = 4198, base = `http://127.0.0.1:${port}/`;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const viewports = [[320,900],[360,640],[390,1000],[768,1024],[1366,768],[1440,1100]];
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Static server unavailable');
  browser = await chromium.launch({ headless: true });
  for (const [width,height] of viewports) for (const language of ['tr','en','ru']) for (const stress of [false,true]) {
    const id = `${width}x${height}-${language}-${stress?'text32-saved99':'text16-empty'}`;
    const entry = { id, passed: false };
    report.cases.push(entry);
    const touch = width < 700;
    const context = await browser.newContext({ viewport: {width,height}, isMobile: touch, hasTouch: touch,
      deviceScaleFactor: 1, reducedMotion: 'reduce', bypassCSP: false, serviceWorkers: 'block',
      locale: `${language}-${language === 'en' ? 'US' : language.toUpperCase()}`, timezoneId: 'Europe/Istanbul' });
    // External links are still activated normally; their requests are blocked in this test.
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript(({language,stress,origin}) => {
      // Test state belongs to the app's top-level document, not blocked map frames/popups.
      if (location.origin !== origin || window.top !== window) return;
      localStorage.setItem('robys-language', language);
      if (stress && !sessionStorage.getItem('robys:coffee-house:order.v2')) sessionStorage.setItem('robys:coffee-house:order.v2',
        JSON.stringify({version:2,revision:1,migrationDone:true,lines:[{id:'hot-coffee:espresso',quantity:99}]}));
    }, {language,stress,origin:new URL(base).origin});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const activate = locator => touch ? locator.tap() : locator.click();
    const prepare = async path => {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.locator('.robys-order .order-bar').waitFor({state:'visible'});
      await page.evaluate(async size => { document.documentElement.style.fontSize = size+'px'; await document.fonts.ready; }, stress ? 32 : 16);
      await frames(page);
      assert.equal(await page.evaluate(() => innerWidth), width, `${id}: expanded layout viewport`);
    };
    try {
      await prepare('discover.html');
      const card = page.locator('#pairing-card');
      await page.locator('#pairing-products img').first().waitFor({state:'visible'});
      await page.locator('#pairing-products img').evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); });
      entry.skipBefore = await page.locator('.skip-link').evaluate(node => node.getBoundingClientRect().bottom);
      assert.ok(entry.skipBefore <= 0, `${id}: unfocused skip link visible`);
      if (language === 'tr' && !stress) {
        await card.screenshot({path:`${out}/${id}-locator.png`});
        await captureDocumentRegion(page, card, `${out}/${id}-document.png`);
        await page.screenshot({path:`${out}/${id}-viewport.png`});
      }
      const mark = page.locator('#mark-discovered');
      await activate(mark);
      assert.equal(await mark.isDisabled(), true, `${id}: mark did not commit`);
      assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('robys-discovery-pairs') || '[]').length > 0));
      const menuLink = page.locator('#pairing-menu-link');
      const destination = await menuLink.getAttribute('href');
      await activate(menuLink);
      await page.waitForURL(url => url.pathname.endsWith('/menu.html'));
      assert.equal(new URL(page.url()).hash, new URL(destination, base).hash, `${id}: wrong category navigation`);
      await page.locator('.full-menu-item--product').first().waitFor({state:'attached'});
      entry.discover = { marked: true, destination, productRows: await page.locator('.full-menu-item--product').count() };

      await prepare('index.html?entry=off');
      // The last category is where the old locator crop showed the order bar.
      const category = page.locator('.menu-card-link').last();
      const categoryDestination = await category.getAttribute('href');
      await activate(category);
      await page.waitForURL(url => url.pathname.endsWith('/menu.html'));
      assert.equal(new URL(page.url()).hash, new URL(categoryDestination, base).hash);
      await page.locator('.full-menu-item--product').first().waitFor({state:'attached'});
      entry.menuPreview = { ordinaryNavigation: true, destination: categoryDestination };
      await prepare('index.html?entry=off');
      entry.visit = [];
      for (const selector of ['.visit-actions a', '.map-live-action']) {
        const action = page.locator(selector).first();
        const visitPopup = page.waitForEvent('popup');
        await activate(action);
        const opened = await visitPopup;
        await opened.close();
        entry.visit.push({ selector, ordinaryActivation: true, externalRequestBlocked: true });
      }
      const offer = page.locator('#daily-offer:not([hidden])');
      await offer.waitFor({state:'visible'});
      assert.equal((await offer.locator('.social-offer-price').innerText()).trim(), '340 ₺');
      const social = offer.locator('.social-offer-button');
      assert.equal(await social.getAttribute('href'), 'https://www.instagram.com/robyscoffeehouse/');
      const popupPromise = page.waitForEvent('popup');
      await activate(social);
      const popup = await popupPromise;
      await popup.close();
      entry.social = { price: '340 ₺', ordinaryActivation: true, externalRequestBlocked: true };
      await page.screenshot({path:`${out}/${id}-social-viewport.png`});
      assert.deepEqual(errors, [], `${id}: page error`);
      entry.passed = true;
    } catch (error) {
      entry.error = String(error.stack || error);
      await page.screenshot({path:`${out}/${id}-failure.png`}).catch(() => {});
    } finally { await context.close(); }
  }
  report.passed = report.cases.length === 36 && report.cases.every(entry => entry.passed);
  assert.ok(report.passed, 'Order visual reachability failed');
} catch (error) { report.error = String(error.stack || error); process.exitCode = 1; }
finally {
  await browser?.close(); server.kill();
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({passed:report.passed,checks:report.cases.length,failures:report.cases.filter(entry=>!entry.passed)},null,2));
}
