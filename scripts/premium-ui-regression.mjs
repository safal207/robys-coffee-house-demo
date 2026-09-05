import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

export async function menuGeometry(page) {
  return page.locator('.full-menu-item--product').evaluateAll(rows => rows.map(row => {
    const media = row.querySelector('.full-menu-item-media').getBoundingClientRect();
    const details = row.querySelector('.full-menu-item-details').getBoundingClientRect();
    const price = row.querySelector('.full-menu-price').getBoundingClientRect();
    const overlap = rect => Math.min(media.right, rect.right) - Math.max(media.left, rect.left);
    return {name: row.querySelector('strong').textContent, width: media.width,
      height: media.height, overlap: overlap(details), priceOverlap: overlap(price)};
  }));
}

export async function verifyGeometry(page, label) {
  // A mobile emulation resize may settle the layout viewport on the next frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rows = await menuGeometry(page);
  assert.ok(rows.length >= 50, `${label}: product-photo fixture did not render`);
  const failures = rows.filter(row => row.overlap > .5 || row.priceOverlap > .5 ||
    Math.abs(row.width - row.height) > 1 || row.width < 44);
  assert.deepEqual(failures, [], `${label}: photos must be square, bounded and clear of copy/price`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${label}: horizontal overflow ${overflow}px`);
  return {label, products: rows.length, overlapFailures: failures.length, overflow};
}

export async function verifyOrder(page, label) {
  const product = page.locator('.full-menu-item--product').first();
  const unitPrice = Number((await product.locator('.full-menu-price').innerText()).replace(/\D/g, ''));
  const photo = product.locator('button');
  await photo.click();
  const dialog = page.locator('#menu-product-dialog');
  await dialog.waitFor({state:'visible'});
  await page.locator('#menu-quantity-increase').click();
  assert.equal((await page.locator('#menu-product-quantity').innerText()).trim(), '2');
  await page.locator('#menu-add-to-cart').click();
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await photo.evaluate(node => document.activeElement === node), true, `${label}: focus restored`);
  assert.equal(Number(await page.locator('#menu-cart-count').innerText()), 2);
  await page.locator('#menu-cart-trigger').click();
  const cart = page.locator('#menu-cart-dialog');
  await cart.waitFor({state:'visible'});
  assert.equal(Number((await page.locator('#menu-cart-dialog-total').innerText()).replace(/\D/g, '')), unitPrice * 2);
  const increase = cart.locator('.menu-cart-step').last();
  await increase.click();
  assert.equal(Number((await page.locator('#menu-cart-dialog-total').innerText()).replace(/\D/g, '')), unitPrice * 3);
  assert.equal(await cart.locator('.menu-cart-step').last().evaluate(node => document.activeElement === node), true);
  // announceCart deliberately writes on the next animation frame so repeated
  // announcements are exposed to assistive technology; wait for its observable result.
  await page.waitForFunction(() => document.querySelector(
    '#menu-cart-dialog [data-menu-cart-status]')?.textContent.includes('3'), null, {timeout:2000});
  assert.ok((await cart.locator('[data-menu-cart-status]').innerText()).includes('3'), `${label}: in-dialog announcement`);
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const target = await cart.locator('.menu-cart-step').first().boundingBox();
  assert.ok(target.width >= 44 && target.height >= 44, `${label}: quantity target >=44px ${JSON.stringify(target)}`);
  await cart.locator('.menu-cart-remove').click();
  assert.equal(Number((await page.locator('#menu-cart-dialog-total').innerText()).replace(/\D/g, '')), 0);
  await page.keyboard.press('Escape');
  assert.equal(await cart.isVisible(), false);
  assert.equal(await page.locator('body').evaluate(node => node.classList.contains('menu-dialog-open')), false);
  return {label, unitPrice, added:2, increased:3, emptyTotal:0, focusRestored:true};
}

async function main() {
  const out = resolve(process.env.PREMIUM_RESULTS_DIR ?? '.artifacts/premium-ui');
  mkdirSync(out, {recursive:true});
  const base = `http://127.0.0.1:${Number(process.env.PREMIUM_PORT ?? 4193)}/`;
  const report = {mode:'real navigation, production HTML/CSS/CSP', head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), checks:[], failures:[]};
  const server = spawn('python3',['-m','http.server',String(new URL(base).port),'--bind','127.0.0.1'],{stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
    browser = await chromium.launch({headless:true});
    for(const language of ['tr','en','ru']) {
      const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce',serviceWorkers:'block'});
      const page = await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${base}menu.html?entry=off`, {waitUntil:'networkidle'});
      await page.locator(`[data-lang="${language}"]`).click();
      for(const width of [320,360,390,768,1440]) for(const fontSize of [16,32]) {
        await page.setViewportSize({width,height:844});
        // Inline CSSOM mirrors browser text enlargement without disabling CSP.
        await page.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,fontSize);
        report.checks.push(await verifyGeometry(page,`${language}/${width}px/${fontSize===32?'200%':'100%'} text`));
      }
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>document.documentElement.style.fontSize='16px');
      await page.locator('#herbal-tea').scrollIntoViewIfNeeded();
      await page.locator('#herbal-tea img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
      await page.locator('#herbal-tea').screenshot({path:`${out}/herbal-${language}-390.png`});
      report.checks.push(await verifyOrder(page,`${language}/cart`));
      const photo = page.locator('.full-menu-item--product .full-menu-item-media').first();
      await photo.focus();
      assert.equal(await photo.evaluate(node=>getComputedStyle(node).outlineStyle),'solid');
      assert.deepEqual(errors,[],`${language}: unhandled browser exceptions`);
      await context.close();
    }
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference',serviceWorkers:'block'});
    const page = await context.newPage();
    await page.goto(`${base}index.html?entry=off`,{waitUntil:'domcontentloaded'});
    await page.locator('.hero-actions a[href="menu.html"]').waitFor({state:'visible'});
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.hero-content').evaluate(async node => {
      await Promise.all(node.getAnimations({subtree:true})
        .filter(a => Number.isFinite(a.effect.getComputedTiming().endTime))
        .map(a => a.finished.catch(() => {})));
    });
    await page.screenshot({path:`${out}/home-390.png`});
    await page.locator('.hero-actions a[href="menu.html"]').click();
    await page.waitForURL('**/menu.html');
    await page.locator('.full-menu-item--product').first().waitFor();
    const control = page.locator('#menu-cart-trigger');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    // Use actionability/stability checks after fonts settle, not stale raw coordinates.
    await control.click({trial:true});
    await control.hover();
    await page.mouse.down();
    await page.waitForTimeout(220);
    const pressed = await control.evaluate(node => ({active:node.matches(':active'),
      transform:getComputedStyle(node).transform, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}));
    await page.screenshot({path:`${out}/pressed-cart-390.png`});
    assert.equal(pressed.active,true,`physical pointer must press the intended control: ${JSON.stringify(pressed)}`);
    assert.notEqual(pressed.transform,'none',`press must visibly respond: ${JSON.stringify(pressed)}`);
    await page.mouse.move(0,0);await page.mouse.up();
    await page.emulateMedia({reducedMotion:'reduce'});
    await control.focus();
    const reduced = await control.evaluate(node => ({durations:getComputedStyle(node).transitionDuration,
      transform:getComputedStyle(node).transform, animation:getComputedStyle(node).animationName}));
    // The pre-existing global reduced-motion rule uses a sub-frame .01ms duration.
    assert.ok(reduced.durations.split(',').every(value => parseFloat(value) <= .00001),JSON.stringify(reduced));
    assert.equal(reduced.transform,'none');
    assert.equal(reduced.animation,'none');
    report.checks.push({label:'mobile direct-menu navigation, pressed feedback and reduced motion',passed:true});
    await page.goto(`${base}smart-choice/`,{waitUntil:'networkidle'});
    await page.locator('[data-lang="en"]').click();
    await page.locator('.primary-button').first().click();
    for(const choice of ['Coffee','Hot','Sweet','One','250']) {
      await page.locator('.option-button').filter({hasText:choice}).first().click();
      assert.equal(await page.locator('.option-button[aria-pressed="true"]').count(),1);
      await page.locator('.primary-button').click();
    }
    assert.ok((await page.locator('#smart-choice-app').innerText()).includes('Caramel Latte'));
    await page.screenshot({path:`${out}/smart-choice-390.png`});
    report.checks.push({label:'Smart Choice five selections → Caramel Latte',passed:true});
    await context.close();
  } catch(error) {
    report.failures.push(error.stack ?? String(error)); process.exitCode=1;
  } finally {
    await browser?.close();server.kill();
    writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
