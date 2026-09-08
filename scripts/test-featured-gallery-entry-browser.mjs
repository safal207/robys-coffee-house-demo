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
async function run(spec){
  const result={name:spec.name,status:'RUNNING'};results.push(result);
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'tr-TR',timezoneId:'Europe/Istanbul',reducedMotion:spec.reduce?'reduce':'no-preference',serviceWorkers:'block'});
  let page;
  try{
    await context.addInitScript(({language})=>{
      try{localStorage.setItem('robys-language',language);}catch{}
      globalThis.__featuredGalleryReads=[];
      const original=Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect=function(...args){
        if(this.classList?.contains('featured-strip'))globalThis.__featuredGalleryReads.push({pending:Boolean(document.documentElement.dataset.robysEntryPending),state:document.documentElement.dataset.robysEntryState??null,at:performance.now()});
        return original.apply(this,args);
      };
    },{language:spec.language??'tr'});
    page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(spec.fail==='module')await page.route('**/takeaway-entry.js*',route=>route.abort());
    if(spec.fail==='image')await page.route('**/src/brand/robys-takeaway-cup-v1.webp*',route=>route.abort());
    await page.goto(`${origin}/?entry=${spec.off?'off':'morning'}`,{waitUntil:'domcontentloaded',timeout:15000});
    if(!spec.off&&!spec.reduce&&!spec.fail){
      await page.waitForFunction(()=>document.documentElement.dataset.robysEntryState==='brand-frame');
      await page.waitForTimeout(50);
      const covered=await page.evaluate(()=>globalThis.__featuredGalleryReads.filter(r=>r.pending&&!['handoff','done'].includes(r.state)));
      assert.equal(covered.length,0,`gallery read ${covered.length} times behind loading/brand frame`);
      if(spec.skip)await page.locator('.robys-takeaway-skip').click();
      await page.waitForFunction(()=>document.documentElement.dataset.robysEntryState==='done'&&!document.documentElement.dataset.robysEntryPending);
    }else if(spec.off||spec.reduce){
      await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending);
    }else{
      await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending,{timeout:4000});
      const covered=await page.evaluate(()=>globalThis.__featuredGalleryReads.filter(r=>r.pending&&!['handoff','done'].includes(r.state)));
      assert.equal(covered.length,0,`failed entry still caused ${covered.length} covered gallery reads`);
    }
    await page.waitForFunction(()=>globalThis.__featuredGalleryReads.some(r=>!r.pending||r.state==='handoff'||r.state==='done'));
    assert.deepEqual(errors,[]);
    await page.locator('.featured-strip').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.body.classList.contains('featured-gallery-active'));
    await page.evaluate(()=>scrollTo(0,0));
    await page.waitForFunction(()=>!document.body.classList.contains('featured-gallery-active'));
    result.reads=await page.evaluate(()=>globalThis.__featuredGalleryReads);
    result.coveredReads=result.reads.filter(r=>r.pending&&!['handoff','done'].includes(r.state)).length;
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
