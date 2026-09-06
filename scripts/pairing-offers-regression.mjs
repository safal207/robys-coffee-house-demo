import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = process.cwd();
const out = resolve(process.env.PAIRING_EVIDENCE ?? '.artifacts/pairings');
await mkdir(out, { recursive: true });
const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff' };
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type':types[extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(bytes);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = { source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  scope:'Full checked-out site in Chromium; ordinary clicks/taps; CSP enforced; SW blocked for deterministic CSS. Not physical-device or deployed-site verification.',
  startedAt:new Date().toISOString(), cases:[], negativeControl:null, passed:false };
const browser = await chromium.launch({headless:true});
const money = text => Number(text.replace(/[^0-9]/g,''));
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function open(page, lang, font) {
  await page.goto(base+'/menu.html?entry=off#pairing-offers', {waitUntil:'domcontentloaded'});
  await page.locator('#pairing-offers [data-pairing]').nth(1).waitFor({state:'attached'});
  await page.locator(`[data-lang="${lang}"]`).click();
  await page.evaluate(size => {document.documentElement.style.fontSize = size+'px';}, font);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}
async function measure(row) {
  await row.locator('.full-menu-item-media').scrollIntoViewIfNeeded();
  await row.locator('img').evaluate(img => img.decode());
  return row.evaluate(card => {
    const media = card.querySelector('.full-menu-item-media'), image = media.querySelector('img');
    const details = card.querySelector('.full-menu-item-details'), price = card.querySelector('.full-menu-price');
    const box = node => {const b=node.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right};};
    const s=getComputedStyle(image);
    return {id:card.dataset.pairing, media:box(media), details:box(details), price:box(price),
      fit:s.objectFit, transform:s.transform, filter:s.filter, detailsDisplay:getComputedStyle(details).display,
      imageWidth:image.naturalWidth,imageHeight:image.naturalHeight,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      priceText:price.textContent, overlay:card.querySelectorAll('.pairing-poster-overlay').length};
  });
}
try {
  if (process.env.PAIRING_BASE_REF) {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,bypassCSP:false,serviceWorkers:'block'});
    for (const path of ['pairing-posters.css','pairing-posters.js']) {
      const body = execFileSync('git',['show',`${process.env.PAIRING_BASE_REF}:${path}`],{encoding:'utf8'});
      await context.route(`**/${path}*`, route => route.fulfill({status:200,contentType:types[extname(path)],body}));
    }
    const page=await context.newPage(); await open(page,'tr',16);
    await page.locator('.pairing-poster-overlay').first().waitFor({state:'attached'});
    const observation=await measure(page.locator('#pairing-offers [data-pairing]').first());
    const detected=observation.transform!=='none' && observation.detailsDisplay==='none';
    await page.locator('#pairing-offers').screenshot({path:out+'/before-390-tr.png'});
    report.negativeControl={detected,observation,scope:'Original poster JS/CSS served over unchanged base styles; no production changes.'};
    assert.ok(detected,'Original cropping/hidden-copy defect was not detected'); await context.close();
  }
  for (const width of [320,390,768,1440]) for (const lang of ['tr','en','ru']) for (const font of [16,32]) {
    const id=`${width}-${lang}-${font}`, height=width===320?568:width>=768?1000:844;
    const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768,
      reducedMotion:font===32?'reduce':'no-preference',bypassCSP:false,serviceWorkers:'block'});
    const page=await context.newPage(), errors=[], result={id,width,height,lang,font,passed:false,geometry:[]};
    page.setDefaultTimeout(12000); page.on('pageerror',e=>errors.push(e.message));
    try {
      await open(page,lang,font);
      assert.equal(await page.locator('#menu-root > section').count(),1,'Direct hash must select only pairings');
      assert.equal(await page.locator('#pairing-offers .pairing-view-set').count(),2,'Two explicit controls');
      for (const [i,expectedPrice] of [290,370].entries()) {
        const row=page.locator('#pairing-offers [data-pairing]').nth(i);
        const geometry=await measure(row); result.geometry.push(geometry);
        assert.equal(geometry.fit,'contain',id); assert.equal(geometry.transform,'none',id); assert.equal(geometry.filter,'none',id);
        assert.notEqual(geometry.detailsDisplay,'none',id); assert.equal(geometry.overlay,0,id);
        assert.ok(geometry.details.y>=geometry.media.bottom-1,`${id}: copy overlaps photo`);
        assert.ok(geometry.overflow<=1,`${id}: horizontal overflow`);
        assert.ok(geometry.imageWidth>=geometry.media.w,`${id}: source upscaled`);
        assert.equal(money(geometry.priceText),expectedPrice,`${id}: catalogue price changed`);
        const action=row.locator('.pairing-view-set');
        const size=await action.boundingBox(); assert.ok(size.height>=44,`${id}: touch target`);
        await action.scrollIntoViewIfNeeded(); await settle(page);
        if (width<768) await action.tap(); else await action.click();
        await page.locator('#menu-product-dialog').waitFor({state:'visible'});
        assert.equal(money(await page.locator('#menu-product-price').innerText()),expectedPrice);
        if(i===0) await page.locator('#menu-quantity-increase').click();
        await page.locator('#menu-add-to-cart').click();
        await page.locator('#menu-product-dialog').waitFor({state:'hidden'});
        assert.ok(await action.evaluate(node=>node===document.activeElement),`${id}: return focus`);
      }
      await page.locator('#robys-order-trigger').filter({hasText:/3/}).click();
      await page.locator('#robys-order-dialog').waitFor({state:'visible'});
      assert.equal(await page.locator('#robys-order-dialog .order-line').count(),2);
      assert.equal(money(await page.locator('#robys-order-dialog .order-total').innerText()),950);
      await page.keyboard.press('Escape'); await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#robys-order-trigger').filter({hasText:/3/}).click();
      assert.equal(money(await page.locator('#robys-order-dialog .order-total').innerText()),950);
      await page.keyboard.press('Escape');
      await page.evaluate(size=>{document.documentElement.style.fontSize=size+'px';},font);
      await page.locator('#pairing-offers .pairing-view-set').nth(1).waitFor({state:'attached'});
      if(width===390||width===1440&&lang==='en'&&font===16) {
        await page.locator('#pairing-offers').screenshot({path:out+`/after-${id}.png`});
      }
      assert.deepEqual(errors,[],`${id}: runtime errors`); result.total=950; result.passed=true;
    } catch(error) {
      result.error=String(error.stack??error);
      await page.screenshot({path:out+`/failure-${id}.png`}).catch(()=>{});
    } finally {report.cases.push(result);await context.close();}
  }
  report.passed=report.cases.length===24&&report.cases.every(x=>x.passed);
} finally {
  await browser.close(); await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,failed:report.cases.filter(x=>!x.passed).map(x=>({id:x.id,error:x.error})),negativeControl:report.negativeControl?.detected},null,2));
  if(!report.passed)process.exitCode=1;
}
