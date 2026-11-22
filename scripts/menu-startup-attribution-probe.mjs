import assert from "node:assert/strict";

// Test-only instrumentation of exactly the four startup calls from src/menu-app.js.
// The published source, compiled menu-app.js, page HTML and FCP budgets stay untouched.
export const STARTUP_STEPS = Object.freeze([
  "translateStaticPage",
  "renderCategoryNav",
  "renderMenu",
  "initializeMenuScrollMetrics"
]);
export const STARTUP_ANCHOR = [
  'document.querySelector("#current-year").textContent = String(new Date().getFullYear());',
  ...STARTUP_STEPS.map(name => name + "();"),
  "menuViewLinks.forEach"
].join("\n");

export function instrumentMenuStartupSource(source) {
  assert.equal(typeof source,"string");
  assert.equal(source.split(STARTUP_ANCHOR).length,2,
    "Startup calls changed; do not instrument the wrong code path");
  const lines=[
    'document.querySelector("#current-year").textContent = String(new Date().getFullYear());',
    '// QA-only wall-clock sampling; identical wrappers in every A/A/A control.',
    'window.__qaStartupWallV1 = [];',
    'function __qaMeasureStartup(name, callback) {',
    '  const startedMs = performance.now();',
    '  try { return callback(); } finally {',
    '    const endedMs = performance.now();',
    '    window.__qaStartupWallV1.push({ name, startedMs, endedMs, durationMs: endedMs - startedMs });',
    '  }',
    '}',
    ...STARTUP_STEPS.map(name =>
      '__qaMeasureStartup("' + name + '", () => ' + name + '());'),
    'window.__qaStartupWallCompleteV1 = true;',
    "menuViewLinks.forEach"
  ];
  const result=source.replace(STARTUP_ANCHOR,lines.join("\n"));
  assert.equal(result.split("window.__qaStartupWallCompleteV1 = true;").length,2,
    "Startup completion marker must occur exactly once");
  return result;
}

export function validateStartupMeasurement(rows) {
  assert.ok(Array.isArray(rows) && rows.length===STARTUP_STEPS.length,
    "Exactly four startup timings required");
  const names=rows.map(x=>x.name);
  assert.deepEqual(names,STARTUP_STEPS,"Startup function order changed");
  for(const [i,r] of rows.entries()){
    assert.ok(Number.isFinite(r.startedMs) && Number.isFinite(r.endedMs) &&
      Number.isFinite(r.durationMs) && r.durationMs>=0 &&
      r.endedMs>=r.startedMs &&
      Math.abs(r.durationMs-(r.endedMs-r.startedMs))<0.002,
      "Invalid startup function duration: "+r.name);
    if(i)assert.ok(rows[i-1].endedMs<=r.startedMs+0.002,
      "Startup functions overlap unexpectedly");
  }
  return {
    bootStartMs:rows[0].startedMs,
    bootEndMs:rows.at(-1).endedMs,
    bootTotalMs:rows.at(-1).endedMs-rows[0].startedMs,
    timedCallsTotalMs:rows.reduce((n,x)=>n+x.durationMs,0),
    durationsMs:Object.fromEntries(rows.map(x=>[x.name,x.durationMs]))
  };
}

export function summarizeStartupTriples(samples) {
  assert.ok(Array.isArray(samples)&&samples.length>=9&&samples.length%3===0,
    "At least three complete A/A/A triples needed");
  const groups=new Map();
  for(const s of samples) {
    assert.ok(Number.isInteger(s.pair)&&s.pair>0 && s.block==="A/A/A" &&
      ["A1","A2","A3"].includes(s.mode) &&
      typeof s.bundleSha256==="string" && s.bundleSha256.length===64 &&
      Number.isFinite(s.passive?.fcpMs) &&
      Number.isFinite(s.passive?.firstPaintMs) &&
      Array.isArray(s.passive?.startupMeasurements),
      "Invalid sample or paint clock");
    const m=validateStartupMeasurement(s.passive.startupMeasurements);
    const key=s.pair;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({sample:s,measure:m});
  }
  const tripleResults=[];
  for(const [pair,entries] of groups){
    assert.equal(entries.length,3,"Incomplete control triple "+pair);
    const modes=entries.map(x=>x.sample.mode).sort();
    assert.deepEqual(modes,["A1","A2","A3"],"Duplicate control mode "+pair);
    const hashes=new Set(entries.map(x=>x.sample.bundleSha256));
    assert.equal(hashes.size,1,"A/A/A controls contain different JavaScript");
    const fcp=entries.map(x=>x.sample.passive.fcpMs);
    tripleResults.push({pair,
      fcpRangeMs:Math.max(...fcp)-Math.min(...fcp),
      startupMs:entries.map(x=>x.measure.durationsMs),
      firstPaintBeforeStartup:entries.map(x=>
        x.sample.passive.firstPaintMs<x.measure.bootStartMs)
    });
  }
  const sorted=[...tripleResults].sort((a,b)=>a.pair-b.pair);
  assert.deepEqual(sorted.map(x=>x.pair),Array.from({length:sorted.length},(_,i)=>i+1),
    "Missing sequential pair");
  const median=a=>{
    assert.ok(a.length);const v=[...a].sort((x,y)=>x-y);
    return (v[(v.length-1)>>1]+v[v.length>>1])/2;
  };
  const durations=STARTUP_STEPS.map(name=>({
    name,medianMs:median(samples.map(s=>validateStartupMeasurement(
      s.passive.startupMeasurements).durationsMs[name]))
  }));
  return {
    schema:"robys.startup-function-attribution-summary.v1",
    sampleCount:samples.length,tripleCount:sorted.length,
    medianFcpRangeMs:median(sorted.map(x=>x.fcpRangeMs)),
    durations,triples:sorted,
    note:"Wall-clock time includes nested layout and instrument overhead; firstPaintBeforeStartup refers to performance first-paint, not necessarily FCP."
  };
}
