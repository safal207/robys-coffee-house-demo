import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const ROUTES = Object.freeze([
  { id: "home", path: "/", selector: "#hero-title", imageSelector: null },
  { id: "menu-list", path: "/menu.html", selector: "#menu-root [data-product-id]", imageSelector: "#menu-root img" },
  { id: "photo-feed", path: "/menu-feed.html", selector: "#feed .feed-card", imageSelector: "#feed .feed-card img" }
]);
export const REPETITIONS = 3;

export function percentile(values, percentileValue) {
  assert.ok(Array.isArray(values) && values.length > 0);
  assert.ok(values.every(value => Number.isFinite(value) && value >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
}
export function summarize(samples) {
  assert.ok(samples.length === REPETITIONS);
  const metrics = ["fcpMs", "lcpMs", "semanticReadyMs", "firstPhotoReadyMs", "imageTransferBytes", "scriptTransferBytes", "stylesheetTransferBytes", "resourceCount"];
  const result = {};
  for (const metric of metrics) {
    const values = samples.map(sample => sample[metric]).filter(value => Number.isFinite(value));
    result[metric] = values.length === REPETITIONS
      ? { median: percentile(values, 0.5), p90: percentile(values, 0.9), min: Math.min(...values), max: Math.max(...values) }
      : { unavailable: true, observed: values.length };
  }
  return result;
}

const baseUrl = process.env.ROBY_LIVE_ORIGIN || "https://safal207.github.io/robys-coffee-house-demo/";
const outputFile = resolve(process.env.ROBY_AUDIT_OUTPUT || ".artifacts/live-customer-performance/report.json");
const timeoutMs = 45000;

function assetPath(url) {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch { return "unknown"; }
}
async function validatePublishedBuild(origin) {
  const local = JSON.parse(readFileSync(resolve("integrity-manifest.json"), "utf8"));
  const url = new URL("integrity-manifest.json", origin);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  assert.ok(response.ok, "Published integrity manifest unavailable: " + response.status);
  const remote = await response.json();
  assert.equal(remote.build, local.build, "Published build does not match checked-out main");
  const localMenu = local.files.find(file => file.path === "menu.html");
  const remoteMenu = remote.files.find(file => file.path === "menu.html");
  assert.ok(localMenu?.sha256 && remoteMenu?.sha256, "Menu integrity evidence missing");
  assert.equal(remoteMenu.sha256, localMenu.sha256, "Published menu differs from checked-out main");
  return { build: remote.build, menuSha256: remoteMenu.sha256 };
}
async function configureMobile(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150,
    downloadThroughput: 1600000 / 8,
    uploadThroughput: 750000 / 8,
    connectionType: "cellular3g"
  });
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return session;
}
async function measure(page, url, route, cacheState) {
  const response = cacheState === "cold"
    ? await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs })
    : await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  assert.ok(response?.ok(), route.id + ": document response failed: " + response?.status());
  await page.waitForFunction(({ selector }) => {
    const node = document.querySelector(selector);
    return node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
  }, { selector: route.selector }, { timeout: timeoutMs });
  const semanticReadyMs = await page.evaluate(() => performance.now());
  let firstPhotoReadyMs = null;
  if (route.imageSelector) {
    const firstPhoto = page.locator(route.imageSelector).first();
    await firstPhoto.scrollIntoViewIfNeeded({ timeout: timeoutMs });
    await page.waitForFunction(({ selector }) => {
      const img = document.querySelector(selector);
      if (!(img instanceof HTMLImageElement) || !img.complete || img.naturalWidth <= 0) return false;
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
    }, { selector: route.imageSelector }, { timeout: timeoutMs });
    firstPhotoReadyMs = await page.evaluate(() => performance.now());
  }
  // The fixed settle window is for resource accounting only, never readiness timings.
  await page.waitForTimeout(500);
  const result = await page.evaluate(({ kind }) => {
    const resources = performance.getEntriesByType("resource");
    const sum = type => resources.filter(entry => type.test(entry.initiatorType)).reduce((total, entry) => total + entry.transferSize, 0);
    const images = [...document.images].filter(img => img.complete && img.naturalWidth > 0);
    const visible = images.filter(img => {
      const rect = img.getBoundingClientRect();
      return rect.height > 0 && rect.width > 0 && rect.top < innerHeight && rect.bottom > 0;
    });
    const largest = resources.filter(entry => /\.(?:webp|avif|jpe?g|png)(?:$|\?)/i.test(entry.name))
      .sort((a, b) => b.transferSize - a.transferSize)
      .slice(0, 7).map(entry => ({ path: new URL(entry.name).pathname, bytes: entry.transferSize, durationMs: entry.duration }));
    const fcp = performance.getEntriesByType("paint").find(item => item.name === "first-contentful-paint");
    const navigation = performance.getEntriesByType("navigation")[0];
    const primary = kind === "photo-feed" ? document.querySelector("#feed .feed-card img")
      : kind === "menu-list" ? document.querySelector("#menu-root img") : null;
    return {
      fcpMs: fcp?.startTime ?? null,
      lcpMs: window.__robysAuditMetrics?.lcpMs ?? null,
      cls: window.__robysAuditMetrics?.cls ?? null,
      ttfbMs: navigation ? navigation.responseStart - navigation.requestStart : null,
      imageTransferBytes: sum(/^(img|image)$/),
      scriptTransferBytes: sum(/script/),
      stylesheetTransferBytes: sum(/^(css|link)$/),
      resourceCount: resources.length,
      imagesLoaded: images.length,
      imagesVisible: visible.length,
      firstPhoto: primary ? {
        path: new URL(primary.currentSrc || primary.src).pathname,
        naturalWidth: primary.naturalWidth,
        displayedWidth: Math.round(primary.getBoundingClientRect().width),
        loading: primary.loading
      } : null,
      largestImageRequests: largest
    };
  }, { kind: route.id });
  return { route: route.id, state: cacheState, ...result, semanticReadyMs, firstPhotoReadyMs };
}
export async function runAudit() {
  const origin = new URL(baseUrl);
  assert.equal(origin.protocol, "https:", "Only HTTPS production origin is allowed");
  assert.equal(origin.hostname, "safal207.github.io", "Audit is restricted to the published Roby's site");
  if (!origin.pathname.endsWith("/")) origin.pathname += "/";
  const evidence = await validatePublishedBuild(origin);
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  const failures = [];
  try {
    for (const route of ROUTES) {
      let routeFailed = false;
      for (let iteration = 1; iteration <= REPETITIONS; iteration++) {
        if (routeFailed) break;
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
          hasTouch: true, serviceWorkers: "block", locale: "tr-TR"
        });
        try {
          const page = await context.newPage();
          const browserErrors = [];
          page.on("pageerror", error => browserErrors.push(String(error.message).slice(0, 800)));
          page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text().slice(0, 800)); });
          page.on("requestfailed", request => browserErrors.push(("REQUEST " + request.url() + ": " + request.failure()?.errorText).slice(0, 800)));
          await page.addInitScript(() => {
            window.__robysAuditMetrics = { lcpMs: null, cls: 0 };
            try {
              new PerformanceObserver(list => {
                const entries = list.getEntries();
                if (entries.length) window.__robysAuditMetrics.lcpMs = entries.at(-1).startTime;
              }).observe({ type: "largest-contentful-paint", buffered: true });
            } catch {}
            try {
              new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                  if (!entry.hadRecentInput) window.__robysAuditMetrics.cls += entry.value;
                }
              }).observe({ type: "layout-shift", buffered: true });
            } catch {}
          });
          const cdp = await configureMobile(page);
          const url = new URL(route.path.replace(/^\//, ""), origin).href;
          for (const state of ["cold", "warm"]) {
            try {
              const sample = await measure(page, url, route, state);
              assert.ok(sample.semanticReadyMs > 0 && sample.semanticReadyMs < timeoutMs, "Readiness invalid for " + route.id);
              if (route.imageSelector) assert.ok(sample.firstPhotoReadyMs > 0, "First photo did not load for " + route.id);
              samples.push({ ...sample, iteration });
              console.log(JSON.stringify({ route: route.id, iteration, state, semanticReadyMs: Math.round(sample.semanticReadyMs), firstPhotoReadyMs: sample.firstPhotoReadyMs && Math.round(sample.firstPhotoReadyMs), imageTransferBytes: sample.imageTransferBytes }));
            } catch (error) {
              routeFailed = true;
              const snapshot = await page.evaluate(selector => ({
                url: location.href,
                readyState: document.readyState,
                selectorCount: document.querySelectorAll(selector).length,
                menuRootCards: document.querySelectorAll("#menu-root [data-product-id]").length,
                feedCards: document.querySelectorAll("#feed .feed-card").length,
                menuEmpty: document.querySelector("#menu-empty")?.textContent?.trim() || null,
                menuHTML: document.querySelector("#menu-root")?.innerHTML?.slice(0, 900) || null,
                scripts: performance.getEntriesByType("resource").filter(entry => /\\.js(?:[?#]|$)/i.test(entry.name))
                  .slice(0, 20).map(entry => ({ url: entry.name, durationMs: entry.duration, transferSize: entry.transferSize }))
              }), route.selector).catch(e => ({ captureError: String(e) }));
              const failure = { route: route.id, iteration, state, error: String(error), snapshot, browserErrors: browserErrors.slice(-15) };
              failures.push(failure);
              mkdirSync(resolve(outputFile, ".."), { recursive: true });
              await page.screenshot({ path: resolve(outputFile, "..", route.id + "-failure.png"), fullPage: true }).catch(() => {});
              console.error("AUDIT_ROUTE_FAILURE " + JSON.stringify(failure));
              break;
            }
          }
          await cdp.detach();
        } finally {
          await context.close();
        }
      }
    }
  } finally { await browser.close(); }
  const summarizeRoute = (route, state) => {
    const subset = samples.filter(sample => sample.route === route && sample.state === state);
    return subset.length === REPETITIONS ? summarize(subset) : { unavailable: true, observed: subset.length };
  };
  const routes = Object.fromEntries(ROUTES.map(route => [route.id, {
    cold: summarizeRoute(route.id, "cold"),
    warm: summarizeRoute(route.id, "warm")
  }]));
  const report = {
    schema: "robys.live-customer-performance.v1",
    measuredAt: new Date().toISOString(),
    source: "published-GitHub-Pages",
    origin: origin.href,
    build: evidence.build,
    verifiedMenuSha256: evidence.menuSha256,
    synthetic: true,
    environment: { browser: "chromium", viewport: "390x844", network: "150ms RTT; 1.6 Mbps download; 0.75 Mbps upload", cpuThrottling: "4x", serviceWorkers: "blocked", coldWarm: "fresh browser context then same-page reload", repetitions: REPETITIONS },
    status: failures.length ? "FAIL" : "PASS",
    failures,
    routes,
    samples
  };
  mkdirSync(resolve(outputFile, ".."), { recursive: true });
  writeFileSync(outputFile, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ["## Roby's published customer journey audit", "", "Source: main GitHub Pages; synthetic Chromium profile, not real-user field data.", "", "| Route | Cold photo ready (ms) | Warm photo ready (ms) | Cold image transfer (KiB) |", "| --- | ---: | ---: | ---: |"];
    for (const route of ROUTES) {
      const item = routes[route.id];
      const format = value => Number.isFinite(value) ? Math.round(value) : "n/a";
      lines.push("| " + route.id + " | " + format(item.cold.firstPhotoReadyMs?.median) + " | " + format(item.warm.firstPhotoReadyMs?.median) + " | " + format(item.cold.imageTransferBytes?.median / 1024) + " |");
    }
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
  if (failures.length) throw new Error("Live customer audit found " + failures.length + " route failures. See uploaded report.json and screenshots.");
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAudit().catch(error => { console.error(error); process.exitCode = 1; });
}
