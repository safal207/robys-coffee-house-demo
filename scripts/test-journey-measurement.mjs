import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultProfiles, expectedJourneyIDs, makeSample, measureJourney, sampleKey, validateJourneyReport } from "./measure-journey-responsiveness.mjs";
const identity = { journeyId: "menu-search", profile: "mobile390-en-normal", attempt: 1 };
const good = () => makeSample({ ...identity, value: 42, correctness: true });
const report = samples => ({ complete: true, expectedSamples: [{ ...identity, metricId: "ready_ms" }], samples });
test("invalid or absent duration never becomes passing evidence", () => {
  for (const value of [null, undefined, NaN, Infinity, -1, 0]) {
    const sample = makeSample({ ...identity, value, correctness: true });
    assert.equal(sample.status, "FAIL"); assert.equal(sample.value, null); assert.equal(sample.timingStatus, "INVALID");
  }
  const forged = { ...good(), value: null };
  assert.equal(validateJourneyReport(report([forged])).valid, false);
});
test("correctness and timing policy remain independent", () => {
  const informational = makeSample({ ...identity, value: 1300, correctness: true });
  assert.equal(informational.correctnessStatus, "PASS"); assert.equal(informational.budgetStatus, "FAIL"); assert.equal(informational.status, "PASS");
  const enforced = makeSample({ ...identity, journeyId: "menu-switch-feed", value: 1300, correctness: true });
  assert.equal(enforced.correctnessStatus, "PASS"); assert.equal(enforced.budgetStatus, "FAIL"); assert.equal(enforced.status, "FAIL");
  assert.equal(makeSample({ ...identity, value: 20, correctness: false }).status, "FAIL");
});
test("missing, duplicate, unexpected or unfinished collection is rejected", () => {
  assert.equal(validateJourneyReport(report([])).valid, false);
  assert.equal(validateJourneyReport(report([good(), good()])).valid, false);
  assert.equal(validateJourneyReport(report([{ ...good(), profile: "wrong" }])).valid, false);
  assert.equal(validateJourneyReport({ ...report([good()]), complete: false }).valid, false);
  assert.equal(validateJourneyReport({ complete: true, expectedSamples: [], samples: [] }).valid, false);
  assert.equal(validateJourneyReport(report([good()])).status, "PASS");
});
test("default matrix has120 distinct expected samples per attempt", () => {
  const matrix = defaultProfiles.flatMap(profile => expectedJourneyIDs.map(journeyId => ({ journeyId, metricId: "ready_ms", profile: profile.id, attempt: 1 })));
  assert.equal(matrix.length, 120); assert.equal(new Set(matrix.map(sampleKey)).size, 120);
});
test("measurement waits for an asynchronous semantic outcome and rejects a stale outcome", async () => {
  let release, finished = false, evaluations = 0, requestId;
  const ready = new Promise(resolve => { release = resolve; });
  const page = { evaluate: async (fn, data) => {
    if (++evaluations === 1) { requestId = data.id; return; }
    return { correct: false, id: requestId, start: 100, end: 250, url: "https://localhost/menu.html" };
  }, waitForFunction: () => ready };
  const pending = measureJourney(page, { ...identity, selector: "#menu-search", outcome: { kind: "search" }, action: async () => {} }).then(value => { finished = true; return value; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false);
  release(); const sample = await pending;
  assert.equal(sample.value, 150); assert.equal(sample.correctnessStatus, "FAIL"); assert.equal(sample.status, "FAIL");
});

test("an asserted PASS cannot waive an enforced timing budget", () => {
  const sample = { ...makeSample({ ...identity, journeyId: "menu-switch-feed", value: 1300, correctness: true }), status: "PASS" };
  const result = validateJourneyReport({ complete: true, expectedSamples: [{ journeyId: sample.journeyId, metricId: "ready_ms", profile: sample.profile, attempt: 1 }], samples: [sample] });
  assert.equal(result.valid, false); assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some(error => error.includes("Enforced timing budget")));
});

import { browserProbe } from "./measure-journey-responsiveness.mjs";
test("semantic readiness excludes invisible ancestors, offscreen results and occluded content", () => {
  const names = ["window", "document", "getComputedStyle", "innerWidth", "innerHeight"];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const body = { style: { opacity: "1", visibility: "visible", display: "block" }, parentElement: null };
  let box = { left: 0, top: 300, right: 150, bottom: 350 }, hit;
  const content = { parentElement: body, textContent: "Espresso", getClientRects: () => [box], getBoundingClientRect: () => box,
    contains: node => node === content, style: { opacity: "1", visibility: "visible", display: "block" } };
  hit = content;
  const row = { dataset: { productId: "hot-coffee:espresso" }, querySelector: () => content };
  try {
    globalThis.window = {}; globalThis.innerWidth = 390; globalThis.innerHeight = 844;
    globalThis.getComputedStyle = node => node.style;
    globalThis.document = { addEventListener() {}, documentElement: { lang: "en" }, elementFromPoint: () => hit,
      querySelectorAll: () => [row], querySelector: selector => selector === '[data-lang="en"]' ? { getAttribute: () => "true" }
        : selector.includes("full-menu-item-copy strong") ? content : null };
    browserProbe(); const ready = () => window.__robysJourneyReady({ kind: "language", language: "en", count: "Espresso" });
    assert.equal(ready(), true);
    body.style.opacity = "0"; assert.equal(ready(), false); body.style.opacity = "1";
    box = { left: 0, top: 900, right: 150, bottom: 950 }; assert.equal(ready(), false);
    box = { left: 0, top: 300, right: 150, bottom: 350 }; hit = {}; assert.equal(ready(), false);
  } finally {
    for (const name of names) { const descriptor = previous.get(name); if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});

import vm from "node:vm";
test("cart readiness uses the canonical expected price and requires visible line and total", () => {
  const style = () => ({ opacity: "1", visibility: "visible", display: "block" });
  const node = (text, top, bottom) => ({ textContent: text, style: style(), parentElement: null,
    getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, right: 300, top, bottom }), getAnimations: () => [], contains: () => true });
  const shell = node("", 0, 800), line = node("Espresso", 200, 300), total = node("175 ₺", 500, 550);
  const map = { "#menu-cart-dialog": { open: true, querySelector: () => shell }, "#menu-product-dialog": { open: false },
    "#menu-cart-count": { textContent: "1" }, "#menu-cart-lines .menu-cart-line": line, "#menu-cart-dialog-total": total };
  const sandbox = { window: {}, innerWidth: 390, innerHeight: 844, getComputedStyle: node => node.style,
    document: { addEventListener() {}, querySelector: selector => map[selector] ?? null,
      querySelectorAll: selector => selector === "#menu-cart-lines .menu-cart-line" ? [line] : [], elementFromPoint: (x, y) => y >= 500 ? total : line } };
  vm.runInNewContext(`(${browserProbe.toString()})()`, sandbox);
  const ready = price => sandbox.window.__robysJourneyReady({ kind: "cart", total: price });
  assert.equal(ready(175), true); assert.equal(ready(110), false);
  total.style.visibility = "hidden"; assert.equal(ready(175), false); total.style.visibility = "visible";
  line.style.visibility = "hidden"; assert.equal(ready(175), false);
});
