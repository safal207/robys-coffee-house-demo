import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { chromium } from "playwright";

const HOME = "https://safal207.github.io/robys-coffee-house-demo/";
const FEED_PATH = "/robys-coffee-house-demo/menu-feed.html";
const PHOTO = "src/products/sets-v1/cool-lime-macaron.webp";
const PHOTO_PATH = "/robys-coffee-house-demo/" + PHOTO;
const OUT = ".artifacts/home-feed-intent-prefetch/report.json";
const PAIRS = 4;
const HOVER_DWELL_MS = 700;
const MODES = ["mouse-hover", "touch-tap"];
const VARIANTS = ["control", "intent-prefetch"];

const median = values => {
  assert.ok(values.length && values.every(Number.isFinite));
  const s = [...values].sort((a, b) => a - b);
  return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
};
const stats = data => ({
  photoReadyMs: median(data.map(v => v.photoReadyMs)),
  feedFcpMs: median(data.map(v => v.feedFcpMs)),
  homeFcpMs: median(data.map(v => v.homeFcpMs)),
  photoRequestStartMs: median(data.map(v => v.photoRequestStartMs)),
  photoTransferBytes: median(data.map(v => v.photoTransferBytes)),
  photoNetworkRequests: median(data.map(v => v.photoNetworkRequests))
});

async function visit(browser, mode, variant, pair) {
  const touch = mode === "touch-tap";
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: touch, hasTouch: touch,
    serviceWorkers: "block", locale: "tr-TR"
  });
  const page = await context.newPage();
  const errors = [], photoRequests = [], photoResponses = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (new URL(request.url()).pathname === PHOTO_PATH) {
      photoRequests.push({ frameUrl: request.frame()?.url() ?? "", resourceType: request.resourceType() });
    }
  });
  if (variant === "intent-prefetch") {
    await page.addInitScript(({ photo }) => {
      let attempted = false;
      function maybePrefetch(event) {
        const target = event.target?.closest?.("a.coffee-feed-entry[href]");
        if (!target || attempted || document.hidden || navigator.onLine === false || navigator.connection?.saveData) return;
        const url = new URL(target.href, location.href);
        const expected = new URL("menu-feed.html", location.href);
        if (url.origin !== location.origin || url.pathname !== expected.pathname || url.search || url.hash || url.username || url.password) return;
        const hint = document.createElement("link");
        if (!hint.relList?.supports("prefetch")) return;
        attempted = true;
        hint.rel = "prefetch";
        hint.as = "image";
        hint.fetchPriority = "low";
        hint.setAttribute("data-intent-photo-experiment", "");
        hint.href = photo;
        document.head.append(hint);
        window.__intentPrefetchAtMs = performance.now();
      }
      for (const event of ["pointerover", "focusin", "pointerdown"]) {
        document.addEventListener(event, maybePrefetch, { passive: true });
      }
    }, { photo: PHOTO });
  }
  let cdp;
  try {
    cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    cdp.on("Network.responseReceived", ({ response }) => {
      if (new URL(response.url).pathname === PHOTO_PATH)
        photoResponses.push({
          fromDiskCache: !!response.fromDiskCache, fromPrefetchCache: !!response.fromPrefetchCache,
          status: response.status, protocol: response.protocol
        });
    });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150,
      downloadThroughput: 1600000 / 8,
      uploadThroughput: 750000 / 8,
      connectionType: "cellular3g"
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const homeResponse = await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.ok(homeResponse?.ok(), "Published home failed: " + homeResponse?.status());
    await page.waitForFunction(() =>
      performance.getEntriesByType("paint").some(p => p.name === "first-contentful-paint"),
      null, { timeout: 45000 });
    const homeFcpMs = await page.evaluate(() =>
      performance.getEntriesByType("paint").find(p => p.name === "first-contentful-paint")?.startTime);
    assert.ok(Number.isFinite(homeFcpMs), "Home FCP is missing");
    const target = page.locator('a.coffee-feed-entry[href="menu-feed.html"]').first();
    assert.equal(await target.count(), 1, "Exact target link missing");
    if (!touch) {
      // A category/deep-link must never trigger a speculative unrelated photo.
      const wrong = page.locator('a.menu-card-link[href="menu.html#desserts"]').first();
      assert.equal(await wrong.count(), 1, "Off-target category link missing");
      await wrong.hover();
      assert.equal(await page.locator('link[data-intent-photo-experiment]').count(), 0,
        "Off-target interaction started a first-photo prefetch");
      await target.hover();
      await page.waitForTimeout(HOVER_DWELL_MS);
    }
    const beforeClick = await page.evaluate(() => ({
      hintCount: document.querySelectorAll('link[data-intent-photo-experiment]').length,
      hintAtMs: window.__intentPrefetchAtMs ?? null,
      photoResourceEntries: performance.getEntriesByType("resource").filter(r =>
        new URL(r.name).pathname.endsWith("/src/products/sets-v1/cool-lime-macaron.webp"))
        .map(r => ({ startTime: r.startTime, responseEnd: r.responseEnd, transferSize: r.transferSize }))
    }));
    assert.equal(beforeClick.hintCount, !touch && variant === "intent-prefetch" ? 1 : 0,
      "Hover-only hint must have correct scope and timing");
    if (beforeClick.hintAtMs !== null)
      assert.ok(beforeClick.hintAtMs >= homeFcpMs, "Intent hint must not compete with home first paint");
    const nav = page.waitForURL(url => url.pathname === FEED_PATH, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (touch) await Promise.all([nav, target.tap()]);
    else await Promise.all([nav, target.click()]);
    const firstPhoto = page.locator("#feed .feed-card .feed-photo img").first();
    await firstPhoto.waitFor({ state: "visible", timeout: 45000 });
    await page.waitForFunction(() => {
      const img = document.querySelector("#feed .feed-card .feed-photo img");
      return img?.complete && img.naturalWidth >= 256;
    }, null, { timeout: 45000 });
    await firstPhoto.evaluate(img => img.decode());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const photoReadyMs = await page.evaluate(() => performance.now());
    const feed = await page.evaluate(() => {
      const image = document.querySelector("#feed .feed-card .feed-photo img");
      const source = image.currentSrc || image.src;
      const resource = performance.getEntriesByType("resource").find(r => r.name === source);
      return {
        photoPath: new URL(source).pathname,
        naturalWidth: image.naturalWidth,
        photoRequestStartMs: resource?.startTime ?? null,
        photoTransferBytes: resource?.transferSize ?? null,
        feedFcpMs: performance.getEntriesByType("paint").find(p => p.name === "first-contentful-paint")?.startTime ?? null
      };
    });
    assert.equal(feed.photoPath, PHOTO_PATH, "Feed first product photo identity changed");
    assert.ok(feed.naturalWidth >= 256 && Number.isFinite(feed.photoRequestStartMs),
      "Actual photo timing or image dimensions missing");
    assert.ok(Number.isFinite(feed.feedFcpMs), "Feed FCP is missing");
    assert.deepEqual(errors, [], "JavaScript errors during home → feed journey");
    return {
      mode, variant, pair, homeFcpMs, photoReadyMs, ...feed,
      homeHint: beforeClick, photoNetworkRequests: photoRequests.length,
      photoRequests, photoResponses, errors
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (const mode of MODES) {
      for (let pair = 1; pair <= PAIRS; pair++) {
        const order = pair % 2 ? VARIANTS : [...VARIANTS].reverse();
        for (const variant of order) {
          const sample = await visit(browser, mode, variant, pair);
          samples.push(sample);
          console.log(JSON.stringify(sample));
        }
      }
    }
  } finally {
    await browser.close();
  }
  const groups = {};
  const deltas = {};
  for (const mode of MODES) {
    const control = samples.filter(s => s.mode === mode && s.variant === "control");
    const candidate = samples.filter(s => s.mode === mode && s.variant === "intent-prefetch");
    assert.equal(control.length, PAIRS);
    assert.equal(candidate.length, PAIRS);
    groups[mode] = { control: stats(control), candidate: stats(candidate) };
    deltas[mode] = Array.from({ length: PAIRS }, (_, index) => {
      const pair = index + 1;
      const a = control.find(s => s.pair === pair), b = candidate.find(s => s.pair === pair);
      assert.ok(a && b);
      return {
        pair,
        photoGainMs: a.photoReadyMs - b.photoReadyMs,
        feedFcpPenaltyMs: b.feedFcpMs - a.feedFcpMs,
        homeFcpPenaltyMs: b.homeFcpMs - a.homeFcpMs,
        extraPhotoRequests: b.photoNetworkRequests - a.photoNetworkRequests
      };
    });
  }
  const report = {
    schema: "robys.home-feed-intent-prefetch.v1",
    source: "published GitHub Pages, Playwright-injected experimental intent handler only",
    synthetic: true, prefetchIsNotShipped: true,
    caveats: [
      "This is a lab diagnostic with 4 paired runs per device mode, not field evidence or conversion uplift",
      "Mouse-hover implies 700 ms of dwell; touch has no dwell and may not benefit",
      "Only direct feed-entry link is eligible; query, hash, category and product-deep links are excluded",
      "The home→feed journey is tested on live published markup, but injection bypasses production CSP integration",
      "Prefetch may not be reusable between documents; inspect actual requests and cache response flags",
      "The photo readiness timestamp is decode + two animation frames, not guaranteed actual on-screen paint",
      "Connection profile: 150 ms RTT, 1.6 Mbps throughput, 4× CPU, 390×844, DPR 2"
    ],
    groups, pairedDeltas: deltas, samples
  };
  mkdirSync(".artifacts/home-feed-intent-prefetch", { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const columns = ["Mouse (700ms hover)", "Touch (immediate tap)"];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## Intent-driven image prefetch: home → feed (read-only)\n\n" +
      "| Metric | " + columns.join(" | ") + " |\n|---|---:|---:|\n" +
      "| Photo readiness: control, ms | " + MODES.map(m => Math.round(groups[m].control.photoReadyMs)).join(" | ") + " |\n" +
      "| Photo readiness: candidate, ms | " + MODES.map(m => Math.round(groups[m].candidate.photoReadyMs)).join(" | ") + " |\n" +
      "| Median paired photo gain, ms | " + MODES.map(m => Math.round(median(deltas[m].map(p => p.photoGainMs)))).join(" | ") + " |\n" +
      "| Median paired feed FCP penalty, ms | " + MODES.map(m => Math.round(median(deltas[m].map(p => p.feedFcpPenaltyMs)))).join(" | ") + " |\n" +
      "| Runs with slower feed FCP | " + MODES.map(m => deltas[m].filter(p => p.feedFcpPenaltyMs > 0).length + "/" + PAIRS).join(" | ") + " |\n\n" +
      "Do not ship based on this experiment alone. Read the JSON artifact for request/cache evidence.\n");
  }
  console.log("SUMMARY " + JSON.stringify({ groups, pairedDeltas: deltas }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
