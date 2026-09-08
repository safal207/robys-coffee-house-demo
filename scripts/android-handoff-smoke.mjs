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

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=android-handoff`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-android-handoff").waitFor({ state: "visible", timeout: 1500 });
  await page.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });

  const contract = await readContract(page);
  assert(contract.state === "ready", `Bridge did not reach READY: ${contract.state}`);
  assert(contract.overlayBackground === "rgb(36, 28, 27)", `Unexpected bridge background: ${contract.overlayBackground}`);
  assert(contract.stageBackground === "rgba(0, 0, 0, 0)", `Bridge introduced a logo card: ${contract.stageBackground}`);
  assert(contract.focusBackground.includes("radial-gradient"), "Bridge is missing the warm luminance focus");
  assert(contract.focusOpacity >= .84, `Warm focus too weak: ${contract.focusOpacity}`);
  assert(contract.markOpacity >= .99 && contract.wordmarkOpacity >= .99, "Brand assets are not fully resolved at READY");
  assert(contract.markPath.endsWith("/src/brand/robys-mark-master-v1.svg"), `Unexpected mark asset: ${contract.markPath}`);
  assert(contract.wordmarkPath.endsWith("/src/brand/robys-compact-master-v1.svg"), `Unexpected wordmark asset: ${contract.wordmarkPath}`);
  assert(contract.fullMorningLayerCount === 0, "Android bridge double-played the full Morning animation");
  assert(contract.releaseHook === "function", "Native release hook is unavailable");

  await page.waitForTimeout(260);
  assert(await page.locator(".robys-android-handoff").count() === 1, "Bridge auto-dismissed before native release");
  await page.screenshot({ path: path.join(resultsDir, "android-handoff-ready.png"), animations: "allow" });

  await page.evaluate(() => window.__robysAndroidHandoffRelease());
  await page.locator(".robys-android-handoff").waitFor({ state: "detached", timeout: 700 });
  assert(
    await page.evaluate(() => document.documentElement.dataset.robysAndroidHandoff) === "done",
    "Bridge did not finish after native release"
  );
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

  async function nativeContext({ language = "tr", width = 390, height = 844, reducedMotion = "no-preference" } = {}) {
    const native = await browser.newContext({
      viewport: { width, height }, reducedMotion, serviceWorkers: "block"
    });
    await native.addInitScript((language) => {
      localStorage.setItem("robys-language", language);
      window.__handoffStates = [];
      window.addEventListener("robys:android-handoff", (event) => {
        window.__handoffStates.push(event.detail.state);
      });
    }, language);
    return native;
  }

  for (const fixture of [
    { language: "tr", width: 390, height: 844 },
    { language: "en", width: 1024, height: 768 },
    { language: "ru", width: 412, height: 915, reducedMotion: "reduce" }
  ]) {
    const native = await nativeContext(fixture);
    const product = await native.newPage();
    await product.goto(`${baseUrl}?entry=android-handoff&handoff-gen=1`, { waitUntil: "domcontentloaded" });
    await product.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });
    const prepared = await product.evaluate(() => ({
      language: document.documentElement.lang,
      overlayCount: document.querySelectorAll(".robys-android-handoff,.robys-takeaway-entry").length,
      heroStylesReady: Boolean(document.querySelector('link[data-hero-balance="true"]')?.sheet),
      brandBackground: getComputedStyle(document.querySelector(".site-header .brand-copy")).backgroundImage,
      contentOpacity: [...document.querySelector(".hero-content").children]
        .map((child) => getComputedStyle(child))
        .filter((style) => style.display !== "none")
        .map((style) => Number(style.opacity)),
      releaseHook: typeof window.__robysAndroidHandoffRelease,
      states: window.__handoffStates
    }));
    assert(prepared.language === fixture.language, "Native product readiness preceded saved-language initialization");
    assert(prepared.overlayCount === 0, "Native launch created a second HTML cover");
    assert(prepared.heroStylesReady, "Native product readiness preceded dynamic hero styling");
    assert(prepared.contentOpacity.every((opacity) => opacity === 1), "Native product readiness preceded visible hero text and actions");
    assert(prepared.brandBackground.includes(fixture.width > 680 ? "robys-header-master-v1.svg" : "robys-compact-master-v1.svg"), "Native product readiness selected the wrong responsive brand asset");
    assert(prepared.releaseHook === "function", "Native product release hook is unavailable");
    assert(prepared.states.join(",") === "loading,ready", "Native product readiness states are out of order");
    assert(await product.locator(".hero h1").isVisible(), "Native READY has no visible product heading");
    await product.screenshot({ path: path.join(resultsDir, `android-native-product-${fixture.language}.png`), animations: "allow" });
    await product.evaluate(() => {
      const release = window.__robysAndroidHandoffRelease;
      release(); release();
    });
    assert(await product.evaluate(() => window.__handoffStates.join(",")) === "loading,ready,releasing,done", "Native release is not idempotent");
    assert(await product.evaluate(() => typeof window.__robysAndroidHandoffRelease) === "undefined", "Completed native release left a stale hook");
    await native.close();
  }

  const pendingNative = await nativeContext();
  const pendingProduct = await pendingNative.newPage();
  let releaseStyle;
  const styleGate = new Promise((resolve) => { releaseStyle = resolve; });
  await pendingProduct.route("**/hero-balance.css?*", async (route) => {
    await styleGate;
    await route.continue();
  });
  await pendingProduct.goto(`${baseUrl}?entry=android-handoff&handoff-gen=2`, { waitUntil: "domcontentloaded" });
  await pendingProduct.locator('html[data-robys-android-handoff="loading"]').waitFor({ state: "attached", timeout: 1500 });
  assert(await pendingProduct.locator(".robys-android-handoff").count() === 0, "Pending native product created a web cover");
  assert(await pendingProduct.evaluate(() => window.__handoffStates.includes("ready")) === false, "Pending product stylesheet was falsely certified READY");
  releaseStyle();
  await pendingProduct.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });
  await pendingNative.close();

  const failedNative = await nativeContext();
  const failedProduct = await failedNative.newPage();
  await failedProduct.route("**/src/robys-hero-poster.jpg", (route) => route.abort());
  await failedProduct.goto(`${baseUrl}?entry=android-handoff&handoff-gen=3`, { waitUntil: "domcontentloaded" });
  await failedProduct.locator('html[data-robys-android-handoff="done"]').waitFor({ state: "attached", timeout: 2200 });
  assert(await failedProduct.evaluate(() => window.__handoffStates.includes("ready")) === false, "Failed product poster was falsely certified READY");
  assert(await failedProduct.locator(".robys-android-handoff").count() === 0, "Failed native preparation introduced a blocking web cover");
  await failedNative.close();

  console.log("✅ ANDROID-HANDOFF-001 passed: unchanged browser bridge and reduced motion; native product preparation without a second cover, responsive localized frames, explicit release, pending-style and failed-poster controls.");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
