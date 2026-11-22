import assert from "node:assert/strict";

// QA-only experiment. No shipped HTML/CSS/JS is patched. The second animation
// frame is a *hypothesis* about first-paint ordering, NOT an assertion that
// the user never sees a partially laid-out UI.
export const STARTUP_GEOMETRY_CALL=[
  "renderMenu();",
  "initializeMenuScrollMetrics();",
  "menuViewLinks.forEach"
].join("\n");

export function deferInitialHeaderGeometry(source) {
  assert.equal(typeof source,"string");
  assert.equal(source.split(STARTUP_GEOMETRY_CALL).length,2,
    "Startup geometry anchor changed; refuse candidate generation");
  const replacement=[
    "renderMenu();",
    'window.__qaDeferredGeometryV1 = {phase:"scheduled", scheduledMs:performance.now(), firstFrameMs:null, appliedMs:null};',
    "requestAnimationFrame(() => {",
    "  window.__qaDeferredGeometryV1.firstFrameMs = performance.now();",
    "  requestAnimationFrame(() => {",
    "    const finish = () => {",
    '      if (window.__qaDeferredGeometryV1.phase==="applied") return;',
    "      initializeMenuScrollMetrics();",
    '      window.__qaDeferredGeometryV1.phase="applied";',
    "      window.__qaDeferredGeometryV1.appliedMs=performance.now();",
    '      performance.mark("qa-deferred-geometry:applied");',
    "    };",
    "    if (window.__qaHoldGeometryV1 === true) {",
    '      window.__qaDeferredGeometryV1.phase="held";',
    "      window.__qaReleaseGeometryV1=finish;",
    '      performance.mark("qa-deferred-geometry:held");',
    "    } else finish();",
    "  });",
    "});",
    "menuViewLinks.forEach"
  ].join("\n");
  const result=source.replace(STARTUP_GEOMETRY_CALL,replacement);
  assert.equal(result.split("window.__qaDeferredGeometryV1 = ").length,2);
  return result;
}
const finite=x=>Number.isFinite(x);
export function verifyMatchedSet(samples,layoutTolerance=2){
  assert.ok(Array.isArray(samples)&&samples.length===3,
    "One complete three-navigation comparison required");
  const [a,b,c]=samples;
  assert.deepEqual([a.mode,b.mode,c.mode],["A1","B","A3"]);
  assert.equal(a.bundleHash,c.bundleHash,"A/A controls have different JS");
  assert.notEqual(a.bundleHash,b.bundleHash,"Candidate is identical to control");
  for(const s of samples){
    assert.ok(finite(s.fcpMs)&&finite(s.firstPaintMs)&&finite(s.cls) &&
      s.cls>=0 && s.cls<1 && finite(s.anchorTop) && finite(s.anchorScrollY),
      "Missing paint/CLS or anchor data");
    assert.ok(s.errors?.length===0&&s.requestFailures?.length===0&&
      s.failedAssets?.length===0,
      "Runtime exception, failed request, or missing asset");
    assert.ok(s.ids?.length>=30&&s.sections?.length>1,
      "Product and category DOM incomplete");
    assert.ok(s.cart?.count==="0"&&s.cart?.total?.length>0&&s.cart?.label?.length>0,
      "Empty cart or ARIA changed unexpectedly");
    assert.ok(s.geometry?.aware===true &&
      finite(s.geometry?.headerHeight)&&finite(s.geometry?.controlsHeight),
      "Sticky geometry not initialized");
    assert.equal(s.trace?.nativeFcpFound,true,"Missing native trace FCP marker");
  }
  for(const s of [b,c]){
    assert.deepEqual(s.ids,a.ids,"Product identifiers/order differ");
    assert.deepEqual(s.sections,a.sections,"Menu category order differs");
    assert.deepEqual(s.cart,a.cart,"Cart total, count or ARIA differs");
    assert.deepEqual(s.geometry.vars,a.geometry.vars,"CSS variables differ");
    for(const key of ["headerHeight","controlsHeight","headerTop","controlsTop"]) {
      assert.ok(Math.abs(s.geometry[key]-a.geometry[key])<=layoutTolerance,
        "Sticky geometry changed: "+key);
    }
    assert.ok(Math.abs(s.anchorTop-a.anchorTop)<=layoutTolerance &&
      Math.abs(s.anchorScrollY-a.anchorScrollY)<=layoutTolerance,
      "Anchor scroll position changed");
  }
  return {
    fcpPenaltyMs:b.fcpMs-(a.fcpMs+c.fcpMs)/2,
    candidateSlowerThanBoth:b.fcpMs>Math.max(a.fcpMs,c.fcpMs),
    controlFcpSpreadMs:Math.abs(a.fcpMs-c.fcpMs),
    candidateCls:b.cls,baselineCls:[a.cls,c.cls],
    uiMatched:true
  };
}
export function evaluateVisualPairs(a,b,c) {
  assert.ok([a,b,c].every(x=>x &&
    Number.isInteger(x.pixelCount)&&x.pixelCount>0 &&
    Number.isInteger(x.changedPixels)&&x.changedPixels>=0 &&
    Number.isInteger(x.width)&&Number.isInteger(x.height)),
    "Missing PNG pixel comparisons");
  assert.equal(a.width,b.width);assert.equal(b.width,c.width);
  assert.equal(a.height,b.height);assert.equal(b.height,c.height);
  // a = A1↔A3 (baseline noise), b = B↔A1, c = B↔A3.
  const baselineNoise=a.changedPixels;
  const candidateDifference=Math.min(b.changedPixels,c.changedPixels);
  return {
    baselineNoise,candidateDifference,
    candidateWithinNoise:candidateDifference<=baselineNoise,
    candidatePixelDelta:Math.max(0,candidateDifference-baselineNoise),
    screenshotDimensions:{width:b.width,height:b.height}
  };
}
