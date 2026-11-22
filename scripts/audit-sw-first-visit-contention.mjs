import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const HOME = "https://safal207.github.io/robys-coffee-house-demo/";
const OUTPUT = ".artifacts/sw-first-visit-contention/report.json";
const HERO_PATH = "/robys-coffee-house-demo/src/robys-hero-poster.jpg";
const CONDITIONS = ["sw-blocked", "sw-first-install"];
const PAIRS = 3;
const OBSERVATION_MS = 8000;
const NET = {
  offline: false, latency: 150, downloadThroughput: 1600000 / 8,
  uploadThroughput: 750000 / 8, connectionType: "cellular3g"
};
const median = data => {
  const xs = [...data].sort((a, b) => a - b);
  assert.ok(xs.length > 0 && xs.every(Number.isFinite));
  return xs[Math.floor(xs.length / 2)] / 2 + xs[Math.floor((xs.length - 1) / 2)] / 2;
};
const path = url => {
  try { return new URL(url).pathname; } catch { return ""; }
};
function cacheClass(req) {
  const u = path(req.url);
  if (/\.(webp|png|jpe?g|avif|svg|gif)$/i.test(u)) return "image";
  if (/\.(js|mjs)$/i.test(u)) return "script";
  if (/\.css$/i.test(u)) return "style";
  if (/\.html?$/.test(u) || /\/$/.test(u)) return "document";
  return "other";
}
async function audit(browser, condition, pair) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: "tr-TR",
    serviceWorkers: condition === "sw-first-install" ? "allow" : "block"
  });
  const page = await context.newPage();
  const records = [], errors = [], workers = [], promises = [];
  const seen = new WeakMap();
  let beganAt = Date.now();
  const serviceWorkerOf = request => {
    try { return !!request.serviceWorker?.(); } catch { return false; }
  };
  context.on("serviceworker", worker => {
    workers.push({ url: worker.url(), discoveredAtMs: Date.now() - beganAt });
  });
  context.on("request", request => {
    const item = {
      url: request.url(), category: cacheClass({ url: request.url() }),
      workerOwned: serviceWorkerOf(request), startObservedMs: Date.now() - beganAt,
      method: request.method(), responseStatus: null, encodedResponseBodyBytes: null,
      sizeKnown: false, completed: false, failed: null
    };
    seen.set(request, item);
    records.push(item);
  });
  context.on("response", response => {
    const item = seen.get(response.request());
    if (!item) return;
    item.responseStatus = response.status();
    const headers = response.headers();
    item.contentLength = headers["content-length"] ?? null;
    item.cacheControl = headers["cache-control"] ?? null;
    item.responseObservedMs = Date.now() - beganAt;
    item.fromServiceWorker = response.fromServiceWorker();
  });
  context.on("requestfinished", request => {
    const item = seen.get(request);
    if (!item) return;
    item.completed = true;
    promises.push(request.sizes().then(sizes => {
      item.encodedResponseBodyBytes = sizes.responseBodySize;
      item.responseHeaderBytes = sizes.responseHeadersSize;
      item.sizeKnown = Number.isFinite(sizes.responseBodySize);
    }).catch(error => { item.sizeError = error.message; }));
  });
  context.on("requestfailed", request => {
    const item = seen.get(request);
    if (item) item.failed = request.failure()?.errorText ?? "request failed";
  });
  page.on("pageerror", error => errors.push(error.message));
  // The same measurement instrumentation runs in BOTH conditions.
  await page.addInitScript(() => {
    window.__qaFirstVisit = { largestContentfulPaintMs: null, largestElement: null };
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__qaFirstVisit.largestContentfulPaintMs = entry.startTime;
          window.__qaFirstVisit.largestElement = entry.element?.tagName ?? null;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* Unsupported LCP API is reported as null. */ }
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const pageRequests = new Map();
  cdp.on("Network.requestWillBeSent", event => {
    pageRequests.set(event.requestId, {
      url: event.request.url, startMs: event.timestamp,
      isHero: path(event.request.url) === HERO_PATH,
      fromBrowserCache: false, fromServiceWorker: false,
      encodedDataLength: null
    });
  });
  cdp.on("Network.requestServedFromCache", event => {
    const item = pageRequests.get(event.requestId);
    if (item) item.fromBrowserCache = true;
  });
  cdp.on("Network.responseReceived", event => {
    const item = pageRequests.get(event.requestId);
    if (item) item.fromServiceWorker = !!event.response.fromServiceWorker;
  });
  cdp.on("Network.loadingFinished", event => {
    const item = pageRequests.get(event.requestId);
    if (item) item.encodedDataLength = event.encodedDataLength;
  });
  try {
    beganAt = Date.now();
    const response = await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.ok(response?.ok(), "Published home page not reachable");
    await page.waitForFunction(() =>
      performance.getEntriesByType("paint").some(entry => entry.name === "first-contentful-paint"),
      null, { timeout: 45000 });
    assert.equal(await page.locator("#hero-title").count(), 1, "Expected homepage hero");
    // No scrolling or interaction: this is the visitor's initial above-the-fold view.
    const snapshot = async () => await page.evaluate(async () => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paint = performance.getEntriesByType("paint");
      const sw = navigator.serviceWorker;
      const registration = sw ? await sw.getRegistration().catch(() => null) : null;
      const keys = "caches" in window ? await caches.keys().catch(() => []) : [];
      const hero = performance.getEntriesByType("resource").find(r =>
        new URL(r.name).pathname.endsWith("/src/robys-hero-poster.jpg"));
      const image = "caches" in window
        ? await caches.match(new URL("src/products/sets-v1/cool-lime-macaron.webp", location.href))
          .then(x => !!x).catch(() => false)
        : false;
      return {
        domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
        fcpMs: paint.find(p => p.name === "first-contentful-paint")?.startTime ?? null,
        lcpCandidateMs: window.__qaFirstVisit?.largestContentfulPaintMs ?? null,
        lcpElementTag: window.__qaFirstVisit?.largestElement ?? null,
        heroRequestStartMs: hero?.startTime ?? null,
        heroResponseEndMs: hero?.responseEnd ?? null,
        heroTransferBytes: hero?.transferSize ?? null,
        networkResourceEntries: performance.getEntriesByType("resource").length,
        sw: {
          registered: !!registration, active: !!registration?.active,
          installing: !!registration?.installing, waiting: !!registration?.waiting,
          controlled: !!sw?.controller,
          offlineReady: document.documentElement.dataset.offlineReady ?? null,
          cacheNames: keys, firstPhotoInCacheStorage: image
        }
      };
    });
    const justAfterFcp = await snapshot();
    await page.waitForTimeout(OBSERVATION_MS);
    const afterWindow = await snapshot();
    // BrowserContext request events did not expose install-time cache.addAll traffic
    // in the initial run. Inspect each Service Worker's OWN Resource Timing buffer
    // without altering the fetched worker source or its caching behavior.
    const workerTimings = [];
    for (const worker of context.serviceWorkers()) {
      let timer;
      try {
        const timing = await Promise.race([
          worker.evaluate(async () => {
            const entries = performance.getEntriesByType("resource").map(entry => ({
              path: new URL(entry.name).pathname,
              initiatorType: entry.initiatorType,
              startTime: entry.startTime,
              responseEnd: entry.responseEnd,
              transferSize: entry.transferSize,
              encodedBodySize: entry.encodedBodySize
            }));
            const cacheBuckets = [];
            for (const name of await caches.keys()) {
              const cache = await caches.open(name);
              const keys = await cache.keys();
              cacheBuckets.push({
                name, cachedEntries: keys.length,
                cachedImageEntries: keys.filter(key => /\.(?:webp|png|jpe?g|avif|svg|gif)(?:\?|$)/i.test(key.url)).length
              });
            }
            return {
              available: true,
              resourceEntryCount: entries.length,
              resourceTransferBytes: entries.reduce((n,r)=>n+r.transferSize,0),
              resourceEncodedBodyBytes: entries.reduce((n,r)=>n+r.encodedBodySize,0),
              imageResourceEntries: entries.filter(r=>/\.(?:webp|png|jpe?g|avif|svg|gif)$/i.test(r.path)).length,
              cacheBuckets,
              entries
            };
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("worker-inspection-timeout")), 3000);
          })
        ]);
        workerTimings.push({ url: worker.url(), ...timing });
      } catch (error) {
        workerTimings.push({ url: worker.url(), available: false, error: String(error.message) });
      } finally {
        clearTimeout(timer);
      }
    }
    await Promise.allSettled(promises);
    const workerRecords = records.filter(r => r.workerOwned);
    const pageRecords = records.filter(r => !r.workerOwned);
    const finished = data => data.filter(r => r.completed && r.sizeKnown);
    const bytes = data => finished(data).reduce((sum, r) => sum + r.encodedResponseBodyBytes, 0);
    const imageRequests = workerRecords.filter(r => r.category === "image");
    const network = {
      contextRequestCount: records.length,
      workerRequestCount: workerRecords.length,
      workerFinishedRequestCount: finished(workerRecords).length,
      workerFailedRequestCount: workerRecords.filter(r => r.failed).length,
      workerImageRequests: imageRequests.length,
      workerImageFinished: finished(imageRequests).length,
      workerObservedEncodedResponseBodyBytes: bytes(workerRecords),
      workerObservedImageBodyBytes: bytes(imageRequests),
      workerUnfinishedRequests: workerRecords.filter(r => !r.completed && !r.failed).length,
      pageRequestCount: pageRecords.length,
      pageObservedEncodedResponseBodyBytes: bytes(pageRecords),
      workerFirstRequestMs: workerRecords.length ? Math.min(...workerRecords.map(r => r.startObservedMs)) : null,
      workerRequestCountByPeriod: [1000,2000,4000,8000].map(limit => ({
        withinMs: limit, count: workerRecords.filter(r => r.startObservedMs <= limit).length
      })),
      heroCdpRequests: [...pageRequests.values()].filter(r => r.isHero).map(r => ({
        fromBrowserCache: r.fromBrowserCache, fromServiceWorker: r.fromServiceWorker,
        encodedDataLength: r.encodedDataLength
      }))
    };
    if (condition === "sw-blocked") {
      assert.equal(workerRecords.length, 0, "Control must not initiate Service Worker network requests");
    }
    if (condition === "sw-first-install" && afterWindow.sw.active) {
      assert.ok(workerTimings.some(w => w.available && w.cacheBuckets.some(c => c.cachedEntries > 0)),
        "An activated worker must provide independently inspectable Cache Storage evidence");
    }
    assert.ok(Number.isFinite(justAfterFcp.fcpMs) && Number.isFinite(afterWindow.fcpMs),
      "First Contentful Paint must be measured");
    assert.deepEqual(errors, [], "Homepage JavaScript errors");
    return {
      pair, condition, justAfterFcp, afterWindow, network,
      createdWorkers: workers, workerTimings, errors,
      workerTimingCompleteness: {
        serviceWorkerObjects: context.serviceWorkers().length,
        successfulInspections: workerTimings.filter(w => w.available).length,
        inspectableResourceEntries: workerTimings.filter(w => w.available).reduce((n,w) => n + w.resourceEntryCount, 0),
        note: "Worker resource timing and cache keys are independent of page-target CDP network instrumentation"
      },
      workerRequestEvidence: workerRecords.map(r => ({
        path: path(r.url), category: r.category, startObservedMs: r.startObservedMs,
        responseStatus: r.responseStatus, encodedResponseBodyBytes: r.encodedResponseBodyBytes,
        fromServiceWorker: r.fromServiceWorker ?? false, failed: r.failed
      }))
    };
  } finally {
    await context.close();
  }
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (let pair=1;pair<=PAIRS;pair++) {
      for (const condition of pair%2 ? CONDITIONS : [...CONDITIONS].reverse()) {
        const result = await audit(browser, condition, pair);
        samples.push(result);
        console.log("SAMPLE " + JSON.stringify({
          pair, condition,
          fcp: result.afterWindow.fcpMs, lcp: result.afterWindow.lcpCandidateMs,
          workerRequests: result.network.workerRequestCount,
          workerBodyBytes: result.network.workerObservedEncodedResponseBodyBytes,
          swActive: result.afterWindow.sw.active,
          firstPhotoInCacheStorage: result.afterWindow.sw.firstPhotoInCacheStorage,
          workerResources: result.workerTimingCompleteness.inspectableResourceEntries,
          workerCacheEntries: result.workerTimings.filter(w=>w.available)
            .flatMap(w=>w.cacheBuckets.map(c=>c.cachedEntries))
        }));
      }
    }
  } finally {
    await browser.close();
  }
  const groups = Object.fromEntries(CONDITIONS.map(mode => [
    mode,
    {
      fcpMs: median(samples.filter(s=>s.condition===mode).map(s=>s.afterWindow.fcpMs)),
      domContentLoadedMs: median(samples.filter(s=>s.condition===mode).map(s=>s.afterWindow.domContentLoadedMs)),
      contextWorkerRequestEvents: median(samples.filter(s=>s.condition===mode).map(s=>s.network.workerRequestCount)),
      workerResourceTimingEntries: median(samples.filter(s=>s.condition===mode).map(s=>s.workerTimings.reduce((n,w)=>n+(w.resourceEntryCount||0),0))),
      workerResourceTransferBytes: median(samples.filter(s=>s.condition===mode).map(s=>s.workerTimings.reduce((n,w)=>n+(w.resourceTransferBytes||0),0))),
      workerImageResourceEntries: median(samples.filter(s=>s.condition===mode).map(s=>s.workerTimings.reduce((n,w)=>n+(w.imageResourceEntries||0),0))),
      workerCacheStorageEntries: median(samples.filter(s=>s.condition===mode).map(s=>s.workerTimings.reduce((n,w)=>n+(w.cacheBuckets||[]).reduce((n,b)=>n+b.cachedEntries,0),0)))
    }
  ]));
  const paired = Array.from({length:PAIRS}, (_,n)=>{
    const pair=n+1;
    const base=samples.find(s=>s.pair===pair&&s.condition==="sw-blocked");
    const worker=samples.find(s=>s.pair===pair&&s.condition==="sw-first-install");
    assert.ok(base&&worker);
    return {
      pair, fcpPenaltyMs:worker.afterWindow.fcpMs-base.afterWindow.fcpMs,
      domContentLoadedPenaltyMs:worker.afterWindow.domContentLoadedMs-base.afterWindow.domContentLoadedMs,
      workerRequests:worker.network.workerRequestCount,
      workerBodyBytes:worker.network.workerObservedEncodedResponseBodyBytes,
      workerActive:worker.afterWindow.sw.active
    };
  });
  const report = {
    schema:"robys.sw-first-visit-contention.v1",
    source:"published homepage, read-only browser audit; no customer-visible changes",
    generatedAt:new Date().toISOString(),pairs:PAIRS,observationMs:OBSERVATION_MS,
    profile:"Chromium 390x844 DPR2, 150 ms RTT, 1.6 Mbps page-CDP throttle, 4x page CPU",
    caveats:[
      "Page CDP throttling may not apply equally to requests originating in the Service Worker target",
      "Playwright browser-context events include worker-owned requests where supported, but do not guarantee completeness across all browser targets",
      "Worker-side Resource Timing is read via worker.evaluate; entries may be limited by the worker buffer or unavailable if the worker was not yet running",
      "Cache Storage entry counts demonstrate stored resources but not how many bytes crossed the network during this visit",
      "Playwright request.sizes().responseBodySize is encoded response payload evidence, not a complete on-wire transfer including all connection overhead",
      "An 8-second observation window cannot establish complete installation bytes if installation continues beyond that window",
      "LCP is the last observed candidate after 8 seconds, not a real-user field Core Web Vital",
      "Three cold pairs are a diagnostic sample, not statistical proof of first-visit performance impact",
      "CSP/brand/photos/offline content are not changed; changes to precache behavior require dedicated offline regression testing"
    ],
    groups,paired,samples
  };
  mkdirSync(".artifacts/sw-first-visit-contention",{recursive:true});
  writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## Cold-first-visit Service Worker installation diagnostic\n\n"+
      "| Mode | Median FCP, ms | DCL, ms | Worker resource entries | Worker ResourceTiming transfer, bytes | Cached entries |\n"+
      "|---|---:|---:|---:|---:|---:|\n"+
      CONDITIONS.map(mode=>"| "+mode+" | "+Math.round(groups[mode].fcpMs)+" | "+
        Math.round(groups[mode].domContentLoadedMs)+" | "+groups[mode].workerResourceTimingEntries+
        " | "+groups[mode].workerResourceTransferBytes+
        " | "+groups[mode].workerCacheStorageEntries+" |").join("\n")+
      "\n\nPaired FCP deltas (worker minus blocked): "+paired.map(p=>Math.round(p.fcpPenaltyMs)+"ms").join(", ")+
      ". These are page-level lab deltas. Worker timings come from worker.evaluate(); the page-only request monitor missed install traffic. Check raw artifact for traffic completeness and install state.\n");
  }
  console.log("SUMMARY "+JSON.stringify({groups,paired}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
