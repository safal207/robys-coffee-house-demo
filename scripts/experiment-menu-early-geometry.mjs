import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { readVerifiedMenuSource, compileMenuRuntime } from "./menu-runtime-source.mjs";
import { compiled } from "./experiment-menu-first-section-render.mjs";
import { createFixtureServer, startServer } from "./experiment-menu-local-fixed-fcp.mjs";
import { buildEarlyGeometryCandidate } from "./menu-early-geometry-candidate.mjs";
import { verifyMatchedSet, evaluateVisualPairs } from "./menu-deferred-geometry-candidate.mjs";

// Synthetic, isolated test: no GitHub Pages, deployed HTML, CSS, or shipping candidate.
const ROOT=".artifacts/menu-first-photo-experiment/geometry-early";
const source=readVerifiedMenuSource();
const tagged=(value)=>{
  const anchor="initializeMenuScrollMetrics();";
  assert.equal(value.split(anchor).length,2,"QA initial geometry mark anchor changed");
  return value.replace(anchor,
    'performance.mark("qa-early-geometry:start");\n'+anchor+
    '\nperformance.mark("qa-early-geometry:end");');
};
const original=compileMenuRuntime(tagged(source));
const candidate=compileMenuRuntime(tagged(buildEarlyGeometryCandidate(source)));
assert.notEqual(original,compiled.control,"Control timing probe missing");
assert.notEqual(candidate,original,"Early geometry test candidate not generated");
const hash=x=>createHash("sha256").update(x).digest("hex");
const bundles={A1:original,A2:original,A3:original,B:candidate};
assert.equal(hash(bundles.A1),hash(bundles.A2));
assert.equal(hash(bundles.A1),hash(bundles.A3));
const scenarios=[
  {id:"360-tr",width:360,lang:"tr"},
  {id:"360-ru",width:360,lang:"ru"},
  {id:"390-tr",width:390,lang:"tr"},
  {id:"390-ru",width:390,lang:"ru"}
];
const blocks=[
  {name:"A/A/A",modes:["A1","A2","A3"]},
  {name:"A/B/A",modes:["A1","B","A3"]}
];
const cssNames=["--menu-header-height","--menu-sticky-inset","--menu-anchor-gap"];
const round=x=>Math.round(x*100)/100;
const median=v=>{assert.ok(v.length);let a=[...v].sort((x,y)=>x-y);
  return (a[(a.length-1)>>1]+a[a.length>>1])/2;};
function diffPng(a,b) {
  const x=PNG.sync.read(a),y=PNG.sync.read(b);
  assert.equal(x.width,y.width,"Screenshot dimensions differ");
  assert.equal(x.height,y.height,"Screenshot dimensions differ");
  const changed=pixelmatch(x.data,y.data,null,x.width,x.height,
    {threshold:0.1,includeAA:false});
  return {changedPixels:changed,pixelCount:x.width*x.height,
    width:x.width,height:x.height};
}
async function stopTrace(cdp,name,passiveFcpMs){
  const done=new Promise((resolve,reject)=>{
    const id=setTimeout(()=>reject(new Error("Tracing completion timeout")),30000);
    cdp.once("Tracing.tracingComplete",ev=>{clearTimeout(id);resolve(ev)});
  });
  await cdp.send("Tracing.end");
  const meta=await done;
  assert.ok(meta.stream && meta.dataLossOccurred!==true,
    "Missing trace or lost Chromium events");
  let chunks=[],sum=0,eof=false;
  try{
    while(!eof){
      const v=await cdp.send("IO.read",{handle:meta.stream,size:1048576});
      const b=Buffer.from(v.data||"",v.base64Encoded?"base64":"utf8");
      sum+=b.length;
      assert.ok(sum<96*1024*1024,"Trace exceeds per-sample budget");
      chunks.push(b);eof=v.eof===true;
    }
  }finally{await cdp.send("IO.close",{handle:meta.stream}).catch(()=>{});}
  const raw=Buffer.concat(chunks),data=JSON.parse(raw.toString("utf8"));
  assert.ok(Array.isArray(data.traceEvents));
  const marks=data.traceEvents.filter(x=>
    ["firstContentfulPaint","Layout","UpdateLayoutTree",
      "BeginFrame","DrawFrame","Paint"].includes(x.name)&&Number.isFinite(x.ts));
  const fcp=marks.find(x=>x.name==="firstContentfulPaint");
  assert.ok(fcp,"Native Chrome FCP marker missing");
  const marksBefore=data.traceEvents.filter(x=>
    ["qa-early-geometry:start","qa-early-geometry:end"].includes(x.name));
  const within=marks.filter(x=>Math.abs(x.ts-fcp.ts)<300000);
  writeFileSync(ROOT+"/"+name+".trace.json.gz",gzipSync(raw,{level:6}));
  return {nativeFcpFound:true,traceEvents:data.traceEvents.length,
    nearbyEventCount:within.length,
    layoutCount:within.filter(x=>x.name==="Layout").length,
    firstPaintTraceMs:round((marks.find(x=>x.name==="Paint")?.ts-fcp.ts)/1000),
    nativeGeometryMarkEvents:marksBefore.length,
    browserFcpMs:passiveFcpMs};
}
async function snapshot(page) {
  return page.evaluate(vars=>{
    const header=document.querySelector(".site-header");
    const controls=document.querySelector(".menu-controls");
    const cart=document.querySelector("#menu-cart-trigger");
    const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,height:r.height}};
    const h=rect(header),c=rect(controls);
    return {
      ids:[...document.querySelectorAll("#menu-root [data-product-id]")]
        .map(x=>x.dataset.productId),
      sections:[...document.querySelectorAll("#menu-root .full-menu-panel")]
        .map(x=>x.id),
      cart:{count:document.querySelector("#menu-cart-count")?.textContent?.trim(),
        total:document.querySelector("#menu-cart-total")?.textContent?.trim(),
        label:cart?.getAttribute("aria-label")},
      geometry:{aware:document.documentElement.classList.contains("menu-scroll-aware"),
        vars:Object.fromEntries(vars.map(n=>[n,document.documentElement.style.getPropertyValue(n).trim()])),
        headerHeight:h.height,controlsHeight:c.height,headerTop:h.top,controlsTop:c.top},
      scrollY:window.scrollY,
      geometryMarks:performance.getEntriesByType("mark")
        .filter(x=>x.name.startsWith("qa-early-geometry:"))
        .map(x=>({name:x.name,startTime:x.startTime}))
    };
  },cssNames);
}
async function measure(browser,fixture,origin,sc,block,mode){
  fixture.select(mode);
  const name=sc.id+"-"+block.name.replaceAll("/","")+"-"+mode;
  const context=await browser.newContext({viewport:{width:sc.width,height:844},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:sc.lang==="tr"?"tr-TR":"ru-RU",
    ignoreHTTPSErrors:true,serviceWorkers:"block",reducedMotion:"reduce"});
  const page=await context.newPage(),errors=[],requestFailures=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("requestfailed",r=>requestFailures.push({url:r.url(),error:r.failure()?.errorText}));
  await page.addInitScript(()=>{
    window.__qaLayoutShiftsV1=[];
    try{new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        if(!e.hadRecentInput) window.__qaLayoutShiftsV1.push({value:e.value,start:e.startTime});
      }
    }).observe({type:"layout-shift",buffered:true});}catch{}
  });
  const cdp=await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions",{
    offline:false,latency:150,downloadThroughput:1600000/8,
    uploadThroughput:750000/8,connectionType:"cellular3g"
  });
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
  let traceRunning=false,traceSaved=false;
  try {
    await cdp.send("Tracing.start",{
      categories:"devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,cc,loading",
      transferMode:"ReturnAsStream"
    });
    traceRunning=true;
    const response=await page.goto(origin+"/menu.html?view=list&lang="+sc.lang,{
      waitUntil:"domcontentloaded",timeout:60000});
    assert.ok(response?.ok(),"Menu document navigation failed");
    await page.waitForFunction(()=>
      document.querySelector("#menu-root")?.dataset.ready==="true" &&
      document.querySelectorAll("#menu-root [data-product-id]").length>=30 &&
      performance.getEntriesByType("paint").some(x=>x.name==="first-contentful-paint"),
      null,{timeout:60000});
    await page.evaluate(()=>new Promise(resolve=>
      requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    // Every screenshot is after native FCP, and cannot represent the exact
    // instant before first Paint. FCP remains passive, unchanged by screenshots.
    const early=await snapshot(page);
    assert.equal(early.geometryMarks.filter(x=>x.name==="qa-early-geometry:start").length,1,
      "Missing/duplicate early-geometry start mark");
    assert.equal(early.geometryMarks.filter(x=>x.name==="qa-early-geometry:end").length,1,
      "Missing/duplicate early-geometry end mark");
    const earlyPng=await page.screenshot({type:"png",animations:"disabled"});
    writeFileSync(ROOT+"/"+name+"-first-painted.png",earlyPng);
    assert.equal(early.geometry.aware,true,"First-painted scroll-aware class missing");
    for(const key of cssNames)assert.ok(early.geometry.vars[key],
      "First-painted CSS variable missing: "+key);
    await page.waitForFunction(()=>
      document.documentElement.classList.contains("menu-scroll-aware"),
      null,{timeout:30000});
    await page.evaluate(async()=>{
      await document.fonts.ready;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const final=await snapshot(page);
    const finalPng=await page.screenshot({type:"png",animations:"disabled"});
    writeFileSync(ROOT+"/"+name+"-stable.png",finalPng);
    const perf=await page.evaluate(()=>{
      const paint=performance.getEntriesByType("paint");
      return {
        fcpMs:paint.find(x=>x.name==="first-contentful-paint")?.startTime,
        firstPaintMs:paint.find(x=>x.name==="first-paint")?.startTime,
        shifts:window.__qaLayoutShiftsV1||[],
        geometryStartMs:performance.getEntriesByName("qa-early-geometry:start")[0]?.startTime,
        geometryEndMs:performance.getEntriesByName("qa-early-geometry:end")[0]?.startTime
      };
    });
    assert.ok(Number.isFinite(perf.geometryStartMs)&&
      Number.isFinite(perf.geometryEndMs)&&
      perf.geometryEndMs>=perf.geometryStartMs,
      "QA geometry startup marker pair missing");
    const anchored=await page.evaluate(()=>{
      const heading=document.querySelector("#desserts");
      if(!heading)throw Error("Desserts anchor missing");
      heading.scrollIntoView({block:"start",behavior:"instant"});
      return {anchorTop:heading.getBoundingClientRect().top,anchorScrollY:scrollY};
    });
    // Exercise the real empty-cart intent, without adding/ordering items.
    await page.locator("#menu-cart-trigger").click({timeout:20000});
    await page.locator("#menu-cart-dialog").waitFor({state:"visible",timeout:20000});
    const modal=await page.evaluate(()=>{
      const dialog=document.querySelector("#menu-cart-dialog");
      return {open:dialog.open,shown:dialog.matches(":modal"),
        total:document.querySelector("#menu-cart-dialog-total")?.textContent?.trim()};
    });
    const trace=await stopTrace(cdp,name,perf.fcpMs);
    traceSaved=true;
    const served=fixture.requests(),failedAssets=served.filter(x=>x.status!==200);
    assert.equal(errors.length,0,"JS runtime errors: "+errors.join(" | "));
    assert.equal(requestFailures.length,0,
      "Local request failures: "+JSON.stringify(requestFailures));
    assert.equal(failedAssets.length,0,"Failed local assets: "+JSON.stringify(failedAssets));
    assert.ok(served.some(x=>x.path==="/menu-app.js"&&x.sha256===hash(bundles[mode])),
      "Incorrect or missing instrumented script bytes");
    assert.ok(modal.open&&modal.shown&&modal.total===final.cart.total,
      "Cart dialog or total changed");
    assert.ok(final.geometry.aware&&final.ids.length>=30&&final.sections.length>1);
    const cls=perf.shifts.reduce((n,x)=>n+x.value,0);
    return {name,scenario:sc.id,block:block.name,mode,
      bundleHash:hash(bundles[mode]),
      fcpMs:perf.fcpMs,firstPaintMs:perf.firstPaintMs,cls,
      layoutShifts:perf.shifts,
      geometryStartMs:perf.geometryStartMs,geometryEndMs:perf.geometryEndMs,
      geometryDurationMs:perf.geometryEndMs-perf.geometryStartMs,
      geometryBeforeFirstPaint:perf.geometryEndMs<=perf.firstPaintMs,
      before:early,after:final,
      beforeAfterPixelDiff:diffPng(earlyPng,finalPng),
      firstScreenshot:earlyPng,finalScreenshot:finalPng,
      ids:final.ids,sections:final.sections,cart:final.cart,
      geometry:final.geometry,...anchored,trace,errors,requestFailures,failedAssets,
      modal};
  } finally{
    if(traceRunning&&!traceSaved)await cdp.send("Tracing.end").catch(()=>{});
    await context.close();
  }
}
function compareAAA(rows){
  assert.deepEqual(rows.map(x=>x.mode),["A1","A2","A3"]);
  assert.equal(new Set(rows.map(x=>x.bundleHash)).size,1,
    "A/A/A controls have different JavaScript bytes");
  for(const s of rows.slice(1)){
    assert.deepEqual(s.ids,rows[0].ids);
    assert.deepEqual(s.sections,rows[0].sections);
    assert.deepEqual(s.cart,rows[0].cart);
    assert.deepEqual(s.geometry.vars,rows[0].geometry.vars);
    assert.deepEqual(s.before.geometry.vars,rows[0].before.geometry.vars);
    assert.equal(s.before.geometry.aware,rows[0].before.geometry.aware);
  }
  const fcp=rows.map(x=>x.fcpMs);
  return {controlFcpRangeMs:Math.max(...fcp)-Math.min(...fcp)};
}
async function main(){
  const cert=mkdtempSync(join(tmpdir(),"robys-geometry-early-"));
  const openssl=spawnSync("openssl",["req","-x509","-nodes","-newkey","rsa:2048",
    "-days","1","-keyout",join(cert,"key.pem"),"-out",join(cert,"cert.pem"),
    "-subj","/CN=localhost"],{stdio:"ignore",timeout:15000});
  assert.equal(openssl.status,0,"Local HTTPS fixture certificate failed");
  mkdirSync(ROOT,{recursive:true});
  const fixture=createFixtureServer(cert,bundles);
  let browser,origin;
  const samples=[],comparisons=[];
  try{
    origin=await startServer(fixture.server);
    browser=await chromium.launch({headless:true});
    for(const sc of scenarios){
      const byBlock={};
      for(const block of blocks){
        const samplesForBlock=[];
        for(const mode of block.modes){
          const r=await measure(browser,fixture,origin,sc,block,mode);
          samplesForBlock.push(r);samples.push(r);
          writeFileSync(ROOT+"/progress.partial.json",JSON.stringify({
            schema:"robys.qa-geometry-early-progress.v1",complete:false,
            completedNavigations:samples.length,requiredNavigations:24,
            samples:samples.map(({firstScreenshot,finalScreenshot,...x})=>x),
            comparisons
          },null,2)+"\n");
          console.log("GEOMETRY_EARLY_SAMPLE "+JSON.stringify({
            scenario:sc.id,block:block.name,mode,
            fcpMs:r.fcpMs,cls:r.cls,geometry:r.geometry.vars,
            beforeGeometry:r.before.geometry.vars,
            shiftCount:r.layoutShifts.length,
            screenshotChanged:r.beforeAfterPixelDiff.changedPixels,
            geometryMs:round(r.geometryDurationMs),
            geometryBeforeFirstPaint:r.geometryBeforeFirstPaint
          }));
        }
        byBlock[block.name]=samplesForBlock;
      }
      const placebo=compareAAA(byBlock["A/A/A"]);
      const [a,b,c]=byBlock["A/B/A"];
      const matched=verifyMatchedSet([a,b,c]);
      const visualBefore=evaluateVisualPairs(
        diffPng(a.firstScreenshot,c.firstScreenshot),
        diffPng(b.firstScreenshot,a.firstScreenshot),
        diffPng(b.firstScreenshot,c.firstScreenshot));
      const visualFinal=evaluateVisualPairs(
        diffPng(a.finalScreenshot,c.finalScreenshot),
        diffPng(b.finalScreenshot,a.finalScreenshot),
        diffPng(b.finalScreenshot,c.finalScreenshot));
      const preMeasureChanges=cssNames.filter(k=>b.before.geometry.vars[k]!==a.before.geometry.vars[k]);
      const changedStickyGeometry=["headerTop","headerHeight","controlsTop","controlsHeight"]
        .filter(k=>Math.abs(b.before.geometry[k]-a.before.geometry[k])>2);
      const clsRegression=b.cls>Math.max(a.cls,c.cls)+0.001;
      const withinRunVisualRegression=b.beforeAfterPixelDiff.changedPixels>
        Math.max(a.beforeAfterPixelDiff.changedPixels,c.beforeAfterPixelDiff.changedPixels);
      const awareChanged=!b.before.geometry.aware ||
        b.before.geometry.aware!==a.before.geometry.aware;
      const fcpRisk=matched.fcpPenaltyMs>Math.max(16,placebo.controlFcpRangeMs);
      const rejects=[
        ...(preMeasureChanges.length?["first-painted-css-variable-mismatch"]:[]),
        ...(awareChanged?["first-painted-scroll-aware-class-mismatch"]:[]),
        ...(withinRunVisualRegression?["within-run-first-to-stable-pixel-shift"]:[]),
        ...(changedStickyGeometry.length?["first-painted-sticky-geometry-mismatch"]:[]),
        ...(!visualBefore.candidateWithinNoise?["first-painted-pixels-differ"]:[]),
        ...(!visualFinal.candidateWithinNoise?["final-pixels-differ"]:[]),
        ...(clsRegression?["layout-shift-regression"]:[]),
        ...(fcpRisk?["fcp-regression-beyond-placebo-spread"]:[])
      ];
      const record={scenario:sc.id,placebo,...matched,
        firstFrameCssChanged:preMeasureChanges,
        firstFrameGeometryChanged:changedStickyGeometry,
        visualBefore,visualFinal,withinRunVisualRegression,awareChanged,
        clsRegression,fcpRisk,
        verdict:rejects.length?"REJECT":"INCONCLUSIVE",
        reasons:rejects};
      comparisons.push(record);
      writeFileSync(ROOT+"/progress.partial.json",JSON.stringify({
        schema:"robys.qa-geometry-early-progress.v1",complete:false,
        completedNavigations:samples.length,requiredNavigations:24,
        samples:samples.map(({firstScreenshot,finalScreenshot,...x})=>x),
        comparisons
      },null,2)+"\n");
      console.log("GEOMETRY_EARLY_COMPARISON "+JSON.stringify(record));
    }
  }finally{
    await browser?.close();
    fixture.server.closeAllConnections();
    if(fixture.server.listening)await new Promise(done=>fixture.server.close(done));
    rmSync(cert,{recursive:true,force:true});
  }
  const report={
    schema:"robys.qa-geometry-early-no-ship.v1",synthetic:true,
    productionApproved:false,shipApproved:false,
    candidateHash:hash(candidate),controlHash:hash(original),
    publishedControlHash:hash(compiled.control),
    cases:scenarios,controlBlocks:blocks,
    limitation:[
      "First-painted screenshot is taken after passive native FCP, not before browser first Paint; do not call this a pre-paint screenshot",
      "Both control and candidate have identical QA performance marks around the startup geometry call; instrumented FCP cannot be pooled with historical values",
      "Only one placebo A/A/A and one A/B/A triplet per viewport/language; insufficient to establish a speed benefit",
      "If any strict local asset request fails, full report.json is not produced; progress.partial.json is diagnostic only and never grants acceptance",
      "Chromium only: no Firefox/WebKit or real-device acceptance",
      "CLS from PerformanceObserver excludes recent user input and screenshots may affect subsequent shifts",
      "A candidate can be REJECTED on visual/geometry/CLS/FCP differences; a test PASS does NOT approve shipping"
    ],
    comparisons,
    samples:samples.map(({firstScreenshot,finalScreenshot,...x})=>x),
    verdict:comparisons.some(x=>x.verdict==="REJECT")?"REJECT":"INCONCLUSIVE"
  };
  writeFileSync(ROOT+"/report.json",JSON.stringify(report,null,2)+"\n");
  console.log("GEOMETRY_EARLY_SUMMARY "+JSON.stringify({
    verdict:report.verdict,comparisons,
    fcpMedianPenaltyMs:median(comparisons.map(x=>x.fcpPenaltyMs)),
    cases:scenarios.length,navigations:samples.length
  }));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
