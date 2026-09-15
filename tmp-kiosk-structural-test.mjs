import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });
const report = [];

async function openMenu(viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto('http://127.0.0.1:4173/menu.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu-category-nav[data-ready="true"]', { state: 'attached' });
  return page;
}

{
  const page = await openMenu({ width: 1440, height: 900 });
  const topState = await page.evaluate(() => {
    const side = document.querySelector('.menu-kiosk-sidebar').getBoundingClientRect();
    return { sideTop: side.top, viewport: innerHeight };
  });
  if (!(topState.sideTop > 400)) throw new Error(`sidebar should live below hero initially: ${JSON.stringify(topState)}`);

  await page.evaluate(() => document.querySelector('.full-menu-wrap')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  const desktop = await page.evaluate(() => {
    const side = document.querySelector('.menu-kiosk-sidebar');
    const nav = document.querySelector('#menu-category-nav');
    const content = document.querySelector('.menu-kiosk-content');
    const chips = [...nav.querySelectorAll('.menu-category-chip')];
    const sr = side.getBoundingClientRect();
    const cr = content.getBoundingClientRect();
    return {
      sidePosition: getComputedStyle(side).position,
      layoutDisplay: getComputedStyle(document.querySelector('.menu-kiosk-layout')).display,
      navDirection: getComputedStyle(nav).flexDirection,
      side: { x:sr.x, y:sr.y, width:sr.width, height:sr.height },
      content: { x:cr.x, width:cr.width },
      chipTops: chips.slice(0,3).map(c => c.getBoundingClientRect().top)
    };
  });
  if (desktop.sidePosition !== 'sticky' || desktop.layoutDisplay !== 'grid' || desktop.navDirection !== 'column') throw new Error(`desktop kiosk layout invalid: ${JSON.stringify(desktop)}`);
  if (!(desktop.side.x + desktop.side.width < desktop.content.x)) throw new Error('sidebar must sit left of menu content');
  if (!(desktop.chipTops[1] > desktop.chipTops[0] + 30)) throw new Error('desktop chips must be vertical');
  await page.screenshot({ path:'qa-kiosk-structural/desktop-1440-all.png', fullPage:false });

  const hot = page.locator('.menu-category-chip[data-category="hot-coffee"]');
  await hot.click();
  await page.waitForTimeout(250);
  const hotState = {
    panels: await page.locator('.full-menu-panel').count(),
    active: await page.locator('.menu-category-chip[data-category="hot-coffee"]').evaluate(el => el.classList.contains('active'))
  };
  if (hotState.panels !== 1 || !hotState.active) throw new Error(`category filtering invalid: ${JSON.stringify(hotState)}`);
  await page.screenshot({ path:'qa-kiosk-structural/desktop-1440-hot.png', fullPage:false });
  report.push({ desktop, hotState });
  await page.close();
}

{
  const page = await openMenu({ width: 1024, height: 768 });
  await page.evaluate(() => document.querySelector('.full-menu-wrap')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  const tablet = await page.evaluate(() => {
    const side = document.querySelector('.menu-kiosk-sidebar');
    const nav = document.querySelector('#menu-category-nav');
    const s = side.getBoundingClientRect();
    const c = document.querySelector('.menu-kiosk-content').getBoundingClientRect();
    return { sidePosition:getComputedStyle(side).position, navDirection:getComputedStyle(nav).flexDirection, sideX:s.x, sideW:s.width, contentX:c.x };
  });
  if (tablet.sidePosition !== 'sticky' || tablet.navDirection !== 'column' || !(tablet.sideX + tablet.sideW < tablet.contentX)) throw new Error(`tablet kiosk invalid: ${JSON.stringify(tablet)}`);
  await page.screenshot({ path:'qa-kiosk-structural/tablet-1024.png', fullPage:false });
  report.push({ tablet });
  await page.close();
}

{
  const page = await openMenu({ width: 390, height: 844 });
  await page.evaluate(() => document.querySelector('.full-menu-wrap')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => {
    const layout = document.querySelector('.menu-kiosk-layout');
    const side = document.querySelector('.menu-kiosk-sidebar');
    const nav = document.querySelector('#menu-category-nav');
    const chips = nav.querySelectorAll('.menu-category-chip');
    const a = chips[0].getBoundingClientRect();
    const b = chips[1].getBoundingClientRect();
    return { layout:getComputedStyle(layout).display, sidePosition:getComputedStyle(side).position, navDirection:getComputedStyle(nav).flexDirection, a:{top:a.top,left:a.left}, b:{top:b.top,left:b.left} };
  });
  if (mobile.layout !== 'block' || mobile.sidePosition !== 'static' || mobile.navDirection !== 'row') throw new Error(`mobile kiosk fallback invalid: ${JSON.stringify(mobile)}`);
  if (Math.abs(mobile.a.top-mobile.b.top) > 5 || !(mobile.b.left > mobile.a.left)) throw new Error('mobile chips must stay horizontal');
  await page.screenshot({ path:'qa-kiosk-structural/mobile-390.png', fullPage:false });
  report.push({ mobile });
  await page.close();
}

fs.writeFileSync('qa-kiosk-structural/report.json', JSON.stringify(report, null, 2));
await browser.close();
