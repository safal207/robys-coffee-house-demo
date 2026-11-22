import test from "node:test";
import assert from "node:assert/strict";
import { STARTUP_ANCHOR, STARTUP_STEPS, instrumentMenuStartupSource,
  validateStartupMeasurement, summarizeStartupTriples
} from "./menu-startup-attribution-probe.mjs";

const timing=(name,start,duration)=>({
  name,startedMs:start,endedMs:start+duration,durationMs:duration
});
const correctRows=()=>[
  timing("translateStaticPage",120,2),
  timing("renderCategoryNav",123,5),
  timing("renderMenu",129,75),
  timing("initializeMenuScrollMetrics",205,18)
];

test("Probe is source-local, instruments each startup call exactly once and leaves other calls untouched",()=>{
  const src="function boot(){\n"+STARTUP_ANCHOR+"\n}\nfunction elsewhere(){ renderMenu(); }\n";
  const result=instrumentMenuStartupSource(src);
  assert.match(result,/window\.__qaStartupWallV1 = \[\];/);
  assert.match(result,/window\.__qaStartupWallCompleteV1 = true;/);
  assert.match(result,/function elsewhere\(\)\{ renderMenu\(\); \}/);
  for(const name of STARTUP_STEPS)
    assert.match(result,new RegExp('__qaMeasureStartup\\("'+name+'",'));
  assert.equal(result.split("__qaMeasureStartup(").length,6);
  assert.equal(result.includes("function elsewhere(){ renderMenu(); }"),true);
});
test("Probe refuses missing, duplicated, or changed source anchors",()=>{
  assert.throws(()=>instrumentMenuStartupSource(""),/Startup calls changed/);
  assert.throws(()=>instrumentMenuStartupSource(STARTUP_ANCHOR+"\n"+STARTUP_ANCHOR),
    /Startup calls changed/);
  assert.throws(()=>instrumentMenuStartupSource(
    STARTUP_ANCHOR.replace("renderMenu();","renderMenu(123);")),
    /Startup calls changed/);
});
test("Function timing arithmetic and order are validated",()=>{
  const r=validateStartupMeasurement(correctRows());
  assert.equal(r.durationsMs.renderMenu,75);
  assert.equal(r.durationsMs.initializeMenuScrollMetrics,18);
  assert.equal(r.bootTotalMs,103);
  assert.throws(()=>validateStartupMeasurement(correctRows().slice(1)),
    /Exactly four startup timings/);
  const reversed=correctRows();
  [reversed[2],reversed[3]]=[reversed[3],reversed[2]];
  assert.throws(()=>validateStartupMeasurement(reversed),/Startup function order changed/);
  const malformed=correctRows();malformed[2].durationMs=NaN;
  assert.throws(()=>validateStartupMeasurement(malformed),/Invalid startup function duration/);
  const overlap=correctRows();overlap[3].startedMs=202;
  overlap[3].durationMs=overlap[3].endedMs-overlap[3].startedMs;
  assert.throws(()=>validateStartupMeasurement(overlap),/overlap/);
});
const sample=(pair,mode,fcp)=>{
  const shift=pair*250;
  return {pair,mode,block:"A/A/A",bundleSha256:"a".repeat(64),
    passive:{
      fcpMs:fcp,firstPaintMs:150+shift,
      startupMeasurements:correctRows().map(x=>({
        ...x,startedMs:x.startedMs+shift,endedMs:x.endedMs+shift
      }))
    }};
};
const controls=()=>[1,2,3].flatMap(pair=>
  ["A1","A2","A3"].map((mode,index)=>sample(pair,mode,300+pair*20+[0,80,40][index])));
test("A/A/A summary reports real matched function durations and paint ordering",()=>{
  const out=summarizeStartupTriples(controls());
  assert.equal(out.sampleCount,9);
  assert.equal(out.tripleCount,3);
  assert.equal(out.medianFcpRangeMs,80);
  assert.equal(out.durations.find(x=>x.name==="renderMenu").medianMs,75);
  assert.equal(out.durations.find(x=>x.name==="initializeMenuScrollMetrics").medianMs,18);
  assert.equal(out.triples.length,3);
  assert.equal(out.triples[0].firstPaintBeforeStartup.length,3);
});
test("A/A/A summary fails on mixed bundles, repeated controls or missing samples",()=>{
  const wrongHash=controls();wrongHash[4].bundleSha256="b".repeat(64);
  assert.throws(()=>summarizeStartupTriples(wrongHash),
    /different JavaScript/);
  const duplicate=controls();duplicate[1].mode="A1";
  assert.throws(()=>summarizeStartupTriples(duplicate),
    /Duplicate control mode/);
  const incomplete=controls().slice(0,-1);
  assert.throws(()=>summarizeStartupTriples(incomplete),
    /At least three complete A\/A\/A triples/);
});
