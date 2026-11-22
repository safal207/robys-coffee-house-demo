import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { chromium } from "playwright";
import { compiled } from "./experiment-menu-first-section-render.mjs";

// Diagnostic only. Identical JS before and after each test candidate estimates
// ambient FCP jitter in cold mobile contexts. No shipped files are changed.
const BASE="https://safal207.github.io/robys-coffee-house-demo/";
const OUTPUT=".artifacts/menu-first-photo-experiment/fcp-attribution.json";
const IMG="#menu-root .full-menu-item-media img";
const cases=[
  {id:"default",href:"menu.html?view=list",repeats:8},
  {id:"search",href:"menu.html?view=list&q=latte",repeats:4}
];
const modes=["placebo-a","staged","placebo-b"];
const bundles={"placebo-a":compiled.control,staged:compiled["default-list-only"],"placebo-b":compiled.control};
assert.equal(bundles["placebo-a"],bundles["placebo-b"],"Placebo JS bytes must match");
assert.notEqual(bundles.staged,bundles["placebo-a"],"Candidate must differ from baseline");
const median=nums=>{const s=[...nums].sort((a,b)=>a-b);assert.ok(s.length);return (s[(s.length-1)>>1]+s[s.length>>1])/2;};
const rnd=n=>Math.round(n*10)/10;
async function measure(browser,route,mode,pair){
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:"tr-TR",serviceWorkers:"block"});
  const page=await ctx.newPage(),errors=[];
  let intercepted=0,requests=0;
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(/\/src\/products\/.+\.webp(?:\?|$)/.test(r.url()))requests++;});
  await page.addInitScript(()=>{
    window.__fcpLab={tasks:[]};
    try{new PerformanceObserver(list=>{for(const x of list.getEntries())window.__fcpLab.tasks.push([x.startTime,x.duration]);}).observe({type:"longtask",buffered:true});}catch{}
  });
  await page.route(url=>url.pathname.endsWith("/menu-app.js"),async routeHandler=>{
    const res=await routeHandler.fetch();
    assert.equal(res.status(),200);
    assert.equal(await res.text(),compiled.control,"Published runtime changed since experiment began");
    intercepted++;
    await routeHandler.fulfill({response:res,body:bundles[mode]});
  });
  const cdp=await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8,connectionType:"cellular3g"});
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
  await cdp.send("Performance.enable");
  try{
    const r=await page.goto(new URL(route.href,BASE).href,{waitUntil:"domcontentloaded",timeout:45000});
    assert.ok(r?.ok(),"Menu document unavailable");
    await page.waitForFunction(()=>document.querySelector("#menu-root")?.dataset.ready==="true"&&!!document.querySelector("#menu-root .full-menu-item-media img"),null,{timeout:45000});
    await page.waitForFunction(()=>performance.getEntriesByType("paint").some(e=>e.name==="first-contentful-paint"),null,{timeout:45000});
    // Passive FCP BEFORE the photo is scrolled into view or decoded.
    const passive=await page.evaluate(selector=>{
      const img=document.querySelector(selector),rect=img.getBoundingClientRect();
      const nav=performance.getEntriesByType("navigation")[0];
      const resources=performance.getEntriesByType("resource");
      const fcp=performance.getEntriesByType("paint").find(x=>x.name==="first-contentful-paint").startTime;
      const tasks=(window.__fcpLab?.tasks||[]).filter(([start])=>start<fcp);
      const js=resources.find(x=>new URL(x.name).pathname.endsWith("/menu-app.js"));
      return {
        fcpMs:fcp,firstPaintMs:performance.getEntriesByType("paint").find(x=>x.name==="first-paint")?.startTime??null,
        dclMs:nav?.domContentLoadedEventEnd??null,docResponseEndMs:nav?.responseEnd??null,
        scriptRequestMs:js?.startTime??null,scriptResponseMs:js?.responseEnd??null,
        firstPhotoY:rect.top,imageInViewport:rect.top<innerHeight&&rect.bottom>0,
        imageLoadedBeforeScroll:!!img.complete&&!!img.naturalWidth,
        preFcpLongTasks:tasks.length,preFcpLongTaskTotalMs:tasks.reduce((s,x)=>s+x[1],0),
        ids:[...document.querySelectorAll("#menu-root [data-product-id]")].map(x=>x.dataset.productId),
        sections:[...document.querySelectorAll("#menu-root .full-menu-panel")].map(x=>x.id)
      };
    },IMG);
    const requestsBeforeScroll=requests;
    const image=page.locator(IMG).first();
    await image.scrollIntoViewIfNeeded({timeout:45000});
    await page.waitForFunction(selector=>{const img=document.querySelector(selector);return img instanceof HTMLImageElement&&img.complete&&img.naturalWidth>0;},IMG,{timeout:45000});
    await image.evaluate(img=>img.decode());
    const photo=await page.evaluate(selector=>{
      const img=document.querySelector(selector),url=img.currentSrc||img.src;
      const r=performance.getEntriesByType("resource").find(e=>e.name===url);
      return {path:new URL(url).pathname,readyMs:performance.now(),requestStartMs:r?.startTime??null,transferBytes:r?.transferSize??null};
    },IMG);
    const perf=(await cdp.send("Performance.getMetrics")).metrics;
    const metrics=Object.fromEntries(perf.map(x=>[x.name,x.value]));
    assert.equal(intercepted,1);
    assert.deepEqual(errors,[],"No JS errors allowed");
    assert.ok(photo.path.includes("/src/products/")&&photo.requestStartMs!==null,"Must measure actual product image");
    assert.ok(passive.ids.length>0&&passive.sections.length>0);
    return {route:route.id,pair,mode,passive,photo,requestsBeforeScroll,imageRequests:requests,jsErrors:errors,bundleBytes:Buffer.byteLength(bundles[mode]),mainThread:{scriptS:metrics.ScriptDuration??null,tasksS:metrics.TaskDuration??null,layoutS:metrics.LayoutDuration??null}};
  }finally{await ctx.close();}
}
async function main(){
  const browser=await chromium.launch({headless:true}),samples=[],triplets=[];
  try{
    for(const route of cases)for(let pair=1;pair<=route.repeats;pair++){
      const group=[];
      for(const mode of modes){
        const sample=await measure(browser,route,mode,pair);
        samples.push(sample);group.push(sample);
        console.log("FCP_LAB_SAMPLE "+JSON.stringify({route:route.id,pair,mode,fcp:rnd(sample.passive.fcpMs),dcl:rnd(sample.passive.dclMs),photo:rnd(sample.photo.readyMs),preFcpLongTasks:rnd(sample.passive.preFcpLongTaskTotalMs)}));
      }
      const [a,b,c]=group;
      for(const control of [a,c]){
        assert.deepEqual(b.passive.ids,control.passive.ids,"Product order changed");
        assert.deepEqual(b.passive.sections,control.passive.sections,"Category order changed");
        assert.equal(b.photo.path,control.photo.path,"First product photo changed");
        assert.equal(b.photo.transferBytes,control.photo.transferBytes,"First image transfer changed");
      }
      const fcp=(a.passive.fcpMs+c.passive.fcpMs)/2;
      const photo=(a.photo.readyMs+c.photo.readyMs)/2;
      const record={route:route.id,pair,placeboFcpSpreadMs:Math.abs(a.passive.fcpMs-c.passive.fcpMs),stagedFcpPenaltyMs:b.passive.fcpMs-fcp,stagedSlowerThanBoth:b.passive.fcpMs>Math.max(a.passive.fcpMs,c.passive.fcpMs),stagedPhotoGainMs:photo-b.photo.readyMs,stagedPhotoFasterThanBoth:b.photo.readyMs<Math.min(a.photo.readyMs,c.photo.readyMs),stagedPreFcpLongTaskDeltaMs:b.passive.preFcpLongTaskTotalMs-(a.passive.preFcpLongTaskTotalMs+c.passive.preFcpLongTaskTotalMs)/2,controlFcpMs:[a.passive.fcpMs,c.passive.fcpMs]};
      triplets.push(record);
      console.log("FCP_LAB_TRIPLET "+JSON.stringify(record));
    }
  }finally{await browser.close();}
  const summary=cases.map(r=>{
    const d=triplets.filter(x=>x.route===r.id);
    return {route:r.id,pairs:d.length,placeboFcpMedianSpreadMs:rnd(median(d.map(x=>x.placeboFcpSpreadMs))),placeboFcpMaxSpreadMs:rnd(Math.max(...d.map(x=>x.placeboFcpSpreadMs))),stagedFcpPenaltyMedianMs:rnd(median(d.map(x=>x.stagedFcpPenaltyMs))),stagedFcpOver100MsPairs:d.filter(x=>x.stagedFcpPenaltyMs>100).length,stagedFcpSlowerThanBothPairs:d.filter(x=>x.stagedSlowerThanBoth).length,stagedPhotoGainMedianMs:rnd(median(d.map(x=>x.stagedPhotoGainMs))),stagedPhotoFasterThanBothPairs:d.filter(x=>x.stagedPhotoFasterThanBoth).length,preFcpLongTaskDeltaMedianMs:rnd(median(d.map(x=>x.stagedPreFcpLongTaskDeltaMs)))};
  });
  const report={schema:"robys.fcp-negative-control-lab.v1",source:"published pages with test-only compiled JS",synthetic:true,shipApproved:false,network:{rttMs:150,downMbps:1.6,cpuSlowdown:4},caveats:["The two placebo controls serve byte-identical JS in fresh browser contexts","FCP is passive before any Playwright scroll or photo decoding","Photo time is after forced scrolling and is not field LCP","Interception changes browser network delivery equally in all conditions","Pre-FCP long tasks are observational and do not identify specific source functions","This experiment cannot establish field performance or authorize deployment"],summary,triplets,samples};
  mkdirSync(".artifacts/menu-first-photo-experiment",{recursive:true});
  writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n");
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,"## Same-byte FCP negative controls (not deployed)\n\n| Route | Control FCP spread median/max | Staged FCP penalty | Staged photo gain | FCP > +100ms |\n|---|---:|---:|---:|---:|\n"+summary.map(x=>"| "+x.route+" | "+x.placeboFcpMedianSpreadMs+"/"+x.placeboFcpMaxSpreadMs+" ms | "+x.stagedFcpPenaltyMedianMs+" ms | "+x.stagedPhotoGainMedianMs+" ms | "+x.stagedFcpOver100MsPairs+"/"+x.pairs+" |").join("\n")+"\n\nObservational synthetic data only; no ship decision.\n");
  console.log("FCP_LAB_SUMMARY "+JSON.stringify(summary));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
