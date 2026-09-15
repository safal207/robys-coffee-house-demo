import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });
const report = [];

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4173/menu.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-category-nav[data-ready="true"]', { state: 'attached' });
  const before = await page.evaluate(() => ({
    kiosk: document.body.classList.contains('menu-kiosk-rail-visible'),
    opacity: getComputedStyle(document.querySelector('#menu-category-nav')).opacity
  }));
  if (before.kiosk || before.opacity !== '0') throw new Error('rail must stay hidden over hero');
  await page.locator('.menu-controls').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const during = await page.evaluate(() => {
    const nav = document.querySelector('#menu-category-nav');
    const buttons = [...nav.querySelectorAll('.menu-category-chip')];
    const r = nav.getBoundingClientRect();
    return {
      kiosk: document.body.classList.contains('menu-kiosk-rail-visible'),
      opacity: getComputedStyle(nav).opacity,
      position: getComputedStyle(nav).position,
      rect: { x:r.x, y:r.y, width:r.width, height:r.height },
      tops: buttons.slice(0,3).map(b => b.getBoundingClientRect().top)
    };
  });
  if (!during.kiosk || during.opacity !== '1' || during.position !== 'fixed') throw new Error('desktop rail not visible/fixed in menu zone');
  if (!(during.tops[1] > during.tops[0] + 30)) throw new Error('desktop categories are not vertical');
  await page.screenshot({ path:'qa-kiosk/desktop-1440-rail.png' });
  const hot = page.locator('.menu-category-chip[data-category="hot-coffee"]');
  await hot.click();
  await page.waitForTimeout(250);
  if ((await page.locator('.full-menu-panel').count()) !== 1) throw new Error('category selection must narrow right pane');
  if (!(await hot.evaluate(el => el.classList.contains('active')))) throw new Error('selected category not active');
  await page.screenshot({ path:'qa-kiosk/desktop-1440-hot.png' });
  await page.locator('.menu-share-section').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    kiosk: document.body.classList.contains('menu-kiosk-rail-visible'),
    opacity: getComputedStyle(document.querySelector('#menu-category-nav')).opacity
  }));
  if (after.kiosk || after.opacity !== '0') throw new Error('rail must hide after menu zone');
  await page.screenshot({ path:'qa-kiosk/desktop-1440-share.png' });
  report.push({ desktop:{ before, during, after } });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.goto('http://127.0.0.1:4173/menu.html', { waitUntil: 'networkidle' });
  await page.locator('.menu-controls').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const state = await page.evaluate(() => {
    const nav = document.querySelector('#menu-category-nav');
    const r = nav.getBoundingClientRect();
    return { kiosk:document.body.classList.contains('menu-kiosk-rail-visible'), x:r.x, width:r.width, opacity:getComputedStyle(nav).opacity };
  });
  if (!state.kiosk || state.opacity !== '1') throw new Error('1024 rail not active');
  await page.screenshot({ path:'qa-kiosk/tablet-1024-rail.png' });
  report.push({ tablet: state });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:4173/menu.html', { waitUntil: 'networkidle' });
  await page.locator('.menu-controls').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => {
    const nav = document.querySelector('#menu-category-nav');
    const buttons = nav.querySelectorAll('.menu-category-chip');
    const a = buttons[0].getBoundingClientRect();
    const b = buttons[1].getBoundingClientRect();
    return {
      kiosk:document.body.classList.contains('menu-kiosk-rail-visible'),
      position:getComputedStyle(nav).position,
      a:{top:a.top,left:a.left}, b:{top:b.top,left:b.left}
    };
  });
  if (mobile.kiosk || mobile.position !== 'static') throw new Error('mobile must keep horizontal rail');
  if (Math.abs(mobile.a.top-mobile.b.top) > 5 || !(mobile.b.left > mobile.a.left)) throw new Error('mobile categories not horizontal');
  await page.screenshot({ path:'qa-kiosk/mobile-390-horizontal.png' });
  report.push({ mobile });
  await page.close();
}

fs.writeFileSync('qa-kiosk/report.json', JSON.stringify(report, null, 2));
await browser.close();
