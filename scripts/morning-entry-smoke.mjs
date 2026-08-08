import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.MORNING_ENTRY_PORT ?? 4187);
const baseUrl = `http://127.0.0.1:${port}/`;
const resultsDir = path.resolve(process.env.MORNING_ENTRY_RESULTS_DIR ?? "visual-results/morning-entry");

function assert(condition, message) {
  if (!condition) throw new Error(`[MOTION-ENTRY-001] ${message}`);
}

function startServer() {
  return spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
  );
}

async function waitForServer(attempts = 40) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError;
}

async function installEventProbe(context) {
  await context.addInitScript(() => {
    globalThis.__robysEntryEvents = [];
    window.addEventListener("robys:entry-state", (event) => {
      globalThis.__robysEntryEvents.push({
        scene: event.detail?.scene,
        state: event.detail?.state,
        variant: event.detail?.variant,
        at: performance.now()
      });
    });
  });
}

async function readEvents(page) {
  return page.evaluate(() => globalThis.__robysEntryEvents ?? []);
}

async function sampleSplineFrames(page, frameCount = 24) {
  return page.evaluate((count) => new Promise((resolve, reject) => {
    const layer = document.querySelector(".robys-entry-red-surface");
    if (!layer) {
      reject(new Error("Red spline surface missing during smoothness capture"));
      return;
    }

    const samples = [];
    const sample = (at) => {
      const style = getComputedStyle(layer);
      samples.push({
        at,
        transform: style.transform,
        opacity: Number(style.opacity)
      });
      if (samples.length >= count) {
        resolve(samples);
        return;
      }
      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  }), frameCount);
}

function summarizeSmoothness(samples) {
  let longestIdenticalRun = 1;
  let currentRun = 1;
  let changingTransitions = 0;

  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].transform === samples[index - 1].transform) {
      currentRun += 1;
      longestIdenticalRun = Math.max(longestIdenticalRun, currentRun);
    } else {
      currentRun = 1;
      changingTransitions += 1;
    }
  }

  const uniqueTransforms = new Set(samples.map((sample) => sample.transform)).size;
  const frameIntervals = samples.slice(1).map((sample, index) => sample.at - samples[index].at);

  return {
    requestedFrames: samples.length,
    uniqueTransforms,
    changingTransitions,
    longestIdenticalRun,
    frameIntervalsMs: frameIntervals,
    samples
  };
}

async function waitForDone(page, timeout) {
  await page.locator('html[data-robys-entry-state="done"]').waitFor({ state: "attached", timeout });
}

async function assertDone(page, timeout = 3500) {
  await waitForDone(page, timeout);
  assert(await page.locator(".robys-morning-entry").count() === 0, "Entry overlay remained after DONE");
  const visibility = await page.evaluate(() => getComputedStyle(document.documentElement).visibility);
  assert(visibility === "visible", `Document remained hidden after handoff: ${visibility}`);
}

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

const server = startServer();
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const motionContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  await installEventProbe(motionContext);
  const page = await motionContext.newPage();

  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-morning-entry").waitFor({ state: "visible", timeout: 1500 });
  assert(
    await page.evaluate(() => document.documentElement.dataset.robysEntryScene) === "morning",
    "Forced entry did not expose the Morning scene"
  );
  assert(
    await page.evaluate(() => document.documentElement.dataset.robysEntryState) === "brand-frame",
    "Forced entry did not enter BRAND_FRAME"
  );
  assert(
    await page.evaluate(() => document.documentElement.dataset.robysEntryPoseCount) === "20",
    "Morning entry did not expose the 20-pose choreography contract"
  );
  const brandFrameVisibility = await page.evaluate(() => getComputedStyle(document.documentElement).visibility);
  assert(
    brandFrameVisibility === "visible",
    `Entry blocked document paint during BRAND_FRAME: ${brandFrameVisibility}`
  );

  const coldCaptureStartedAt = Date.now();
  const smoothnessSamples = await sampleSplineFrames(page, 24);
  const smoothness = summarizeSmoothness(smoothnessSamples);
  assert(
    smoothness.uniqueTransforms >= 20,
    `60 Hz capture exposed too few interpolated transforms: ${smoothness.uniqueTransforms}/${smoothness.requestedFrames}`
  );
  assert(
    smoothness.changingTransitions >= 20,
    `60 Hz capture exposed visible stepping: only ${smoothness.changingTransitions} changing transitions`
  );
  assert(
    smoothness.longestIdenticalRun <= 2,
    `60 Hz capture held one transform for ${smoothness.longestIdenticalRun} consecutive frames`
  );
  writeFileSync(
    path.join(resultsDir, "morning-entry-60hz-evidence.json"),
    `${JSON.stringify(smoothness, null, 2)}\n`
  );

  const coldCaptureElapsed = Date.now() - coldCaptureStartedAt;
  if (coldCaptureElapsed < 780) {
    await page.waitForTimeout(780 - coldCaptureElapsed);
  }
  await page.screenshot({ path: path.join(resultsDir, "morning-entry-cold-mid.png"), animations: "allow" });
  await assertDone(page);

  let events = await readEvents(page);
  assert(events.some((event) => event.state === "brand-frame" && event.variant === "cold"), "Cold BRAND_FRAME event missing");
  assert(events.some((event) => event.state === "handoff" && event.variant === "cold"), "Cold HANDOFF event missing");

  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-morning-entry").waitFor({ state: "visible", timeout: 1500 });
  await assertDone(page, 2200);
  events = await readEvents(page);
  assert(events.some((event) => event.state === "brand-frame" && event.variant === "warm"), "Warm BRAND_FRAME event missing");
  assert(events.some((event) => event.state === "handoff" && event.variant === "warm"), "Warm HANDOFF event missing");

  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-morning-entry").waitFor({ state: "visible", timeout: 1500 });
  await page.waitForTimeout(220);
  const skipStarted = Date.now();
  await page.locator(".robys-morning-entry").dispatchEvent("pointerdown");
  await waitForDone(page, 1200);
  assert(Date.now() - skipStarted < 1000, "Pointer skip did not hand off promptly");

  await page.goto(`${baseUrl}?entry=off`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(100);
  assert(await page.locator(".robys-morning-entry").count() === 0, "entry=off still rendered the overlay");
  assert(
    await page.evaluate(() => document.documentElement.dataset.robysEntryScene ?? "") === "",
    "entry=off still exposed an entry scene"
  );

  await motionContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await reducedPage.waitForTimeout(120);
  assert(await reducedPage.locator(".robys-morning-entry").count() === 0, "Reduced motion still rendered the overlay");
  assert(
    await reducedPage.evaluate(() => document.documentElement.dataset.robysEntryScene ?? "") === "",
    "Reduced motion still exposed an entry scene"
  );
  await reducedPage.screenshot({ path: path.join(resultsDir, "reduced-motion-product.png") });
  await reducedContext.close();

  console.log("✅ MOTION-ENTRY-001 passed: 20-pose cold/warm choreography, 60 Hz interpolation evidence, force/off, skip, non-blocking paint, handoff, and reduced-motion paths are deterministic.");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
