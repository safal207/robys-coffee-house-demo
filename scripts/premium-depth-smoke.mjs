import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.PREMIUM_DEPTH_PORT ?? 4197);
const baseUrl = `http://127.0.0.1:${port}/`;
const resultsDir = path.resolve(process.env.PREMIUM_DEPTH_RESULTS_DIR ?? "visual-results/premium-depth");

function assert(condition, message) {
  if (!condition) throw new Error(`[MOTION-DEPTH-001] ${message}`);
}

function parseBlurPx(filter) {
  const match = String(filter).match(/blur\(([\d.]+)px\)/i);
  return match ? Number(match[1]) : 0;
}

function startServer() {
  return spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
  );
}

async function waitForServer(server, attempts = 50) {
  let exit = null;
  server.once("exit", (code, signal) => {
    exit = new Error(`HTTP server exited before readiness: code=${code} signal=${signal}`);
  });

  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (exit) throw exit;
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw lastError ?? new Error("HTTP server did not become ready");
}

async function waitForDepthReady(page, timeoutMs = 1_700) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await page.evaluate(() => {
      const root = document.documentElement;
      const foreground = document.querySelector(".robys-entry-foreground-occluder");
      const specular = document.querySelector(".robys-entry-specular-edge");
      const depth = document.querySelector(".robys-entry-depth-haze");
      if (!foreground || !specular || !depth) return false;
      return root.dataset.robysEntryDepth === "premium-v2"
        && root.dataset.robysEntryDepthPlanes === "3"
        && Number(getComputedStyle(foreground).opacity) > .08
        && Number(getComputedStyle(specular).opacity) > .08
        && Number(getComputedStyle(depth).opacity) > .08;
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Premium depth layers did not become visibly ready");
}

async function readDepthEvidence(page) {
  return page.evaluate(() => {
    const select = (selector) => document.querySelector(selector);
    const style = (selector) => {
      const element = select(selector);
      if (!element) return null;
      const computed = getComputedStyle(element);
      const animations = element.getAnimations().map((animation) => animation.effect?.getKeyframes?.() ?? []);
      return {
        filter: computed.filter,
        opacity: Number(computed.opacity),
        zIndex: Number(computed.zIndex || 0),
        background: computed.backgroundImage,
        transform: computed.transform,
        animationKeyframes: animations.flat()
      };
    };

    const stage = select(".robys-entry-logo-stage");
    const mark = stage?.querySelector('img[src*="robys-mark-master-v1.svg"]');
    const wordmark = stage?.querySelector('img[src*="robys-compact-master-v1.svg"]');
    const markStyle = mark ? getComputedStyle(mark) : null;
    const wordmarkStyle = wordmark ? getComputedStyle(wordmark) : null;

    return {
      scene: document.documentElement.dataset.robysEntryScene ?? "",
      depth: document.documentElement.dataset.robysEntryDepth ?? "",
      optics: document.documentElement.dataset.robysEntryOptics ?? "",
      overlayPerspective: getComputedStyle(document.querySelector(".robys-contextual-entry")).perspective,
      depthPlanes: document.documentElement.dataset.robysEntryDepthPlanes ?? "",
      depthHaze: style(".robys-entry-depth-haze"),
      redSurface: style(".robys-entry-red-surface"),
      specularEdge: style(".robys-entry-specular-edge"),
      foreground: style(".robys-entry-foreground-occluder"),
      logoStage: stage ? {
        zIndex: Number(getComputedStyle(stage).zIndex || 0),
        backgroundColor: getComputedStyle(stage).backgroundColor
      } : null,
      logoFocus: style(".robys-entry-logo-focus"),
      mark: mark ? {
        path: new URL(mark.src).pathname,
        filter: markStyle.filter,
        opacity: Number(markStyle.opacity)
      } : null,
      wordmark: wordmark ? {
        path: new URL(wordmark.src).pathname,
        filter: wordmarkStyle.filter,
        opacity: Number(wordmarkStyle.opacity)
      } : null
    };
  });
}

function assertTransformOpacityOnly(layer, label) {
  assert(layer?.animationKeyframes?.length >= 20, `${label} is missing 20-pose animation evidence`);
  for (const frame of layer.animationKeyframes) {
    assert(!Object.hasOwn(frame, "filter"), `${label} animates filter; blur must remain static`);
  }
  const first = layer.animationKeyframes[0]?.transform;
  const last = layer.animationKeyframes.at(-1)?.transform;
  assert(first && last && first !== last, `${label} parallax transform does not evolve`);
}

async function captureScene(browser, scene) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=${scene}`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-contextual-entry").waitFor({ state: "visible", timeout: 1_500 });
  await waitForDepthReady(page);
  await page.waitForTimeout(scene === "night" ? 260 : 180);

  const evidence = await readDepthEvidence(page);
  assert(evidence.scene === scene, `${scene}: wrong resolved scene ${evidence.scene}`);
  assert(evidence.depth === "premium-v2", `${scene}: premium depth v2 dataset missing`);
  assert(evidence.optics === "perspective-dof-v2", `${scene}: perspective optics dataset missing`);
  assert(evidence.overlayPerspective !== "none", `${scene}: CSS perspective is not active`);
  assert(evidence.depthPlanes === "3", `${scene}: expected exactly three logical depth planes`);

  const depthBlur = parseBlurPx(evidence.depthHaze?.filter);
  const foregroundBlur = parseBlurPx(evidence.foreground?.filter);
  const focusBlur = parseBlurPx(evidence.logoFocus?.filter);
  assert(depthBlur === 0, `${scene}: far plane must stay gradient-softened without a full-screen CSS blur`);
  const expectedForegroundBlur = scene === "night" ? 24 : 18;
  assert(foregroundBlur === expectedForegroundBlur, `${scene}: foreground blur must match the cinematic DOF target: ${foregroundBlur}px`);
  assert(foregroundBlur > depthBlur, `${scene}: foreground must be softer than the far plane`);
  assert(focusBlur >= 10 && focusBlur <= 16, `${scene}: focus pocket blur out of range: ${focusBlur}px`);

  assert(evidence.depthHaze.zIndex < evidence.redSurface.zIndex, `${scene}: background plane is not behind hero surface`);
  assert(evidence.redSurface.zIndex < evidence.foreground.zIndex, `${scene}: foreground plane is not in front of hero surface`);
  assert(evidence.foreground.zIndex < evidence.logoStage.zIndex, `${scene}: foreground may occlude the logo`);
  assert(evidence.specularEdge.zIndex > evidence.redSurface.zIndex, `${scene}: specular edge must sit above hero material`);

  assertTransformOpacityOnly(evidence.depthHaze, `${scene} far depth plane`);
  assert(String(evidence.depthHaze.filter) === "none", `${scene}: far plane may parallax but must not animate/filter a full-screen blur surface`);
  assert(String(evidence.depthHaze.background).includes("radial-gradient"), `${scene}: far haze must retain soft gradient depth`);
  assertTransformOpacityOnly(evidence.foreground, `${scene} foreground`);
  assertTransformOpacityOnly(evidence.specularEdge, `${scene} specular edge`);

  assert(evidence.logoStage.backgroundColor === "rgba(0, 0, 0, 0)", `${scene}: logo stage gained a card/background`);
  assert(evidence.mark?.path.endsWith("/src/brand/robys-mark-master-v1.svg"), `${scene}: canonical mark missing`);
  assert(evidence.wordmark?.path.endsWith("/src/brand/robys-compact-master-v1.svg"), `${scene}: canonical wordmark missing`);
  assert(!String(evidence.mark?.filter).includes("blur("), `${scene}: mark itself must remain sharp`);
  assert(!String(evidence.wordmark?.filter).includes("blur("), `${scene}: wordmark itself must remain sharp`);

  await page.screenshot({
    path: path.join(resultsDir, `premium-depth-${scene}-mid.png`),
    fullPage: false
  });
  await context.close();

  return {
    scene,
    depthBlurPx: depthBlur,
    foregroundBlurPx: foregroundBlur,
    focusBlurPx: focusBlur,
    evidence
  };
}

mkdirSync(resultsDir, { recursive: true });
const server = startServer();
let browser;

try {
  await waitForServer(server);
  browser = await chromium.launch({ headless: true });
  const day = await captureScene(browser, "day");
  const night = await captureScene(browser, "night");

  assert(night.foregroundBlurPx > day.foregroundBlurPx, "Night should carry more atmospheric foreground blur than Day");
  assert(night.depthBlurPx >= day.depthBlurPx, "Night background haze should be at least as soft as Day");

  const summary = {
    contract: "MOTION-DEPTH-001",
    depthModel: "perspective far-plane parallax -> espresso depth -> hero/specular material -> cinematic blurred foreground -> sharp logo focal plane",
    day: { depthBlurPx: day.depthBlurPx, foregroundBlurPx: day.foregroundBlurPx, focusBlurPx: day.focusBlurPx },
    night: { depthBlurPx: night.depthBlurPx, foregroundBlurPx: night.foregroundBlurPx, focusBlurPx: night.focusBlurPx }
  };
  writeFileSync(path.join(resultsDir, "premium-depth-evidence.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`✅ MOTION-DEPTH-001 passed: gradient-softened far plane + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px foreground DOF; sharp canonical logo, static blur, three-plane z hierarchy and specular focus are certified.`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
