import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";

const ORIGIN = "https://safal207.github.io/robys-coffee-house-demo/";
const HOME = ORIGIN;
const FEED_PATH = "/robys-coffee-house-demo/menu-feed.html";
const PHOTO_PATH = "/robys-coffee-house-demo/src/products/sets-v1/cool-lime-macaron.webp";
const OUT = ".artifacts/sw-shared-bandwidth/report.json";
const BYTES_PER_SECOND = 200_000; // One 1.6 Mb/s downstream pipe shared by ALL browser and worker TCP tunnels.
const INITIAL_CONNECT_DELAY_MS = 150;
const PAIRS = 4;
const WAIT_TIMEOUT_MS = 60000;
const AFTER_DCL_MS = 500;
const AFTER_IMAGES_MS = 3000;
const median = nums => {
  assert.ok(nums.length && nums.every(Number.isFinite));
  const sorted = [...nums].sort((a,b)=>a-b);
  return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;
};
const pathname = url => { try { return new URL(url).pathname; } catch { return ""; } };

async function createSharedProxy() {
  let availableAt = Date.now();
  let downloadBytes = 0, uploadBytes = 0, connections = 0, rejectedConnects = 0;
  const sockets = new Set(), timers = new Set();
  function later(fn, ms) {
    const handle = setTimeout(() => { timers.delete(handle); fn(); }, Math.max(0, ms));
    timers.add(handle);
  }
  // Rate-limit TLS ciphertext without intercepting/altering HTTPS content.
  // All page requests, worker requests, and concurrent TCP tunnels reserve slots
  // on the SAME downstream scheduler; this is NOT a per-target CDP throttle.
  function pumpDownstream(upstream, downstream) {
    let pending = false, ended = false;
    upstream.on("data", data => {
      upstream.pause();
      pending = true;
      let offset = 0;
      const send = () => {
        if (downstream.destroyed) { pending = false; return; }
        if (offset >= data.length) {
          pending = false;
          if (ended) downstream.end();
          else upstream.resume();
          return;
        }
        const next = data.subarray(offset, Math.min(offset + 8192, data.length));
        offset += next.length;
        const now = Date.now();
        const sendAt = Math.max(now, availableAt) +
          Math.ceil(next.length * 1000 / BYTES_PER_SECOND);
        availableAt = sendAt;
        later(() => {
          if (downstream.destroyed) return;
          downloadBytes += next.length;
          if (!downstream.write(next)) downstream.once("drain", send);
          else send();
        }, sendAt - now);
      };
      send();
    });
    upstream.on("end", () => { ended = true; if (!pending) downstream.end(); });
  }
  const server = createServer((_, response) => {
    response.writeHead(403, { "Content-Type": "text/plain" }); response.end("CONNECT only");
  });
  server.on("connect", (request, client, head) => {
    const target = request.url ?? "";
    if (target.toLowerCase() !== "safal207.github.io:443") {
      rejectedConnects++;
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    connections++;
    const upstream = connect({ host: "safal207.github.io", port: 443 });
    sockets.add(client); sockets.add(upstream);
    const close = socket => () => {
      sockets.delete(socket);
      (socket === client ? upstream : client).destroy();
    };
    client.on("close", close(client));
    upstream.on("close", close(upstream));
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    upstream.once("connect", () => later(() => {
      if (client.destroyed || upstream.destroyed) return;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) { uploadBytes += head.length; upstream.write(head); }
      client.on("data", chunk => { uploadBytes += chunk.length; upstream.write(chunk); });
      client.on("end", () => upstream.end());
      pumpDownstream(upstream, client);
    }, INITIAL_CONNECT_DELAY_MS));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    port, url: "http://127.0.0.1:" + port,
    snapshot: () => ({ downloadBytes, uploadBytes, connections, rejectedConnects }),
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

async function measure(browser, mode, pair, proxy) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: "tr-TR",
    serviceWorkers: mode === "worker-allowed" ? "allow" : "block"
  });
  const page = await context.newPage();
  const errors = [], workerStarts = [];
  const at = () => performance.now();
  const started = at();
  context.on("serviceworker", worker => workerStarts.push({
    path: pathname(worker.url()), atMs: at() - started
  }));
  page.on("pageerror", error => errors.push(error.message));
  const getPaint = () => page.evaluate(() => ({
    fcpMs: performance.getEntriesByType("paint")
      .find(r => r.name === "first-contentful-paint")?.startTime ?? null,
    domReadyMs: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd ?? null,
    resourceCount: performance.getEntriesByType("resource").length
  }));
  const workerState = () => page.evaluate(async () => {
    const sw = navigator.serviceWorker;
    const reg = await sw?.getRegistration().catch(()=>null);
    const cacheNames = "caches" in window ? await caches.keys() : [];
    return {
      registered: !!reg, active: !!reg?.active, installing: !!reg?.installing,
      controlled: !!sw?.controller, cacheNames
    };
  });
  try {
    const homeResponse = await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: WAIT_TIMEOUT_MS });
    assert.ok(homeResponse?.ok(), "Published homepage unavailable");
    await page.waitForFunction(() => performance.getEntriesByType("paint")
      .some(p => p.name === "first-contentful-paint"), null, { timeout: WAIT_TIMEOUT_MS });
    const homePaint = await getPaint();
    assert.ok(Number.isFinite(homePaint.fcpMs), "Homepage FCP missing");
    await page.waitForTimeout(AFTER_DCL_MS);
    const atHomeClick = proxy.snapshot();
    const workerAtClick = await workerState();
    const link = page.locator('a.coffee-feed-entry[href="menu-feed.html"]');
    assert.equal(await link.count(), 1, "Expected actual home-to-feed link");
    const clickAt = at();
    const dest = page.waitForURL(url => url.pathname === FEED_PATH, {
      waitUntil: "domcontentloaded", timeout: WAIT_TIMEOUT_MS
    });
    await page.evaluate(() => document.querySelector('a.coffee-feed-entry[href="menu-feed.html"]').click());
    await dest;
    const feedDclAfterClickMs = at() - clickAt;
    const feedPaint = await getPaint();
    await page.waitForFunction(() => document.querySelectorAll("#feed .feed-card .feed-photo img").length >= 2,
      null, { timeout: WAIT_TIMEOUT_MS });
    const images = page.locator("#feed .feed-card .feed-photo img");
    const first = images.nth(0);
    await first.scrollIntoViewIfNeeded({ timeout: WAIT_TIMEOUT_MS });
    await page.waitForFunction(() => {
      const img = document.querySelectorAll("#feed .feed-card .feed-photo img")[0];
      return !!img && img.complete && img.naturalWidth >= 256;
    }, null, { timeout: WAIT_TIMEOUT_MS });
    const firstPhoto = await first.evaluate(async img => {
      await img.decode();
      return { src: img.currentSrc || img.src, width: img.naturalWidth };
    });
    assert.equal(pathname(firstPhoto.src), PHOTO_PATH, "First actual photo changed");
    assert.ok(firstPhoto.width >= 256, "First photo decode failed");
    const firstPhotoAfterClickMs = at() - clickAt;
    const second = images.nth(1);
    await second.scrollIntoViewIfNeeded({ timeout: WAIT_TIMEOUT_MS });
    await page.waitForFunction(() => {
      const img = document.querySelectorAll("#feed .feed-card .feed-photo img")[1];
      return !!img && img.complete && img.naturalWidth >= 256;
    }, null, { timeout: WAIT_TIMEOUT_MS });
    const secondPhoto = await second.evaluate(async img => {
      await img.decode(); return { src: img.currentSrc || img.src, width: img.naturalWidth };
    });
    assert.ok(secondPhoto.width >= 256 && /\.webp$/i.test(pathname(secondPhoto.src)),
      "Second catalog image must be real and decoded");
    const secondPhotoAfterClickMs = at() - clickAt;
    const afterPhotos = proxy.snapshot();
    const feedState = await workerState();
    await page.waitForTimeout(AFTER_IMAGES_MS);
    const afterTail = proxy.snapshot();
    const workerTimings = [];
    for (const worker of context.serviceWorkers()) {
      let timer;
      try {
        const info = await Promise.race([
          worker.evaluate(async () => {
            const r = performance.getEntriesByType("resource");
            const cachesList = [];
            for (const name of await caches.keys()) {
              const cache = await caches.open(name);
              cachesList.push({ name, entries: (await cache.keys()).length });
            }
            return {
              entries: r.length,
              transferSize: r.reduce((n, e) => n + e.transferSize, 0),
              encodedBodySize: r.reduce((n, e) => n + e.encodedBodySize, 0),
              lastResponseEndMs: Math.max(0, ...r.map(e => e.responseEnd)),
              caches: cachesList
            };
          }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("worker snapshot timed out")), 3000); })
        ]);
        workerTimings.push({ script: pathname(worker.url()), ...info });
      } catch (error) {
        workerTimings.push({ script: pathname(worker.url()), error: String(error.message) });
      } finally { clearTimeout(timer); }
    }
    const afterWorker = await workerState();
    assert.deepEqual(errors, [], "Browser JavaScript errors");
    if (mode === "worker-blocked")
      assert.equal(workerStarts.length, 0, "Blocked control cannot install worker");
    if (mode === "worker-allowed") {
      assert.ok(workerStarts.length > 0 && workerTimings.some(w => Number.isFinite(w.entries) && w.entries > 0),
        "Allowed first-install condition must actually start a worker and observe background resources");
    }
    return {
      mode, pair, homePaint, feedPaint, workerAtClick, feedState, afterWorker,
      workerStarts, workerTimings, firstPhoto, secondPhoto,
      feedDclAfterClickMs, firstPhotoAfterClickMs, secondPhotoAfterClickMs,
      proxy: {
        atHomeClick, afterPhotos, afterTail,
        bytesDuringClickThroughPhotos: afterPhotos.downloadBytes - atHomeClick.downloadBytes,
        bytesDuringClickThroughTail: afterTail.downloadBytes - atHomeClick.downloadBytes
      },
      errors
    };
  } finally {
    await context.close();
  }
}

async function one(mode, pair) {
  const proxy = await createSharedProxy();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true, proxy: { server: proxy.url },
      args: ["--disable-quic"]
    });
    const result = await measure(browser, mode, pair, proxy);
    result.proxy.total = proxy.snapshot();
    assert.ok(result.proxy.total.connections > 0 &&
      result.proxy.total.downloadBytes > 0, "Shared line did not carry the site");
    return result;
  } finally {
    if (browser) await browser.close();
    await proxy.close();
  }
}

async function main() {
  const conditions = ["worker-blocked", "worker-allowed"];
  const samples = [];
  for (let pair = 1; pair <= PAIRS; pair++) {
    const order = pair % 2 ? conditions : [...conditions].reverse();
    for (const mode of order) {
      const result = await one(mode, pair);
      samples.push(result);
      console.log("SAMPLE " + JSON.stringify({
        mode, pair, homeFcpMs: result.homePaint.fcpMs,
        feedDclMs: result.feedDclAfterClickMs,
        firstPhotoMs: result.firstPhotoAfterClickMs,
        secondPhotoMs: result.secondPhotoAfterClickMs,
        proxyDownloadBytes: result.proxy.total.downloadBytes,
        workerStarted: result.workerStarts.length,
        workerTimingEntries: result.workerTimings.reduce((n,w)=>n+(w.entries??0),0)
      }));
    }
  }
  const grouped = Object.fromEntries(conditions.map(mode => {
    const subset = samples.filter(s=>s.mode===mode);
    return [mode, {
      homeFcpMs: median(subset.map(s=>s.homePaint.fcpMs)),
      feedDclAfterClickMs: median(subset.map(s=>s.feedDclAfterClickMs)),
      firstPhotoAfterClickMs: median(subset.map(s=>s.firstPhotoAfterClickMs)),
      secondPhotoAfterClickMs: median(subset.map(s=>s.secondPhotoAfterClickMs)),
      totalProxyDownBytes: median(subset.map(s=>s.proxy.total.downloadBytes))
    }];
  }));
  const pairs = Array.from({length:PAIRS}, (_,i) => {
    const n = i+1;
    const a = samples.find(s=>s.mode==="worker-blocked"&&s.pair===n);
    const b = samples.find(s=>s.mode==="worker-allowed"&&s.pair===n);
    assert.ok(a&&b);
    return {
      pair:n,
      firstPhotoPenaltyMs:b.firstPhotoAfterClickMs-a.firstPhotoAfterClickMs,
      secondPhotoPenaltyMs:b.secondPhotoAfterClickMs-a.secondPhotoAfterClickMs,
      feedDclPenaltyMs:b.feedDclAfterClickMs-a.feedDclAfterClickMs,
      extraProxyDownloadBytes:b.proxy.total.downloadBytes-a.proxy.total.downloadBytes,
      workerObservedResourceCount:b.workerTimings.reduce((v,w)=>v+(w.entries??0),0),
      workerActive:b.afterWorker.active
    };
  });
  const report = {
    schema:"robys.sw-shared-bandwidth-home-feed.v1",
    source:"Published site, unmodified HTTPS tunneled through a single shared TCP bandwidth shaper",
    createdAt:new Date().toISOString(),
    profile:{
      contexts:"Fresh browser and fresh local HTTP CONNECT proxy per cold visit",
      downstreamBitsPerSecond:BYTES_PER_SECOND*8,
      oneTimeProxyConnectDelayMs:INITIAL_CONNECT_DELAY_MS,
      noPerTargetCDPThrottling:true,
      device:"Chromium, 390x844, DPR2, mobile/touch",
      navigation:"Home DCL +500ms, synthetic activation of existing home-to-feed anchor",
      afterImagesObservationMs:AFTER_IMAGES_MS
    },
    caveats:[
      "The HTTPS CONNECT tunnel shares one download quota across page and service-worker connections; the proxy does not inspect TLS contents or replace images",
      "The shaper is a laboratory link, not a real cellular modem; initial RTT is modeled once per CONNECT rather than on each HTTP request",
      "Upload bytes are counted but not throttled; DNS, transport-layer congestion, TLS multiplexing and target scheduling differ from cellular networks",
      "Context-level Service Worker request events are incomplete; worker.evaluate Resource Timing and proxy total bytes are separate evidence, not per-resource attribution",
      "Navigation is triggered via a scripted click to remove locator auto-scroll variance; not a literal user's tap",
      "The first and second feed product photographs are decode-ready metrics; not verified visible paint or user conversion",
      "Only two matched cold pairs; no performance win or regression is established without repeatable results and deeper browser testing",
      "A still-installing Service Worker yields partial Resource Timing and cache counts; no precache reduction is authorized"
    ],
    grouped, pairs, samples
  };
  mkdirSync(".artifacts/sw-shared-bandwidth",{recursive:true});
  writeFileSync(OUT,JSON.stringify(report,null,2)+"\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## Shared 1.6 Mbps home → feed test (read-only)\n\n"+
      "| Condition | Home FCP, ms | Feed DCL after click, ms | First feed photo, ms | Second feed photo, ms | Total proxy downstream, B |\n"+
      "|---|---:|---:|---:|---:|---:|\n"+
      conditions.map(mode=>"| "+mode+" | "+["homeFcpMs","feedDclAfterClickMs",
        "firstPhotoAfterClickMs","secondPhotoAfterClickMs","totalProxyDownBytes"]
        .map(k=>Math.round(grouped[mode][k])).join(" | ")+" |").join("\n")+
      "\n\nMatched first-photo penalties (worker minus blocked): "+pairs.map(p=>Math.round(p.firstPhotoPenaltyMs)+" ms").join(", ")+
      ". Worker/page share a single lab TCP download throttle, not real mobile radio. See raw JSON.\n");
  }
  console.log("SUMMARY "+JSON.stringify({grouped,pairs}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
