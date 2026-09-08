/** Static RU landing: shared layout assertions for HTTP and declared offline rendering.
 * Offline rendering never claims URL delivery, routing, cache or production evidence.
 * HTTP menu navigation proves document delivery, not menu application/order behavior.
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
const expectedFocus = [
  { selector: '.skip-link', href: '#main' },
  { selector: '.site-header .brand', href: '../' },
  { selector: '.main-nav a[href="../menu.html"]', href: '../menu.html' },
  { selector: '.main-nav a[href="#location"]', href: '#location' },
  { selector: '.main-nav a[href="#faq"]', href: '#faq' }
];
const requiredChecks = [
  'actualViewport', 'noPageOverflow', 'noTextClipping', 'visibleNavigation',
  'headerDoesNotCoverHero', 'canonicalLoadedLogo', 'labelsContrast', 'underlinedFAQ',
  'actionReachability', 'visibleKeyboardFocus', 'keyboardTargetOrder', 'anchorNavigation',
  ...(mode === 'http' ? ['httpMenuNavigation'] : [])
];
// A box alone does not establish CSS visibility. Keep this predicate shared with
// isolated controls so a future geometry-only implementation cannot pass silently.
function inspectAnchorHeading(id) {
  const heading = document.getElementById(id)?.querySelector('h2');
  const r = heading?.getBoundingClientRect();
  const inViewport = Boolean(r && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight);
  // Visibility is inherited but may be explicitly restored by a descendant.
  let cssVisible = Boolean(heading) && getComputedStyle(heading).visibility === 'visible';
  let effectiveOpacity = 1;
  for (let node = heading; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none') cssVisible = false;
    effectiveOpacity *= Number(style.opacity);
  }
  return { id, hash: location.hash, inViewport, cssVisible, effectiveOpacity,
    headingVisible: inViewport && cssVisible && effectiveOpacity >= .99 };
}
const anchorVisibilityFixtures = [
  ['visible', [], true],
  ['heading-hidden', [['#probe h2', 'visibility', 'hidden']], false],
  ['parent-hidden', [['#probe', 'visibility', 'hidden']], false],
  ['ancestor-hidden', [['#outer', 'visibility', 'hidden']], false],
  ['heading-transparent', [['#probe h2', 'opacity', '0']], false],
  ['parent-transparent', [['#probe', 'opacity', '0']], false],
  ['ancestor-transparent', [['#outer', 'opacity', '0']], false],
  ['composed-opacity', [['#probe', 'opacity', '.994'], ['#outer', 'opacity', '.994']], false],
  ['ancestor-display-none', [['#outer', 'display', 'none']], false],
  ['visible-child-override', [['#probe', 'visibility', 'hidden'], ['#probe h2', 'visibility', 'visible']], true],
  ['outside-viewport', [['#probe h2', 'transform', 'translateY(1000px)']], false],
  ['missing-heading', [], false, 'missing']
];
async function checkAnchorVisibilityControls(browser) {
  const results = [];
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled });
    try {
      const page = await context.newPage();
      for (const [name, styles, expectedVisible, id = 'probe'] of anchorVisibilityFixtures) {
        // Separate synthetic documents: never mutate the real landing or its screenshots.
        await page.setContent('<!doctype html><html><body><div id="outer"><section id="probe"><h2>Anchor heading</h2></section></div></body></html>');
        await page.evaluate(mutations => {
          for (const [selector, property, value] of mutations) {
            document.querySelector(selector).style.setProperty(property, value);
          }
        }, styles);
        const measurement = await page.evaluate(inspectAnchorHeading, id);
        const passed = measurement.headingVisible === expectedVisible;
        results.push({ name, javaScriptEnabled, expectedVisible, ...measurement, passed });
        console.log(`${passed ? 'PASS' : 'FAIL'} anchor-visibility/${name}/${javaScriptEnabled ? 'js' : 'nojs'}`);
      }
    } finally { await context.close(); }
  }
  return results;
}
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
  nonClaims: ['No approved historical baseline', 'No external navigation, order, cache-upgrade or physical-device proof',
    'Menu navigation checks document delivery only; not menu application readiness'],
  requiredChecks, expectedFocus, anchorVisibilityControls: [], cases: [] };
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
  report.anchorVisibilityControls = await checkAnchorVisibilityControls(browser);
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
      // Preserve independent trial checks for all hero actions, including the external map link.
      for (const selector of ['.main-nav a','.hero-actions a']) {
        for (const link of await page.locator(selector).all()) await link.click({trial:true,timeout:3000});
      }
      item.checks.actionReachability = true;
      // Fresh page avoids a stale sequential-focus state in the offline transport.
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
      for (let step=0; step<expectedFocus.length; step++) {
        await page.keyboard.press('Tab');
        const samples = [], started = Date.now();
        let f;
        do {
          f = await page.evaluate(expected => {
            const e=document.activeElement;
            const focused=document.hasFocus(), matches=e.matches(':focus');
            const r=e.getBoundingClientRect(),s=getComputedStyle(e);
            let opacity=1;for(let n=e;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);
            return {documentFocused:focused,matchesFocus:matches,tag:e.tagName,href:e.getAttribute('href'),
              expectedSelector:expected.selector,expectedTarget:e===document.querySelector(expected.selector),
              opacity,top:r.top,bottom:r.bottom,outline:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth)};
          }, expectedFocus[step]);
          samples.push({elapsedMs:Date.now()-started,...f});
          if (usableFocus(f)) break;
          await page.waitForTimeout(50);
        } while (Date.now()-started < 2000);
        item.focus.push(f);
        item.focusSamples.push(samples);
      }
      item.checks.visibleKeyboardFocus = item.focus.every(f=>f.documentFocused&&f.matchesFocus&&f.tag==='A'&&f.opacity>=.99&&f.top>=0&&f.bottom<=conf.height&&f.outline!=='none'&&f.outlineWidth>=2);
      item.checks.keyboardTargetOrder = item.focus.length===expectedFocus.length
        && item.focus.every((f,index)=>f.expectedTarget&&f.href===expectedFocus[index].href);
      // Real native anchor clicks: URL fragment and the destination heading must both agree.
      item.anchors = [];
      for (const target of ['location', 'faq']) {
        await page.locator(`.main-nav a[href="#${target}"]`).click({timeout:3000});
        await page.waitForURL(value=>value.hash===`#${target}`, {timeout:3000});
        const anchor = await page.evaluate(inspectAnchorHeading, target);
        item.anchors.push(anchor);
      }
      item.checks.anchorNavigation = item.anchors.length===2
        && item.anchors.every(anchor=>anchor.hash===`#${anchor.id}`&&anchor.headingVisible);
      if (mode === 'http') {
        // Use another page so navigation cannot replace the landing focus/layout evidence.
        const navPage = await context.newPage();
        try {
          const landingResponse = await navPage.goto(url, {waitUntil:'load'});
          assert.equal(landingResponse.status(), 200, 'Menu journey starts on the HTTP landing page');
          await navPage.evaluate(font=>{document.documentElement.style.fontSize=`${font}px`;},conf.font);
          const menuURL = new URL('../menu.html', url).href;
          const [menuResponse] = await Promise.all([
            navPage.waitForResponse(response=>response.url()===menuURL&&response.request().isNavigationRequest()
              &&response.frame()===navPage.mainFrame(), {timeout:5000}),
            navPage.waitForURL(menuURL, {waitUntil:'domcontentloaded',timeout:5000}),
            navPage.locator('.main-nav a[href="../menu.html"]').click({timeout:3000})
          ]);
          assert.equal(menuResponse.status(), 200, 'Menu document must return HTTP 200 after a real click');
          assert.equal(navPage.url(), menuURL, 'Menu destination must retain the project-path prefix');
          const actualDigest = digest(await menuResponse.body());
          assert.equal(actualDigest, digest(await input('menu.html')), 'Menu HTTP document identity');
          item.menuNavigation = {status:'passed',url:menuURL,httpStatus:menuResponse.status(),sha256:actualDigest,
            scope:'Local HTTP document delivery only; not menu application readiness or an order'};
          item.checks.httpMenuNavigation = true;
        } finally { await navPage.close(); }
      } else {
        item.menuNavigation = {status:'not_run',reason:'Offline source rendering cannot prove HTTP menu delivery'};
      }
    } catch (error) { item.errors.push(String(error)); }
    item.passed = item.errors.length===0 && Object.keys(item.checks).length===requiredChecks.length
      && requiredChecks.every(name=>item.checks[name]===true);
    report.cases.push(item);
    console.log(`${item.passed?'PASS':'FAIL'} ${id} checks=${requiredChecks.filter(name=>item.checks[name]===true).length}/${requiredChecks.length}`);
    await context.close();
  }
} catch (error) { report.infrastructureError=String(error); }
finally {
  if(browser) await browser.close();
  if(server) await new Promise(resolve=>server.close(resolve));
  report.inputs=Object.fromEntries([...inputs].sort());
  report.anchorVisibilityControlsPassed = report.anchorVisibilityControls.length === anchorVisibilityFixtures.length * 2
    && report.anchorVisibilityControls.every(control => control.passed);
  report.passed=report.cases.length===22 && report.cases.every(c=>c.passed)
    && report.anchorVisibilityControlsPassed && !report.infrastructureError;
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({sourceSha:report.sourceSha,mode,passed:report.passed,
    casesPassed:report.cases.filter(c=>c.passed).length,casesExpected:22,requiredChecks,
    anchorVisibilityControlsPassed:report.anchorVisibilityControls.filter(c=>c.passed).length,
    anchorVisibilityControlsExpected:anchorVisibilityFixtures.length * 2,
    failedAnchorVisibilityControls:report.anchorVisibilityControls.filter(c=>!c.passed),
    failedCases:report.cases.filter(c=>!c.passed).map(c=>({id:c.id,errors:c.errors,
      failedChecks:requiredChecks.filter(name=>c.checks[name]!==true)})),
    infrastructureError:report.infrastructureError},null,2));
}
if(!report.passed) process.exitCode=1;
