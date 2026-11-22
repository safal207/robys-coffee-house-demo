import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const PAGE = "https://safal207.github.io/robys-coffee-house-demo/menu.html?view=list";
const PHOTO = "src/products/sets-v1/cool-lime-macaron.webp";
const SMALL = "src/products/quick-v1/sets-v1/cool-lime-macaron-512.webp";
const OUTPUT = ".artifacts/menu-first-photo-experiment/report.json";
const RUNS_PER_VARIANT = 8;
const OBSERVATION_TAIL_MS = 500;
const HINT = '<link data-perf-experiment="first-photo" rel="preload" as="image" href="' + PHOTO +
  '" imagesrcset="' + SMALL + ' 512w, ' + PHOTO + ' 1024w" imagesizes="(max-width: 460px) 100vw, 460px" fetchpriority="high" />';

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
}
async function one(browser, variant, pair) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, serviceWorkers: "block", locale: "tr-TR"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  if (variant === "preload-after-fcp") {
    await page.addInitScript(({ photo, small }) => {
      // An in-memory experiment: wait until the browser reports first contentful paint.
      // No production source or CSP policy is changed.
      const startHint = () => {
        if (document.querySelector('link[data-perf-experiment="first-photo"]')) return;
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.setAttribute("data-perf-experiment", "first-photo");
        link.href = photo;
        link.setAttribute("imagesrcset", small + " 512w, " + photo + " 1024w");
        link.setAttribute("imagesizes", "(max-width: 460px) 100vw, 460px");
        link.fetchPriority = "low";
        (document.head || document.documentElement).appendChild(link);
        window.__photoHintInsertedAt = performance.now();
      };
      const observer = new PerformanceObserver(list => {
        if (list.getEntries().some(entry => entry.name === "first-contentful-paint")) {
          observer.disconnect();
          startHint();
        }
      });
      observer.observe({ type: "paint", buffered: true });
    }, { photo: PHOTO, small: SMALL });
  }
  let intercepted = 0;
  await page.route(url => url.pathname.endsWith("/menu.html") && url.searchParams.get("view") === "list", async route => {
    intercepted++;
    const response = await route.fetch();
    assert.equal(response.status(), 200, "Published page must be reachable");
    let html = await response.text();
    if (variant === "preload" || variant === "preload-low") {
      const viewport = /(<meta name="viewport"[^>]*>)/;
      assert.match(html, viewport);
      html = html.replace(viewport, "$1\n  " + (variant === "preload-low" ? HINT.replace('fetchpriority="high"', 'fetchpriority="low"') : HINT));
    } else if (variant === "preload-late") {
      assert.match(html, /<\/head>/);
      html = html.replace("</head>", "  " + HINT.replace('fetchpriority="high"', 'fetchpriority="low"') + "\n</head>");
    }
    await route.fulfill({ response, body: html });
  });
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150, downloadThroughput: 1600000 / 8,
      uploadThroughput: 750000 / 8, connectionType: "cellular3g"
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const nav = await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.ok(nav?.ok(), "Menu navigation failed");
    const image = page.locator("#menu-root .full-menu-item-media img").first();
    await image.scrollIntoViewIfNeeded({ timeout: 45000 });
    await page.waitForFunction(() => {
      const img = document.querySelector("#menu-root .full-menu-item-media img");
      return img?.complete && img.naturalWidth >= 256;
    }, null, { timeout: 45000 });
    await image.evaluate(img => img.decode());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const readyMs = await page.evaluate(() => performance.now());
    await page.waitForTimeout(OBSERVATION_TAIL_MS);
    const network = await page.evaluate(() => {
      const img = document.querySelector("#menu-root .full-menu-item-media img");
      const source = img.currentSrc || img.src;
      const resource = performance.getEntriesByType("resource").find(r => r.name === source);
      const entries = performance.getEntriesByType("resource");
      return {
        imagePath: new URL(source).pathname,
        naturalWidth: img.naturalWidth,
        imageRequestStartMs: resource?.startTime ?? null,
        imageResponseEndMs: resource?.responseEnd ?? null,
        imageNetworkMs: resource?.duration ?? null,
        imageTransferBytes: resource?.transferSize ?? null,
        observedImageTransferBytes: entries.filter(r => /\.(?:webp|avif|jpe?g|png|gif|svg)(?:\?|$)/i.test(r.name))
          .reduce((total, r) => total + r.transferSize, 0),
        fcpMs: performance.getEntriesByType("paint").find(p => p.name === "first-contentful-paint")?.startTime ?? null,
        hintCount: document.querySelectorAll('link[data-perf-experiment="first-photo"]').length,
        hintInsertedAtMs: window.__photoHintInsertedAt ?? null
      };
    });
    assert.equal(intercepted, 1, "One published list document must be intercepted");
    assert.ok(network.imagePath.endsWith("/" + PHOTO), "First photo identity changed");
    assert.ok(network.imageRequestStartMs !== null, "First photo request timing is missing");
    assert.equal(network.hintCount, variant === "control" ? 0 : 1, "Preload must be scoped to candidate");
    if (variant === "preload-after-fcp") {
      assert.ok(network.hintInsertedAtMs >= network.fcpMs, "Deferred hint must start after FCP");
    }
    assert.deepEqual(errors, [], "Browser JavaScript errors");
    return { pair, variant, readyMs, ...network, errors };
  } finally {
    await context.close();
  }
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    // Alternate run order to reduce systematic cache/server drift.
    for (let pair = 1; pair <= RUNS_PER_VARIANT; pair++) {
      const variants = ["control", "preload", "preload-low", "preload-late", "preload-after-fcp"];
      const order = variants.map((_, index) => variants[(index + (pair - 1) * 2) % variants.length]);
      for (const variant of order) {
        const result = await one(browser, variant, pair);
        samples.push(result);
        console.log(JSON.stringify(result));
      }
    }
  } finally {
    await browser.close();
  }
  const control = samples.filter(s => s.variant === "control");
  const preload = samples.filter(s => s.variant === "preload");
  const preloadLow = samples.filter(s => s.variant === "preload-low");
  const preloadLate = samples.filter(s => s.variant === "preload-late");
  const preloadAfterFcp = samples.filter(s => s.variant === "preload-after-fcp");
  const stats = set => ({
    readyMs: median(set.map(s => s.readyMs)),
    requestStartMs: median(set.map(s => s.imageRequestStartMs)),
    networkMs: median(set.map(s => s.imageNetworkMs)),
    photoBytes: median(set.map(s => s.imageTransferBytes)),
    observedImageBytes: median(set.map(s => s.observedImageTransferBytes)),
    fcpMs: median(set.map(s => s.fcpMs))
  });
  const baseline = stats(control), candidate = stats(preload), candidateLow = stats(preloadLow);
  const candidateLate = stats(preloadLate), candidateAfterFcp = stats(preloadAfterFcp);
  const improvementMsLow = baseline.readyMs - candidateLow.readyMs;
  const fcpPenaltyMsLow = candidateLow.fcpMs - baseline.fcpMs;
  const pairwise = Array.from({ length: RUNS_PER_VARIANT }, (_, index) => {
    const pair = index + 1;
    const current = samples.filter(sample => sample.pair === pair);
    const controlRun = current.find(sample => sample.variant === "control");
    const highRun = current.find(sample => sample.variant === "preload");
    const lowRun = current.find(sample => sample.variant === "preload-low");
    const lateRun = current.find(sample => sample.variant === "preload-late");
    const afterFcpRun = current.find(sample => sample.variant === "preload-after-fcp");
    assert.ok(controlRun && highRun && lowRun && lateRun && afterFcpRun, `All variants required for pair ${pair}`);
    return {
      pair,
      highPhotoGainMs: controlRun.readyMs - highRun.readyMs,
      highFcpPenaltyMs: highRun.fcpMs - controlRun.fcpMs,
      lowPhotoGainMs: controlRun.readyMs - lowRun.readyMs,
      lowFcpPenaltyMs: lowRun.fcpMs - controlRun.fcpMs,
      latePhotoGainMs: controlRun.readyMs - lateRun.readyMs,
      lateFcpPenaltyMs: lateRun.fcpMs - controlRun.fcpMs,
      afterFcpPhotoGainMs: controlRun.readyMs - afterFcpRun.readyMs,
      afterFcpFcpPenaltyMs: afterFcpRun.fcpMs - controlRun.fcpMs
    };
  });
  const lowFcpSlowerPairs = pairwise.filter(pair => pair.lowFcpPenaltyMs > 0).length;
  const report = {
    schema: "robys.first-photo-preload-experiment.v1",
    source: "published GitHub Pages; intercepted HTML only, no production changes",
    synthetic: true,
    caveats: [
      "Playwright document interception introduces overhead in all conditions; the intercepted HTML response may not obey browser network throttling",
      "The harness scrolls the first product card into view after DOMContentLoaded; readyMs is not passive first-screen paint",
      "Observed image bytes are a resource-timing snapshot 500ms after first-photo readiness, not complete page-transfer bytes",
      "One early preload can waste bytes on filtered and feed-redirect routes; do not ship unconditionally",
      "Eight controlled cold paired runs per variant; not production field data or proof of revenue impact",
      "The after-FCP hint uses Playwright addInitScript and is an experimental scheduling strategy, not a deployed or CSP-approved application script"
    ],
    network: "150ms RTT / 1.6Mbps / 4x CPU / DPR 2 / 390x844",
    observationTailMs: OBSERVATION_TAIL_MS,
    baseline, candidate, candidateLow, candidateLate, candidateAfterFcp,
    improvementMs: baseline.readyMs - candidate.readyMs,
    improvementMsLow, fcpPenaltyMsHigh: candidate.fcpMs - baseline.fcpMs, fcpPenaltyMsLow,
    lowFcpSlowerPairs, pairwise, samples
  };
  mkdirSync(".artifacts/menu-first-photo-experiment", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import("node:fs");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## First product-photo preload experiment\n\n" +
      "| Metric | Control | High early | Low early | Low late-head | Low after FCP |\n|---|---:|---:|---:|---:|---:|\n" +
      "| Decoded photo ready, ms | " + [baseline, candidate, candidateLow, candidateLate, candidateAfterFcp].map(x => Math.round(x.readyMs)).join(" | ") + " |\n" +
      "| Photo request start, ms | " + [baseline, candidate, candidateLow, candidateLate, candidateAfterFcp].map(x => Math.round(x.requestStartMs)).join(" | ") + " |\n" +
      "| First photo transfer, KiB | " + [baseline, candidate, candidateLow, candidateLate, candidateAfterFcp].map(x => Math.round(x.photoBytes / 1024)).join(" | ") + " |\n" +
      "| First Contentful Paint, ms | " + [baseline, candidate, candidateLow, candidateLate, candidateAfterFcp].map(x => Math.round(x.fcpMs)).join(" | ") + " |\n\n" +
      "Low-priority preload had slower FCP in " + lowFcpSlowerPairs + "/" + RUNS_PER_VARIANT + " pairs. " +
      "Observed page-image bytes in JSON are partial snapshots, not complete transfers.\n\n" +
      "Synthetic paired, non-deployed experiment; inspect artifact before shipping.\n");
  }
  console.log("SUMMARY " + JSON.stringify({ baseline, candidate, candidateLow, candidateLate, candidateAfterFcp,
    improvementMs: report.improvementMs, improvementMsLow, fcpPenaltyMsLow, lowFcpSlowerPairs }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
