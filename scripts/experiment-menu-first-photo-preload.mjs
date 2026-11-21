import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const PAGE = "https://safal207.github.io/robys-coffee-house-demo/menu.html?view=list";
const PHOTO = "src/products/sets-v1/cool-lime-macaron.webp";
const SMALL = "src/products/quick-v1/sets-v1/cool-lime-macaron-512.webp";
const OUTPUT = ".artifacts/menu-first-photo-experiment/report.json";
const RUNS_PER_VARIANT = 4;
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
  let intercepted = 0;
  await page.route(url => url.pathname.endsWith("/menu.html") && url.searchParams.get("view") === "list", async route => {
    intercepted++;
    const response = await route.fetch();
    assert.equal(response.status(), 200, "Published page must be reachable");
    let html = await response.text();
    if (variant !== "control") {
      const viewport = /(<meta name="viewport"[^>]*>)/;
      assert.match(html, viewport);
      html = html.replace(viewport, "$1\n  " + (variant === "preload-low" ? HINT.replace('fetchpriority="high"', 'fetchpriority="low"') : HINT));
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
    await page.waitForTimeout(500);
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
        totalImageTransferBytes: entries.filter(r => /\.(?:webp|avif|jpe?g|png|gif|svg)(?:\?|$)/i.test(r.name))
          .reduce((total, r) => total + r.transferSize, 0),
        fcpMs: performance.getEntriesByType("paint").find(p => p.name === "first-contentful-paint")?.startTime ?? null,
        hintCount: document.querySelectorAll('link[data-perf-experiment="first-photo"]').length
      };
    });
    assert.equal(intercepted, 1, "One published list document must be intercepted");
    assert.ok(network.imagePath.endsWith("/" + PHOTO), "First photo identity changed");
    assert.ok(network.imageRequestStartMs !== null, "First photo request timing is missing");
    assert.equal(network.hintCount, variant === "control" ? 0 : 1, "Preload must be scoped to candidate");
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
      const orders = [
        ["control", "preload", "preload-low"],
        ["preload-low", "control", "preload"],
        ["preload", "preload-low", "control"],
        ["control", "preload-low", "preload"]
      ];
      const order = orders[pair - 1];
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
  const stats = set => ({
    readyMs: median(set.map(s => s.readyMs)),
    requestStartMs: median(set.map(s => s.imageRequestStartMs)),
    networkMs: median(set.map(s => s.imageNetworkMs)),
    totalImageBytes: median(set.map(s => s.totalImageTransferBytes)),
    fcpMs: median(set.map(s => s.fcpMs))
  });
  const baseline = stats(control), candidate = stats(preload), candidateLow = stats(preloadLow);
  const improvementMsLow = baseline.readyMs - candidateLow.readyMs;
  const fcpPenaltyMsLow = candidateLow.fcpMs - baseline.fcpMs;
  const report = {
    schema: "robys.first-photo-preload-experiment.v1",
    source: "published GitHub Pages; intercepted HTML only, no production changes",
    synthetic: true,
    caveats: [
      "Playwright document interception introduces overhead in both conditions",
      "One early preload can waste bytes on filtered and feed-redirect routes; do not ship unconditionally",
      "Four controlled cold paired runs per variant; not production field data or proof of revenue impact"
    ],
    network: "150ms RTT / 1.6Mbps / 4x CPU / DPR 2 / 390x844",
    baseline, candidate, candidateLow, improvementMs: baseline.readyMs - candidate.readyMs,
    improvementMsLow, fcpPenaltyMsHigh: candidate.fcpMs - baseline.fcpMs, fcpPenaltyMsLow, samples
  };
  mkdirSync(".artifacts/menu-first-photo-experiment", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import("node:fs");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## First product-photo preload experiment\n\n" +
      "| Metric | Control | High-priority preload | Low-priority preload |\n|---|---:|---:|---:|\n" +
      "| Decoded photo ready, ms | " + Math.round(baseline.readyMs) + " | " + Math.round(candidate.readyMs) + " | " + Math.round(candidateLow.readyMs) + " |\n" +
      "| Photo request start, ms | " + Math.round(baseline.requestStartMs) + " | " + Math.round(candidate.requestStartMs) + " | " + Math.round(candidateLow.requestStartMs) + " |\n" +
      "| Image transfer, KiB | " + Math.round(baseline.totalImageBytes / 1024) + " | " + Math.round(candidate.totalImageBytes / 1024) + " | " + Math.round(candidateLow.totalImageBytes / 1024) + " |\n" +
      "| First Contentful Paint, ms | " + Math.round(baseline.fcpMs) + " | " + Math.round(candidate.fcpMs) + " | " + Math.round(candidateLow.fcpMs) + " |\n\n" +
      "Synthetic paired, non-deployed experiment; inspect artifact before shipping.\n");
  }
  console.log("SUMMARY " + JSON.stringify({ baseline, candidate, candidateLow, improvementMs: report.improvementMs, improvementMsLow, fcpPenaltyMsLow }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
