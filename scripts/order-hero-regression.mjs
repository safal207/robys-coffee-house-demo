import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = resolve(process.cwd());
const out = resolve(process.env.HERO_RESULTS_DIR || '.artifacts/order-hero');
const negative = process.argv.includes('--negative-control');
const marker = /\/\* ORDER-HERO-CLEARANCE:START \*\/[\s\S]*?\/\* ORDER-HERO-CLEARANCE:END \*\//;
const report = { source: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  scope: 'Built local site, Chromium, enforcing CSP, actual touch/mouse navigation. Service workers blocked for deterministic cold CSS. No physical-device or deployed-site claim.',
  negativeControl: negative, checks: [], passed: false };
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.mp4':'video/mp4'};
await mkdir(out, {recursive:true});
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = resolve(root, '.' + pathname);
    if (!path.startsWith(root + sep) && path !== root) { response.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    let bytes = await readFile(path);
    if (negative && path === resolve(root, 'order-shell.css')) {
      assert.match(bytes.toString('utf8'), marker);
      bytes = Buffer.from(bytes.toString('utf8').replace(marker, ''));
    }
    response.writeHead(200, {'Content-Type':mime[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    response.end(bytes);
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true});
const cases = negative ? [{width:390, height:1000, language:'tr', size:16, saved:false}] :
  [{width:320,height:1000},{width:360,height:640},{width:390,height:1000},{width:1440,height:1000}]
    .flatMap(viewport => ['tr','en','ru'].flatMap(language => [16,32].flatMap(size => [false,true].map(saved => ({...viewport,language,size,saved})))));
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  for (const config of cases) {
    const id = `${config.width}-${config.language}-${config.size}-${config.saved?'saved':'empty'}`;
    const touch = config.width < 680;
    const context = await browser.newContext({viewport:{width:config.width,height:config.height},isMobile:touch,hasTouch:touch,
      reducedMotion:config.size===32?'reduce':'no-preference',bypassCSP:false,serviceWorkers:'block'});
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.addInitScript(({language,saved}) => {
      localStorage.setItem('robys-language',language);
      if (saved && !sessionStorage.getItem('robys:coffee-house:order.v2')) sessionStorage.setItem('robys:coffee-house:order.v2',JSON.stringify({version:2,revision:1,migrationDone:true,lines:[{id:'hot-coffee:espresso',quantity:99}]}));
    },config);
    try {
      await page.goto(base+'/index.html?entry=off',{waitUntil:'load'});
      const bar = page.locator('.robys-order .order-bar');
      await bar.waitFor({state:'visible'});
      if (config.saved) await page.locator('#robys-order-trigger').waitFor({state:'visible'});
      await page.evaluate(size => {document.documentElement.style.fontSize=size+'px';},config.size);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.hero-content').evaluate(async node => {
        await Promise.all(node.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));
      });
      await frames(page);
      await page.evaluate(() => window.scrollTo({top:window.scrollY+document.querySelector('.hero').getBoundingClientRect().bottom-window.innerHeight,behavior:'instant'}));
      await frames(page);
      const geometry = await page.evaluate(() => {
        const link = document.querySelector('.hero-actions a[href="menu.html"]');
        const bar = document.querySelector('.robys-order .order-bar');
        if (!link || !bar) throw new Error('Required CTA or order entry missing');
        const rect = element => {const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        const a = rect(link), b = rect(bar);
        const hit = document.elementFromPoint((a.left+a.right)/2,(a.top+a.bottom)/2);
        return {link:a,bar:b,gap:b.top-a.bottom,hit:!!hit&&(hit===link||link.contains(hit)),hitClass:hit?.className,
          viewport:{width:window.innerWidth,height:window.innerHeight},
          skipLinkBottom:document.querySelector(".skip-link").getBoundingClientRect().bottom,
          headerControlsWithin:[...document.querySelectorAll(".header-actions button")].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=window.innerWidth;}),
          heroHeight:document.querySelector('.hero').getBoundingClientRect().height,
          barHeight:getComputedStyle(document.documentElement).getPropertyValue('--robys-order-bar-height')};
      });
      await writeFile(resolve(out,id+'-geometry.json'),JSON.stringify(geometry,null,2));
      await page.screenshot({path:resolve(out,id+'.png')});
      if (negative) {
        assert.ok(geometry.gap<0 && !geometry.hit,'Negative control must expose the original obstructed menu CTA');
        report.checks.push({id,passed:true,detectedOriginalOverlap:true,geometry});
        continue;
      }
      assert.ok(geometry.headerControlsWithin,`${id}: header controls overflow`);
      assert.ok(geometry.skipLinkBottom<=0,`${id}: unfocused skip link covers the header`);
      assert.equal(geometry.viewport.width,config.width,`${id}: layout viewport expanded`);
      assert.ok(geometry.link.top>=0 && geometry.link.bottom<=geometry.viewport.height,`${id}: CTA not fully on-screen`);
      assert.ok(geometry.gap>=10,`${id}: insufficient menu/cart separation: ${geometry.gap}`);
      assert.ok(geometry.hit,`${id}: menu hit intercepted by ${geometry.hitClass}`);
      const skip = page.locator('.skip-link');
      await skip.focus();
      await frames(page);
      const focusedSkip = await skip.evaluate(node => {
        const r=node.getBoundingClientRect();
        return {x:r.left,y:r.top,width:r.width,height:r.height,focused:document.activeElement===node,viewportHeight:innerHeight};
      });
      await writeFile(resolve(out,id+'-focus.json'),JSON.stringify(focusedSkip,null,2));
      assert.ok(focusedSkip.focused && focusedSkip.y>=0 && focusedSkip.y+focusedSkip.height<=focusedSkip.viewportHeight,`${id}: focused skip link unavailable: ${JSON.stringify(focusedSkip)}`);
      await page.keyboard.press('Tab');
      await frames(page);
      const link = page.locator('.hero-actions a[href="menu.html"]');
      if (touch) await link.tap(); else await link.click();
      await page.waitForURL('**/menu.html');
      await page.locator('.full-menu-item--product').nth(49).waitFor({state:'attached'});
      assert.deepEqual(errors,[],`${id}: page error`);
      report.checks.push({id,passed:true,actualNavigation:true,geometry});
    } catch(error) {
      await page.screenshot({path:resolve(out,'failure-'+id+'.png')}).catch(()=>{});
      report.checks.push({id,passed:false,error:String(error.stack||error)});
    } finally { await context.close(); }
  }
  report.passed=report.checks.length===cases.length&&report.checks.every(c=>c.passed);
  assert.ok(report.passed,'Hero clearance regression failed');
} catch(error) {report.error=String(error.stack||error);process.exitCode=1;}
finally {
  await browser.close(); await new Promise(resolve=>server.close(resolve));
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,negativeControl:negative,checks:report.checks.length,failures:report.checks.filter(c=>!c.passed)},null,2));
}
