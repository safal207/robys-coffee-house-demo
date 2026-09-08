/** Real production page. This verifies loading intent and recovery, not a claimed
 * network-byte or startup-speed improvement: Chromium may still opportunistically
 * fetch lazy images based on its distance heuristic.
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
    const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+sep))throw new Error('outside root');
    const body=await readFile(file);
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2'}[extname(file)]??'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[];
async function run({name,entry='off',language='ru',reducedMotion='no-preference'}){
  const result={name,status:'RUNNING'};results.push(result);
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'tr-TR',timezoneId:'Europe/Istanbul',reducedMotion,serviceWorkers:'block'});
  let page;
  try{
    await context.addInitScript(({language})=>{try{localStorage.setItem('robys-language',language);}catch{}},{language});
    page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${origin}/?entry=${entry}`,{waitUntil:'domcontentloaded',timeout:15000});
    if(entry==='morning'&&reducedMotion!=='reduce')await page.waitForFunction(()=>document.documentElement.dataset.robysEntryState==='brand-frame');
    const initial=await page.evaluate(()=>{
      const section=document.querySelector('.featured-strip');
      const images=[...document.querySelectorAll('.featured-track img')];
      const rect=section?.getBoundingClientRect();
      return {viewport:innerHeight,sectionTop:rect?.top??null,count:images.length,
        loading:images.map(img=>img.getAttribute('loading')),priority:images.map(img=>img.getAttribute('fetchpriority')),
        ready:document.querySelector('.featured-track')?.dataset.galleryReady??null};
    });
    result.initial=initial;
    assert.equal(initial.count,6,'Expected six progressive gallery cards');
    assert(initial.loading.every(value=>value==='lazy'),`Gallery loading drift: ${JSON.stringify(initial.loading)}`);
    assert(initial.priority.every(value=>value===null),'Below-fold gallery must not request explicit fetch priority');
    assert(Number(initial.sectionTop)>Number(initial.viewport),'Gallery must remain below the initial mobile viewport for this loading contract');
    if(entry==='morning'&&reducedMotion!=='reduce')await page.locator('.robys-takeaway-skip').click();
    await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending,{timeout:4000});
    await page.waitForFunction(()=>document.querySelector('.featured-track')?.dataset.galleryReady==='true');
    await page.locator('.featured-strip').scrollIntoViewIfNeeded();
    const first=page.locator('.featured-track img').first();
    await page.waitForFunction(()=>{const img=document.querySelector('.featured-track img');return img?.complete&&img.naturalWidth>0;});
    assert(await first.isVisible());
    await page.waitForFunction(()=>document.body.classList.contains('featured-gallery-active'));
    result.loaded=await first.evaluate(img=>({complete:img.complete,naturalWidth:img.naturalWidth,loading:img.loading,priority:img.getAttribute('fetchpriority')}));
    assert.equal(result.loaded.loading,'lazy');assert.equal(result.loaded.priority,null);assert(result.loaded.naturalWidth>0);
    assert.deepEqual(errors,[]);result.status='PASS';
  }catch(e){result.status='FAIL';result.error=String(e.stack);}
  finally{await context.close();console.log(`${result.status} ${name}`);}
}
try{
  await run({name:'entry-off-ru'});
  await run({name:'entry-morning-tr',entry:'morning',language:'tr'});
  await run({name:'entry-morning-en',entry:'morning',language:'en'});
  await run({name:'reduced-motion-ru',entry:'morning',reducedMotion:'reduce'});
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
