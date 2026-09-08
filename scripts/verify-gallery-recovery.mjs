/** Real page and native geometry. This is recovery/behavior evidence, not timing
 * certification. Only the two named failure cases intercept entry resources.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root=process.cwd(),out=resolve('.artifacts/gallery-expanded');
await mkdir(out,{recursive:true});
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(head,'5e6618b861efc866286c83a06e0380133e103a08');
const protectedFiles=['src/featured-gallery.ts','featured-gallery.js','index.html','takeaway-entry.js','scripts/takeaway-browser-contract.mjs','styles-v2.css','lighthouse/budgets.json','lighthouse/baseline.json'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={head,scope:'Native geometry recorder returns original values; CSP enforced; service workers blocked. Entry module/image failure explicitly simulated. No startup/cadence, external service delivery, native-device or release claim.',files:Object.fromEntries(protectedFiles.map(p=>[p,hash(readFileSync(p))])),cases:[]};
const save=()=>writeFile(resolve(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep))throw Error('Outside root');
  const body=await readFile(file);
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4','.woff2':'font/woff2'}[extname(file)]??'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const specs=[
 ...['tr','en','ru'].map(language=>({name:`auto-${language}-390`,language,width:390})),
 {name:'escape-ru-320',language:'ru',width:320,key:'Escape'},
 {name:'tab-ru-390',language:'ru',width:390,key:'Tab'},
 {name:'off-ru-390',language:'ru',width:390,off:true},
 {name:'reduce-ru-390',language:'ru',width:390,reduce:true},
 {name:'module-failure-ru-390',language:'ru',width:390,fail:'module'},
 {name:'image-failure-ru-390',language:'ru',width:390,fail:'image'},
 {name:'auto-ru-1440',language:'ru',width:1440}
];
try{
 browser=await chromium.launch({headless:true});report.browser=browser.version();
 for(const spec of specs){
  const row={...spec,status:'RUNNING',pageErrors:[]};report.cases.push(row);
  const context=await browser.newContext({viewport:{width:spec.width,height:900},locale:'tr-TR',timezoneId:'Europe/Istanbul',reducedMotion:spec.reduce?'reduce':'no-preference',serviceWorkers:'block',bypassCSP:false});
  let page;
  try{
   await context.addInitScript(language=>{
    try{localStorage.setItem('robys-language',language);}catch{}
    globalThis.__galleryRecoveryReads=[];globalThis.__galleryRecoveryEvents=[];
    window.addEventListener('robys:entry-state',e=>globalThis.__galleryRecoveryEvents.push({...e.detail,at:performance.now()}));
    const native=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(...args){
     if(this.classList?.contains('featured-strip'))globalThis.__galleryRecoveryReads.push({pending:Boolean(document.documentElement.dataset.robysEntryPending),state:document.documentElement.dataset.robysEntryState??null,at:performance.now()});
     return native.apply(this,args);
    };
   },spec.language);
   page=await context.newPage();page.setDefaultTimeout(6000);
   page.on('pageerror',e=>row.pageErrors.push(e.message));
   if(spec.fail==='module')await page.route('**/takeaway-entry.js*',r=>r.abort());
   if(spec.fail==='image')await page.route('**/src/brand/robys-takeaway-cup-v1.webp*',r=>r.abort());
   await page.goto(`${origin}/?entry=${spec.off?'off':'morning'}`,{waitUntil:'domcontentloaded',timeout:15000});
   await page.waitForFunction(()=>document.querySelector('.featured-track')?.dataset.galleryReady==='true');
   if(!spec.off&&!spec.reduce&&!spec.fail){
    await page.waitForFunction(()=>document.documentElement.dataset.robysEntryState==='brand-frame');
    if(spec.key)await page.keyboard.press(spec.key);
    await page.waitForFunction(()=>document.documentElement.dataset.robysEntryState==='done'&&!document.documentElement.dataset.robysEntryPending);
   }else await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending,null,{timeout:4000});
   await page.waitForFunction(()=>globalThis.__galleryRecoveryReads.some(r=>!r.pending||r.state==='handoff'||r.state==='done'));
   assert.equal(await page.locator('.robys-takeaway-entry').count(),0);
   const state=await page.evaluate(()=>({inert:document.body.inert,pending:Boolean(document.documentElement.dataset.robysEntryPending),language:document.documentElement.lang}));
   assert.equal(state.inert,false);assert.equal(state.pending,false);assert.equal(state.language,spec.language);
   // Resize after release and test both gallery visibility transitions twice.
   for(const width of [spec.width,Math.max(320,spec.width-30)]){
    await page.setViewportSize({width,height:900});
    await page.locator('.featured-strip').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.body.classList.contains('featured-gallery-active'));
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.waitForFunction(()=>!document.body.classList.contains('featured-gallery-active'));
   }
   await page.locator('.featured-strip').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.body.classList.contains('featured-gallery-active'));
   row.reads=await page.evaluate(()=>globalThis.__galleryRecoveryReads);
   row.events=await page.evaluate(()=>globalThis.__galleryRecoveryEvents);
   row.coveredReads=row.reads.filter(r=>r.pending&&!['handoff','done'].includes(r.state)).length;
   assert.equal(row.coveredReads,0,'Every recorded phase, not only initial 50ms, stays free of covered gallery reads');
   row.cards=await page.locator('.featured-track a').count();assert.equal(row.cards,6);
   const first=page.locator('.featured-track a').first();
   assert.equal(await first.getAttribute('href'),'menu.html#hot-coffee');
   assert((await first.getAttribute('aria-label'))?.trim());
   if(spec.name==='auto-ru-390')await page.screenshot({path:resolve(out,'ru-gallery-recovered.png')});
   // Ordinary navigation to real menu (no order/payment or external message).
   await first.click();
   await page.locator('#menu-root[data-ready="true"]').waitFor();
   assert.equal(new URL(page.url()).pathname,'/menu.html');
   assert.equal(new URL(page.url()).hash,'#hot-coffee');
   assert(await page.locator('[data-product-id^="hot-coffee:"]').count()>0);
   row.menuNavigation='PASS';assert.deepEqual(row.pageErrors,[]);
   row.status='PASS';
  }catch(e){row.status='FAIL';row.error=String(e.stack);await page?.screenshot({path:resolve(out,`${spec.name}-failure.png`)}).catch(()=>{});}
  finally{await context.close();await save();console.log(`${row.status} ${row.name}`);}
 }
 for(const f of protectedFiles)assert.equal(hash(readFileSync(f)),report.files[f],f);
}finally{
 await browser?.close();await new Promise(r=>server.close(r));
 report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status!=='PASS').length;
 report.status=report.cases.length===10&&report.failed===0?'PASS':'FAIL';await save();
 console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed}));
 if(report.status!=='PASS')process.exitCode=1;
}
