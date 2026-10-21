import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const repo = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.env.ROBYS_PERF_OUTPUT ?? '.artifacts/menu-performance');
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'robys-menu-performance-'));
execFileSync('openssl', ['req','-x509','-nodes','-newkey','rsa:2048','-days','1','-keyout',join(tmp,'key.pem'),'-out',join(tmp,'cert.pem'),'-subj','/CN=localhost'], {stdio:'ignore'});
const latency = Number(process.env.ROBYS_PERF_LATENCY ?? 80);
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png','.json':'application/json','.jpg':'image/jpeg'};
const requests = [];
const server = createServer({key:readFileSync(join(tmp,'key.pem')),cert:readFileSync(join(tmp,'cert.pem'))}, (req,res) => {
  const url = new URL(req.url,'https://localhost');
  const file = resolve(repo, '.'+decodeURIComponent(url.pathname));
  if (!file.startsWith(repo+sep) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
  requests.push({url:req.url,purpose:req.headers['sec-purpose']??req.headers.purpose??'',destination:req.headers['sec-fetch-dest']});
  setTimeout(() => {
    res.writeHead(200, {'content-type':types[extname(file)]??'application/octet-stream', 'cache-control':'public, max-age=600', 'content-length':statSync(file).size});
    createReadStream(file).pipe(res);
  },latency);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = `https://127.0.0.1:${server.address().port}`;
const report = {sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(), browser:null,
  conditions:{viewport:'390x844',cpuSlowdown:4,requestDelayMs:latency,bandwidth:'unlimited local HTTPS; latency only, not a real 4G simulation',serviceWorkers:'blocked',httpCache:'enabled, max-age=600',warmupMs:1200,readiness:'menu ready marker plus two animation frames; first photo is a separately observed upper bound'},
  assetHashes:Object.fromEntries(['menu-app.js','menu-feed.js','menu-view-mode.js','menu-feed.css'].map(f=>[f,createHash('sha256').update(readFileSync(join(repo,f))).digest('hex')])),switches:[],scroll:{},errors:[]};
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.ROBYS_CHROMIUM_PATH?{executablePath:process.env.ROBYS_CHROMIUM_PATH}:{})});
  report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,serviceWorkers:'block'});
  await context.addInitScript(() => {
    window.__menuPerf={cardReads:0,frameGaps:[],longTasks:[],readyAt:null,feedReplacements:0,warmFetches:[]};
    const originalFetch=window.fetch;
    window.fetch=function(input,options){if(options?.cache==='force-cache'&&options?.priority==='low')window.__menuPerf.warmFetches.push(String(input));return originalFetch.call(this,input,options);};
    const original=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(...args){ if(this.classList.contains('feed-card'))window.__menuPerf.cardReads++;return original.apply(this,args); };
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__menuPerf.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
    new MutationObserver(() => {
      if(document.documentElement?.dataset.menuViewReady==='true'&&!window.__menuPerf.readyAt){
        window.__menuPerf.readyAt=-1;
        requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__menuPerf.readyAt=performance.timeOrigin+performance.now();}));
      }
    }).observe(document,{attributes:true,subtree:true,attributeFilter:['data-menu-view-ready']});
    new MutationObserver(records=>{for(const r of records)if(r.target.id==='feed'&&r.removedNodes.length)window.__menuPerf.feedReplacements++;}).observe(document,{childList:true,subtree:true});
    document.addEventListener('click',e=>{
      if(e.target.closest?.('a[data-menu-view]'))sessionStorage.setItem('robys-qa-click-at',String(performance.timeOrigin+performance.now()));
    },true);
  });
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto(`${base}/menu.html?view=list&lang=ru`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__menuPerf.readyAt>0);
  for(let i=0;i<8;i++){
    await page.waitForTimeout(1200);
    const mode=i%2===0?'feed':'list';
    const selector=mode==='feed'?'.menu-view-switch a[data-menu-view="feed"]':'.feed-view-switch a[data-menu-view="list"]';
    const old=page.url();
    await page.locator(selector).click();
    await page.waitForURL(url=>url.href!==old);
    await page.waitForFunction(()=>window.__menuPerf.readyAt>0);
    report.switches.push(await page.evaluate(mode=>({to:mode,readyMs:window.__menuPerf.readyAt-Number(sessionStorage.getItem('robys-qa-click-at')),domElements:document.querySelectorAll('*').length,navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),longTasks:window.__menuPerf.longTasks}),mode));
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');
    if(mode==='feed'){
      await page.waitForFunction(()=>{const image=document.querySelector('.feed-photo>img');return image?.complete&&image.naturalWidth>0;});
      report.switches.at(-1).firstPhotoObservedMs=await page.evaluate(()=>performance.timeOrigin+performance.now()-Number(sessionStorage.getItem('robys-qa-click-at')));
    }
  }
  await page.goto(`${base}/menu-feed.html?view=feed&lang=ru`);
  await page.waitForFunction(()=>window.__menuPerf.readyAt>0);
  await page.evaluate(()=>{for(let i=0;i<30&&!document.querySelector('#feed-more').hidden;i++)document.querySelector('#feed-more').click();});
  await page.waitForTimeout(500);
  report.scroll=await page.evaluate(async()=>{
    const stats=window.__menuPerf;stats.cardReads=0;stats.longTasks=[];
    const frames=[];let last=performance.now();
    const distance=Math.min(12000,document.documentElement.scrollHeight-innerHeight);
    for(let i=0;i<100;i++){
      await new Promise(requestAnimationFrame);
      const now=performance.now();frames.push(now-last);last=now;
      window.scrollTo({top:(i<50?i/49:(99-i)/49)*distance,behavior:'instant'});
    }
    await new Promise(requestAnimationFrame);
    return {cards:document.querySelectorAll('.feed-card').length,frames,cardRectReads:stats.cardReads,longTasks:stats.longTasks,counter:document.querySelector('#feed-counter').textContent};
  });
  if (process.env.ROBYS_PERF_ENFORCE === '1') {
    assert.ok(report.switches.every(s=>s.readyMs>0&&s.readyMs<=1500),'Every measured mode change must meet the 1.5-second lab readiness budget');
    assert.ok(report.scroll.cardRectReads < 1200, 'Scroll geometry must be bounded to near-screen cards, not the complete feed');
    const originBefore=await page.evaluate(()=>performance.timeOrigin);
    await page.locator('.feed-view-switch a[data-menu-view="feed"]').click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>performance.timeOrigin),originBefore,'Tapping the active mode must not reload the menu');
    await page.goto(`${base}/menu-feed.html?view=feed&lang=ru&q=latte`);
    await page.waitForFunction(()=>window.__menuPerf.readyAt>0);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.__menuPerf.feedReplacements),0,'Initial query must not destroy and recreate the first batch');
    assert.equal(await page.locator('#feed-search').inputValue(),'latte');
    await page.waitForFunction(()=>window.__menuPerf.warmFetches.length>0);
    const warm=await page.evaluate(()=>window.__menuPerf.warmFetches);
    assert.ok(warm.length<=4&&new Set(warm).size===warm.length,'Warmup must be bounded and deduplicated, not fetch documents or the catalog');
    assert.ok(warm.every(url=>/\/(?:menu-app|menu-feed|menu-view-mode|bootstrap-v2|menu-product-reveal|pairing-posters)\.(?:js|css)\?v=/.test(url)));
    report.warmFetches=warm;
    report.functionalChecks=['all measured switches within 1500ms','bounded scroll geometry','active mode no-op','query restored before first render','bounded same-origin HTTP-cache warmup'];
    for (const connection of [{saveData:true,effectiveType:'4g'},{saveData:false,effectiveType:'2g'}]) {
      const limited=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,serviceWorkers:'block'});
      await limited.addInitScript(connection=>Object.defineProperty(navigator,'connection',{configurable:true,value:connection}),connection);
      const limitedPage=await limited.newPage();
      const speculative=[];
      limitedPage.on('request',request=>{if(request.resourceType()==='fetch')speculative.push(request.url());});
      await limitedPage.goto(`${base}/menu-feed.html?view=feed&lang=en`);
      await limitedPage.waitForTimeout(1600);
      await limitedPage.locator('.feed-view-switch a[data-menu-view="list"]').focus();
      assert.equal(speculative.length,0,'Reduced-data connections must not prefetch on idle or focus');
      await limited.close();
    }
    report.functionalChecks.push('Data Saver and 2G skip speculative downloads');
  }
  await page.screenshot({path:join(out,'feed-mobile.png')});
  report.requests=requests;
  assert.deepEqual(report.errors,[]);
  report.status='passed';
  await context.close();
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}
finally{
  await browser?.close();await new Promise(r=>server.close(r));rmSync(tmp,{recursive:true,force:true});
  writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,switches:report.switches.map(x=>({to:x.to,readyMs:Math.round(x.readyMs)})),scroll:{cards:report.scroll.cards,cardRectReads:report.scroll.cardRectReads,framesOver50ms:report.scroll.frames?.filter(n=>n>50).length},error:report.error}));
}
