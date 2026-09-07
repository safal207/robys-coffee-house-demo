import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// Run against actual files served under the GitHub Pages project prefix.
// RU_LANDING_ROOT can point at an unmodified checkout for a negative control.
const root = path.resolve(process.env.RU_LANDING_ROOT || process.cwd());
const out = path.resolve(process.env.RU_LANDING_RESULTS || 'visual-results/ru-landing');
const prefix = '/robys-coffee-house-demo/';
const mime = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  let file;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) throw new Error('outside project');
    file = path.resolve(root, pathname.slice(prefix.length));
    if (!file.startsWith(root + path.sep) || !existsSync(file)) throw new Error('missing file');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
mkdirSync(out, { recursive: true });
const url = `http://127.0.0.1:${server.address().port}${prefix}ru/coffee-gazipasa.html`;
const sizes = [[320,740],[360,640],[360,800],[390,844],[430,932],[768,1024],[980,900],[981,900],[1366,768],[1440,1000]];
const scenarios = sizes.map(([width,height]) => ({name:`${width}x${height}`,width,height,js:false}));
scenarios.push({name:'390x844-js',width:390,height:844,js:true},
  {name:'844x390-landscape',width:844,height:390,js:false},
  {name:'390x844-text200',width:390,height:844,js:false,text200:true});
const evidence = { scope: 'local source, not production or historical baseline approval', browser: '', results: [] };
let browser;
try {
  browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {})});
  evidence.browser = browser.version();
  for (const s of scenarios) {
    const context = await browser.newContext({viewport:{width:s.width,height:s.height}, javaScriptEnabled:s.js,
      reducedMotion:'reduce', locale:'ru-RU', deviceScaleFactor:1});
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => { if(r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    page.on('requestfailed', r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
    const response = await page.goto(url, {waitUntil:'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    if(s.text200) await page.evaluate(() => { document.documentElement.style.fontSize='200%'; });
    await page.evaluate(() => Promise.all(Array.from(document.images, i => i.decode().catch(() => {}))));
    const checks=[];
    const check = (id, pass, actual) => checks.push({id,pass:Boolean(pass),actual});
    check('HTTP', response?.status()===200, response?.status());
    const metrics = await page.evaluate(() => {
      const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const visible = el => {
        if(!el) return false;
        for(let a=el;a;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||s.pointerEvents==='none')return false;}
        const r=el.getBoundingClientRect(); return r.width>0 && r.height>0;
      };
      const rgb = v => v.match(/[\d.]+/g).slice(0,3).map(Number);
      const luminance = c => c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      const contrast = el => {
        let background='rgb(255, 255, 255)';
        for(let a=el;a;a=a.parentElement){const c=getComputedStyle(a).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){background=c;break;}}
        const a=luminance(rgb(getComputedStyle(el).color)),b=luminance(rgb(background));
        return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      };
      const nav=[...document.querySelectorAll('.main-nav a')].map(el=>{
        const r=rect(el),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {text:el.textContent,rect:r,visible:visible(el),hit:el===hit||el.contains(hit)};
      });
      const logo=document.querySelector('.brand img');
      const title=document.querySelector('h1');
      const clipped=[];
      for(const el of document.querySelectorAll('h1,h2,h3,p,address,a')){
        if(!visible(el)||el.classList.contains('skip-link'))continue;
        const r=rect(el);
        const range=document.createRange();range.selectNodeContents(el);
        if(r.x<-.5||r.right>innerWidth+.5||[...range.getClientRects()].some(t=>t.x<-.5||t.right>innerWidth+.5))clipped.push(el.textContent.trim().slice(0,70));
      }
      return {nav,logo:logo?{src:logo.getAttribute('src'),loaded:logo.complete&&logo.naturalWidth>0,rect:rect(logo)}:null,
        title:rect(title),header:rect(document.querySelector('.site-header')),
        overflow:document.documentElement.scrollWidth>innerWidth,clipped,
        contrasts:[...document.querySelectorAll('#location .eyebrow,#faq .eyebrow')].map(contrast),
        links:[...document.querySelectorAll('#location p a,#faq p a,footer a')].map(e=>({text:e.textContent,underline:getComputedStyle(e).textDecorationLine.includes('underline')})),
        ctas:[...document.querySelectorAll('.hero-actions a')].map(e=>({visible:visible(e),rect:rect(e)}))};
    });
    check('RU-001 visible usable nav', metrics.nav.length===3 && metrics.nav.every(n=>n.visible&&n.hit&&n.rect.height>=44), metrics.nav);
    check('RU-002 approved logo', metrics.logo?.loaded && metrics.logo.src==='../src/brand/robys-compact-master-v1.svg', metrics.logo);
    check('RU-003 contrast >=4.5', metrics.contrasts.length===2 && metrics.contrasts.every(c=>c>=4.5), metrics.contrasts);
    check('RU-004 distinguishable links', metrics.links.length>=4 && metrics.links.every(l=>l.underline), metrics.links);
    check('RU-005 reflow', !metrics.overflow && metrics.clipped.length===0, {overflow:metrics.overflow,clipped:metrics.clipped});
    check('RU-006 header clearance', metrics.header.bottom<=metrics.title.y, {header:metrics.header,title:metrics.title});
    check('RU-007 both actions', metrics.ctas.length===2 && metrics.ctas.every(c=>c.visible&&c.rect.height>=44), metrics.ctas);
    // Actual keyboard navigation, not locator.isVisible (which accepts opacity:0).
    await page.keyboard.press('Tab');
    const skip=await page.locator('.skip-link').evaluate(el=>({focused:document.activeElement===el,top:el.getBoundingClientRect().top}));
    check('RU-008 skip link', skip.focused && skip.top>=0, skip);
    await page.keyboard.press('Tab'); // brand
    const focus=[];
    for(let i=0;i<3;i++){
      await page.keyboard.press('Tab');
      focus.push(await page.evaluate(()=>{const el=document.activeElement;let visible=true;for(let a=el;a;a=a.parentElement){const s=getComputedStyle(a);if(Number(s.opacity)===0||s.visibility==='hidden'||s.display==='none')visible=false;}
        const c=getComputedStyle(el),r=el.getBoundingClientRect();return {nav:Boolean(el.closest('.main-nav')),visible,outline:parseFloat(c.outlineWidth)>0&&c.outlineStyle!=='none',inViewport:r.top>=0&&r.bottom<=innerHeight};}));
    }
    check('RU-009 keyboard nav',focus.every(f=>f.nav&&f.visible&&f.outline&&f.inViewport),focus);
    for(const id of ['location','faq']){
      await page.goto(url,{waitUntil:'networkidle'});
      if(s.text200) await page.evaluate(() => { document.documentElement.style.fontSize='200%'; });
      await page.locator(`.main-nav a[href="#${id}"]`).click({timeout:1500}).catch(e=>errors.push(`${id} anchor: ${e.message.split('\n')[0]}`));
      const pos=await page.locator(`#${id}`).boundingBox();
      check(`RU-010 anchor ${id}`,new URL(page.url()).hash===`#${id}` && pos?.y<s.height && pos?.y>=-1,{hash:new URL(page.url()).hash,rect:pos});
    }
    await page.goto(url,{waitUntil:'networkidle'});
    if(s.text200) await page.evaluate(() => { document.documentElement.style.fontSize='200%'; });
    await page.mouse.move(0,0);
    await page.screenshot({path:path.join(out,`${s.name}-viewport.png`),animations:'disabled'});
    await page.screenshot({path:path.join(out,`${s.name}-full.png`),fullPage:true,animations:'disabled'});
    check('RU-011 no asset/runtime errors',errors.length===0,errors);
    const failed=checks.filter(c=>!c.pass).map(c=>c.id);
    evidence.results.push({scenario:s,pass:failed.length===0,checks});
    console.log(`${failed.length?'FAIL':'PASS'} ${s.name}${failed.length?' '+failed.join(', '):''}`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
  evidence.pass=evidence.results.length===scenarios.length&&evidence.results.every(r=>r.pass);
  writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2)+'\n');
}
if(!evidence.pass) process.exitCode=1;
