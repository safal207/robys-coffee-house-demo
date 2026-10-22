import assert from "node:assert/strict";
import { test } from "node:test";
import { createJourneyProxy, defaultProfiles, expectedJourneyIDs, makeSample, measureJourney, sampleKey, validCacheProof, validateJourneyReport } from "./measure-journey-responsiveness.mjs";
import { createServer as createTcpServer } from "node:net";
import { request } from "node:http";
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
test("navigation startup before the document root exists remains pending instead of aborting measurement", () => {
  const sandbox = { window: {}, location: { pathname: "/menu.html" }, document: {
    documentElement: null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] } };
  vm.runInNewContext(`(${browserProbe.toString()})()`, sandbox);
  for (const kind of ["list", "feed", "language", "product", "cart"]) {
    assert.equal(sandbox.window.__robysJourneyReady({ kind, language: "en" }), false);
  }
  sandbox.document.documentElement = { dataset: {}, lang: "tr" };
  assert.equal(sandbox.window.__robysJourneyReady({ kind: "list" }), false);
  sandbox.location.pathname = "/menu-feed.html";
  assert.equal(sandbox.window.__robysJourneyReady({ kind: "feed", language: "en" }), false);
});

test("cart readiness uses the canonical expected price and requires visible line and total", () => {
  const style = () => ({ opacity: "1", visibility: "visible", display: "block" });
  const node = (text, top, bottom) => ({ textContent: text, style: style(), parentElement: null,
    getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, right: 300, top, bottom }), getAnimations: () => [], contains: () => true });
  const shell = node("", 0, 800), line = node("Espresso", 200, 300), total = node("175 ₺", 500, 550);
  const map = { "#menu-cart-dialog": { open: true, querySelector: () => shell }, "#menu-product-dialog": { open: false },
    "#menu-cart-count": { textContent: "1" }, "#menu-cart-lines .menu-cart-line": line, "#menu-cart-dialog-total": total };
  const sandbox = { window: {}, innerWidth: 390, innerHeight: 844, getComputedStyle: node => node.style,
    document: { documentElement: {}, addEventListener() {}, querySelector: selector => map[selector] ?? null,
      querySelectorAll: selector => selector === "#menu-cart-lines .menu-cart-line" ? [line] : [], elementFromPoint: (x, y) => y >= 500 ? total : line } };
  vm.runInNewContext(`(${browserProbe.toString()})()`, sandbox);
  const ready = price => sandbox.window.__robysJourneyReady({ kind: "cart", total: price });
  assert.equal(ready(175), true); assert.equal(ready(110), false);
  total.style.visibility = "hidden"; assert.equal(ready(175), false); total.style.visibility = "visible";
  line.style.visibility = "hidden"; assert.equal(ready(175), false);
});

test("a decoded product image must be visible before product readiness can pass", () => {
  const node = (top, bottom) => ({ style: { opacity: "1", visibility: "visible", display: "block" }, parentElement: null,
    getClientRects: () => [{}], getBoundingClientRect: () => ({ left: 0, right: 300, top, bottom }), getAnimations: () => [], contains: () => false });
  const shell = node(0, 800), title = node(100, 140), image = node(200, 450), add = node(500, 550);
  shell.contains = hit => [title, image, add].includes(hit);
  Object.assign(title, { textContent: "Espresso" }); Object.assign(image, { complete: true, naturalWidth: 1024 }); add.disabled = false;
  const map = { "#menu-product-dialog": { open: true, querySelector: () => shell }, "#menu-product-image": image,
    "#menu-product-title": title, "#menu-add-to-cart": add };
  let occluded = false;
  const sandbox = { window: {}, innerWidth: 390, innerHeight: 844, getComputedStyle: node => node.style,
    document: { documentElement: {}, addEventListener() {}, querySelector: selector => map[selector] ?? null, querySelectorAll: () => [],
      elementFromPoint: (x, y) => y >= 500 ? add : y >= 200 ? (occluded ? {} : image) : title } };
  vm.runInNewContext(`(${browserProbe.toString()})()`, sandbox);
  const ready = () => sandbox.window.__robysJourneyReady({ kind: "product", count: "Espresso" });
  assert.equal(ready(), true);
  image.style.visibility = "hidden"; assert.equal(ready(), false);
  image.style.visibility = "visible"; occluded = true; assert.equal(ready(), false);
});

test("the local deny proxy forwards only its exact HTTPS authority and rejects external or other loopback destinations", async () => {
  let connections = 0;
  const target = createTcpServer(socket => { connections++; socket.on("data", data => socket.write(data)); });
  await new Promise(resolve => target.listen(0, "127.0.0.1", resolve));
  const authority = `127.0.0.1:${target.address().port}`, proxy = await createJourneyProxy(`https://${authority}`), endpoint = new URL(proxy.server);
  const tunnel = destination => new Promise((resolve, reject) => {
    const req = request({ hostname: endpoint.hostname, port: endpoint.port, method: "CONNECT", path: destination });
    req.once("error", reject); req.setTimeout(2000, () => req.destroy(Error("Proxy control timed out")));
    req.once("connect", (response, socket) => {
      if (response.statusCode !== 200) { socket.destroy(); resolve({ status: response.statusCode }); return; }
      socket.setTimeout(2000, () => { socket.destroy(); reject(Error("Allowed local tunnel timed out")); });
      socket.once("data", data => { socket.destroy(); resolve({ status: response.statusCode, body: data.toString() }); }); socket.write("local-only-proof");
    }); req.end();
  });
  try {
    assert.deepEqual(await tunnel(authority), { status: 200, body: "local-only-proof" });
    assert.deepEqual(await tunnel("journey-deny-123.invalid:443"), { status: 403 });
    assert.deepEqual(await tunnel("127.0.0.1:1"), { status: 403 });
    assert.equal(connections, 1); assert.equal(proxy.allowedTunnels, 1);
    assert.deepEqual(proxy.blocked, ["journey-deny-123.invalid:443", "127.0.0.1:1"]);
    const plainHttp = await new Promise((resolve, reject) => {
      const req = request({ hostname: endpoint.hostname, port: endpoint.port, path: "https://journey-deny-456.invalid/blocked" }, response => { response.resume(); resolve(response.statusCode); });
      req.once("error", reject); req.end();
    });
    assert.equal(plainHttp, 403); assert.equal(connections, 1);
  } finally { await proxy.close(); await new Promise(resolve => target.close(resolve)); }
});

test("the deny proxy cannot be configured with an external, credentialed or non-HTTPS origin", async () => {
  for (const origin of ["http://127.0.0.1:1234", "https://example.com", "https://localhost:1234", "https://user@127.0.0.1:1234", "https://127.0.0.1:1234/path"]) {
    await assert.rejects(() => createJourneyProxy(origin));
  }
});

test("cache evidence needs a real cold load, cached fetch and stylesheet, and an observed external denial", () => {
  const origin = "https://127.0.0.1:1234";
  const good = { origin, start: 100, end: 200, proxyLocalConnections: 1, url: `${origin}/menu-feed.css?journey-cache-proof=123`,
    entries: [{ initiatorType: "fetch", transferSize: 1300, decodedBodySize: 1000 }, { initiatorType: "fetch", transferSize: 0, decodedBodySize: 1000 }, { initiatorType: "link", transferSize: 0, decodedBodySize: 1000 }],
    external: { url: "https://journey-deny-123.invalid/blocked", rejected: true, proxyDenied: true } };
  assert.equal(validCacheProof(good, origin), true);
  for (const mutate of [p => { p.entries[1].transferSize = 1300; }, p => { p.entries[0].transferSize = 0; }, p => { p.entries[0].transferSize = Infinity; },
    p => { p.entries[2].initiatorType = "fetch"; }, p => { p.entries[2].decodedBodySize = 0; }, p => { p.proxyLocalConnections = 0; },
    p => { p.external.proxyDenied = false; }, p => { p.external.rejected = false; }, p => { p.external.url = "https://example.com/blocked"; },
    p => { p.url = "https://127.0.0.1:9999/menu-feed.css?journey-cache-proof=1"; }]) {
    const bad = structuredClone(good); mutate(bad); assert.equal(validCacheProof(bad, origin), false);
  }
});
