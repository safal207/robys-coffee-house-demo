import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.ANDROID_HANDOFF_PORT ?? 4191);
const baseUrl = `https://127.0.0.1:${port}/`;
const resultsDir = path.resolve(process.env.ANDROID_HANDOFF_RESULTS_DIR ?? "visual-results/android-handoff");
const certPath = process.env.ANDROID_HANDOFF_TLS_CERT;
const keyPath = process.env.ANDROID_HANDOFF_TLS_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(`[ANDROID-HANDOFF-001] ${message}`);
}

function startServer() {
  assert(certPath && keyPath, "Local HTTPS certificate and key are required");
  const source = `import http.server, ssl, sys
server = http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), http.server.SimpleHTTPRequestHandler)
tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
tls.load_cert_chain(sys.argv[2], sys.argv[3])
server.socket = tls.wrap_socket(server.socket, server_side=True)
server.serve_forever()
`;
  return spawn(process.env.PYTHON_EXECUTABLE ?? "python3", ["-u", "-c", source, String(port), certPath, keyPath], {
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

async function assertProductPaint(page, visible) {
  const state = await page.locator("main").evaluate(main => {
    const hero = main.querySelector(".hero");
    const rect = hero.getBoundingClientRect();
    return {
      main: getComputedStyle(main).visibility,
      header: getComputedStyle(document.querySelector(".site-header")).visibility,
      hero: getComputedStyle(hero).visibility,
      width: rect.width,
      height: rect.height
    };
  });
  const expected = visible ? "visible" : "hidden";
  assert([state.main, state.header, state.hero].every(value => value === expected),
    `Product paint should be ${expected}: ${JSON.stringify(state)}`);
  assert(state.width >= 320 && state.height >= 300, "Deferring paint collapsed the product layout");
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
    serviceWorkers: "block",
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=android-handoff`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-android-handoff").waitFor({ state: "visible", timeout: 1500 });
  await page.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });
  assert(await page.evaluate(() => Array.from(document.styleSheets).some(sheet => {
    try { return sheet.href?.includes("styles-v2.css") && sheet.cssRules.length > 0; }
    catch { return false; }
  })), "Base stylesheet did not load under the production CSP");

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
  await assertProductPaint(page, false);
  assert(await page.locator(".hero-video").evaluate(video => video.paused && video.readyState === 0),
    "Hero decoder started before native frame acknowledgement");

  await page.waitForTimeout(260);
  assert(await page.locator(".robys-android-handoff").count() === 1, "Bridge auto-dismissed before native release");
  await page.screenshot({ path: path.join(resultsDir, "android-handoff-ready.png"), animations: "allow" });

  await page.evaluate(() => { window.__robysAndroidHandoffRelease(); });
  assert(await page.evaluate(() => document.documentElement.dataset.robysNativeReady) === "true",
    "Native release did not acknowledge deferred media");
  await page.locator('html[data-robys-android-handoff="releasing"]').waitFor({ state: "attached", timeout: 500 });
  await assertProductPaint(page, true);
  assert(await page.locator(".robys-android-handoff").count() === 1,
    "Bridge disappeared before the product could paint");
  assert(await page.locator(".hero-video").evaluate(video => video.autoplay), "Native release did not schedule hero playback");
  await page.locator(".robys-android-handoff").waitFor({ state: "detached", timeout: 700 });
  assert(
    await page.evaluate(() => document.documentElement.dataset.robysAndroidHandoff) === "done",
    "Bridge did not finish after native release"
  );
  await assertProductPaint(page, true);
  await page.screenshot({ path: path.join(resultsDir, "android-handoff-product.png") });
  await context.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ignoreHTTPSErrors: true
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}?entry=android-handoff`, { waitUntil: "domcontentloaded" });
  await reducedPage.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });
  assert(await reducedPage.locator(".robys-android-handoff").count() === 1, "Reduced motion removed the static native/web bridge");
  assert(await reducedPage.locator(".robys-morning-entry").count() === 0, "Reduced motion Android bridge replayed Morning motion");
  await assertProductPaint(reducedPage, false);
  const reducedReleaseStarted = Date.now();
  await reducedPage.evaluate(() => window.__robysAndroidHandoffRelease());
  await reducedPage.locator(".robys-android-handoff").waitFor({ state: "detached", timeout: 300 });
  assert(Date.now() - reducedReleaseStarted < 250, "Reduced-motion handoff did not release immediately");
  await assertProductPaint(reducedPage, true);
  await reducedContext.close();

  // Recovery must expose the real page even if native acknowledgement never
  // arrives or the bridge cannot load/finish. Exercise the shipped code paths.
  for (const fault of ["no-ack", "import-failure", "runtime-failure"]) {
    const recovery = await browser.newContext({
      viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block",
      ignoreHTTPSErrors: true
    });
    if (fault === "import-failure") {
      await recovery.route("**/android-handoff.js*", route => route.abort());
    } else if (fault === "runtime-failure") {
      const source = readFileSync("android-handoff.js", "utf8");
      const target = "await waitForAssets(mark, wordmark);";
      assert(source.includes(target), "Runtime failure injection no longer targets the asset wait");
      await recovery.route("**/android-handoff.js*", route => route.fulfill({
        contentType: "application/javascript",
        body: source.replace(target, 'throw new Error("injected handoff failure");')
      }));
    }
    const recoveryPage = await recovery.newPage();
    await recoveryPage.goto(`${baseUrl}?entry=android-handoff`, { waitUntil: "domcontentloaded" });
    if (fault === "no-ack") {
      await recoveryPage.locator('html[data-robys-android-handoff="ready"]').waitFor({ state: "attached", timeout: 2200 });
      await assertProductPaint(recoveryPage, false);
    }
    await recoveryPage.locator(".hero").waitFor({ state: "visible", timeout: 6000 });
    await assertProductPaint(recoveryPage, true);
    assert(await recoveryPage.locator(".robys-android-handoff").count() === 0, `${fault} retained the bridge`);
    assert(await recoveryPage.locator(".hero-video").evaluate(video => video.paused && video.readyState === 0),
      `${fault} started the hero decoder without native acknowledgement`);
    await recovery.close();
  }

  console.log("✅ ANDROID-HANDOFF-001 passed: static brand bridge, canonical assets, preserved layout with deferred product paint, native release, reduced motion, no-ack timeout and import/runtime failure recovery.");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
