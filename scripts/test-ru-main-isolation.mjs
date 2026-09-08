/** Main-isolation browser proof: RU landing -> menu -> hot coffee -> quantity 2 -> cart total.
 * This proves a local HTTP guest path and arithmetic only; it does not submit an order.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = await realpath(process.cwd());
const out = path.resolve(process.env.RU_MAIN_ISOLATION_OUTPUT || 'visual-results/ru-main-isolation');
const digest = data => createHash('sha256').update(data).digest('hex');
const mime = name => ({'.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.js':'text/javascript','.json':'application/json'}[path.extname(name)] || 'application/octet-stream');
await mkdir(out, {recursive:true});

const report = {
  sourceSha: process.env.RU_QA_SOURCE_SHA || null,
  scope: 'Local HTTP RU landing -> existing main menu -> two hot coffees -> cart arithmetic; no order submission',
  checks: {},
  evidence: {}
};

const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    assert(pathname.startsWith('/robys-coffee-house-demo/'));
    const relative = pathname.slice('/robys-coffee-house-demo/'.length) || 'index.html';
    const file = await realpath(path.resolve(root, relative));
    assert(file === root || file.startsWith(root + path.sep));
    const bytes = await readFile(file);
    res.writeHead(200, {'Content-Type':mime(file),'Cache-Control':'no-store'});
    res.end(bytes);
  } catch {
    res.writeHead(404, {'Content-Type':'text/plain'});
    res.end('Not found');
  }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}/robys-coffee-house-demo/`;
let browser;
try {
  browser = await chromium.launch({headless:true});
  report.browser = browser.version();
  const context = await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(() => {
    try { localStorage.setItem('robys-language','ru'); } catch {}
    try { sessionStorage.clear(); } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));

  const landingResponse = await page.goto(base + 'ru/coffee-gazipasa.html', {waitUntil:'load'});
  assert.equal(landingResponse?.status(), 200);
  assert.equal(digest(await landingResponse.body()), digest(await readFile(path.join(root,'ru/coffee-gazipasa.html'))));
  report.checks.ruLandingHttpIdentity = true;
  assert(await page.locator('.main-nav a[href="../menu.html"]').isVisible());
  assert(await page.locator('.hero-actions .button-primary').isVisible());
  report.checks.ruActionsVisible = true;
  await page.screenshot({path:path.join(out,'01-ru-landing.png'),fullPage:true});

  const menuURL = base + 'menu.html';
  const [menuResponse] = await Promise.all([
    page.waitForResponse(response => response.url() === menuURL && response.request().isNavigationRequest() && response.frame() === page.mainFrame()),
    page.waitForURL(menuURL, {waitUntil:'domcontentloaded'}),
    page.locator('.hero-actions .button-primary').click()
  ]);
  assert.equal(menuResponse.status(), 200);
  assert.equal(digest(await menuResponse.body()), digest(await readFile(path.join(root,'menu.html'))));
  report.checks.realLandingToMenuDelivery = true;

  await page.waitForSelector('#menu-root[data-ready="true"]', {state:'attached',timeout:10000});
  const overlay = page.locator('.robys-takeaway-entry');
  if (await overlay.count()) {
    try {
      if (await overlay.isVisible({timeout:300})) await overlay.click({position:{x:20,y:20},timeout:2000});
    } catch {}
  }
  await page.waitForFunction(() => !document.querySelector('.robys-takeaway-entry'), null, {timeout:5000}).catch(() => {});
  await page.waitForSelector('#hot-coffee [data-product-id] .full-menu-item-media', {state:'visible',timeout:10000});
  report.checks.mainMenuRendered = true;

  const coffee = page.locator('#hot-coffee [data-product-id]').first();
  const productId = await coffee.getAttribute('data-product-id');
  assert(productId?.startsWith('hot-coffee:'));
  const rowPriceText = await coffee.locator('.full-menu-price').innerText();
  const numberFrom = value => {
    const groups = value.match(/\d+(?:[\s\u00a0\u202f.,]\d+)*/g) ?? [];
    const raw = groups.at(-1) ?? '';
    return Number(raw.replace(/[^\d]/g,''));
  };
  const unitPrice = numberFrom(rowPriceText);
  assert(Number.isFinite(unitPrice) && unitPrice > 0);
  report.evidence.productId = productId;
  report.evidence.unitPriceTry = unitPrice;

  await coffee.locator('.full-menu-item-media').click();
  const productDialog = page.locator('#menu-product-dialog');
  await productDialog.waitFor({state:'visible'});
  const dialogPrice = numberFrom(await page.locator('#menu-product-price').innerText());
  assert.equal(dialogPrice, unitPrice);
  report.checks.productPriceMatchesCatalogRow = true;

  await page.locator('#menu-quantity-increase').click();
  await page.locator('#menu-product-quantity').waitFor({state:'visible'});
  assert.equal((await page.locator('#menu-product-quantity').innerText()).trim(), '2');
  const expectedTotal = unitPrice * 2;
  assert.equal(numberFrom(await page.locator('#menu-add-to-cart').innerText()), expectedTotal);
  report.checks.quantityTwoPreviewTotal = true;

  await page.locator('#menu-add-to-cart').click();
  await page.waitForFunction(expected => document.querySelector('#menu-cart-count')?.textContent?.trim() === String(expected), 2);
  assert.equal(numberFrom(await page.locator('#menu-cart-total').innerText()), expectedTotal);
  report.checks.cartTriggerQuantityAndTotal = true;

  await page.locator('#menu-cart-trigger').click();
  const cartDialog = page.locator('#menu-cart-dialog');
  await cartDialog.waitFor({state:'visible'});
  assert.equal(await page.locator('#menu-cart-lines .menu-cart-line').count(), 1);
  assert.equal(numberFrom(await page.locator('#menu-cart-lines .menu-cart-line-total').innerText()), expectedTotal);
  assert.equal(numberFrom(await page.locator('#menu-cart-dialog-total').innerText()), expectedTotal);
  report.checks.cartLineAndGrandTotal = true;
  report.evidence.expectedTotalTry = expectedTotal;
  report.evidence.cartCount = 2;
  await page.screenshot({path:path.join(out,'02-menu-cart.png'),fullPage:true});

  assert.equal(errors.length, 0, `Browser errors: ${errors.join(' | ')}`);
  report.checks.noBrowserErrors = true;
  report.passed = Object.values(report.checks).every(Boolean);
  await context.close();
} catch (error) {
  report.error = String(error);
  report.passed = false;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(out,'journey-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
