import { createServer } from 'node:https';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
const repo = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.env.ROBYS_PERF_OUTPUT ?? '.artifacts/menu-responsiveness');
mkdirSync(out, {recursive:true});
const cert = mkdtempSync(join(tmpdir(), 'robys-perf-'));
execFileSync('openssl',['req','-x509','-nodes','-newkey','rsa:2048','-days','1','-keyout',join(cert,'key'),'-out',join(cert,'cert'),'-subj','/CN=localhost'],{stdio:'ignore'});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer({key:readFileSync(join(cert,'key')),cert:readFileSync(join(cert,'cert'))},(req,res)=>{
 try {
 let path=resolve(repo,'.'+decodeURIComponent(new URL(req.url,'https://localhost').pathname));
 if(!path.startsWith(repo+sep)||!existsSync(path))return res.writeHead(404).end();
 if(statSync(path).isDirectory())path=join(path,'index.html');
 if(!existsSync(path))return res.writeHead(404).end();
 res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Cache-Control':'public, max-age=600'});createReadStream(path).pipe(res);
 }catch{res.writeHead(400).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`https://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
const report={label:process.env.ROBYS_PERF_LABEL??'unlabelled',browser:browser.version(),environment:{server:'local HTTPS, unchanged emitted assets and CSP; HTTP cache enabled',cpu:4,latencyMs:150,downloadMbps:1.6,serviceWorkers:'blocked',metric:'click capture to menu ready plus two animation frames; not field INP',sourceRevision:process.env.ROBYS_SOURCE_REVISION??null},samples:[],scroll:[]};
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
try {
 for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:844},ignoreHTTPSErrors:true,serviceWorkers:'block'});
 await context.addInitScript(()=>{
   window.__qa={rects:0,frames:[],longTasks:[],ready:null};
   const getRect=Element.prototype.getBoundingClientRect;
   Element.prototype.getBoundingClientRect=function(){if(this.matches('.feed-card'))window.__qa.rects++;return getRect.call(this);};
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__qa.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
   document.addEventListener('click',e=>{const a=e.target.closest('a[data-menu-view]');if(a&&a.getAttribute('aria-current')!=='page'&&!e.ctrlKey&&!e.metaKey){sessionStorage.setItem('__qa_switch',String(performance.timeOrigin+performance.now()));}},true);
   let done=false;
   function check(){if(!done&&document.documentElement?.dataset.menuViewReady==='true'){
     done=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{const start=Number(sessionStorage.getItem('__qa_switch'));window.__qa.ready={navigationMs:performance.now(),switchMs:start?performance.timeOrigin+performance.now()-start:null};sessionStorage.removeItem('__qa_switch');}));}}
   new MutationObserver(check).observe(document,{subtree:true,attributes:true,attributeFilter:['data-menu-view-ready']});check();
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);
 const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${origin}/menu.html?view=list&lang=ru`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__qa.ready);
 for(let cycle=0;cycle<4;cycle++)for(const target of ['feed','list']){
   await page.waitForTimeout(1800);
   await page.locator(`.${target==='feed'?'menu':'feed'}-view-switch [data-menu-view="${target}"]`).click();
   await page.waitForURL(url=>url.pathname===(target==='feed'?'/menu-feed.html':'/menu.html'));
   await page.waitForFunction(()=>window.__qa.ready);
   const data=await page.evaluate(()=>({...window.__qa.ready,longTasks:window.__qa.longTasks,resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),bytes:e.transferSize,duration:e.duration}))}));
   report.samples.push({width,cycle,target,...data});console.log(JSON.stringify({width,cycle,target,ms:data.switchMs}));
 }
 await page.goto(`${origin}/menu-feed.html?view=feed&lang=ru`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__qa.ready);
 await page.evaluate(()=>{let guard=0;const b=document.querySelector('#feed-more');while(!b.hidden&&guard++<100)b.click();});
 await page.waitForTimeout(1500);
 const scroll=await page.evaluate(async()=>{
   const q=window.__qa;q.rects=0;q.frames=[];q.longTasks=[];let running=true,previous=performance.now();
   function frame(t){if(!running)return;q.frames.push(t-previous);previous=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
   const positions=[];const stop=document.documentElement.scrollHeight-innerHeight;
   for(let i=0;i<100;i++){const direction=i<50?i:99-i;window.scrollTo({top:stop*direction/49,behavior:'instant'});await new Promise(r=>setTimeout(r,20));positions.push(scrollY);}
   running=false;return {rectReads:q.rects,frames:q.frames,longTasks:q.longTasks,cards:document.querySelectorAll('.feed-card').length,positions};
 });
 report.scroll.push({width,...scroll});report.samples.push({width,errors});
 await page.screenshot({path:join(out,`feed-${width}.png`)});
 await context.close();
 }
 report.summary={};
 for(const target of ['feed','list']){const data=report.samples.filter(s=>s.target===target).map(s=>s.switchMs);report.summary[target]={count:data.length,medianMs:percentile(data,.5),p95Ms:percentile(data,.95),maxMs:Math.max(...data)};}
 report.scrollSummary=report.scroll.map(s=>({width:s.width,cards:s.cards,rectReads:s.rectReads,frames:s.frames.length,p95FrameGapMs:percentile(s.frames,.95),maxFrameGapMs:Math.max(...s.frames),longTasks:s.longTasks.length}));
 console.log(JSON.stringify({summary:report.summary,scroll:report.scrollSummary},null,2));
} finally {
 writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(r=>server.close(r));rmSync(cert,{recursive:true,force:true});
}
