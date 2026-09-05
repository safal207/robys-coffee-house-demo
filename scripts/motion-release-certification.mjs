import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.MOTION_RELEASE_PORT ?? 4193);
const baseUrl = `http://127.0.0.1:${port}/`;
const resultsDir = path.resolve(
  process.env.MOTION_RELEASE_RESULTS_DIR ?? "visual-results/motion-release"
);

const DARK_PREPAINT = "rgb(23, 10, 8)";
const COLD_MIN_MS = 1_100;
const COLD_MAX_MS = 2_400;
const WARM_MIN_MS = 400;
const WARM_MAX_MS = 1_100;

function assert(condition, message) {
  if (!condition) throw new Error(`[MOTION-RELEASE-001] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer() {
  return spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
  );
}

async function waitForServer(server, attempts = 40) {
  let lastError;
  let stderr = "";
  let spawnError;

  server.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  server.once("error", (error) => {
    spawnError = error;
  });

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(
        `Local server exited before readiness (code=${server.exitCode}, signal=${server.signalCode}): ${stderr.trim()}`
      );
    }

    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) {
        await sleep(40);
        assert(
          server.exitCode === null && server.signalCode === null,
          "Configured port was answered after the intended local server exited"
        );
        return;
      }
      lastError = new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }

  throw lastError ?? new Error("Local server did not become ready");
}

async function newMotionContext(browser, reducedMotion = "no-preference") {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion,
    serviceWorkers: "block"
  });
}

async function waitForOverlay(page, timeout = 1_800) {
  await page.locator(".robys-morning-entry").waitFor({ state: "visible", timeout });
}

async function waitForDone(page, timeout = 4_000) {
  await page.locator('html[data-robys-entry-state="done"]').waitFor({ state: "attached", timeout });
  assert(await page.locator(".robys-morning-entry").count() === 0, "Entry overlay remained after DONE");
  assert(
    await page.evaluate(() => getComputedStyle(document.documentElement).visibility === "visible"),
    "Document remained hidden after handoff"
  );
}

async function readSurface(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector(".robys-morning-entry");
    const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    const focusable = overlay?.querySelectorAll(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
    ).length ?? 0;

    return {
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      htmlInlineBackground: document.documentElement.style.backgroundColor,
      htmlVisibility: getComputedStyle(document.documentElement).visibility,
      overlayBackground: overlay ? getComputedStyle(overlay).backgroundColor : "missing",
      overlayAriaHidden: overlay?.getAttribute("aria-hidden") ?? "missing",
      overlayOwnsCenter: Boolean(center?.closest?.(".robys-morning-entry")),
      focusableCount: focusable,
      activeInsideOverlay: Boolean(overlay?.contains(document.activeElement)),
      bodyInert: Boolean(document.body?.inert),
      productPaintable: Boolean(
        document.body &&
        getComputedStyle(document.body).display !== "none" &&
        getComputedStyle(document.documentElement).visibility === "visible"
      )
    };
  });
}

async function readPaletteEvidence(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector(".robys-morning-entry");
    if (!overlay) return { colors: [], coolDrift: [], rubyPresent: false };

    const elements = [overlay, ...overlay.querySelectorAll("*")];
    const paintProperties = [
      "color",
      "background-color",
      "background-image",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "outline-color",
      "box-shadow",
      "text-shadow",
      "fill",
      "stroke",
      "stop-color",
      "flood-color",
      "lighting-color"
    ];
    const paintAttributes = [
      "fill",
      "stroke",
      "stop-color",
      "flood-color",
      "lighting-color"
    ];
    const paintValues = [];

    for (const element of elements) {
      const computed = getComputedStyle(element);
      for (const property of paintProperties) {
        const value = computed.getPropertyValue(property);
        if (value) paintValues.push(value);
      }
      const inlineStyle = element.getAttribute("style");
      if (inlineStyle) paintValues.push(inlineStyle);
      for (const attribute of paintAttributes) {
        const value = element.getAttribute(attribute);
        if (value) paintValues.push(value);
      }
    }

    const paintText = paintValues.join("\n");
    const colors = [];
    const rgbPattern = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;
    const hexPattern = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
    let match;

    while ((match = rgbPattern.exec(paintText))) {
      colors.push([Number(match[1]), Number(match[2]), Number(match[3])]);
    }
    while ((match = hexPattern.exec(paintText))) {
      const raw = match[1];
      const hex = raw.length === 3
        ? raw.split("").map((digit) => `${digit}${digit}`).join("")
        : raw;
      colors.push([
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16)
      ]);
    }

    const uniqueColors = [...new Map(colors.map((color) => [color.join(","), color])).values()];
    const coolDrift = uniqueColors.filter(([r, g, b]) => {
      const greenDominant = g > 80 && g >= r * 1.25 && g >= b * 1.15;
      const blueDominant = b > 80 && b >= r * 1.25 && b >= g * 1.15;
      return greenDominant || blueDominant;
    });

    const rubyPresent = uniqueColors.some(([r, g, b]) => r >= 180 && g <= 80 && b <= 95);
    return { colors: uniqueColors, coolDrift, rubyPresent };
  });
}

async function assertCanonicalLogo(page) {
  const contract = await page.evaluate(() => {
    const stage = document.querySelector(".robys-entry-logo-stage");
    const mark = stage?.querySelector('img[src*="robys-mark-master-v1.svg"]');
    const wordmark = stage?.querySelector('img[src*="robys-compact-master-v1.svg"]');
    return {
      mark: mark ? new URL(mark.src).pathname : "",
      wordmark: wordmark ? new URL(wordmark.src).pathname : ""
    };
  });

  assert(
    contract.mark.endsWith("/src/brand/robys-mark-master-v1.svg"),
    `Unexpected mark asset: ${contract.mark}`
  );
  assert(
    contract.wordmark.endsWith("/src/brand/robys-compact-master-v1.svg"),
    `Unexpected wordmark asset: ${contract.wordmark}`
  );
}

function assertEntrySurface(surface, label) {
  assert(surface.htmlVisibility === "visible", `${label}: document is not paintable`);
  assert(surface.productPaintable, `${label}: product document is not paintable under the entry`);
  assert(surface.overlayBackground === DARK_PREPAINT, `${label}: unexpected entry background ${surface.overlayBackground}`);
  assert(surface.overlayOwnsCenter, `${label}: branded overlay does not own the viewport center`);
  assert(surface.overlayAriaHidden === "true", `${label}: decorative overlay is exposed to assistive tech`);
  assert(surface.focusableCount === 0, `${label}: decorative overlay introduced focusable controls`);
  assert(!surface.activeInsideOverlay, `${label}: keyboard focus is trapped inside decorative entry`);
  assert(!surface.bodyInert, `${label}: product body was made inert`);
}

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

const evidence = {
  contract: "MOTION-RELEASE-001",
  cold: {},
  warm: {},
  escape: {},
  backgroundRecovery: {},
  slowNetwork: {},
  offline: {},
  reducedMotion: {}
};

const server = startServer();
let browser;

try {
  await waitForServer(server);
  browser = await chromium.launch({ headless: true });

  // Keep timing measurements free from screenshots and diagnostic DOM work.
  const timingContext = await newMotionContext(browser);
  const timingPage = await timingContext.newPage();

  await timingPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  const coldPrepaint = await timingPage.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  assert(coldPrepaint === DARK_PREPAINT, `Cold prepaint was not Roby's dark surface: ${coldPrepaint}`);
  await waitForOverlay(timingPage);
  const coldStartedAt = Date.now();
  await waitForDone(timingPage);
  const coldMs = Date.now() - coldStartedAt;
  assert(coldMs >= COLD_MIN_MS, `Cold entry became implausibly short: ${coldMs} ms`);
  assert(coldMs <= COLD_MAX_MS, `Cold entry exceeded release budget: ${coldMs} ms`);

  await timingPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await waitForOverlay(timingPage);
  const warmStartedAt = Date.now();
  await waitForDone(timingPage, 2_000);
  const warmMs = Date.now() - warmStartedAt;
  assert(warmMs >= WARM_MIN_MS, `Warm entry became implausibly short: ${warmMs} ms`);
  assert(warmMs <= WARM_MAX_MS, `Warm entry exceeded release budget: ${warmMs} ms`);
  await timingContext.close();

  evidence.warm = { durationMs: warmMs };

  // Use a fresh session for cold visual/accessibility evidence so diagnostics do
  // not contaminate the release timing measurement above.
  const primaryContext = await newMotionContext(browser);
  const page = await primaryContext.newPage();
  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  const visualPrepaint = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  assert(visualPrepaint === DARK_PREPAINT, `Cold visual prepaint was not Roby's dark surface: ${visualPrepaint}`);
  await waitForOverlay(page);
  const coldSurface = await readSurface(page);
  assertEntrySurface(coldSurface, "cold");
  await assertCanonicalLogo(page);
  const palette = await readPaletteEvidence(page);
  assert(palette.rubyPresent, "Roby's red/ruby family disappeared from the rendered entry palette");
  assert(palette.coolDrift.length === 0, `Green/blue rendered palette drift detected: ${JSON.stringify(palette.coolDrift)}`);
  await page.screenshot({ path: path.join(resultsDir, "cold-entry.png"), animations: "allow" });
  await waitForDone(page);
  evidence.cold = { durationMs: coldMs, prepaint: coldPrepaint, surface: coldSurface, palette };

  // Escape must hand off promptly and never trap the product.
  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await waitForOverlay(page);
  await page.waitForTimeout(180);
  const escapeStartedAt = Date.now();
  await page.keyboard.press("Escape");
  await waitForDone(page, 1_200);
  const escapeMs = Date.now() - escapeStartedAt;
  assert(escapeMs < 1_000, `Escape recovery was too slow: ${escapeMs} ms`);
  evidence.escape = { durationMs: escapeMs };

  // Background -> foreground recovery. The runtime contract reads visibilityState;
  // override it deterministically, dispatch the browser event, then restore visible.
  await page.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await waitForOverlay(page);
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitForDone(page, 1_200);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(120);
  assert(await page.locator(".robys-morning-entry").count() === 0, "Entry replayed after foreground recovery");
  evidence.backgroundRecovery = { overlayCountAfterForeground: 0 };
  await page.screenshot({ path: path.join(resultsDir, "foreground-recovery-product.png") });
  await primaryContext.close();

  // Slow lazy-module delivery: product must stay paintable, dark prepaint must prevent
  // an unstyled white surface, and the bounded entry must still recover to product.
  const slowContext = await newMotionContext(browser);
  const slowPage = await slowContext.newPage();
  let delayedModuleRequests = 0;
  await slowPage.route("**/morning-entry-v2.js*", async (route) => {
    delayedModuleRequests += 1;
    await sleep(900);
    await route.continue();
  });
  await slowPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  assert(delayedModuleRequests > 0, "Slow-network route did not intercept the entry module");
  const slowSurfaceBeforeModule = await readSurface(slowPage);
  assert(slowSurfaceBeforeModule.htmlVisibility === "visible", "Slow network hid the product document");
  assert(
    slowSurfaceBeforeModule.htmlBackground === DARK_PREPAINT,
    `Slow network exposed a non-branded prepaint surface: ${slowSurfaceBeforeModule.htmlBackground}`
  );
  await slowPage.waitForTimeout(1_050);
  await slowPage.screenshot({ path: path.join(resultsDir, "slow-network-entry.png"), animations: "allow" });
  await waitForDone(slowPage, 4_500);
  evidence.slowNetwork = {
    moduleDelayMs: 900,
    interceptedModuleRequests: delayedModuleRequests,
    prepaint: slowSurfaceBeforeModule.htmlBackground,
    productPaintable: slowSurfaceBeforeModule.productPaintable
  };
  await slowContext.close();

  // Offline lazy-module failure must fail open immediately to usable product.
  const offlineContext = await newMotionContext(browser);
  const offlinePage = await offlineContext.newPage();
  let abortedModuleRequests = 0;
  await offlinePage.route("**/morning-entry-v2.js*", (route) => {
    abortedModuleRequests += 1;
    return route.abort("failed");
  });
  await offlinePage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  assert(abortedModuleRequests > 0, "Offline route did not intercept the entry module");
  await offlinePage.waitForTimeout(350);
  const offlineState = await offlinePage.evaluate(() => ({
    aborted: globalThis.__robysMorningEntryAborted === true,
    overlayCount: document.querySelectorAll(".robys-morning-entry").length,
    visibility: getComputedStyle(document.documentElement).visibility,
    inlineBackground: document.documentElement.style.backgroundColor,
    bodyDisplay: document.body ? getComputedStyle(document.body).display : "missing"
  }));
  assert(offlineState.aborted, "Offline module failure did not enter fail-open recovery");
  assert(offlineState.overlayCount === 0, "Offline module failure left a trapped overlay");
  assert(offlineState.visibility === "visible", "Offline module failure left the product hidden");
  assert(offlineState.inlineBackground === "", "Offline module failure left the temporary prepaint background pinned");
  assert(offlineState.bodyDisplay !== "none" && offlineState.bodyDisplay !== "missing", "Offline module failure hid product content");
  evidence.offline = { ...offlineState, interceptedModuleRequests: abortedModuleRequests };
  await offlinePage.screenshot({ path: path.join(resultsDir, "offline-fail-open-product.png") });
  await offlineContext.close();

  // Reduced motion remains a real bypass, not merely a shorter animation.
  const reducedContext = await newMotionContext(browser, "reduce");
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}?entry=morning`, { waitUntil: "domcontentloaded" });
  await reducedPage.waitForTimeout(160);
  const reducedState = await reducedPage.evaluate(() => ({
    overlayCount: document.querySelectorAll(".robys-morning-entry").length,
    scene: document.documentElement.dataset.robysEntryScene ?? "",
    visibility: getComputedStyle(document.documentElement).visibility
  }));
  assert(reducedState.overlayCount === 0, "Reduced motion rendered the full entry overlay");
  assert(reducedState.scene === "", "Reduced motion exposed a motion scene state");
  assert(reducedState.visibility === "visible", "Reduced motion left the product hidden");
  evidence.reducedMotion = reducedState;
  await reducedContext.close();

  writeFileSync(
    path.join(resultsDir, "motion-release-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`
  );

  console.log(
    `✅ MOTION-RELEASE-001 passed: cold ${evidence.cold.durationMs} ms, warm ${evidence.warm.durationMs} ms; ` +
    "no white prepaint, no cool palette drift, canonical logo, no focus trap, Escape/background recovery, slow-network and offline fail-open, and reduced-motion bypass are certified."
  );
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
