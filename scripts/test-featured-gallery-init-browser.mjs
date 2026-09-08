/** Real production page and resources. The only request aborts are named negative controls.
 * This test observes gallery DOM/resource timing; it does not replace Motion cadence.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!path.startsWith(root+sep))throw new Error('outside root');
    const body=await readFile(path);
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2'}[extname(path)]??'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];
const galleryResources=()=>performance.getEntriesByType('resource').filter(e=>/\/gallery-v5\//.test(e.name)).map(e=>({name:e.name,startTime:e.startTime,duration:e.duration}));
async function run(spec){
 const result={name:spec.name,status:'RUNNING'};results.push(result);
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'tr-TR',timezoneId:'Europe/Istanbul',reducedMotion:spec.reduce?'reduce':'no-preference',serviceWorkers:'block'});
 let page;
 try{
  await context.addInitScript(({language})=>{
    try{localStorage.setItem('robys-language',language);}catch{}
    globalThis.__galleryInitEntryEvents=[];
    window.addEventListener('robys:entry-state',e=>globalThis.__galleryInitEntryEvents.push({...e.detail,at:performance.now()}));
  },{language:spec.language??'tr'});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(spec.fail==='module')await page.route('**/takeaway-entry.js*',r=>r.abort());
  if(spec.fail==='image')await page.route('**/src/brand/robys-takeaway-cup-v1.webp*',r=>r.abort());
  await page.goto(`${origin}/?entry=${spec.off?'off':'morning'}`,{waitUntil:'domcontentloaded',timeout:15000});
  const gallery=page.locator('.featured-track');
  if(!spec.off&&!spec.reduce&&!spec.fail){
    await page.waitForFunction(()=>document.documentElement.dataset.robysEntryState==='brand-frame');
    await page.waitForTimeout(60);
    const covered=await page.evaluate(()=>({pending:Boolean(document.documentElement.dataset.robysEntryPending),state:document.documentElement.dataset.robysEntryState,children:document.querySelector('.featured-track')?.children.length??-1,ready:document.querySelector('.featured-track')?.dataset.galleryReady??null,resources:performance.getEntriesByType('resource').filter(e=>/\/gallery-v5\//.test(e.name)).map(e=>({name:e.name,startTime:e.startTime}))}));
    assert(covered.pending&&covered.state==='brand-frame');
    assert.equal(covered.children,0,'Gallery cards were built behind the fullscreen entry');
    assert.equal(covered.ready,null,'Gallery declared ready behind the fullscreen entry');
    assert.equal(covered.resources.length,0,'Gallery image loading started behind the fullscreen entry');
    if(spec.skip)await page.locator('.robys-takeaway-skip').click();
    await page.waitForFunction(()=>document.documentElement.dataset.robysEntryState==='done'&&!document.documentElement.dataset.robysEntryPending);
  } else if(spec.off||spec.reduce) {
    await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending);
  } else {
    await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending,{timeout:4000});
  }
  await page.waitForFunction(()=>document.querySelector('.featured-track')?.dataset.galleryReady==='true'&&document.querySelector('.featured-track')?.children.length===6);
  const snapshot=await page.evaluate(()=>({events:globalThis.__galleryInitEntryEvents,resources:performance.getEntriesByType('resource').filter(e=>/\/gallery-v5\//.test(e.name)).map(e=>({name:e.name,startTime:e.startTime,duration:e.duration})),ready:document.querySelector('.featured-track')?.dataset.galleryReady,children:document.querySelector('.featured-track')?.children.length,labels:[...document.querySelectorAll('.featured-card')].map(e=>e.getAttribute('aria-label'))}));
  result.snapshot=snapshot;
  if(!spec.off&&!spec.reduce&&!spec.fail){
    const handoff=snapshot.events.find(e=>e.state==='handoff');assert(handoff,'Missing handoff event');
    assert(snapshot.resources.length>0,'Gallery images never started after handoff');
    assert(Math.min(...snapshot.resources.map(r=>r.startTime))>=handoff.at-2,`Gallery resource started before handoff: ${JSON.stringify({handoff:handoff.at,resources:snapshot.resources})}`);
  }
  assert.equal(snapshot.ready,'true');assert.equal(snapshot.children,6);assert.deepEqual(errors,[]);
  const expected=spec.language==='ru'?'Латте':spec.language==='en'?'Latte':'Latte';assert(snapshot.labels[0]?.startsWith(expected));
  await gallery.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.body.classList.contains('featured-gallery-active'));
  await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>!document.body.classList.contains('featured-gallery-active'));
  result.status='PASS';
 }catch(e){result.status='FAIL';result.error=String(e.stack);}
 finally{await context.close();console.log(`${result.status} ${result.name}`);}
}
try{
 for(const language of ['tr','en','ru'])await run({name:`entry-${language}`,language});
 await run({name:'skip-during-entry',language:'ru',skip:true});
 await run({name:'entry-off',language:'ru',off:true});
 await run({name:'reduced-motion',language:'ru',reduce:true});
 await run({name:'module-failure-recovery',language:'ru',fail:'module'});
 await run({name:'image-failure-recovery',language:'ru',fail:'image'});
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
