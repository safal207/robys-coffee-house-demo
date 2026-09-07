import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.env.RU_LANDING_ROOT || process.cwd());
const out = path.resolve(process.env.RU_LANDING_RESULTS || '.artifacts/ru-landing');
const target = 'ru/coffee-gazipasa.html';
const widths = [[320,740],[360,640],[360,800],[390,844],[430,932],[768,1024],[980,900],[981,900],[1366,768],[1440,1000]];
const fullMatrix = process.env.RU_LANDING_BASELINE !== '1';
const cases = widths.flatMap(([width,height]) => (fullMatrix ? [true,false] : [true]).map(javaScriptEnabled => ({width,height,javaScriptEnabled,fontSize:16})));
if (fullMatrix) for (const width of [320,390,1440]) cases.push({width,height:900,javaScriptEnabled:false,fontSize:32});
mkdirSync(out, { recursive: true });
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4'};
const served = new Map();
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep) || !statSync(file).isFile()) throw new Error('Not a file');
    const bytes = readFileSync(file);
    served.set(path.relative(root,file), {bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    response.end(bytes);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = {createdAt:new Date().toISOString(),source:process.env.RU_LANDING_SOURCE_SHA || 'local working tree',page:target,transport:'unaltered files served over loopback HTTP; not production',historicalGoldenBaseline:'not approved',cases:[],servedFiles:{}};
let browser;
const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(x=>Number(x)/255).map(x=>x<=0.04045 ? x/12.92 : ((x+0.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
const contrast = (a,b) => { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // Host-side settling also works with page JavaScript disabled; page rAF callbacks do not.
  await new Promise(resolve => setTimeout(resolve, 80));
}
try {
  browser = await chromium.launch({headless:true,...(process.env.RU_LANDING_CHROMIUM ? {executablePath:process.env.RU_LANDING_CHROMIUM} : {})});
  report.browser = browser.version();
  for (const spec of cases) {
    const id = `${spec.width}x${spec.height}-js${Number(spec.javaScriptEnabled)}-text${spec.fontSize}`;
    const context = await browser.newContext({viewport:{width:spec.width,height:spec.height},javaScriptEnabled:spec.javaScriptEnabled,deviceScaleFactor:1,locale:'ru-RU',colorScheme:'light',reducedMotion:spec.fontSize===32 ? 'reduce' : 'no-preference',isMobile:spec.width<=430,hasTouch:spec.width<=430,serviceWorkers:'block'});
    const page = await context.newPage();
    const errors = [], failures = [];
    page.on('pageerror', error=>errors.push(String(error)));
    page.on('requestfailed', request=>errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response=>{if(response.status()>=400) errors.push(`${response.status()} ${response.url()}`);});
    const entry = {id,...spec,failures,errors};
    const check = (name, condition) => {if(!condition) failures.push(name);};
    try {
      const response = await page.goto(`${origin}/${target}`, {waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      if(spec.fontSize!==16) await page.evaluate(size=>{document.documentElement.style.fontSize=`${size}px`;},spec.fontSize);
      await settle(page);
      const metrics = await page.evaluate(() => {
        const isVisible = element => {
          for(let node=element;node;node=node.parentElement){const s=getComputedStyle(node);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)<0.99) return false;}
          const r=element.getBoundingClientRect();return r.width>0&&r.height>0;
        };
        const bounds = element => {const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
        const links = [...document.querySelectorAll('.main-nav a')].map(a=>({text:a.textContent,href:a.getAttribute('href'),visible:isVisible(a),pointerEvents:getComputedStyle(a).pointerEvents,...bounds(a)}));
        const background=getComputedStyle(document.body).backgroundColor;
        const labels=[...document.querySelectorAll('#location .eyebrow,#faq .eyebrow')].map(e=>({color:getComputedStyle(e).color,background}));
        const bodyLinks=[...document.querySelectorAll('#location p a,#faq p a,footer a')].map(e=>({text:e.textContent,decoration:getComputedStyle(e).textDecorationLine,color:getComputedStyle(e).color,background}));
        const overflow=[...document.querySelectorAll('h1,h2,h3,p,address,.main-nav a')].flatMap(e=>{const r=document.createRange();r.selectNodeContents(e);return [...r.getClientRects()].filter(x=>x.left< -1||x.right>innerWidth+1).map(x=>({text:e.textContent,left:x.left,right:x.right}));});
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nav:links,header:bounds(document.querySelector('header')),hero:bounds(document.querySelector('.hero')),brand:getComputedStyle(document.querySelector('.brand-copy')).backgroundImage,labels,bodyLinks,overflow};
      });
      entry.metrics = metrics;
      entry.labelContrast = metrics.labels.map(x=>contrast(x.color,x.background));
      entry.linkContrast = metrics.bodyLinks.map(x=>contrast(x.color,x.background));
      check('layout viewport equals requested width', metrics.width===spec.width);
      check('no horizontal document or text overflow',metrics.scrollWidth<=spec.width && metrics.overflow.length===0);
      check('all three navigation links visible, on screen and actionable',metrics.nav.length===3 && metrics.nav.every(a=>a.visible&&a.pointerEvents!=='none'&&a.x>=0&&a.right<=spec.width&&a.y>=0&&a.bottom<=spec.height));
      check('navigation destinations preserved',JSON.stringify(metrics.nav.map(a=>a.href))===JSON.stringify(['../menu.html','#location','#faq']));
      check('approved SVG brand rendered',/robys-(header|compact)-master-v1\.svg/.test(metrics.brand));
      check('small labels contrast >= 4.5',entry.labelContrast.length===2&&entry.labelContrast.every(x=>x>=4.5));
      check('body links always underlined and contrast >= 4.5',metrics.bodyLinks.length===5&&metrics.bodyLinks.every(x=>x.decoration.includes('underline'))&&entry.linkContrast.every(x=>x>=4.5));
      await page.evaluate(() => {
        window.__qaImages = [...document.querySelectorAll('.brand-copy,.hero')].map(e=>getComputedStyle(e).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]).filter(Boolean).map(src=>{const image=new Image();image.src=src;return image;});
      });
      let assets=[];
      for (let attempt=0; attempt<50; attempt++) {
        assets=await page.evaluate(()=>window.__qaImages.map(img=>({src:img.src,complete:img.complete,loaded:img.complete&&img.naturalWidth>0})));
        if(assets.every(x=>x.complete)) break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      entry.assets=assets;check('hero and SVG images actually load',assets.length===2&&assets.every(x=>x.loaded));
      await page.screenshot({path:path.join(out,`${id}-full.png`),fullPage:true});
      await page.screenshot({path:path.join(out,`${id}-viewport.png`)});
      // Check actual keyboard focus, not just Playwright's opacity-insensitive isVisible.
      const focus=[];
      for(let i=0;i<5;i++) {
        await page.keyboard.press('Tab');await settle(page);
        focus.push(await page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect();let visible=true;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);visible&&=s.display!=='none'&&s.visibility==='visible'&&Number(s.opacity)>=0.99;}return {text:e.textContent,visible,onScreen:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,outline:getComputedStyle(e).outlineStyle,outlineWidth:getComputedStyle(e).outlineWidth};}));
      }
      entry.focus=focus;
      check('skip, brand and three navigation links have visible keyboard focus',focus.every(x=>x.visible&&x.onScreen&&x.outline!=='none'&&parseFloat(x.outlineWidth)>=2));
      if(spec.width===390 && spec.javaScriptEnabled && spec.fontSize===16) await page.screenshot({path:path.join(out,`${id}-focus.png`)});
      if (metrics.nav.every(a=>a.visible&&a.pointerEvents!=='none')) {
        for (const hash of ['#faq','#location']) {
          await page.locator(`.main-nav a[href="${hash}"]`).click();
          assert.equal(new URL(page.url()).hash,hash);
          let reached=false;
          for(let attempt=0;attempt<50;attempt++){reached=await page.evaluate(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;},hash);if(reached)break;await new Promise(resolve=>setTimeout(resolve,100));}
          assert(reached,`${hash} must enter the viewport after an ordinary click`);
        }
        check('FAQ and location real-click navigation',true);
      } else failures.push('FAQ and location real-click navigation (blocked by hidden nav)');
      check('no browser or asset errors',errors.length===0);
    } catch(error) {failures.push(String(error.stack||error));}
    entry.pass=failures.length===0;
    report.cases.push(entry);
    console.log(`${entry.pass?'PASS':'FAIL'} ${id}: ${failures.join('; ')}`);
    await context.close();
  }
} finally {
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
  report.servedFiles=Object.fromEntries([...served].sort(([a],[b])=>a.localeCompare(b)));
  report.pass=report.cases.length===cases.length && report.cases.every(x=>x.pass);
  writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
if(!report.pass) process.exitCode=1;
