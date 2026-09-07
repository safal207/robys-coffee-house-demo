/** Static RU landing: identical assertions for HTTP and declared offline source rendering.
 * RU_QA_MODE=offline never claims URL delivery, routing, cache or production evidence.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = await realpath(process.env.RU_QA_ROOT || process.cwd());
const out = path.resolve(process.env.RU_QA_OUTPUT || 'visual-results/ru-coffee');
const mode = process.env.RU_QA_MODE || 'http';
assert(['http', 'offline'].includes(mode), 'RU_QA_MODE must be http or offline');
const pagePath = 'ru/coffee-gazipasa.html';
const digest = data => createHash('sha256').update(data).digest('hex');
const inputs = new Map();
const mime = name => ({ '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript' }[path.extname(name)] || 'application/octet-stream');
async function input(name) {
  const file = await realpath(path.resolve(root, name));
  assert(file.startsWith(root + path.sep), 'Input must be inside the source root');
  const data = await readFile(file);
  inputs.set(path.relative(root, file), { bytes: data.length, sha256: digest(data) });
  return data;
}
async function embeddedSource() {
  let html = (await input(pagePath)).toString();
  assert(!/<script\b[^>]*\bsrc=/i.test(html), 'Offline mode is only for this static page');
  for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
    const name = path.posix.normalize(path.posix.join('ru', match[1].split('?')[0]));
    let css = (await input(name)).toString();
    for (const asset of [...css.matchAll(/url\(([^)]+)\)/g)]) {
      const url = asset[1].replace(/^["']|["']$/g, '');
      if (url.startsWith('data:')) continue;
      assert(!/^(?:[a-z]+:|\/\/)/i.test(url), 'No external source substitution');
      const resource = path.posix.normalize(path.posix.join(path.posix.dirname(name), url.split('?')[0]));
      css = css.replace(asset[0], `url("data:${mime(resource)};base64,${(await input(resource)).toString('base64')}")`);
    }
    html = html.replace(match[0], `<style>${css}</style>`);
  }
  return html.replace(/<link\b[^>]*rel="icon"[^>]*>/g, '');
}
const report = { mode, sourceSha: process.env.RU_QA_SOURCE_SHA || null, page: pagePath,
  nonClaims: ['No approved historical baseline', 'No external navigation, order, cache-upgrade or physical-device proof'], cases: [] };
await mkdir(out, { recursive: true });
let server, browser;
try {
  const html = mode === 'offline' ? await embeddedSource() : null;
  let url;
  if (mode === 'http') {
    server = createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        assert(pathname.startsWith('/robys-coffee-house-demo/'), 'Unexpected project prefix');
        const file = pathname.slice('/robys-coffee-house-demo/'.length);
        const bytes = await input(file);
        res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
        res.end(bytes);
      } catch { res.writeHead(404); res.end('Not found'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/robys-coffee-house-demo/${pagePath}`;
  }
  browser = await chromium.launch({ headless: true, ...(process.env.RU_QA_CHROMIUM ? { executablePath: process.env.RU_QA_CHROMIUM } : {}) });
  report.browser = browser.version();
  const sizes = [[320,740],[360,640],[360,800],[390,844],[430,932],[768,1024],[980,900],[981,900],[1366,768],[1440,1000]];
  const matrix = sizes.flatMap(([width,height]) => [16,32].map(font => ({width,height,font,js:true})));
  matrix.push({width:390,height:844,font:16,js:false}, {width:1440,height:1000,font:16,js:false});
  for (const conf of matrix) {
    const id = `${conf.width}x${conf.height}-font${conf.font}-${conf.js ? 'js' : 'nojs'}`;
    const context = await browser.newContext({ viewport: {width:conf.width,height:conf.height}, deviceScaleFactor:1,
      isMobile:conf.width<=430, hasTouch:conf.width<=430, javaScriptEnabled:conf.js,
      reducedMotion:'reduce', serviceWorkers:'block', locale:'ru-RU' });
    let page = await context.newPage();
    const item = { id, ...conf, checks: {}, errors: [] };
    page.on('pageerror', error => item.errors.push(String(error)));
    page.on('requestfailed', req => item.errors.push(`${req.url()}: ${req.failure()?.errorText}`));
    try {
      if (html) await page.setContent(html, {waitUntil:'load'});
      else {
        const response = await page.goto(url, {waitUntil:'load'});
        assert.equal(response.status(), 200);
        assert.equal(digest(await response.body()), digest(await input(pagePath)), 'HTTP document identity');
      }
      await page.evaluate(font => {document.documentElement.style.fontSize = `${font}px`;}, conf.font);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(80); // Styles/focus settle; no timing claim. Works with page JS disabled.
      const m = await page.evaluate(() => {
        const visible = e => {for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)<.99)return false;}const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
        const ratio = (a,b) => {const lum = s => s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).reduce((sum,v,i)=>sum+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4),0);const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
        const nav = [...document.querySelectorAll('.main-nav a')].map(e=>{const r=e.getBoundingClientRect();return {visible:visible(e),height:r.height,interactive:getComputedStyle(e).pointerEvents!=='none',hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
        const clipping = [...document.querySelectorAll('h1,h2,h3,p,address')].flatMap(e=>{const range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].filter(r=>r.left< -1||r.right>innerWidth+1).map(()=>e.innerText);});
        const background = getComputedStyle(document.querySelector('.brand-copy')).backgroundImage;
        const contrasts = [...document.querySelectorAll('#location .eyebrow,#faq .eyebrow')].map(e=>ratio(getComputedStyle(e).color,getComputedStyle(document.body).backgroundColor));
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nav,clipping,background,contrasts,
          links:[...document.querySelectorAll('#faq p a')].map(e=>getComputedStyle(e).textDecorationLine),
          headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom,
          heroTop:document.querySelector('.hero').getBoundingClientRect().top};
      });
      const bg = m.background.match(/url\(["']?([^"']+?)["']?\)/)?.[1];
      await page.evaluate(src=>{window.__ruQaImage=new Image();if(src)window.__ruQaImage.src=src;}, bg);
      await page.waitForTimeout(80);
      const imageLoaded = await page.evaluate(()=>window.__ruQaImage.complete&&window.__ruQaImage.naturalWidth>0);
      let brandMatches = false;
      if (bg?.startsWith('data:image/svg+xml;base64,')) {
        const hash = digest(Buffer.from(bg.split(',')[1], 'base64'));
        brandMatches = [...inputs].some(([file,value])=>/^src\/brand\/robys-(compact|header|primary)-master-v1\.svg$/.test(file)&&value.sha256===hash);
      } else brandMatches = /\/src\/brand\/robys-(compact|header|primary)-master-v1\.svg(?:\?|$)/.test(bg || '');
      item.measurements = {...m, background: undefined, imageLoaded};
      item.checks = { actualViewport:m.width===conf.width, noPageOverflow:m.scrollWidth<=conf.width,
        noTextClipping:m.clipping.length===0, visibleNavigation:m.nav.length===3&&m.nav.every(n=>n.visible&&n.interactive&&n.hit&&n.height>=44),
        headerDoesNotCoverHero:m.headerBottom<=m.heroTop+1, canonicalLoadedLogo:brandMatches&&imageLoaded,
        labelsContrast:m.contrasts.length===2&&m.contrasts.every(n=>n>=4.5), underlinedFAQ:m.links.length===2&&m.links.every(s=>s.includes('underline')) };
      await page.screenshot({path:path.join(out, `${id}-viewport.png`)});
      await page.screenshot({path:path.join(out, `${id}-full.png`),fullPage:true});
      // Trial uses Playwright's scroll, visibility and hit-target checks; it does not activate navigation.
      for (const selector of ['.main-nav a','.hero-actions a']) {
        for (const link of await page.locator(selector).all()) await link.click({trial:true,timeout:3000});
      }
      item.checks.actionReachability = true;
      // Fresh page, not document.open/setContent on a focused document: the latter can retain
      // a stale sequential-focus state in the offline transport. Keep real keyboard assertions.
      await page.close();
      page = await context.newPage();
      page.on('pageerror', error => item.errors.push(String(error)));
      if (html) await page.setContent(html, {waitUntil:'load'}); else await page.goto(url, {waitUntil:'load'});
      await page.evaluate(font=>{document.documentElement.style.fontSize=`${font}px`;},conf.font);
      if (conf.js) await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      else await page.waitForTimeout(80);
      item.focus = [];
      item.focusSamples = [];
      const usableFocus = f => f.documentFocused && f.matchesFocus && f.tag === 'A' && f.opacity >= .99
        && f.top >= 0 && f.bottom <= conf.height && f.outline !== 'none' && f.outlineWidth >= 2;
      for (let step=0; step<5; step++) {
        await page.keyboard.press('Tab');
        const samples = [], started = Date.now();
        let f;
        do {
          f = await page.evaluate(() => {
            const e=document.activeElement;
            const focused=document.hasFocus(), matches=e.matches(':focus');
            const r=e.getBoundingClientRect(),s=getComputedStyle(e);
            let opacity=1;for(let n=e;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);
            return {documentFocused:focused,matchesFocus:matches,tag:e.tagName,href:e.getAttribute('href'),
              opacity,top:r.top,bottom:r.bottom,outline:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth)};
          });
          samples.push({elapsedMs:Date.now()-started,...f});
          if (usableFocus(f)) break;
          await page.waitForTimeout(50);
        } while (Date.now()-started < 2000);
        item.focus.push(f);
        item.focusSamples.push(samples);
      }
      item.checks.visibleKeyboardFocus = item.focus.every(f=>f.documentFocused&&f.matchesFocus&&f.tag==='A'&&f.opacity>=.99&&f.top>=0&&f.bottom<=conf.height&&f.outline!=='none'&&f.outlineWidth>=2);
    } catch (error) { item.errors.push(String(error)); }
    item.passed = item.errors.length===0 && Object.keys(item.checks).length===10 && Object.values(item.checks).every(Boolean);
    report.cases.push(item);
    console.log(`${item.passed?'PASS':'FAIL'} ${id}`);
    await context.close();
  }
} catch (error) { report.infrastructureError=String(error); }
finally {
  if(browser) await browser.close();
  if(server) await new Promise(resolve=>server.close(resolve));
  report.inputs=Object.fromEntries([...inputs].sort());
  report.passed=report.cases.length===22 && report.cases.every(c=>c.passed) && !report.infrastructureError;
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
if(!report.passed) process.exitCode=1;
