import assert from "node:assert/strict";

// Test-only exact-source operation probes. No runtime/source changes are deployed.
function once(source,oldText,newText){
  assert.equal(source.split(oldText).length,2,"Geometry source anchor moved: "+oldText);
  return source.replace(oldText,newText);
}
export function instrumentMenuGeometrySource(original){
  assert.equal(typeof original,"string");
  let source=original;
  source=once(source,
    "function initializeMenuScrollMetrics() {\n  const root = document.documentElement;",
    [
      "function initializeMenuScrollMetrics() {",
      "  window.__qaGeometryOpsV1 = [];",
      "  let __qaGeometryFirstMeasureV1 = true;",
      "  let __qaGeometrySerialV1 = 0;",
      "  const __qaGeometryOpV1 = (kind, target, action) => {",
      "    if (!__qaGeometryFirstMeasureV1) return action();",
      "    const seq = ++__qaGeometrySerialV1;",
      '    const markBase = "qa-geometry-v1:" + seq + ":" + kind + ":" + target;',
      '    performance.mark(markBase + ":start");',
      "    const startedMs = performance.now();",
      "    try { return action(); } finally {",
      "      const endedMs = performance.now();",
      '      performance.mark(markBase + ":end");',
      "      window.__qaGeometryOpsV1.push({seq,kind,target,startedMs,endedMs,",
      "        durationMs:endedMs-startedMs,markStart:markBase+':start',markEnd:markBase+':end'});",
      "    }",
      "  };",
      "  const root = document.documentElement;"
    ].join("\n"));
  source=once(source,
    '  const pinned = (element) => ["sticky", "fixed"].includes(getComputedStyle(element).position);',
    '  const pinned = (element) => ["sticky", "fixed"].includes(__qaGeometryOpV1("computedStyle", element === header ? "header" : "controls", () => getComputedStyle(element).position));');
  source=once(source,
    '    const headerHeight = pinned(header) ? Math.ceil(header.getBoundingClientRect().height) : 0;',
    '    const headerHeight = pinned(header) ? Math.ceil(__qaGeometryOpV1("boundingRect", "header", () => header.getBoundingClientRect().height)) : 0;');
  source=once(source,
    '    const controlsHeight = Math.ceil(controls.getBoundingClientRect().height);',
    '    const controlsHeight = Math.ceil(__qaGeometryOpV1("boundingRect", "controls", () => controls.getBoundingClientRect().height));');
  source=once(source,
    '      if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);',
    '      if (__qaGeometryOpV1("cssRead", name, () => root.style.getPropertyValue(name)) !== next) __qaGeometryOpV1("cssWrite", name, () => root.style.setProperty(name, next));');
  source=once(source,
    '    root.classList.add("menu-scroll-aware");',
    '    __qaGeometryOpV1("classWrite", "menu-scroll-aware", () => root.classList.add("menu-scroll-aware"));');
  source=once(source,
    '  measure();\n  if (typeof ResizeObserver === "function") {',
    '  measure();\n  __qaGeometryFirstMeasureV1 = false;\n  window.__qaGeometryInitialCompleteV1 = true;\n  if (typeof ResizeObserver === "function") {');
  return source;
}
const kinds=new Set(["computedStyle","boundingRect","cssRead","cssWrite","classWrite"]);
export function validateGeometryOperations(ops,markNames) {
  assert.ok(Array.isArray(ops)&&ops.length>=8&&ops.length<=15,
    "Geometry first-measure operations missing or excessive");
  assert.ok(Array.isArray(markNames),"Geometry Performance marks required");
  const marks=new Set(markNames);
  const count=k=>ops.filter(x=>x.kind===k);
  for(let i=0;i<ops.length;i++){
    const x=ops[i];
    assert.ok(x.seq===i+1&&kinds.has(x.kind)&&
      typeof x.target==="string"&&x.target.length>0&&
      Number.isFinite(x.startedMs)&&Number.isFinite(x.endedMs)&&
      Number.isFinite(x.durationMs)&&x.durationMs>=0&&
      Math.abs((x.endedMs-x.startedMs)-x.durationMs)<0.002,
      "Invalid geometry operation or duration");
    assert.ok(marks.has(x.markStart)&&marks.has(x.markEnd),
      "Missing Performance mark pair for geometry operation "+x.seq);
    assert.ok(x.markStart.startsWith("qa-geometry-v1:")&&
      x.markStart.endsWith(":start")&&x.markEnd.endsWith(":end"),
      "Unexpected geometry mark namespace");
    if(i)assert.ok(ops[i-1].endedMs<=x.startedMs+0.002,
      "Overlapping geometry operation intervals");
  }
  assert.deepEqual(count("computedStyle").map(x=>x.target),["header","controls"]);
  assert.ok(count("boundingRect").some(x=>x.target==="controls"),
    "Controls bounding box was not read");
  assert.ok(count("boundingRect").every(x=>["header","controls"].includes(x.target)),
    "Unexpected rect target");
  const vars=["--menu-header-height","--menu-sticky-inset","--menu-anchor-gap"];
  assert.deepEqual(count("cssRead").map(x=>x.target),vars);
  assert.ok(count("cssWrite").length<=3&&
    count("cssWrite").every(x=>vars.includes(x.target)),
    "Unexpected CSS variable write");
  assert.deepEqual(count("classWrite").map(x=>x.target),["menu-scroll-aware"]);
  return {
    totalOperations:ops.length,
    durationsMs:Object.fromEntries([...kinds].map(k=>[k,
      ops.filter(x=>x.kind===k).reduce((n,x)=>n+x.durationMs,0)])),
    byTarget:ops.map(x=>({kind:x.kind,target:x.target,durationMs:x.durationMs}))
  };
}
const isPinned=x=>["sticky","fixed"].includes(x);
export function validateGeometrySnapshot(snapshot) {
  assert.ok(snapshot&&Number.isFinite(snapshot.headerHeight)&&
    Number.isFinite(snapshot.controlsHeight)&&
    typeof snapshot.headerPosition==="string"&&
    typeof snapshot.controlsPosition==="string"&&
    snapshot.aware===true&&snapshot.scrollY===0&&
    snapshot.cart?.count==="0"&&
    typeof snapshot.cart?.total==="string"&&snapshot.cart.total.length>0&&
    typeof snapshot.cart?.label==="string",
    "Geometry or empty-cart invariant missing");
  const headerHeight=isPinned(snapshot.headerPosition)?Math.ceil(snapshot.headerHeight):0;
  const controlsHeight=Math.ceil(snapshot.controlsHeight);
  const controlsPinned=isPinned(snapshot.controlsPosition);
  assert.deepEqual(snapshot.cssVars,{
    "--menu-header-height":headerHeight+"px",
    "--menu-sticky-inset":headerHeight+(controlsPinned?controlsHeight:0)+"px",
    "--menu-anchor-gap":(controlsPinned?12:controlsHeight+12)+"px"
  },"CSS geometry variables differ from measured UI geometry");
  return {headerHeight,controlsHeight,controlsPinned};
}
const median=values=>{assert.ok(values.length&&values.every(Number.isFinite));
  const a=[...values].sort((x,y)=>x-y);return (a[(a.length-1)>>1]+a[a.length>>1])/2;};
export function summarizeGeometryTraceEvents(events,fcpMs,ops) {
  assert.ok(Array.isArray(events)&&Number.isFinite(fcpMs));
  const mark=events.find(x=>x.name==="firstContentfulPaint"&&Number.isFinite(x.ts));
  assert.ok(mark&&Number.isFinite(mark.pid)&&Number.isFinite(mark.tid),
    "Native FCP mark or renderer thread missing");
  const timeline=events.filter(x=>["Layout","UpdateLayoutTree"].includes(x.name)&&
    x.pid===mark.pid&&x.tid===mark.tid&&
    Number.isFinite(x.ts)&&Number.isFinite(x.dur)&&x.dur>=0);
  return {
    fcpMarkerFound:true,
    operations:ops.map(x=>{
      const startUs=mark.ts+1000*(x.startedMs-fcpMs);
      const endUs=mark.ts+1000*(x.endedMs-fcpMs);
      const overlapMs=kind=>timeline.filter(e=>e.name===kind).reduce((sum,e)=>
        sum+Math.max(0,Math.min(endUs,e.ts+e.dur)-Math.max(startUs,e.ts))/1000,0);
      return {seq:x.seq,kind:x.kind,target:x.target,
        wallMs:x.durationMs,layoutOverlapMs:overlapMs("Layout"),
        styleOverlapMs:overlapMs("UpdateLayoutTree")};
    })
  };
}
export function summarizeGeometryTriples(samples){
  assert.ok(Array.isArray(samples)&&samples.length>=9&&samples.length%3===0,
    "At least three complete identical-code triples are required");
  const pairs=new Map(),rows=[];
  for(const s of samples){
    assert.ok(Number.isInteger(s.pair)&&s.pair>0&&s.block==="A/A/A"&&
      ["A1","A2","A3"].includes(s.mode)&&
      /^[0-9a-f]{64}$/.test(s.bundleSha256)&&
      Number.isFinite(s.passive?.fcpMs)&&
      Array.isArray(s.passive?.geometryOperations)&&
      s.passive.geometryComplete===true&&s.trace?.geometry?.fcpMarkerFound,
      "Incomplete geometry sample or trace");
    const m=validateGeometryOperations(s.passive.geometryOperations,
      s.passive.geometryMarkNames);
    validateGeometrySnapshot(s.passive.geometrySnapshot);
    assert.equal(s.trace.geometry.operations.length,s.passive.geometryOperations.length,
      "Layout attribution count differs from Performance marks");
    if(!pairs.has(s.pair))pairs.set(s.pair,[]);
    pairs.get(s.pair).push(s);
    rows.push({sample:s,measurement:m});
  }
  const triples=[];
  for(const [pair,observations] of pairs){
    assert.equal(observations.length,3,"Incomplete geometry triple");
    const modes=observations.map(s=>s.mode).sort();
    assert.deepEqual(modes,["A1","A2","A3"],"Repeated or missing control");
    assert.equal(new Set(observations.map(s=>s.bundleSha256)).size,1,
      "Different instrumented JS across identical controls");
    const fcp=observations.map(s=>s.passive.fcpMs);
    const orig=observations[0].passive.geometrySnapshot;
    for(const s of observations.slice(1)){
      const cur=s.passive.geometrySnapshot;
      assert.deepEqual(cur.cssVars,orig.cssVars,"CSS geometry differs across controls");
      assert.deepEqual(cur.cart,orig.cart,"Cart state differs across controls");
      assert.ok(Math.abs(cur.headerHeight-orig.headerHeight)<=2&&
        Math.abs(cur.controlsHeight-orig.controlsHeight)<=2,
        "Bounding geometry differs across controls");
      assert.deepEqual(s.passive.ids,observations[0].passive.ids,
        "Product order differs across controls");
      assert.deepEqual(s.passive.sections,observations[0].passive.sections,
        "Category order differs across controls");
    }
    triples.push({pair,fcpRangeMs:Math.max(...fcp)-Math.min(...fcp)});
  }
  triples.sort((a,b)=>a.pair-b.pair);
  assert.deepEqual(triples.map(x=>x.pair),
    Array.from({length:triples.length},(_,i)=>i+1),"Geometry pair sequencing broken");
  const metrics=[...kinds].map(kind=>{
    const ops=rows.flatMap(({sample})=>sample.trace.geometry.operations.filter(x=>x.kind===kind));
    return {kind,n:ops.length,
      medianOperationWallMs:median(ops.map(x=>x.wallMs)),
      medianOperationLayoutOverlapMs:median(ops.map(x=>x.layoutOverlapMs)),
      medianPerLoadWallMs:median(rows.map(x=>x.measurement.durationsMs[kind])),
      medianPerLoadLayoutOverlapMs:median(rows.map(({sample})=>
        sample.trace.geometry.operations.filter(x=>x.kind===kind)
          .reduce((sum,x)=>sum+x.layoutOverlapMs,0)))};
  });
  return {schema:"robys.menu-geometry-operation-attribution.v1",
    samples:samples.length,triples:triples.length,
    medianFcpRangeMs:median(triples.map(x=>x.fcpRangeMs)),
    metrics,triples,source:"Identical QA-only JS on local HTTPS with CDP 4x CPU, 150ms RTT, 1.6Mbps",
    caveat:"Performance marks and trace spans measure inclusive wall/renderer event overlap, not causal exclusivity."};
}
