import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });
const out = 'qa-manual-rebase';
fs.mkdirSync(out, { recursive: true });
const report = [];

async function pageWith(viewport, locale='tr-TR') {
  const context = await browser.newContext({ viewport, locale });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return { context, page, errors };
}

async function gotoExperienceScene(page, index) {
  const max = await page.evaluate(() => {
    const el = document.querySelector('[data-cinematic-experience]');
    return Math.max(1, el.offsetHeight - innerHeight);
  });
  for (const delta of [0, -0.025, 0.025, -0.05, 0.05]) {
    const progress = Math.max(0, Math.min(1, index / 6 + delta));
    await page.evaluate(y => scrollTo(0, y), max * progress);
    await page.waitForTimeout(220);
    const current = Number(await page.locator('[data-cinematic-experience]').getAttribute('data-active-scene'));
    if (current === index) return current;
  }
  throw new Error(`Could not reach cinematic scene ${index}`);
}

// Cinematic 320x480: real cup must remain materially visible in Pair and Finale.
{
  const { context, page, errors } = await pageWith({ width: 320, height: 480 }, 'ru-RU');
  await context.addInitScript(() => localStorage.setItem('robys-language', 'ru'));
  await page.goto('http://127.0.0.1:4173/experience/', { waitUntil:'networkidle' });
  for (const scene of [5, 6]) {
    await gotoExperienceScene(page, scene);
    const state = await page.evaluate(() => {
      const img = document.querySelector('.hero-cup');
      const r = img.getBoundingClientRect();
      const ix = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left));
      const iy = Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));
      return { rect:{x:r.x,y:r.y,width:r.width,height:r.height}, visibleRatio:(ix*iy)/(r.width*r.height || 1), opacity:getComputedStyle(img).opacity };
    });
    if (state.visibleRatio < 0.62 || Number(state.opacity) < 0.9) throw new Error(`Cup not sufficiently visible on scene ${scene}: ${JSON.stringify(state)}`);
    await page.screenshot({ path:`${out}/experience-320-scene${scene}.png` });
  }
  if (errors.length) throw new Error(`Experience page errors: ${errors.join(' | ')}`);
  report.push({ experience320:'PASS' });
  await context.close();
}

// Desktop menu: kiosk rail left/right mechanics + tall cart must remain inside viewport.
{
  const { context, page, errors } = await pageWith({ width:1440, height:900 });
  await page.goto('http://127.0.0.1:4173/menu.html', { waitUntil:'networkidle' });
  await page.waitForSelector('#menu-category-nav[data-ready="true"]', { state:'attached' });
  await page.evaluate(() => document.querySelector('.full-menu-wrap')?.scrollIntoView({ block:'start' }));
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => {
    const side=document.querySelector('.menu-kiosk-sidebar');
    const content=document.querySelector('.menu-kiosk-content');
    const nav=document.querySelector('#menu-category-nav');
    const sr=side.getBoundingClientRect(), cr=content.getBoundingClientRect();
    const chips=[...nav.querySelectorAll('.menu-category-chip')];
    return { sidePosition:getComputedStyle(side).position, display:getComputedStyle(document.querySelector('.menu-kiosk-layout')).display, direction:getComputedStyle(nav).flexDirection, sideRight:sr.right, contentLeft:cr.left, tops:chips.slice(0,3).map(x=>x.getBoundingClientRect().top) };
  });
  if (layout.sidePosition!=='sticky' || layout.display!=='grid' || layout.direction!=='column' || !(layout.sideRight < layout.contentLeft) || !(layout.tops[1]>layout.tops[0]+30)) throw new Error(`Desktop kiosk invalid: ${JSON.stringify(layout)}`);
  await page.screenshot({ path:`${out}/menu-1440-kiosk-all.png` });
  await page.locator('.menu-category-chip[data-category="hot-coffee"]').click();
  await page.waitForTimeout(180);
  if ((await page.locator('.full-menu-panel').count()) !== 1) throw new Error('Kiosk category selection did not filter to one panel');
  await page.screenshot({ path:`${out}/menu-1440-kiosk-hot.png` });

  // Add several products so the cart is tall enough to reproduce the original clipping bug.
  await page.locator('.menu-category-chip[data-category="all"]').click();
  await page.waitForTimeout(120);
  for (let i=0;i<4;i++) {
    const media = page.locator('.full-menu-item-media').nth(i);
    await media.evaluate(el => el.click());
    await page.waitForTimeout(80);
    await page.locator('#menu-add-to-cart').evaluate(el => el.click());
    await page.waitForTimeout(90);
  }
  await page.locator('#menu-cart-trigger').evaluate(el => el.click());
  await page.waitForTimeout(120);
  const cart = await page.evaluate(() => {
    const dialog=document.querySelector('#menu-cart-dialog');
    const shell=dialog.querySelector('.menu-dialog-shell').getBoundingClientRect();
    const close=dialog.querySelector('.menu-dialog-close').getBoundingClientRect();
    return { open:dialog.hasAttribute('open'), shell:{x:shell.x,y:shell.y,width:shell.width,height:shell.height,bottom:shell.bottom}, close:{x:close.x,y:close.y,bottom:close.bottom}, vh:innerHeight };
  });
  if (!cart.open || cart.shell.y < 0 || cart.close.y < 0 || cart.close.bottom > cart.vh) throw new Error(`Desktop cart clips viewport: ${JSON.stringify(cart)}`);
  await page.screenshot({ path:`${out}/menu-1440-cart.png` });
  if (errors.length) throw new Error(`Menu page errors: ${errors.join(' | ')}`);
  report.push({ menuDesktop: { layout, cart } });
  await context.close();
}

// 1024 keeps kiosk rail; 390 keeps horizontal mobile chips.
for (const [label, viewport, expectKiosk] of [['tablet-1024',{width:1024,height:768},true],['mobile-390',{width:390,height:844},false]]) {
  const { context, page, errors } = await pageWith(viewport);
  await page.goto('http://127.0.0.1:4173/menu.html', { waitUntil:'networkidle' });
  await page.waitForSelector('#menu-category-nav[data-ready="true"]', { state:'attached' });
  await page.evaluate(() => document.querySelector('.full-menu-wrap')?.scrollIntoView({ block:'start' }));
  await page.waitForTimeout(180);
  const state = await page.evaluate(() => {
    const side=document.querySelector('.menu-kiosk-sidebar');
    const nav=document.querySelector('#menu-category-nav');
    const chips=nav.querySelectorAll('.menu-category-chip');
    const a=chips[0].getBoundingClientRect(), b=chips[1].getBoundingClientRect();
    return { layout:getComputedStyle(document.querySelector('.menu-kiosk-layout')).display, sidePosition:getComputedStyle(side).position, direction:getComputedStyle(nav).flexDirection, a:{top:a.top,left:a.left}, b:{top:b.top,left:b.left} };
  });
  if (expectKiosk) {
    if (state.layout!=='grid' || state.sidePosition!=='sticky' || state.direction!=='column') throw new Error(`${label} kiosk invalid: ${JSON.stringify(state)}`);
  } else {
    if (state.layout!=='block' || state.sidePosition!=='static' || state.direction!=='row' || Math.abs(state.a.top-state.b.top)>5 || !(state.b.left>state.a.left)) throw new Error(`${label} mobile rail invalid: ${JSON.stringify(state)}`);
  }
  await page.screenshot({ path:`${out}/menu-${label}.png` });
  if (errors.length) throw new Error(`${label} page errors: ${errors.join(' | ')}`);
  report.push({ [label]:state });
  await context.close();
}

// Landing fallback if Instagram is blocked + short hero capture.
{
  const { context, page, errors } = await pageWith({width:1440,height:900});
  await page.route(/instagram\.com/, route => route.abort());
  await page.goto('http://127.0.0.1:4173/', { waitUntil:'domcontentloaded' });
  await page.evaluate(() => document.querySelector('#community')?.scrollIntoView({block:'center'}));
  await page.waitForTimeout(300);
  const fallback = await page.evaluate(() => {
    const card=document.querySelector('.community-reel-card');
    return { bg:getComputedStyle(card).backgroundImage, label:getComputedStyle(card,'::after').content };
  });
  if (!fallback.bg.includes('robys-hero-poster.jpg') || !/ROBY/.test(fallback.label)) throw new Error(`Community fallback missing: ${JSON.stringify(fallback)}`);
  await page.screenshot({path:`${out}/landing-community-fallback.png`});
  report.push({ communityFallback:fallback });
  await context.close();
}
{
  const { context, page, errors } = await pageWith({width:360,height:640});
  await page.goto('http://127.0.0.1:4173/', { waitUntil:'domcontentloaded' });
  const hero = await page.evaluate(() => {
    const h=document.querySelector('.hero h1').getBoundingClientRect();
    const t=document.querySelector('.hero-text').getBoundingClientRect();
    const a=document.querySelector('.hero-actions').getBoundingClientRect();
    return {h:{top:h.top,bottom:h.bottom}, t:{top:t.top,bottom:t.bottom}, a:{top:a.top,bottom:a.bottom}, vh:innerHeight, overflow:document.documentElement.scrollWidth>innerWidth};
  });
  if (hero.overflow || hero.a.bottom > hero.vh + 2) throw new Error(`Short hero overflow: ${JSON.stringify(hero)}`);
  await page.screenshot({path:`${out}/landing-360-short.png`});
  if (errors.length) throw new Error(`Short hero page errors: ${errors.join(' | ')}`);
  report.push({ hero360:hero });
  await context.close();
}

// Smart Choice RU narrow intro typography.
{
  const { context, page, errors } = await pageWith({width:320,height:480}, 'ru-RU');
  await context.addInitScript(() => localStorage.setItem('robys-language','ru'));
  await page.goto('http://127.0.0.1:4173/smart-choice/', { waitUntil:'networkidle' });
  await page.waitForFunction(() => document.querySelector('#smart-choice-app')?.getAttribute('aria-busy') !== 'true');
  const state = await page.evaluate(() => {
    const title=document.querySelector('.smart-title');
    const r=title.getBoundingClientRect();
    return { fontSize:parseFloat(getComputedStyle(title).fontSize), rect:{x:r.x,y:r.y,width:r.width,height:r.height}, scrollWidth:document.documentElement.scrollWidth, iw:innerWidth };
  });
  if (state.fontSize > 43 || state.scrollWidth > state.iw + 1) throw new Error(`Smart Choice narrow RU typography invalid: ${JSON.stringify(state)}`);
  await page.screenshot({path:`${out}/smart-320-ru.png`});
  if (errors.length) throw new Error(`Smart Choice page errors: ${errors.join(' | ')}`);
  report.push({ smart320:state });
  await context.close();
}

fs.writeFileSync(`${out}/report.json`, JSON.stringify(report,null,2));
await browser.close();
