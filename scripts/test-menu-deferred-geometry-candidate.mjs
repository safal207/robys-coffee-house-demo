import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";
import { STARTUP_GEOMETRY_CALL, deferInitialHeaderGeometry,
  verifyMatchedSet, evaluateVisualPairs } from "./menu-deferred-geometry-candidate.mjs";

const source=readFileSync("src/menu-app.js","utf8");
const hash="a".repeat(64),candidateHash="b".repeat(64);
const make=(mode, fcp=1700)=>({
  mode,bundleHash:mode==="B"?candidateHash:hash,
  fcpMs:fcp,firstPaintMs:fcp-40,cls:0,
  anchorTop:123,anchorScrollY:300,
  errors:[],requestFailures:[],failedAssets:[],
  ids:Array.from({length:30},(_,i)=>"p"+i),
  sections:["pairing-offers","desserts"],cart:{count:"0",total:"0 ₺",label:"Cart: 0"},
  geometry:{aware:true,headerTop:0,headerHeight:123,
    controlsTop:200,controlsHeight:115,
    vars:{"--menu-header-height":"123px","--menu-sticky-inset":"123px","--menu-anchor-gap":"127px"}},
  trace:{nativeFcpFound:true}
});
test("Candidate modifies only the unique initial geometry call and compiles",()=>{
  assert.equal(compileMenuRuntime(source),readFileSync("menu-app.js","utf8"));
  assert.equal(source.split(STARTUP_GEOMETRY_CALL).length-1,1);
  const patched=deferInitialHeaderGeometry(source);
  assert.equal(patched.split("window.__qaDeferredGeometryV1 = ").length-1,1);
  assert.match(patched,/window\.__qaHoldGeometryV1 === true/);
  assert.match(patched,/window\.__qaReleaseGeometryV1=finish/);
  assert.match(patched,/requestAnimationFrame\(\(\) => \{/);
  assert.notEqual(compileMenuRuntime(patched),compileMenuRuntime(source));
});
test("Refuse changed, missing or repeated entry anchors",()=>{
  assert.throws(()=>deferInitialHeaderGeometry(""),/Startup geometry anchor changed/);
  assert.throws(()=>deferInitialHeaderGeometry(STARTUP_GEOMETRY_CALL+
    "\n"+STARTUP_GEOMETRY_CALL),/Startup geometry anchor changed/);
});
test("Matching A/B/A preserves products, cart, geometry and anchors",()=>{
  const t=verifyMatchedSet([make("A1",1660),make("B",1655),make("A3",1668)]);
  assert.equal(t.uiMatched,true);
  assert.equal(t.fcpPenaltyMs,-9);
  assert.equal(t.controlFcpSpreadMs,8);
  assert.equal(t.candidateSlowerThanBoth,false);
});
test("Fail closed when a candidate changes CSS, cart, product or scroll",()=>{
  for(const mutation of [
    x=>x.geometry.vars["--menu-anchor-gap"]="20px",
    x=>x.cart.count="1",
    x=>x.ids[0]="different",
    x=>x.anchorScrollY+=40,
    x=>x.trace.nativeFcpFound=false,
    x=>x.requestFailures.push({url:"/menu-runtime.css",error:"ERR_TOO_MANY_RETRIES"})
  ]){
    const a=make("A1"),b=make("B"),c=make("A3");
    mutation(b);
    assert.throws(()=>verifyMatchedSet([a,b,c]));
  }
});
test("Visual decision uses A/A control noise, not candidate screenshots as baseline",()=>{
  const d=(changedPixels)=>({changedPixels,pixelCount:10000,width:100,height:100});
  const ok=evaluateVisualPairs(d(40),d(30),d(70));
  assert.equal(ok.baselineNoise,40);
  assert.equal(ok.candidateDifference,30);
  assert.equal(ok.candidateWithinNoise,true);
  const fail=evaluateVisualPairs(d(40),d(800),d(500));
  assert.equal(fail.candidateWithinNoise,false);
  assert.equal(fail.candidatePixelDelta,460);
  assert.throws(()=>evaluateVisualPairs(d(40),{...d(5),height:75},d(12)));
});
