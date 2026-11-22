import assert from "node:assert/strict";

// QA-only alternative to deferred measurement. Keep the initial geometry
// measurement synchronous, including CSS vars and menu-scroll-aware; move it
// ahead of the costly menu product DOM creation. A browser test must still
// prove pixel/CLS/scroll equivalence before considering any production change.
export const ORIGINAL_STARTUP_SEQUENCE = [
  "translateStaticPage();",
  "renderCategoryNav();",
  "renderMenu();",
  "initializeMenuScrollMetrics();",
  "menuViewLinks.forEach"
].join("\n");
export const EARLY_GEOMETRY_STARTUP_SEQUENCE = [
  "translateStaticPage();",
  "renderCategoryNav();",
  "initializeMenuScrollMetrics();",
  "renderMenu();",
  "menuViewLinks.forEach"
].join("\n");

export function buildEarlyGeometryCandidate(source) {
  assert.equal(typeof source, "string", "Source text required");
  assert.equal(source.split(ORIGINAL_STARTUP_SEQUENCE).length, 2,
    "Original startup anchor missing or repeated; refuse unsafe experiment");
  assert.equal(source.split(EARLY_GEOMETRY_STARTUP_SEQUENCE).length, 1,
    "Early geometry startup is already present");
  const candidate = source.replace(ORIGINAL_STARTUP_SEQUENCE,
    EARLY_GEOMETRY_STARTUP_SEQUENCE);
  assert.equal(candidate.length, source.length,
    "Candidate must only reorder existing calls");
  assert.equal(candidate.split(EARLY_GEOMETRY_STARTUP_SEQUENCE).length, 2,
    "Expected one QA-only replacement");
  assert.equal(candidate.replace(EARLY_GEOMETRY_STARTUP_SEQUENCE,
    ORIGINAL_STARTUP_SEQUENCE), source,
    "Source change exceeds synchronized startup call reordering");
  assert.equal(candidate.split("function initializeMenuScrollMetrics() {").length,
    source.split("function initializeMenuScrollMetrics() {").length,
    "Original geometry function declaration changed");
  return candidate;
}

// Minimal symbolic ordering check. This is NOT a browser geometry or
// screenshot proof, only a regression guard for preserving before-paint sync
// CSS initialization (no rAF/setTimeout/Promise introduced).
export function assertSynchronousEarlyGeometry(source, candidate) {
  assert.ok(candidate.includes(EARLY_GEOMETRY_STARTUP_SEQUENCE),
    "Initial geometry must precede renderMenu");
  assert.equal(candidate.replace(EARLY_GEOMETRY_STARTUP_SEQUENCE,
    ORIGINAL_STARTUP_SEQUENCE), source, "Unexpected extra changes");
  for(const keyword of ["requestAnimationFrame(", "setTimeout(", "queueMicrotask("]) {
    const occurrences=text=>text.split(keyword).length-1;
    assert.equal(occurrences(candidate),occurrences(source),
      "Candidate injected asynchronous scheduling: "+keyword);
  }
  return {
    initialGeometryCallBeforeMenuDom:true,
    sameFunctionBody:true,
    sameSynchronousCalls:true,
    productionSafe:false,
    requiredBrowserEvidence:[
      "Matched A/A/A versus A/B/A FCP, native Chrome traces",
      "Before/after first-painted screenshots at 360 and 390px, Turkish and Russian",
      "Zero new CLS; identical CSS variables and menu-scroll-aware at first paint",
      "Sticky header/controls rects; exact #desserts anchor scroll geometry",
      "Unchanged products/categories/cart/ARIA and no JS or resource failures"
    ]
  };
}
