import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.CONTEXTUAL_ENTRY_PORT ?? 4191);
const baseUrl = `http://127.0.0.1:${port}/`;
const resultsDir = path.resolve(process.env.CONTEXTUAL_ENTRY_RESULTS_DIR ?? "visual-results/contextual-entry");

const DAY_COLD_MIN_MS = 1_000;
const DAY_COLD_MAX_MS = 2_100;
const NIGHT_COLD_MIN_MS = 1_250;
const NIGHT_COLD_MAX_MS = 2_300;
const WARM_MAX_MS = 1_150;

function assert(condition, message) {
  if (!condition) throw new Error(`[MOTION-CONTEXT-001] ${message}`);
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

async function waitForDone(page, timeout = 3_200) {
  await page.locator('html[data-robys-entry-state="done"]').waitFor({ state: "attached", timeout });
  assert(await page.locator(".robys-contextual-entry").count() === 0, "Contextual overlay remained after DONE");
  const visibility = await page.evaluate(() => getComputedStyle(document.documentElement).visibility);
  assert(visibility === "visible", `Document remained hidden after contextual handoff: ${visibility}`);
}

function parsePaints(text) {
  const colors = [];
  const rgbPattern = /rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,/\s]+([\d.]+))?\)/gi;
  const hexPattern = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;

  for (const match of String(text).matchAll(rgbPattern)) {
    colors.push({
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] == null ? 1 : Number(match[4])
    });
  }

  for (const match of String(text).matchAll(hexPattern)) {
    const raw = match[1].length === 3
      ? match[1].split("").map((part) => `${part}${part}`).join("")
      : match[1];
    colors.push({
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: 1
    });
  }
  return colors;
}

function isCoolDrift(color) {
  if (color.a < .08) return false;
  const blueDominant = color.b > color.r * 1.12 && color.b > color.g * 1.08 && color.b - color.r > 18;
  const greenDominant = color.g > color.r * 1.12 && color.g > color.b * 1.05 && color.g - color.r > 18;
  return blueDominant || greenDominant;
}

async function readSceneEvidence(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector(".robys-contextual-entry");
    const stage = overlay?.querySelector(".robys-entry-logo-stage");
    const mark = stage?.querySelector('img[src*="robys-mark-master-v1.svg"]');
    const wordmark = stage?.querySelector('img[src*="robys-compact-master-v1.svg"]');
    const descendants = overlay ? [overlay, ...overlay.querySelectorAll("*")] : [];
    const paintValues = descendants.flatMap((element) => {
      const style = getComputedStyle(element);
      return [
        style.backgroundColor,
        style.backgroundImage,
        style.borderTopColor,
        style.borderRightColor,
        style.borderBottomColor,
        style.borderLeftColor,
        style.boxShadow,
        style.filter,
        style.fill,
        style.stroke,
        element.getAttribute?.("fill") ?? "",
        element.getAttribute?.("stroke") ?? ""
      ];
    });

    const focusables = overlay?.querySelectorAll(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]'
    ).length ?? -1;

    return {
      scene: document.documentElement.dataset.robysEntryScene ?? "",
      family: document.documentElement.dataset.robysEntryFamily ?? "",
      poseCount: document.documentElement.dataset.robysEntryPoseCount ?? "",
      state: document.documentElement.dataset.robysEntryState ?? "",
      overlayBackground: overlay ? getComputedStyle(overlay).backgroundColor : "missing",
      ariaHidden: overlay?.getAttribute("aria-hidden") ?? "missing",
      focusables,
      markPath: mark ? new URL(mark.src).pathname : "",
      wordmarkPath: wordmark ? new URL(wordmark.src).pathname : "",
      stageBackground: stage ? getComputedStyle(stage).backgroundColor : "missing",
      animationCount: overlay?.getAnimations({ subtree: true }).length ?? -1,
      paintValues
    };
  });
}

async function sampleSplineFrames(page, frameCount = 18) {
  return page.evaluate((count) => new Promise((resolve, reject) => {
    const layer = document.querySelector(".robys-entry-red-surface");
    if (!layer) {
      reject(new Error("Contextual red spline surface missing"));
      return;
    }

    const samples = [];
    const sample = (at) => {
      const style = getComputedStyle(layer);
      samples.push({ at, transform: style.transform, opacity: Number(style.opacity) });
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
  const uniqueTransforms = new Set(samples.map((sample) => sample.transform)).size;
  const intervals = samples.slice(1).map((sample, index) => sample.at - samples[index].at);
  const sorted = [...intervals].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianFrameIntervalMs = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return { uniqueTransforms, medianFrameIntervalMs, samples };
}

async function measureCold(browser, scene) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  await installEventProbe(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
  await waitForDone(page);
  const events = await readEvents(page);
  const brandFrame = events.find((event) => event.scene === scene && event.state === "brand-frame" && event.variant === "cold");
  const handoff = events.find((event) => event.scene === scene && event.state === "handoff" && event.variant === "cold");
  assert(
    brandFrame,
    `${scene} cold BRAND_FRAME event missing`
  );
  assert(
    handoff,
    `${scene} cold HANDOFF event missing`
  );
  const elapsedMs = handoff.at - brandFrame.at;
  await context.close();
  return elapsedMs;
}

async function captureScene(browser, scene) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  await installEventProbe(context);
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-contextual-entry").waitFor({ state: "visible", timeout: 1_500 });

  const evidence = await readSceneEvidence(page);
  assert(evidence.scene === scene, `Forced ${scene} override exposed scene ${evidence.scene}`);
  assert(evidence.family === "contextual-v1", `${scene} did not expose contextual motion family`);
  assert(evidence.poseCount === "20", `${scene} did not expose 20 logical poses`);
  assert(evidence.state === "brand-frame", `${scene} did not enter BRAND_FRAME`);
  assert(evidence.ariaHidden === "true", `${scene} overlay is not decorative/aria-hidden`);
  assert(evidence.focusables === 0, `${scene} overlay introduced ${evidence.focusables} focusable controls`);
  assert(evidence.markPath.endsWith("/src/brand/robys-mark-master-v1.svg"), `${scene} mark asset drifted: ${evidence.markPath}`);
  assert(evidence.wordmarkPath.endsWith("/src/brand/robys-compact-master-v1.svg"), `${scene} wordmark asset drifted: ${evidence.wordmarkPath}`);
  assert(evidence.stageBackground === "rgba(0, 0, 0, 0)", `${scene} introduced a logo card background`);
  assert(evidence.animationCount === 7, `${scene} exceeded the seven-layer compositor budget: ${evidence.animationCount}`);

  const colors = evidence.paintValues.flatMap(parsePaints);
  const coolDrift = colors.filter(isCoolDrift);
  assert(coolDrift.length === 0, `${scene} rendered green/blue-dominant paint drift: ${JSON.stringify(coolDrift.slice(0, 4))}`);

  const smoothness = summarizeSmoothness(await sampleSplineFrames(page));
  assert(smoothness.uniqueTransforms >= 15, `${scene} spline exposed stepping: ${smoothness.uniqueTransforms}/18 unique transforms`);
  assert(smoothness.medianFrameIntervalMs <= 21, `${scene} median frame interval regressed to ${smoothness.medianFrameIntervalMs.toFixed(2)} ms`);

  await page.waitForTimeout(scene === "day" ? 480 : 700);
  await page.screenshot({
    path: path.join(resultsDir, `${scene}-entry-mid.png`),
    animations: "allow"
  });
  await waitForDone(page);
  const events = await readEvents(page);
  await context.close();
  return { evidence, smoothness, events };
}

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

const server = startServer();
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const dayColdMs = await measureCold(browser, "day");
  const nightColdMs = await measureCold(browser, "night");
  assert(dayColdMs >= DAY_COLD_MIN_MS && dayColdMs <= DAY_COLD_MAX_MS, `Day cold duration ${dayColdMs} ms outside ${DAY_COLD_MIN_MS}-${DAY_COLD_MAX_MS} ms`);
  assert(nightColdMs >= NIGHT_COLD_MIN_MS && nightColdMs <= NIGHT_COLD_MAX_MS, `Night cold duration ${nightColdMs} ms outside ${NIGHT_COLD_MIN_MS}-${NIGHT_COLD_MAX_MS} ms`);

  const day = await captureScene(browser, "day");
  const night = await captureScene(browser, "night");

  const dayBackground = parsePaints(day.evidence.overlayBackground)[0];
  const nightBackground = parsePaints(night.evidence.overlayBackground)[0];
  assert(dayBackground && nightBackground, "Could not parse Day/Night overlay backgrounds");
  const dayLuminanceProxy = dayBackground.r + dayBackground.g + dayBackground.b;
  const nightLuminanceProxy = nightBackground.r + nightBackground.g + nightBackground.b;
  assert(dayLuminanceProxy > nightLuminanceProxy, "Day is not measurably higher-luminance than Night");

  const continuityContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  await installEventProbe(continuityContext);
  const continuityPage = await continuityContext.newPage();
  await continuityPage.goto(`${baseUrl}?entry=day`, { waitUntil: "domcontentloaded" });
  await waitForDone(continuityPage);

  await continuityPage.goto(`${baseUrl}?entry=night`, { waitUntil: "domcontentloaded" });
  await waitForDone(continuityPage, 2_200);
  const continuityEvents = await readEvents(continuityPage);
  const warmBrandFrame = continuityEvents.find((event) => event.scene === "night" && event.state === "brand-frame" && event.variant === "warm");
  const warmHandoff = continuityEvents.find((event) => event.scene === "night" && event.state === "handoff" && event.variant === "warm");
  assert(warmBrandFrame, "Night did not inherit warm replay state after Day");
  assert(warmHandoff, "Night warm replay did not emit HANDOFF");
  const crossSceneWarmMs = warmHandoff.at - warmBrandFrame.at;
  assert(crossSceneWarmMs <= WARM_MAX_MS, `Cross-scene warm replay took ${crossSceneWarmMs} ms`);
  await continuityContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  const reducedPage = await reducedContext.newPage();
  for (const scene of ["day", "night"]) {
    await reducedPage.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
    await reducedPage.waitForTimeout(120);
    assert(await reducedPage.locator(".robys-contextual-entry").count() === 0, `Reduced motion still rendered ${scene}`);
    assert(
      await reducedPage.evaluate(() => document.documentElement.dataset.robysEntryScene ?? "") === "",
      `Reduced motion still exposed ${scene} entry state`
    );
  }
  await reducedPage.screenshot({ path: path.join(resultsDir, "reduced-motion-product.png") });
  await reducedContext.close();

  const runtimeBytes = Buffer.byteLength(readFileSync("day-night-entry.js", "utf8"));
  assert(runtimeBytes < 32_000, `Contextual lazy runtime grew to ${runtimeBytes} bytes`);

  const evidence = {
    dayColdMs,
    nightColdMs,
    crossSceneWarmMs,
    runtimeBytes,
    day: {
      overlayBackground: day.evidence.overlayBackground,
      animationCount: day.evidence.animationCount,
      uniqueTransforms: day.smoothness.uniqueTransforms,
      medianFrameIntervalMs: day.smoothness.medianFrameIntervalMs
    },
    night: {
      overlayBackground: night.evidence.overlayBackground,
      animationCount: night.evidence.animationCount,
      uniqueTransforms: night.smoothness.uniqueTransforms,
      medianFrameIntervalMs: night.smoothness.medianFrameIntervalMs
    },
    coldBudgets: {
      day: [DAY_COLD_MIN_MS, DAY_COLD_MAX_MS],
      night: [NIGHT_COLD_MIN_MS, NIGHT_COLD_MAX_MS]
    },
    warmMaxMs: WARM_MAX_MS
  };
  writeFileSync(path.join(resultsDir, "contextual-entry-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(
    `✅ MOTION-CONTEXT-001 passed: Day ${dayColdMs} ms, Night ${nightColdMs} ms, cross-scene warm ${crossSceneWarmMs} ms; `
    + "same 20-pose Roby's family, seven-layer compositor budget, canonical assets, warm-only palette, 60 Hz interpolation, reduced-motion bypass and contextual luminance hierarchy are certified."
  );
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
