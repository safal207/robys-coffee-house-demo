import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { compiled } from "./experiment-menu-first-section-render.mjs";

// Trace the category's natural lazy-loading lifecycle, comparing unchanged JS
// against guarded staged-render candidate. No site/code/image is deployed.
const BASE="https://safal207.github.io/robys-coffee-house-demo/";
const URL=new URL("menu.html?view=list#desserts", BASE).href;
const FILE=".artifacts/menu-first-photo-experiment/category-image-lifecycle.json";
const FIRST="#menu-root .full-menu-item-media img";
const runs=5;
const modes=["control","guarded"];
const runtime={control:compiled.control,guarded:compiled["default-list-only"]};
const median=a=>{assert.ok(a.length);const b=[...a].sort((x,y)=>x-y);return(b[(b.length-1)>>1]+b[b.length>>1])/2;};
const round=x=>Math.round(x*10)/10;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function normalize(url){
  try{return new URL(url).pathname;}catch{return url;}
}
async function snapshot(page){
  return page.evaluate(()=>{
    const photos=[...document.querySelectorAll("#menu-root .full-menu-item-media img")];
    return {
      at:performance.now(),
      scrollY:window.scrollY,
      ready:document.querySelector("#menu-root")?.dataset.ready==="true",
      hash:location.hash,
      sections:[...document.querySelectorAll("#menu-root .full-menu-panel")].map(x=>x.id),
      ids:[...document.querySelectorAll("#menu-root [data-product-id]")].map(x=>x.dataset.productId),
      photos:photos.map((img,i)=>{
        const box=img.getBoundingClientRect();
        return {index:i,path:img.currentSrc?new URL(img.currentSrc).pathname:null,
          src:img.getAttribute("src"),deferred:img.hasAttribute("data-menu-lazy-src"),
          complete:img.complete,decoded:img.naturalWidth>0,
          y:Math.round(box.top),inViewport:box.top<innerHeight&&box.bottom>0,
          nearViewport:box.top<innerHeight+150&&box.bottom>-150};
      })
    };
  });
}
function requestSummary(records){
  const started=records.filter(x=>x.started!==null);
  const byUrl={};for(const record of started){
    const path=record.url;
    if(!byUrl[path])byUrl[path]={starts:0,finished:0,failed:0,
      responseStatuses:[],chosenResourceTypes:[]};
    const entry=byUrl[path];entry.starts++;
    if(record.finished!==null)entry.finished++;
    if(record.failed!==null)entry.failed++;
    if(record.status!==null)entry.responseStatuses.push(record.status);
    entry.chosenResourceTypes.push(record.type);
  }
  const duplicateUrls=Object.entries(byUrl).filter(([,x])=>x.starts>1).map(([path,x])=>({path,...x}));
  return {requestStarts:started.length,uniqueUrls:Object.keys(byUrl).length,
    finished:started.filter(x=>x.finished!==null).length,
    failed:started.filter(x=>x.failed!==null).length,
    unfinished:started.filter(x=>x.finished===null&&x.failed===null).length,
    duplicateUrls,perUrl:byUrl};
}
async function capture(browser, mode, pair){
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    locale:"tr-TR",serviceWorkers:"block"
  });
  const page=await context.newPage(),errors=[],records=[],live=new Map();
  let intercepts=0;
  const started=performance.now();
  const stamp=()=>round(performance.now()-started);
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",req=>{
    if(!/\/src\/products\/.+\.webp(?:\?|$)/.test(req.url()))return;
    const rec={url:normalize(req.url()),type:req.resourceType(),
      started:stamp(),responded:null,status:null,finished:null,failed:null,failure:null};
    records.push(rec);live.set(req,rec);
  });
  page.on("response",res=>{
    const rec=live.get(res.request());
    if(rec){rec.responded=stamp();rec.status=res.status();}
  });
  page.on("requestfinished",req=>{
    const rec=live.get(req);
    if(rec){rec.finished=stamp();live.delete(req);}
  });
  page.on("requestfailed",req=>{
    const rec=live.get(req);
    if(rec){rec.failed=stamp();rec.failure=req.failure();live.delete(req);}
  });
  await page.route(url=>url.pathname.endsWith("/menu-app.js"),async route=>{
    const response=await route.fetch();
    assert.equal(response.status(),200);
    assert.equal(await response.text(),compiled.control,
      "Published bundle changed; do not compare unmatched versions");
    intercepts++;
    await route.fulfill({response,body:runtime[mode]});
  });
  const cdp=await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions",{
    offline:false,latency:150,downloadThroughput:1600000/8,
    uploadThroughput:750000/8,connectionType:"cellular3g"
  });
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
  try{
    const res=await page.goto(URL,{waitUntil:"domcontentloaded",timeout:45000});
    assert.ok(res?.ok(),"Category URL did not load");
    await page.waitForFunction(()=>
      document.querySelector("#menu-root")?.dataset.ready==="true" &&
      document.querySelectorAll("#menu-root [data-product-id]").length>=1,
      null,{timeout:30000});
    const preScroll={dom:await snapshot(page),network:requestSummary(records)};
    // Reproduce original photo benchmark: Playwright scrollIntoView then decode.
    const first=page.locator(FIRST).first();
    await first.scrollIntoViewIfNeeded({timeout:30000});
    await page.waitForFunction(selector=>{
      const img=document.querySelector(selector);
      return img instanceof HTMLImageElement&&img.complete&&img.naturalWidth>0;
    },FIRST,{timeout:45000});
    await first.evaluate(img=>img.decode());
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const photoReadyMs=await page.evaluate(()=>performance.now());
    const postScroll={dom:await snapshot(page),network:requestSummary(records)};
    // Fixed window + finite request-drain sampling distinguish in-flight versus
    // persistent additional requests; timeout is recorded, not treated as pass.
    await page.waitForTimeout(1200);
    const late={dom:await snapshot(page),network:requestSummary(records)};
    try{await page.waitForLoadState("networkidle",{timeout:6000});}
    catch{/* long-running prefetch is a recorded bounded observation, not a test failure */}
    await pause(250);
    const settled={dom:await snapshot(page),network:requestSummary(records)};
    assert.equal(intercepts,1,"One runtime interception expected");
    assert.deepEqual(errors,[],"No browser JS errors");
    assert.equal(settled.dom.hash,"#desserts");
    assert.deepEqual(settled.dom.sections,["desserts"]);
    assert.ok(settled.dom.photos.length>=1);
    assert.equal(settled.network.failed,0,"Failed product image request");
    return {
      pair,mode,photoReadyMs,preScroll,postScroll,late,settled,
      imageRequests:records,errors,bundleBytes:Buffer.byteLength(runtime[mode])
    };
  }finally{await context.close();}
}
async function main(){
  const browser=await chromium.launch({headless:true});
  const samples=[],pairs=[];
  try{
    for(let pair=1;pair<=runs;pair++){
      // Alternate order so the same runtime isn't always first.
      const order=pair%2===1?modes:[...modes].reverse();
      const current=[];
      for(const mode of order){
        const sample=await capture(browser,mode,pair);
        samples.push(sample);current.push(sample);
        console.log("CATEGORY_LIFECYCLE_SAMPLE "+JSON.stringify({
          pair,mode,photoReadyMs:round(sample.photoReadyMs),
          preScroll:sample.preScroll.network.requestStarts,
          postScroll:sample.postScroll.network.requestStarts,
          late:sample.late.network.requestStarts,
          settled:sample.settled.network.requestStarts,
          distinctURLs:sample.settled.network.uniqueUrls,
          repeatedUrls:sample.settled.network.duplicateUrls.length,
          pending:sample.settled.network.unfinished,
          scrollY:sample.postScroll.dom.scrollY
        }));
      }
      const a=current.find(x=>x.mode==="control"),b=current.find(x=>x.mode==="guarded");
      assert.ok(a&&b);
      for(const phase of ["preScroll","postScroll","late","settled"]){
        assert.deepEqual(b[phase].dom.ids,a[phase].dom.ids,
          "Product order mismatch at "+phase);
        assert.deepEqual(b[phase].dom.sections,a[phase].dom.sections,
          "Category mismatch at "+phase);
      }
      const candidateOnly=Object.keys(b.settled.network.perUrl)
        .filter(x=>!a.settled.network.perUrl[x]);
      const controlOnly=Object.keys(a.settled.network.perUrl)
        .filter(x=>!b.settled.network.perUrl[x]);
      const result={
        pair,
        photoGainMs:a.photoReadyMs-b.photoReadyMs,
        requestStartDeltaAtPhoto:b.postScroll.network.requestStarts-a.postScroll.network.requestStarts,
        requestStartDeltaAfterWait:b.late.network.requestStarts-a.late.network.requestStarts,
        requestStartDeltaSettled:b.settled.network.requestStarts-a.settled.network.requestStarts,
        distinctUrlDeltaSettled:b.settled.network.uniqueUrls-a.settled.network.uniqueUrls,
        duplicateUrlDeltaSettled:b.settled.network.duplicateUrls.length-a.settled.network.duplicateUrls.length,
        unfinishedDeltaSettled:b.settled.network.unfinished-a.settled.network.unfinished,
        candidateOnlyUrls:candidateOnly,controlOnlyUrls:controlOnly,
        scrollDeltaPx:b.postScroll.dom.scrollY-a.postScroll.dom.scrollY
      };
      pairs.push(result);
      console.log("CATEGORY_LIFECYCLE_PAIR "+JSON.stringify(result));
    }
  }finally{await browser.close();}
  const summary={
    comparisons:pairs.length,
    medianPhotoGainMs:round(median(pairs.map(x=>x.photoGainMs))),
    snapshotExtraRequestPairs:pairs.filter(x=>x.requestStartDeltaAtPhoto>0).length,
    delayedExtraRequestPairs:pairs.filter(x=>x.requestStartDeltaAfterWait>0).length,
    settledExtraRequestPairs:pairs.filter(x=>x.requestStartDeltaSettled>0).length,
    settledUniqueUrlDiffPairs:pairs.filter(x=>x.distinctUrlDeltaSettled!==0).length,
    settledDuplicateUrlDiffPairs:pairs.filter(x=>x.duplicateUrlDeltaSettled!==0).length,
    maxAbsoluteScrollDeltaPx:Math.max(...pairs.map(x=>Math.abs(x.scrollDeltaPx)))
  };
  const report={
    schema:"robys.category-image-request-lifecycle.v1",
    source:"GitHub Pages / temporary verified bundled JS substitution",
    synthetic:true,productionApproved:false,
    observation:"request/response/finished/failed tracked separately by URL; snapshots before scroll, after photo decode, after wait and network idle timeout",
    limitations:[
      "Counts are request-start events, not proof of extra bytes or duplicate downloads",
      "Requests to different 512/1024px variants do not mean the same URL was downloaded twice",
      "Networkidle is bounded and cache behavior can vary between isolated contexts",
      "Full photo readiness still uses Playwright scroll and is not passive first paint"
    ],
    summary,pairs,samples
  };
  mkdirSync(".artifacts/menu-first-photo-experiment",{recursive:true});
  writeFileSync(FILE,JSON.stringify(report,null,2)+"\n");
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "## #desserts image request lifecycle (diagnostic only)\n\n"+
    "| Comparison | Value |\n|---|---:|\n"+
    Object.entries(summary).map(([key,value])=>"| "+key+" | "+value+" |").join("\n")+
    "\n\nImage request starts at different snapshot times do not establish duplicate downloads. NO SHIP.\n");
  console.log("CATEGORY_LIFECYCLE_SUMMARY "+JSON.stringify(summary));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
