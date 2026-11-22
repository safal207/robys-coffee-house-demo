import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";
import { instrumentMenuStartupSource } from "./menu-startup-attribution-probe.mjs";
import { instrumentMenuGeometrySource, validateGeometryOperations,
  validateGeometrySnapshot, summarizeGeometryTraceEvents, summarizeGeometryTriples
} from "./menu-geometry-attribution-probe.mjs";

const source=readFileSync("src/menu-app.js","utf8");
function fixtureOperations(){
  const ops=[],marks=[];let time=1200;
  const add=(kind,target,duration)=>{
    const seq=ops.length+1;
    const base="qa-geometry-v1:"+seq+":"+kind+":"+target;
    const x={seq,kind,target,startedMs:time,endedMs:time+duration,
      durationMs:duration,markStart:base+":start",markEnd:base+":end"};
    ops.push(x);marks.push(x.markStart,x.markEnd);time+=duration+0.3;
  };
  add("computedStyle","header",4);add("boundingRect","header",17);
  add("boundingRect","controls",12);add("computedStyle","controls",3);
  for(const v of ["--menu-header-height","--menu-sticky-inset","--menu-anchor-gap"]){
    add("cssRead",v,0.5);add("cssWrite",v,0.8);
  }
  add("classWrite","menu-scroll-aware",0.9);
  return {ops,marks};
}
const snap=()=>({
  headerHeight:42,controlsHeight:50,headerPosition:"sticky",
  controlsPosition:"sticky",
  cssVars:{"--menu-header-height":"42px","--menu-sticky-inset":"92px",
    "--menu-anchor-gap":"12px"},
  aware:true,scrollY:0,cart:{count:"0",total:"0 ₺",label:"Cart 0"}
});
test("Real startup source matches exactly, all geometry operations instrumented, original build unchanged",()=>{
  const original=compileMenuRuntime(source);
  assert.equal(original,readFileSync("menu-app.js","utf8"));
  const annotated=instrumentMenuStartupSource(instrumentMenuGeometrySource(source));
  assert.notEqual(annotated,source);
  assert.ok(annotated.includes("qa-geometry-v1:"));
  assert.ok(annotated.includes("__qaGeometryInitialCompleteV1 = true"));
  assert.ok(annotated.includes("root.style.setProperty(name, next)"));
  assert.ok(annotated.includes("header.getBoundingClientRect().height"));
  assert.ok(annotated.includes("controls.getBoundingClientRect().height"));
  assert.notEqual(compileMenuRuntime(annotated),original);
  assert.equal(compileMenuRuntime(source),original);
});
test("Geometry instrumentation rejects changed, missing or duplicate source anchors",()=>{
  assert.throws(()=>instrumentMenuGeometrySource(""),/Geometry source anchor moved/);
  assert.throws(()=>instrumentMenuGeometrySource(source.replace(
    '    const controlsHeight = Math.ceil(controls.getBoundingClientRect().height);',
    '    const controlsHeight = 200;')),/Geometry source anchor moved/);
  assert.throws(()=>instrumentMenuGeometrySource(source+"\n"+
    '  const pinned = (element) => ["sticky", "fixed"].includes(getComputedStyle(element).position);'),
    /Geometry source anchor moved/);
});
test("Validate true paired Performance marks and all read/write categories",()=>{
  const {ops,marks}=fixtureOperations();
  const x=validateGeometryOperations(ops,marks);
  assert.equal(x.totalOperations,11);
  assert.equal(x.durationsMs.boundingRect,29);
  assert.equal(x.durationsMs.computedStyle,7);
  assert.equal(x.durationsMs.cssWrite,2.4000000000000004);
  const missing=marks.slice(1);
  assert.throws(()=>validateGeometryOperations(ops,missing),
    /Missing Performance mark/);
  const corrupted=structuredClone(ops);
  corrupted[3].durationMs=NaN;
  assert.throws(()=>validateGeometryOperations(corrupted,marks),
    /Invalid geometry operation/);
  const duplicated=structuredClone(ops);
  duplicated[2].target="header";
  assert.throws(()=>validateGeometryOperations(duplicated,marks),
    /Controls bounding box was not read/);
});
test("UI geometry CSS variables and untouched empty cart must agree with measured rectangles",()=>{
  assert.deepEqual(validateGeometrySnapshot(snap()),{
    headerHeight:42,controlsHeight:50,controlsPinned:true
  });
  const wrong=snap();wrong.cssVars["--menu-sticky-inset"]="42px";
  assert.throws(()=>validateGeometrySnapshot(wrong),/CSS geometry variables differ/);
  const broken=snap();broken.cart.count="1";
  assert.throws(()=>validateGeometrySnapshot(broken),/invariant missing/);
});
test("Chrome Layout and style events align with Performance marks by renderer clock",()=>{
  const {ops}=fixtureOperations();
  // Chrome FCP mark at trace 5,000,000us maps to passive FCP at 1400ms.
  const base=5000000, fcpMs=1400;
  const x=ops[1],center=base+(x.startedMs-fcpMs)*1000;
  const events=[
    {name:"firstContentfulPaint",ts:base,pid:5,tid:6},
    {name:"Layout",ts:center+1000,dur:9000,pid:5,tid:6},
    {name:"UpdateLayoutTree",ts:center+2500,dur:2000,pid:5,tid:6},
    {name:"Layout",ts:center+1000,dur:400000,pid:99,tid:99}
  ];
  const result=summarizeGeometryTraceEvents(events,fcpMs,ops);
  assert.equal(result.fcpMarkerFound,true);
  assert.equal(result.operations.length,11);
  assert.equal(result.operations[1].layoutOverlapMs,9);
  assert.equal(result.operations[1].styleOverlapMs,2);
  assert.equal(result.operations[2].layoutOverlapMs,0);
  assert.throws(()=>summarizeGeometryTraceEvents([],1400,ops),
    /Native FCP mark/);
});
function fakeSample(pair,mode,fcp){
  const {ops,marks}=fixtureOperations(),paint=fcp-100;
  const trace=summarizeGeometryTraceEvents([
    {name:"firstContentfulPaint",ts:6000000,pid:8,tid:11}
  ],fcp,ops);
  return {pair,mode,block:"A/A/A",bundleSha256:"a".repeat(64),
    passive:{fcpMs:fcp,firstPaintMs:paint,
      ids:["first:x","second:y"],sections:["first","second"],
      geometryComplete:true,geometryOperations:ops,geometryMarkNames:marks,
      geometrySnapshot:snap()},
    trace:{geometry:trace}};
}
const samples=()=>[1,2,3].flatMap(p=>["A1","A2","A3"]
  .map((mode,i)=>fakeSample(p,mode,1700+p*8+[0,120,12][i])));
test("Geometry control triplets require identical source, cart and layout before reporting",()=>{
  const rows=samples(),r=summarizeGeometryTriples(rows);
  assert.equal(r.samples,9);assert.equal(r.triples.length,3);
  assert.equal(r.medianFcpRangeMs,120);
  assert.ok(r.metrics.find(x=>x.kind==="boundingRect").medianPerLoadWallMs>0);
  const wrong=samples();wrong[1].bundleSha256="b".repeat(64);
  assert.throws(()=>summarizeGeometryTriples(wrong),/Different instrumented JS/);
  const wrongCart=samples();wrongCart[1].passive.geometrySnapshot.cart.total="bad";
  assert.throws(()=>summarizeGeometryTriples(wrongCart),/Cart state differs/);
  const wrongLayout=samples();wrongLayout[1].passive.geometrySnapshot.controlsHeight=58;
  wrongLayout[1].passive.geometrySnapshot.cssVars["--menu-sticky-inset"]="100px";
  assert.throws(()=>summarizeGeometryTriples(wrongLayout),/CSS geometry differs across controls/);
});
