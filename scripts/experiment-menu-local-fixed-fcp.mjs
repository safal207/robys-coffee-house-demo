import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { gzipSync } from "node:zlib";
import { compiled } from "./experiment-menu-first-section-render.mjs";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";
import { instrumentMenuStartupSource, validateStartupMeasurement,
  summarizeStartupTriples } from "./menu-startup-attribution-probe.mjs";
import { instrumentMenuGeometrySource, validateGeometryOperations,
  validateGeometrySnapshot, summarizeGeometryTraceEvents,
  summarizeGeometryTriples } from "./menu-geometry-attribution-probe.mjs";

// Fixed-repository HTTPS assets: no GitHub Pages, CDN, remote images or JS
// interception. Identical A/A/A and bracketed A/B/A isolate scheduler/network
// noise from a guarded staged-render candidate. QA-only; never deployed.
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const GEOMETRY_MODE=process.env.ROBY_GEOMETRY_ATTRIBUTION==="1";
const ATTRIBUTION_MODE=process.env.ROBY_STARTUP_ATTRIBUTION==="1" || GEOMETRY_MODE;
const TRACE_MODE=process.env.ROBY_FCP_FRAME_TRACE==="1" || ATTRIBUTION_MODE;
const OUTPUT=GEOMETRY_MODE
  ? ".artifacts/menu-first-photo-experiment/local-geometry-operation-attribution.json"
  : ATTRIBUTION_MODE
  ? ".artifacts/menu-first-photo-experiment/local-startup-function-attribution.json"
  : TRACE_MODE
    ? ".artifacts/menu-first-photo-experiment/local-frame-trace.json"
    : ".artifacts/menu-first-photo-experiment/local-fcp-controls.json";
const REPEATS=GEOMETRY_MODE?4:ATTRIBUTION_MODE?8:TRACE_MODE?2:4;
const PROFILES=TRACE_MODE?[{id:"loopback-throttled",cpu:4,emulateNetwork:true}]:[
  {id:"loopback",cpu:4,emulateNetwork:false},
  {id:"loopback-throttled",cpu:4,emulateNetwork:true}
];
const BLOCKS=ATTRIBUTION_MODE
  ? [{id:"A/A/A",modes:["A1","A2","A3"]}]
  : [{id:"A/A/A",modes:["A1","A2","A3"]},{id:"A/B/A",modes:["A1","B","A3"]}];
const startupBuild=ATTRIBUTION_MODE
  ? compileMenuRuntime(instrumentMenuStartupSource(
      GEOMETRY_MODE
        ? instrumentMenuGeometrySource(readFileSync(resolve("src/menu-app.js"),"utf8"))
        : readFileSync(resolve("src/menu-app.js"),"utf8")))
  : compiled.control;
const bundles={A1:startupBuild,A2:startupBuild,A3:startupBuild,
  B:compiled["default-list-only"]};
assert.equal(bundles.A1,bundles.A2);
assert.equal(bundles.A1,bundles.A3);
assert.notEqual(bundles.B,bundles.A1);
const sha=b=>createHash("sha256").update(b).digest("hex");
const median=v=>{assert.ok(v.length&&v.every(Number.isFinite));const a=[...v].sort((x,y)=>x-y);
  return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
const round=v=>Math.round(v*10)/10;
const mime={
  ".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",
  ".webp":"image/webp",".svg":"image/svg+xml",".png":"image/png",
  ".jpg":"image/jpeg",".jpeg":"image/jpeg",".woff2":"font/woff2",
  ".ico":"image/x-icon",".mp4":"video/mp4",".webm":"video/webm"
};
const failReason=error=>error?.stack||String(error);

const frameNames=new Set(["Layout","UpdateLayoutTree","Paint","PrePaint","CompositeLayers",
  "BeginMainThreadFrame","BeginFrame","DrawFrame","Commit","RunTask",
  "EvaluateScript","ParseHTML","RecalculateStyles","firstContentfulPaint","firstPaint"]);
export function summarizeFrameTimeline(events, fcpMs, cssEndMs) {
  assert.ok(Array.isArray(events)&&Number.isFinite(fcpMs)&&Number.isFinite(cssEndMs));
  const eventsWithTimes=events.filter(x=>Number.isFinite(x.ts)&&frameNames.has(x.name));
  const fcpMarkers=eventsWithTimes.filter(x=>x.name==="firstContentfulPaint");
  const fcpTraceUs=fcpMarkers[0]?.ts??null;
  const aroundFcp=fcpTraceUs===null?[]:eventsWithTimes.filter(x=>
    x.ts<=fcpTraceUs+20000&&x.ts+(Number.isFinite(x.dur)?x.dur:0)>=fcpTraceUs-300000)
    .sort((a,b)=>a.ts-b.ts).slice(-100).map(x=>({
      name:x.name,relativeToFcpMs:round((x.ts-fcpTraceUs)/1000),
      durationMs:Number.isFinite(x.dur)?round(x.dur/1000):null,
      pid:x.pid??null,tid:x.tid??null
    }));
  return {postCssToFcpMs:round(fcpMs-cssEndMs),
    fcpTraceMarkerFound:fcpTraceUs!==null,
    traceEventCount:events.length,
    eventCounts:Object.fromEntries([...frameNames].map(name=>[
      name,eventsWithTimes.filter(x=>x.name===name).length
    ]).filter(([,count])=>count>0)),
    aroundFcp};
}
async function collectFrameTrace(cdp,passive,profile,block,pair,mode){
  const completed=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Chrome tracing completion timeout")),30000);
    cdp.once("Tracing.tracingComplete",event=>{clearTimeout(timer);resolve(event);});
  });
  await cdp.send("Tracing.end");
  const meta=await completed;
  assert.ok(meta.stream,"Missing trace IO stream");
  assert.notEqual(meta.dataLossOccurred,true,"Trace data loss detected");
  let chunks=[],size=0,eof=false;
  try{
    while(!eof){
      const result=await cdp.send("IO.read",{handle:meta.stream,size:1048576});
      const data=result.base64Encoded
        ?Buffer.from(result.data||"","base64"):Buffer.from(result.data||"","utf8");
      size+=data.length;
      assert.ok(size<96*1024*1024,"Chrome trace exceeds diagnostic memory budget");
      chunks.push(data);eof=result.eof===true;
    }
  }finally{await cdp.send("IO.close",{handle:meta.stream}).catch(()=>{});}
  const raw=Buffer.concat(chunks);
  const decoded=JSON.parse(raw.toString("utf8"));
  assert.ok(Array.isArray(decoded.traceEvents),"Chrome timeline trace events missing");
  const outputDir=".artifacts/menu-first-photo-experiment/"+
    (GEOMETRY_MODE?"geometry-operation-traces":ATTRIBUTION_MODE?"startup-function-traces":"frame-traces");
  mkdirSync(outputDir,{recursive:true});
  const filename=outputDir+"/trace-"+profile.id+"-"+block.id.replaceAll("/","")+
    "-"+pair+"-"+mode+".json.gz";
  writeFileSync(filename,gzipSync(raw,{level:6}));
  return {file:filename,rawBytes:raw.length,
    ...summarizeFrameTimeline(decoded.traceEvents,passive.fcpMs,passive.cssEndMs),
    geometry:GEOMETRY_MODE?summarizeGeometryTraceEvents(
      decoded.traceEvents,passive.fcpMs,passive.geometryOperations):null};
}
export function createFixtureServer(cert){
  let selected="A1";
  let requests=[];
  const cache=new Map();
  const originalHtml=readFileSync(join(ROOT,"menu.html"));
  const originalRuntime=readFileSync(join(ROOT,"menu-app.js"));
  assert.equal(originalRuntime.toString("utf8"),compiled.control,"Local compiled JS changed");
  const readAsset=relative=>{
    const file=resolve(ROOT,relative);
    if(!file.startsWith(ROOT+sep)||!existsSync(file)||!statSync(file).isFile()) return null;
    if(!cache.has(relative))cache.set(relative,readFileSync(file));
    return cache.get(relative);
  };
  const server=createServer({
    key:readFileSync(join(cert,"key.pem")),cert:readFileSync(join(cert,"cert.pem"))
  },(request,response)=>{
    try{
      const u=new URL(request.url,"https://127.0.0.1/");
      const relative=decodeURIComponent(u.pathname).replace(/^\/+/,"");
      if(relative.includes("\0")||relative.includes("\\")||relative.split("/").includes("..")){
        response.writeHead(400).end();return;
      }
      const data=relative==="menu-app.js"
        ?Buffer.from(bundles[selected],"utf8")
        :readAsset(relative);
      const record={path:u.pathname,bytes:data?.length??0,
        sha256:data?sha(data):null,status:data?200:404,mode:selected,
        relative,at:Date.now()};
      requests.push(record);
      if(!data){response.writeHead(404,{"cache-control":"no-store"}).end();return;}
      response.writeHead(200,{"content-type":mime[extname(relative)]||"application/octet-stream",
        "content-length":data.length,"cache-control":"no-store",
        "x-content-type-options":"nosniff"});
      response.end(data);
    }catch(error){
      requests.push({path:request.url,status:400,error:failReason(error)});
      response.writeHead(400).end();
    }
  });
  return {
    server,originalHtmlHash:sha(originalHtml),
    runtimeHash:sha(originalRuntime),
    staticAssetCache:cache,
    select(mode){assert.ok(Object.hasOwn(bundles,mode));selected=mode;requests=[];},
    requests(){return structuredClone(requests);}
  };
}
export async function startServer(server){
  await new Promise((done,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      server.off("error",reject);done();
    });
  });
  return "https://127.0.0.1:"+server.address().port;
}
async function measure(browser,fixture,origin,profile,block,pair,mode,slot){
  fixture.select(mode);
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,
    hasTouch:true,locale:"tr-TR",ignoreHTTPSErrors:true,
    serviceWorkers:"block"
  });
  const page=await context.newPage(),errors=[],failures=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("requestfailed",r=>failures.push({url:r.url(),failure:r.failure()}));
  page.on("request",r=>requests.push(new URL(r.url()).pathname));
  await page.addInitScript(()=>{
    window.__localFcpTasks=[];
    try{new PerformanceObserver(list=>{
      for(const entry of list.getEntries())window.__localFcpTasks.push({
        start:entry.startTime,duration:entry.duration});
    }).observe({type:"longtask",buffered:true});}catch{}
  });
  const cdp=await context.newCDPSession(page);
  await cdp.send("Network.enable");
  if(profile.emulateNetwork)await cdp.send("Network.emulateNetworkConditions",{
    offline:false,latency:150,downloadThroughput:1600000/8,
    uploadThroughput:750000/8,connectionType:"cellular3g"
  });
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:profile.cpu});
  let traceStarted=false,traceCollected=false;
  try{
    if(TRACE_MODE){
      await cdp.send("Tracing.start",{
        categories:"devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing,blink,cc,loading",
        transferMode:"ReturnAsStream"
      });
      traceStarted=true;
    }
    const res=await page.goto(origin+"/menu.html?view=list",{
      waitUntil:"domcontentloaded",timeout:60000
    });
    assert.ok(res?.ok(),"Local menu did not load");
    await page.waitForFunction(()=>{
      const root=document.querySelector("#menu-root");
      return root?.dataset.ready==="true" &&
        document.querySelectorAll("#menu-root [data-product-id]").length>=30;
    },null,{timeout:60000});
    await page.waitForFunction(()=>
      performance.getEntriesByType("paint").some(x=>x.name==="first-contentful-paint"),
      null,{timeout:30000});
    const passive=await page.evaluate(()=>{
      const nav=performance.getEntriesByType("navigation")[0];
      const resources=performance.getEntriesByType("resource");
      const paint=performance.getEntriesByType("paint");
      const fcp=paint.find(x=>x.name==="first-contentful-paint").startTime;
      const js=resources.find(x=>new URL(x.name).pathname==="/menu-app.js");
      const css=resources.find(x=>new URL(x.name).pathname==="/menu-runtime.css");
      const catalog=resources.find(x=>new URL(x.name).pathname==="/menu-catalog.js");
      const tasks=(window.__localFcpTasks||[]).filter(x=>x.start<fcp);
      const first=document.querySelector("#menu-root .full-menu-item-media img");
      return {
        fcpMs:fcp,firstPaintMs:paint.find(x=>x.name==="first-paint")?.startTime??null,
        dclMs:nav?.domContentLoadedEventEnd??null,
        documentResponseEndMs:nav?.responseEnd??null,
        jsStartMs:js?.startTime??null,jsEndMs:js?.responseEnd??null,
        cssStartMs:css?.startTime??null,cssEndMs:css?.responseEnd??null,
        catalogEndMs:catalog?.responseEnd??null,
        preFcpLongTasks:tasks.length,
        preFcpLongTaskMs:tasks.reduce((n,x)=>n+x.duration,0),
        ids:[...document.querySelectorAll("#menu-root [data-product-id]")].map(x=>x.dataset.productId),
        sections:[...document.querySelectorAll("#menu-root .full-menu-panel")].map(x=>x.id),
        firstPhotoPath:first?.currentSrc?new URL(first.currentSrc).pathname:null,
        firstPhotoDeferred:first?.hasAttribute("data-menu-lazy-src")??null,
        viewport:innerWidth+"x"+innerHeight,
        scrollY:scrollY,
        startupMeasurements:window.__qaStartupWallV1??null,
        startupComplete:window.__qaStartupWallCompleteV1===true
      };
    });
    if(ATTRIBUTION_MODE) {
      assert.equal(passive.startupComplete,true,
        "Instrumented startup did not complete");
      validateStartupMeasurement(passive.startupMeasurements);
    }
    if(GEOMETRY_MODE){
      // AFTER passive FCP capture: these invariant reads cannot move the FCP.
      await page.evaluate(async()=>{await document.fonts.ready;});
      const snap=await page.evaluate(()=>{
        const root=document.documentElement;
        const header=document.querySelector(".site-header");
        const controls=document.querySelector(".menu-controls");
        const count=document.querySelector("#menu-cart-count");
        const total=document.querySelector("#menu-cart-total");
        const cart=document.querySelector("#menu-cart-trigger");
        const vars=["--menu-header-height","--menu-sticky-inset","--menu-anchor-gap"];
        return {
          geometryComplete:window.__qaGeometryInitialCompleteV1===true,
          geometryOperations:window.__qaGeometryOpsV1??null,
          geometryMarkNames:performance.getEntriesByType("mark")
            .filter(x=>x.name.startsWith("qa-geometry-v1:")).map(x=>x.name),
          geometrySnapshot:{
            headerHeight:header.getBoundingClientRect().height,
            controlsHeight:controls.getBoundingClientRect().height,
            headerPosition:getComputedStyle(header).position,
            controlsPosition:getComputedStyle(controls).position,
            cssVars:Object.fromEntries(vars.map(name=>[name,root.style.getPropertyValue(name).trim()])),
            aware:root.classList.contains("menu-scroll-aware"),
            scrollY:window.scrollY,
            cart:{count:count.textContent.trim(),total:total.textContent.trim(),
              label:cart.getAttribute("aria-label")}
          }
        };
      });
      Object.assign(passive,snap);
      assert.equal(passive.geometryComplete,true,"QA geometry hooks did not run");
      validateGeometryOperations(passive.geometryOperations,passive.geometryMarkNames);
      validateGeometrySnapshot(passive.geometrySnapshot);
    }
    const trace=TRACE_MODE?await collectFrameTrace(
      cdp,passive,profile,block,pair,mode):null;
    traceCollected=TRACE_MODE;
    const served=fixture.requests();
    assert.equal(errors.length,0,"Browser errors: "+errors.join(" | "));
    assert.equal(failures.length,0,"Local asset request failures: "+JSON.stringify(failures));
    assert.equal(served.filter(x=>x.path==="/menu.html"&&x.status===200).length,1,
      "Exactly one local menu document");
    assert.ok(served.filter(x=>x.path==="/menu-app.js"&&x.status===200).length>=1,
      "Menu-app resource missing");
    assert.ok(served.every(x=>x.status===200),
      "Missing local files or bad paths: "+JSON.stringify(served.filter(x=>x.status!==200)));
    assert.ok(served.filter(x=>x.path==="/menu-app.js")
      .every(x=>x.sha256===sha(Buffer.from(bundles[mode]))),
      "Delivered menu JS differs from intended mode");
    assert.ok(passive.ids.length>=30&&passive.sections.length>1);
    assert.ok(passive.documentResponseEndMs!==null&&passive.jsEndMs!==null
      &&passive.cssEndMs!==null&&passive.catalogEndMs!==null,
      "FCP resource milestones missing");
    return {profile:profile.id,block:block.id,pair,mode,slot,
      passive,served,requestUrls:requests,errors,trace,
      bundleSha256:sha(Buffer.from(bundles[mode]))};
  }finally{
    if(traceStarted&&!traceCollected)await cdp.send("Tracing.end").catch(()=>{});
    await context.close();
  }
}
export function compareTriple(triple,block){
  assert.equal(triple.length,3);
  const [a,b,c]=triple;
  assert.equal(a.mode,"A1");assert.equal(c.mode,"A3");
  assert.equal(b.mode,block.id==="A/A/A"?"A2":"B");
  for(const x of [b,c]){
    assert.deepEqual(x.passive.ids,a.passive.ids,"Product order changed");
    assert.deepEqual(x.passive.sections,a.passive.sections,"Section order changed");
    assert.equal(x.passive.viewport,a.passive.viewport,"Viewport changed");
    assert.equal(x.passive.scrollY,a.passive.scrollY,"Scroll position changed");
  }
  if(block.id==="A/A/A"){
    assert.equal(a.bundleSha256,b.bundleSha256);
    assert.equal(a.bundleSha256,c.bundleSha256);
  }else{
    assert.notEqual(a.bundleSha256,b.bundleSha256);
    assert.equal(a.bundleSha256,c.bundleSha256);
  }
  const values=triple.map(x=>x.passive.fcpMs);
  return {profile:a.profile,block:block.id,pair:a.pair,
    fcpMs:values,rangeFcpMs:Math.max(...values)-Math.min(...values),
    bracketFcpSpreadMs:Math.abs(a.passive.fcpMs-c.passive.fcpMs),
    candidateFcpPenaltyMs:block.id==="A/B/A"
      ?b.passive.fcpMs-(a.passive.fcpMs+c.passive.fcpMs)/2:null,
    candidateSlowerThanBoth:block.id==="A/B/A"
      ?b.passive.fcpMs>Math.max(a.passive.fcpMs,c.passive.fcpMs):null,
    documentResponseMs:triple.map(x=>round(x.passive.documentResponseEndMs)),
    jsResponseMs:triple.map(x=>round(x.passive.jsEndMs)),
    cssResponseMs:triple.map(x=>round(x.passive.cssEndMs)),
    longTaskMs:triple.map(x=>round(x.passive.preFcpLongTaskMs))};
}
async function main(){
  const dir=mkdtempSync(join(tmpdir(),"robys-local-fcp-"));
  const generated=spawnSync("openssl",["req","-x509","-nodes","-newkey","rsa:2048",
    "-days","1","-keyout",join(dir,"key.pem"),"-out",join(dir,"cert.pem"),
    "-subj","/CN=localhost"],{stdio:"ignore",timeout:15000});
  assert.equal(generated.status,0,"OpenSSL certificate generation failed");
  const fixture=createFixtureServer(dir);
  let browser,triplets=[],samples=[],origin=null;
  try{
    origin=await startServer(fixture.server);
    browser=await chromium.launch({headless:true});
    for(const profile of PROFILES){
      for(let pair=1;pair<=REPEATS;pair++){
        // Alternate A/A/A vs A/B/A ordering so local startup drift
        // cannot systematically prefer the guarded candidate.
        const orderedBlocks=pair%2?BLOCKS:[...BLOCKS].reverse();
        for(const block of orderedBlocks){
          const triple=[];
          for(let slot=0;slot<3;slot++){
            const mode=block.modes[slot];
            const sample=await measure(browser,fixture,origin,profile,block,pair,mode,slot);
            triple.push(sample);samples.push(sample);
            console.log("LOCAL_FCP_SAMPLE "+JSON.stringify({
              profile:profile.id,pair,block:block.id,mode,
              fcp:sample.passive.fcpMs,dcl:round(sample.passive.dclMs),
              docEnd:round(sample.passive.documentResponseEndMs),
              jsEnd:round(sample.passive.jsEndMs),cssEnd:round(sample.passive.cssEndMs),
              tasks:round(sample.passive.preFcpLongTaskMs),
              assets:sample.served.length
            }));
          }
          const record=compareTriple(triple,block);
          triplets.push(record);
          console.log("LOCAL_FCP_TRIPLE "+JSON.stringify(record));
        }
      }
    }
  }finally{
    await browser?.close();
    fixture.server.closeAllConnections();
    if(fixture.server.listening)await new Promise(done=>fixture.server.close(done));
    rmSync(dir,{recursive:true,force:true});
  }
  const summary=PROFILES.flatMap(profile=>BLOCKS.map(block=>{
    const d=triplets.filter(x=>x.profile===profile.id&&x.block===block.id);
    assert.equal(d.length,REPEATS,"Incomplete profile/triples");
    return {profile:profile.id,block:block.id,triples:d.length,
      fcpSpanMedianMs:round(median(d.map(x=>x.rangeFcpMs))),
      controlBracketSpreadMedianMs:round(median(d.map(x=>x.bracketFcpSpreadMs))),
      fcpSpanMaxMs:Math.max(...d.map(x=>x.rangeFcpMs)),
      candidateFcpPenaltyMedianMs:block.id==="A/B/A"
        ?round(median(d.map(x=>x.candidateFcpPenaltyMs))):null,
      candidateSlowerThanBothPairs:block.id==="A/B/A"
        ?d.filter(x=>x.candidateSlowerThanBoth).length:null};
  }));
  const startupAttribution=ATTRIBUTION_MODE?summarizeStartupTriples(samples):null;
  const geometryAttribution=GEOMETRY_MODE?summarizeGeometryTriples(samples):null;
  const report={
    schema:GEOMETRY_MODE
      ?"robys.local-geometry-operation-attribution.v1"
      :ATTRIBUTION_MODE
      ?"robys.local-startup-function-attribution.v1"
      :TRACE_MODE?"robys.local-frame-trace.v1":"robys.local-fixed-asset-fcp.v1",
    synthetic:true,shipApproved:false,
    source:"Local verified repository assets over ephemeral loopback HTTPS, no remote resources",
    traced:TRACE_MODE,attributionProbe:ATTRIBUTION_MODE,
    geometryProbe:GEOMETRY_MODE,startupAttribution,geometryAttribution,
    htmlSHA256:fixture.originalHtmlHash,
    originalRuntimeSHA256:fixture.runtimeHash,
    candidateRuntimeSHA256:sha(Buffer.from(bundles.B)),
    profileSpecs:PROFILES,triplesPerProfilePerBlock:REPEATS,
    filesCached:fixture.staticAssetCache.size,
    limitations:[
      "A/A/A measures scheduler, TLS loopback, OS, CPU throttling and local-resource variability; it is not zero-noise",
      "Browser DevTools network emulation still affects the loopback-throttled profile",
      "First-contentful-paint captured passively without forced photo scroll or image.decode()",
      "A/B/A still differs in runtime JS byte length and parsing; unchanged A/A/A controls estimate run-to-run variation",
      "No field LCP, real-user outcomes or shipping approval are inferred from local test data",
      ...(TRACE_MODE?["Tracing instrumentation changes scheduler timing; compare only equally traced runs","CSS responseEnd is not CSSOM/style calculation/layout completion"]:[]),
      ...(ATTRIBUTION_MODE?["Timing probes change bundle bytes and call overhead: comparisons must use only identical attributed A/A/A control bytes","Function wall time includes nested DOM and layout work, not exclusive self CPU time"]:[]),
      ...(GEOMETRY_MODE?["Geometry operations are wrapped without altering return values; performance marks and tracing affect timings","A Layout trace overlap indicates an event inside an operation, not proof of exclusive causal responsibility","Snapshot of CSS geometry and empty cart is collected after passive FCP, and checked within each identical A/A/A triple"]:[])
    ],summary,triplets,samples};
  mkdirSync(dirname(OUTPUT),{recursive:true});
  writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n");
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "## Local fixed-resource FCP experiment — no deployment\n\n"+
    "| Profile | Triple | Median FCP span | Median control bracket | Candidate median delta |\n"+
    "|---|---|---:|---:|---:|\n"+
    summary.map(x=>"| "+x.profile+" | "+x.block+" | "+x.fcpSpanMedianMs+
      "ms | "+x.controlBracketSpreadMedianMs+"ms | "+
      (x.candidateFcpPenaltyMedianMs===null?"—":x.candidateFcpPenaltyMedianMs+"ms")+" |").join("\n")+
    "\n\nA/A/A = identical-code controls; A/B/A = guarded experimental candidate. Lab data only. NO SHIP.\n");
  if(ATTRIBUTION_MODE)console.log("STARTUP_ATTRIBUTION_SUMMARY "+JSON.stringify(
    startupAttribution));
  if(GEOMETRY_MODE)console.log("GEOMETRY_ATTRIBUTION_SUMMARY "+JSON.stringify(
    geometryAttribution));
  if(TRACE_MODE)console.log("FRAME_TIMELINE_SUMMARY "+JSON.stringify({
    summary,frames:samples.map(x=>({profile:x.profile,block:x.block,
      pair:x.pair,mode:x.mode,fcp:x.passive.fcpMs,trace:x.trace}))
  }));
  console.log("LOCAL_FCP_SUMMARY "+JSON.stringify(summary));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error(e);process.exitCode=1;});
}
