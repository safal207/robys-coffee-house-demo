/** Real index/gallery/CSS with production runtime. Geometry wrappers only record and
 * return the native rectangle. Named negative cases abort only the entry module/cup.
 * No order, Telegram message, payment or external navigation is performed.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const out=resolve(process.env.GALLERY_ENTRY_RESULTS_DIR??'.artifacts/gallery-entry');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!path.startsWith(root+sep))throw new Error('Outside static root');
    const body=await readFile(path);
    const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.mp4':'video/mp4'}[extname(path)]??'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const report={scope:'Actual built home page, gallery and CSS. getBoundingClientRect is wrapped only to record featured-strip reads and returns native values. Entry module/image failures are explicit request aborts. No visual startup certification or speedup claim.',cases:[],pageErrors:[]};
let browser;
async function runCase(spec){
  const row={name:spec.name,status:'RUNNING',coveredReads:[],allReads:[]};report.cases.push(row);
  let context,page;
  try{
    context=await browser.newContext({viewport:{width:390,height:844},locale:'tr-TR',timezoneId:'Europe/Istanbul',reducedMotion:spec.reduced?'reduce':'no-preference',serviceWorkers:'block'});
    await context.addInitScript(({language})=>{
      try{localStorage.setItem('robys-language',language);}catch{}
      globalThis.__galleryRectReads=[];
      const native=Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect=function(...args){
        if(this.classList?.contains('featured-strip')){
          globalThis.__galleryRectReads.push({at:performance.now(),pending:Boolean(document.documentElement.dataset.robysEntryPending),state:document.documentElement.dataset.robysEntryState??null});
        }
        return native.apply(this,args);
      };
    },{language:spec.language??'tr'});
    page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(spec.fail==='module')await page.route('**/takeaway-entry.js*',route=>route.abort());
    if(spec.fail==='image')await page.route('**/src/brand/robys-takeaway-cup-v1.webp',route=>route.abort());
    await page.goto(`${origin}/?entry=${spec.off?'off':'morning'}`,{waitUntil:'domcontentloaded',timeout:15000});
    await page.locator('.featured-track[data-gallery-ready="true"]').waitFor();
    assert.equal(await page.locator('.featured-card').count(),6,'Gallery cards must render');
    if(!spec.off&&!spec.reduced&&!spec.fail){await page.locator('html[data-robys-entry-state="done"]').waitFor({state:'attached',timeout:4000});}
    else if(spec.fail){await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending,{timeout:4000});}
    else await page.waitForTimeout(150);
    row.allReads=await page.evaluate(()=>globalThis.__galleryRectReads);
    row.coveredReads=row.allReads.filter(r=>r.pending&&!['handoff','done'].includes(r.state));
    assert.equal(row.coveredReads.length,0,`Gallery performed ${row.coveredReads.length} hidden geometry reads`);
    // Prove the deferred controller wakes and still tracks actual visibility.
    await page.locator('.featured-strip').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.body.classList.contains('featured-gallery-active'));
    assert.equal(await page.locator('body.featured-gallery-active').count(),1,'Gallery dock state did not activate');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>!document.body.classList.contains('featured-gallery-active'));
    const geometry=await page.locator('.featured-strip').evaluate(section=>{const r=section.getBoundingClientRect();return{top:r.top,bottom:r.bottom,width:r.width,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};});
    assert(geometry.width>0&&geometry.documentWidth<=geometry.viewport+1,'Gallery/page overflow after recovery');
    assert.deepEqual(errors,[],'Unexpected page errors');
    if(spec.name==='ru-entry')await page.screenshot({path:resolve(out,'ru-gallery-after-entry.png'),fullPage:false});
    row.status='PASS';
  }catch(e){row.status='FAIL';row.error=String(e.stack);if(page)await page.screenshot({path:resolve(out,`${spec.name}-failure.png`)}).catch(()=>{});}
  finally{await context?.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`${row.status} ${row.name}: covered=${row.coveredReads.length}, total=${row.allReads.length}`);}
}
try{
  browser=await chromium.launch({headless:true});report.browser=browser.version();
  for(const spec of [
    {name:'tr-entry',language:'tr'},{name:'en-entry',language:'en'},{name:'ru-entry',language:'ru'},
    {name:'entry-off',language:'ru',off:true},{name:'reduced-motion',language:'ru',reduced:true},
    {name:'entry-module-failure',language:'ru',fail:'module'},{name:'entry-image-failure',language:'ru',fail:'image'}
  ])await runCase(spec);
}catch(e){report.environmentError=String(e.stack);}
finally{
  await browser?.close();await new Promise(r=>server.close(r));
  report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status==='FAIL').length;
  report.status=report.environmentError||report.failed?'FAIL':'PASS';
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,browser:report.browser}));
  if(report.status!=='PASS')process.exitCode=1;
}
