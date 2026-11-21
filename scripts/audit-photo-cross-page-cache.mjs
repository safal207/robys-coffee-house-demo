import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const ORIGIN = "https://safal207.github.io/robys-coffee-house-demo/";
const HOME = new URL(".", ORIGIN).href;
const FEED = new URL("menu-feed.html", ORIGIN);
const PHOTO = new URL("src/products/sets-v1/cool-lime-macaron.webp", ORIGIN);
const OUT = ".artifacts/photo-cross-page-cache/report.json";
const SCENARIOS = ["http-normal", "http-disabled", "sw-allowed"];
const REPETITIONS = 2;
const WAIT_TIMEOUT_MS = 45000;
const WORKER_WAIT_MS = 18000;

const photoUrl = url => { try { return new URL(url).pathname === PHOTO.pathname; } catch { return false; } };
function summarizeRequests(records) {
  return records.map(record => ({
    phase: record.phase,
    status: record.status ?? null,
    fromDiskCache: !!record.fromDiskCache,
    fromServiceWorker: !!record.fromServiceWorker,
    fromPrefetchCache: !!record.fromPrefetchCache,
    servedFromBrowserCache: !!record.servedFromBrowserCache,
    encodedDataLength: record.encodedDataLength ?? null,
    contentLength: record.headers?.["content-length"] ?? null,
    cacheControl: record.headers?.["cache-control"] ?? null,
    etag: record.headers?.etag ?? null,
    resourceType: record.resourceType ?? null
  }));
}
async function workerState(page) {
  return await page.evaluate(async (photo) => {
    const supported = "serviceWorker" in navigator && "caches" in window;
    if (!supported) return { supported: false, controlled: false, cacheKeys: [], imageInCacheStorage: false };
    const registration = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    const image = await caches.match(photo);
    return {
      supported: true, registered: !!registration,
      active: !!registration?.active,
      installing: !!registration?.installing,
      waiting: !!registration?.waiting,
      controlled: !!navigator.serviceWorker.controller,
      controllerScript: navigator.serviceWorker.controller?.scriptURL ?? null,
      cacheKeys: keys, imageInCacheStorage: !!image
    };
  }, PHOTO.href);
}
async function ensureRealPhoto(page, selector) {
  const locator = page.locator(selector).first();
  assert.equal(await locator.count(), 1, "Expected a unique first real photo");
  await locator.scrollIntoViewIfNeeded({ timeout: WAIT_TIMEOUT_MS });
  await page.waitForFunction(path => {
    const img = document.querySelector(path);
    return !!img && img.complete && img.naturalWidth >= 256;
  }, selector, { timeout: WAIT_TIMEOUT_MS });
  await locator.evaluate(img => img.decode());
  return await locator.evaluate(img => ({ url: img.currentSrc || img.src, naturalWidth: img.naturalWidth }));
}
async function one(browser, scenario, repetition) {
  const enableWorker = scenario === "sw-allowed";
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: "tr-TR", serviceWorkers: enableWorker ? "allow" : "block"
  });
  const page = await context.newPage();
  let phase = "home";
  const requests = new Map();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  if (scenario === "http-disabled") await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150,
    downloadThroughput: 1600000 / 8,
    uploadThroughput: 750000 / 8,
    connectionType: "cellular3g"
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  cdp.on("Network.requestWillBeSent", event => {
    if (!photoUrl(event.request.url)) return;
    requests.set(event.requestId, {
      phase, resourceType: event.type,
      requestId: event.requestId,
      url: event.request.url
    });
  });
  cdp.on("Network.requestServedFromCache", event => {
    const record = requests.get(event.requestId);
    if (record) record.servedFromBrowserCache = true;
  });
  cdp.on("Network.responseReceived", event => {
    const record = requests.get(event.requestId);
    if (!record) return;
    const response = event.response;
    const lowerHeaders = Object.fromEntries(Object.entries(response.headers ?? {}).map(([k,v]) => [k.toLowerCase(),v]));
    Object.assign(record, {
      status: response.status, fromDiskCache: response.fromDiskCache,
      fromServiceWorker: response.fromServiceWorker,
      fromPrefetchCache: response.fromPrefetchCache,
      headers: lowerHeaders
    });
  });
  cdp.on("Network.loadingFinished", event => {
    const record = requests.get(event.requestId);
    if (record) record.encodedDataLength = event.encodedDataLength;
  });
  cdp.on("Network.loadingFailed", event => {
    const record = requests.get(event.requestId);
    if (record) record.loadingFailed = event.errorText;
  });
  try {
    const homeResponse = await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: WAIT_TIMEOUT_MS });
    assert.ok(homeResponse?.ok(), "Published home failed");
    let workerReadyWithinLimit = false;
    if (enableWorker) {
      workerReadyWithinLimit = await page.evaluate(async timeout => {
        return await Promise.race([
          navigator.serviceWorker.ready.then(() => true).catch(() => false),
          new Promise(resolve => setTimeout(() => resolve(false), timeout))
        ]);
      }, WORKER_WAIT_MS);
    }
    const afterHome = await workerState(page);
    const homePhoto = await ensureRealPhoto(page, "a.coffee-feed-entry img");
    assert.equal(new URL(homePhoto.url).pathname, PHOTO.pathname, "Homepage first feed tile must be same photo");
    const afterHomeImage = await workerState(page);
    const homeRequests = summarizeRequests([...requests.values()].filter(r => r.phase === "home"));
    assert.ok(homeRequests.length, "Homepage must request its visible image");
    phase = "feed";
    const navigation = page.waitForURL(url => url.pathname === FEED.pathname, {
      waitUntil: "domcontentloaded", timeout: WAIT_TIMEOUT_MS
    });
    await Promise.all([navigation, page.locator('a.coffee-feed-entry[href="menu-feed.html"]').tap()]);
    const feedPhoto = await ensureRealPhoto(page, "#feed .feed-card .feed-photo img");
    assert.equal(new URL(feedPhoto.url).pathname, PHOTO.pathname, "Feed first photo must match home tile");
    await page.waitForTimeout(100);
    const afterFeed = await workerState(page);
    const feedRequests = summarizeRequests([...requests.values()].filter(r => r.phase === "feed"));
    assert.ok(feedRequests.length, "Feed document should request actual first photo");
    assert.deepEqual(errors, [], "Page JavaScript errors");
    return {
      scenario, repetition, workerReadyWithinLimit, homePhoto, feedPhoto,
      worker: { afterHome, afterHomeImage, afterFeed },
      homeRequests, feedRequests,
      cacheEvidence: {
        feedCacheHits: feedRequests.filter(r => r.fromDiskCache || r.fromServiceWorker || r.fromPrefetchCache || r.servedFromBrowserCache).length,
        feedHttpBytes: feedRequests.reduce((sum,r) => sum + (r.encodedDataLength ?? 0), 0),
        feedFullResponses: feedRequests.filter(r => r.status === 200).length,
        feedNotModifiedResponses: feedRequests.filter(r => r.status === 304).length,
        transferSizesComplete: feedRequests.every(r => Number.isFinite(r.encodedDataLength))
      },
      errors
    };
  } finally {
    await context.close();
  }
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (let repetition = 1; repetition <= REPETITIONS; repetition++) {
      const order = repetition % 2 ? SCENARIOS : [...SCENARIOS].reverse();
      for (const scenario of order) {
        const row = await one(browser, scenario, repetition);
        samples.push(row);
        console.log(JSON.stringify(row));
      }
    }
  } finally {
    await browser.close();
  }
  const report = {
    schema: "robys.cross-page-photo-cache.v1", sampledAt: new Date().toISOString(),
    subject: PHOTO.href,
    environment: "Published site, Chromium, 390x844 DPR2, 150ms RTT, 1.6Mbps, 4x CPU, fresh context per run",
    scenarios: SCENARIOS, repetitions: REPETITIONS,
    caveats: [
      "The Network.loadingFinished encodedDataLength is CDP request transfer evidence, not a full-page byte audit",
      "SW install-time requests can occur in the worker process, outside this page CDP target",
      "An HTTP 200 may be served from a cache; response status alone does not prove network transfer",
      "The SW install is awaited for at most 18 seconds; a false workerReadyWithinLimit means SW caching was not verified",
      "Only the same Cool Lime product image and a deliberate home photo tile to feed navigation are compared",
      "Synthetic tests are not real-device field measurements; no commerce/checkout code or PWA data is modified"
    ],
    samples
  };
  mkdirSync(".artifacts/photo-cross-page-cache", { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## Cross-page product-photo cache audit\n\n" +
      "| Mode | Feed photo cache hits | Feed encoded bytes | SW controlled on feed |\n|---|---:|---:|---|\n" +
      samples.map(row => "| " + row.scenario + " #" + row.repetition + " | " +
        row.cacheEvidence.feedCacheHits + " | " + row.cacheEvidence.feedHttpBytes + " | " +
        row.worker.afterFeed.controlled + " |").join("\n") +
      "\n\nInspect JSON for per-request cache flags and HTTP headers. Do not infer full network bytes from request count alone.\n");
  }
  console.log("SUMMARY " + JSON.stringify(samples.map(r=>({
    scenario:r.scenario, repetition:r.repetition, workerReady:r.workerReadyWithinLimit,
    controlled:r.worker.afterFeed.controlled, imageInCacheStorage:r.worker.afterFeed.imageInCacheStorage,
    cacheEvidence:r.cacheEvidence, feedRequests:r.feedRequests
  }))));
}
main().catch(error => { console.error(error); process.exitCode=1; });
