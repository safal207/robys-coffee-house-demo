import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
const repo = resolve(process.env.ROBYS_PERF_ROOT ?? new URL('..', import.meta.url).pathname);
const out = resolve(process.env.ROBYS_PERF_OUTPUT ?? '.artifacts/menu-responsiveness');
const budgets = JSON.parse(readFileSync(new URL('../qa/menu-interaction-budgets.json', import.meta.url), 'utf8'));
mkdirSync(out, {recursive:true});
const cert = mkdtempSync(join(tmpdir(), 'robys-perf-'));
execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048','-days','1','-keyout',join(cert,'key'),'-out',join(cert,'cert'),'-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
const publicKey = execFileSync('openssl',['x509','-in',join(cert,'cert'),'-pubkey','-noout']);
const der = execFileSync('openssl',['pkey','-pubin','-outform','DER'],{input:publicKey});
const pin = createHash('sha256').update(der).digest('base64');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer({key:readFileSync(join(cert,'key')),cert:readFileSync(join(cert,'cert'))},(req,res)=>{
 try {
 const pathname=new URL(req.url,'https://localhost').pathname;
 if(pathname==='/__perf-cache-probe.html') return res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>HTTP cache preflight</title>');
 let path=resolve(repo,'.'+decodeURIComponent(pathname));
 if(!path.startsWith(repo+sep)||!existsSync(path))return res.writeHead(404).end();
 if(statSync(path).isDirectory())path=join(path,'index.html');
 if(!existsSync(path))return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Cache-Control':'public, max-age=600'});createReadStream(path).pipe(res);
 }catch{res.writeHead(400).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`https://127.0.0.1:${server.address().port}`;
// Pin only this ephemeral lab certificate. Broad ignoreHTTPSErrors can leave
// SSL-error cache restrictions active and invalidate a cache-warming experiment.
const browser=await chromium.launch({headless:true,args:[`--ignore-certificate-errors-spki-list=${pin}`]});
const report={protocol:2,label:process.env.ROBYS_PERF_LABEL??'unlabelled',browser:browser.version(),environment:{server:'local HTTPS; emitted assets and CSP unchanged',cache:'HTTP cache enabled; ephemeral certificate SPKI pinned; verified fetch-to-stylesheet reuse',cpu:4,latencyMs:150,downloadMbps:1.6,serviceWorkers:'blocked',metric:'click capture to menu ready plus two animation frames; first feed photo decoded separately; not field INP',sourceRevision:process.env.ROBYS_SOURCE_REVISION??null},samples:[],rapidSamples:[],rapidErrors:[],rapidPreClickDelayMs:0,scroll:[]};
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
try {
 const probe=await browser.newContext();
 try {
   const page=await probe.newPage();
   await page.goto(`${origin}/__perf-cache-probe.html`);
   report.cachePreflight=await page.evaluate(async()=>{
     const url=new URL('menu-feed.css?perf-cache-preflight=1',location.href).href;
     await (await fetch(url)).arrayBuffer();await (await fetch(url)).arrayBuffer();
     await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=url;link.onload=resolve;link.onerror=reject;document.head.append(link);});
     return performance.getEntriesByName(url).map(e=>({initiatorType:e.initiatorType,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize}));
   });
   assert.ok(report.cachePreflight.length>=3,'Cache preflight must observe all three loads');
   assert.ok(report.cachePreflight[0].transferSize>0,'Probe must start uncached');
   assert.ok(report.cachePreflight.slice(1).every(e=>e.transferSize===0&&e.decodedBodySize>0),'HTTP cache and fetch-to-stylesheet reuse must work before performance is compared');
 }finally{await probe.close();}
 for(const width of budgets.viewports){
 // Separate contexts preserve the comparable normal profile while making the
 // first rapid switch genuinely cold. Rapid adds no intentional click delay;
 // each subsequent activation follows the previous completed view/photo.
 for(const profile of ['normal','rapid']){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
 await context.addInitScript(()=>{
   window.__qa={rects:0,frames:[],longTasks:[],ready:null,photoDone:false,photoReadyMs:null};
   const getRect=Element.prototype.getBoundingClientRect;
   Element.prototype.getBoundingClientRect=function(){if(this.matches('.feed-card'))window.__qa.rects++;return getRect.call(this);};
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__qa.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
   const readSwitch=()=>{try{return JSON.parse(sessionStorage.getItem('__qa_switch'));}catch{return null;}};
   let completedId=null,pendingId=null;
   const currentTarget=()=>/\/menu-feed\.html$/.test(location.pathname)?'feed':/\/menu\.html$/.test(location.pathname)?'list':null;
   const usable=target=>{
     const root=document.querySelector(target==='feed'?'#feed':'#menu-root');
     return currentTarget()===target&&document.documentElement?.dataset.menuViewReady==='true'
       &&root?.dataset.ready==='true'&&root.getClientRects().length>0
       &&document.querySelector(`nav [data-menu-view="${target}"][aria-current="page"]`);
   };
   document.addEventListener('click',e=>{const a=e.target.closest('a[data-menu-view]');if(a&&a.getAttribute('aria-current')!=='page'&&!e.ctrlKey&&!e.metaKey){
     const entry={id:crypto.randomUUID(),target:a.dataset.menuView,start:performance.timeOrigin+performance.now()};
     sessionStorage.setItem('__qa_switch',JSON.stringify(entry));
     window.__qa.ready=null;window.__qa.photoDone=false;window.__qa.photoReadyMs=null;
     queueMicrotask(check);
   }},true);
   function check(){
     const entry=readSwitch(),target=entry?.target??currentTarget(),id=entry?.id??'initial';
     if(!target||completedId===id||pendingId===id||!usable(target))return;
     pendingId=id;const start=entry?.start;
     const image=target==='feed'?document.querySelector('.feed-photo>img'):null;
     if(image)image.decode().then(()=>{
       if(readSwitch()?.id!==entry?.id)return;
       window.__qa.photoReadyMs=start&&image.naturalWidth>0?performance.timeOrigin+performance.now()-start:null;window.__qa.photoDone=true;
     }).catch(()=>{if(readSwitch()?.id===entry?.id)window.__qa.photoDone=true;});
     else window.__qa.photoDone=true;
     requestAnimationFrame(()=>requestAnimationFrame(()=>{
       pendingId=null;
       if(!usable(target)||(readSwitch()?.id??'initial')!==id)return check();
       completedId=id;window.__qa.ready={id,target,navigationMs:performance.now(),switchMs:start?performance.timeOrigin+performance.now()-start:null};
     }));
   }
   new MutationObserver(check).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-menu-view-ready','data-ready','aria-current','hidden']});check();
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/menu.html?view=list&lang=ru`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__qa.ready);
 for(let cycle=0;cycle<(profile==='normal'?budgets.cycles:budgets.rapidCycles);cycle++)for(const target of ['feed','list']){
   if(profile==='normal')await page.waitForTimeout(1800);
   const previousId=await page.evaluate(()=>window.__qa.ready.id);
   await page.locator(`.${target==='feed'?'menu':'feed'}-view-switch [data-menu-view="${target}"]`).click();
   await page.waitForURL(url=>url.pathname===(target==='feed'?'/menu-feed.html':'/menu.html'));
   await page.waitForFunction(({target,previousId})=>window.__qa.ready?.target===target&&window.__qa.ready.id!==previousId&&window.__qa.photoDone,{target,previousId});
   const data=await page.evaluate(()=>({...window.__qa.ready,photoReadyMs:window.__qa.photoReadyMs,longTasks:window.__qa.longTasks,resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),bytes:e.transferSize,duration:e.duration}))}));
   assert.ok(Number.isFinite(data.switchMs)&&data.switchMs>0,'A real navigation must have a positive click-to-ready sample');
   if(target==='feed')assert.ok(data.photoReadyMs>0,'The first feed photograph must decode successfully');
   (profile==='normal'?report.samples:report.rapidSamples).push({width,cycle,target,...data});console.log(JSON.stringify({profile,width,cycle,target,ms:data.switchMs,photoMs:data.photoReadyMs}));
 }
 if(profile==='rapid'){
   report.rapidErrors.push({width,errors});
   assert.deepEqual(errors,[],'Application errors invalidate rapid measurements');
   await context.close();continue;
 }
 await page.evaluate(()=>sessionStorage.removeItem('__qa_switch'));
 await page.goto(`${origin}/menu-feed.html?view=feed&lang=ru`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__qa.ready);
 await page.evaluate(()=>{let guard=0;const b=document.querySelector('#feed-more');while(!b.hidden&&guard++<100)b.click();});await page.waitForTimeout(1500);
 const scroll=await page.evaluate(async()=>{
   const q=window.__qa;q.rects=0;q.frames=[];q.longTasks=[];let running=true,previous=performance.now();
   function frame(t){if(!running)return;q.frames.push(t-previous);previous=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
   const positions=[];const stop=document.documentElement.scrollHeight-innerHeight;
   for(let i=0;i<100;i++){const direction=i<50?i:99-i;window.scrollTo({top:stop*direction/49,behavior:'instant'});await new Promise(r=>setTimeout(r,20));positions.push(scrollY);}
   running=false;return {rectReads:q.rects,frames:q.frames,longTasks:q.longTasks,cards:document.querySelectorAll('.feed-card').length,positions};
 });
 report.scroll.push({width,...scroll});report.samples.push({width,errors});assert.deepEqual(errors,[],'Application errors invalidate measurements');
 await page.screenshot({path:join(out,`feed-${width}.png`)});await context.close();
 }
 }
 report.summary={};
 for(const target of ['feed','list']){const data=report.samples.filter(s=>s.target===target).map(s=>s.switchMs);report.summary[target]={count:data.length,medianMs:percentile(data,.5),p95Ms:percentile(data,.95),maxMs:Math.max(...data)};}
 const photos=report.samples.filter(s=>s.target==='feed').map(s=>s.photoReadyMs);report.firstPhoto={medianMs:percentile(photos,.5),p95Ms:percentile(photos,.95)};
 report.rapidSummary={};
 for(const target of ['feed','list']){const data=report.rapidSamples.filter(s=>s.target===target).map(s=>s.switchMs);report.rapidSummary[target]={count:data.length,medianMs:percentile(data,.5),p95Ms:percentile(data,.95),maxMs:Math.max(...data)};}
 const rapidPhotos=report.rapidSamples.filter(s=>s.target==='feed').map(s=>s.photoReadyMs);report.rapidFirstPhoto={medianMs:percentile(rapidPhotos,.5),p95Ms:percentile(rapidPhotos,.95),maxMs:Math.max(...rapidPhotos)};
 report.scrollSummary=report.scroll.map(s=>({width:s.width,cards:s.cards,rectReads:s.rectReads,frames:s.frames.length,p95FrameGapMs:percentile(s.frames,.95),maxFrameGapMs:Math.max(...s.frames),longTasks:s.longTasks.length}));
 console.log(JSON.stringify({summary:report.summary,firstPhoto:report.firstPhoto,rapidSummary:report.rapidSummary,rapidFirstPhoto:report.rapidFirstPhoto,scroll:report.scrollSummary},null,2));
} finally {
 writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(r=>server.close(r));rmSync(cert,{recursive:true,force:true});
}
