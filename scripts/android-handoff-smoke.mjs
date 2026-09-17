import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.ANDROID_HANDOFF_PORT ?? 4191);
const baseUrl = `http://127.0.0.1:${port}/`;
const resultsDir = path.resolve(process.env.ANDROID_HANDOFF_RESULTS_DIR ?? "visual-results/android-handoff");

function assert(condition, message) {
  if (!condition) throw new Error(`[ANDROID-HANDOFF-001] ${message}`);
}

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForServer(server, attempts = 40) {
  let lastError;
  let spawnError;
  let stderr = "";
  server.once("error", (error) => {
    spawnError = error;
  });
  server.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const assertServerAlive = () => {
    if (spawnError) {
      throw new Error(`Local handoff server failed to start: ${spawnError.message}`);
    }
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(
        `Local handoff server exited before readiness (code=${server.exitCode}, signal=${server.signalCode ?? "none"}). ${stderr.trim()}`
      );
    }
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    assertServerAlive();
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) {
        // A foreign listener can answer the configured port while our child is
        // still failing asynchronously. Give the spawned server one turn to
        // prove it owns a live process before accepting HTTP readiness.
        await new Promise((resolve) => setTimeout(resolve, 50));
        assertServerAlive();
        return;
      }
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assertServerAlive();
  throw lastError ?? new Error("Local handoff server did not become ready");
}

async function readContract(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector(".robys-android-handoff");
    const stage = document.querySelector(".robys-android-handoff-stage");
    const focus = document.querySelector(".robys-android-handoff-focus");
    const mark = stage?.querySelector('img[src*="robys-mark-master-v1.svg"]');
    const wordmark = stage?.querySelector('img[src*="robys-compact-master-v1.svg"]');
    return {
      state: document.documentElement.dataset.robysAndroidHandoff ?? "",
      overlayHost: overlay?.parentElement === document.documentElement ? "html" : overlay?.parentElement?.tagName?.toLowerCase() ?? "missing",
      overlayBackground: overlay ? getComputedStyle(overlay).backgroundColor : "missing",
      stageBackground: stage ? getComputedStyle(stage).backgroundColor : "missing",
      focusBackground: focus ? getComputedStyle(focus).backgroundImage : "missing",
      focusOpacity: focus ? Number(getComputedStyle(focus).opacity) : -1,
      markOpacity: mark ? Number(getComputedStyle(mark).opacity) : -1,
      wordmarkOpacity: wordmark ? Number(getComputedStyle(wordmark).opacity) : -1,
      markPath: mark ? new URL(mark.src).pathname : "",
      wordmarkPath: wordmark ? new URL(wordmark.src).pathname : "",
      fullMorningLayerCount: document.querySelectorAll(".robys-entry-red-surface,.robys-morning-entry").length,
      releaseHook: typeof window.__robysAndroidHandoffRelease
    };
  });
}

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

const server = startServer();
let browser;
try {
  await waitForServer(server);
  browser = await chromium.launch({ headless: true });

  const ordinaryContext = await browser.newContext({ serviceWorkers: "block" });
  const ordinaryPage = await ordinaryContext.newPage();
  const ordinaryHandoffRequests = [];
  ordinaryPage.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/android-handoff.js")) ordinaryHandoffRequests.push(request.url());
  });
  await ordinaryPage.goto(`${baseUrl}?entry=off`, { waitUntil: "load" });
  await ordinaryPage.locator('.featured-track[data-gallery-ready="true"]').waitFor({ state: "attached", timeout: 1500 });
  await ordinaryPage.waitForTimeout(260);
  assert(ordinaryHandoffRequests.length === 0, "Ordinary landing must not download the Android-only handoff runtime");
  await ordinaryContext.close();

  // A product stylesheet must not hold the native bridge behind page startup.
  const criticalContext = await browser.newContext({ serviceWorkers: "block" });
  const criticalPage = await criticalContext.newPage();
  let releaseProductStyles;
  const productStylesGate = new Promise((resolve) => { releaseProductStyles = resolve; });
  await criticalPage.route(/\.css(?:\?|$)/, async (route) => {
    await productStylesGate;
    await route.continue();
  });
  const criticalNavigation = criticalPage.goto(`${baseUrl}?entry=android-handoff`, { waitUntil: "domcontentloaded" });
  try {
    await criticalPage.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });
    assert(await criticalPage.locator(".robys-android-handoff").count() === 1,
      "Critical bridge must be ready once while product styles are still pending");
  } finally {
    releaseProductStyles();
    await criticalNavigation;
    await criticalContext.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  await context.addInitScript(() => {
    window.__featuredGeometryReads = { pending: 0, released: 0 };
    const getBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (...args) {
      if (this.classList.contains("featured-strip")) {
        const state = document.documentElement.dataset.robysAndroidHandoff;
        const pending = state === "loading" || state === "ready";
        window.__featuredGeometryReads[pending ? "pending" : "released"] += 1;
        if (pending) throw new Error("Featured gallery forced layout before native handoff release");
      }
      return getBoundingClientRect.apply(this, args);
    };
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}?entry=android-handoff`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-android-handoff").waitFor({ state: "visible", timeout: 1500 });
  await page.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });

  const contract = await readContract(page);
  assert(contract.state === "ready", `Bridge did not reach READY: ${contract.state}`);
  assert(contract.overlayHost === "html", `Bridge must be hosted by the pre-body document element, found ${contract.overlayHost}`);
  assert(contract.overlayBackground === "rgb(36, 28, 27)", `Unexpected bridge background: ${contract.overlayBackground}`);
  assert(contract.stageBackground === "rgba(0, 0, 0, 0)", `Bridge introduced a logo card: ${contract.stageBackground}`);
  assert(contract.focusBackground.includes("radial-gradient"), "Bridge is missing the warm luminance focus");
  assert(contract.focusOpacity >= .84, `Warm focus too weak: ${contract.focusOpacity}`);
  assert(contract.markOpacity >= .99 && contract.wordmarkOpacity >= .99, "Brand assets are not fully resolved at READY");
  assert(contract.markPath.endsWith("/src/brand/robys-mark-master-v1.svg"), `Unexpected mark asset: ${contract.markPath}`);
  assert(contract.wordmarkPath.endsWith("/src/brand/robys-compact-master-v1.svg"), `Unexpected wordmark asset: ${contract.wordmarkPath}`);
  assert(contract.fullMorningLayerCount === 0, "Android bridge double-played the full Morning animation");
  assert(contract.releaseHook === "function", "Native release hook is unavailable");
  assert(await page.locator('body').evaluate(body => getComputedStyle(body).contentVisibility) === "hidden",
    "Covered product document must defer painting until the native handoff");

  await page.locator('.featured-track[data-gallery-ready="true"]').waitFor({ state: "attached", timeout: 1500 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(260);
  assert(await page.evaluate(() => window.__featuredGeometryReads.pending) === 0,
    "Featured gallery must not force product layout while the native handoff is pending");
  assert(!pageErrors.some((message) => message.includes("Featured gallery forced layout")),
    "Featured gallery attempted covered product geometry before native release");
  assert(await page.locator(".robys-android-handoff").count() === 1, "Bridge auto-dismissed before native release");
  await page.screenshot({ path: path.join(resultsDir, "android-handoff-ready.png"), animations: "allow" });

  await page.evaluate(() => window.__robysAndroidHandoffRelease());
  await page.locator(".robys-android-handoff").waitFor({ state: "detached", timeout: 700 });
  assert(
    await page.evaluate(() => document.documentElement.dataset.robysAndroidHandoff) === "done",
    "Bridge did not finish after native release"
  );
  assert(await page.locator('body').evaluate(body => getComputedStyle(body).contentVisibility) !== "hidden",
    "Native release must restore product rendering");
  await page.waitForFunction(() => window.__featuredGeometryReads.released >= 1, undefined, { timeout: 700 });
  assert(await page.evaluate(() => window.__featuredGeometryReads.pending) === 0,
    "Native release must resume gallery geometry without any covered layout reads");
  await page.screenshot({ path: path.join(resultsDir, "android-handoff-product.png") });
  await context.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}?entry=android-handoff`, { waitUntil: "domcontentloaded" });
  await reducedPage.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });
  assert(await reducedPage.locator(".robys-android-handoff").count() === 1, "Reduced motion removed the static native/web bridge");
  assert(await reducedPage.locator(".robys-morning-entry").count() === 0, "Reduced motion Android bridge replayed Morning motion");
  const reducedReleaseStarted = Date.now();
  await reducedPage.evaluate(() => window.__robysAndroidHandoffRelease());
  await reducedPage.locator(".robys-android-handoff").waitFor({ state: "detached", timeout: 300 });
  assert(Date.now() - reducedReleaseStarted < 250, "Reduced-motion handoff did not release immediately");
  await reducedContext.close();

  console.log("✅ ANDROID-HANDOFF-001 passed: static brand bridge, canonical assets, no-card focus, no double-play, explicit native release, product handoff and reduced-motion behavior are deterministic.");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
