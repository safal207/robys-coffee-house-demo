import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { menuCategories } from "../menu-data.js";

const port = Number(process.env.SCROLL_AUDIT_PORT ?? 4183);
const resultsDir = path.resolve(process.env.SCROLL_RESULTS_DIR ?? "visual-results/scroll-audit");
const viewports = [
  { id: "phone-320", width: 320, height: 900 },
  { id: "phone-390", width: 390, height: 1000 }
];
const scrollSequence = [0, 0.94, 0.12, 0.78, 0.34, 1, 0.48, 0.06, 0.72, 0.55];
const maxStabilityDiffRatio = 0.002;
const expectedPanelCount = menuCategories.length;

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

function assert(condition, viewport, message) {
  if (!condition) throw new Error(`[SCROLL-001/${viewport}] ${message}`);
}

function startServer() {
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let diagnostics = "";
  server.stderr.on("data", (chunk) => {
    diagnostics += chunk.toString();
  });
  server.on("exit", (code) => {
    if (code && code !== 0) console.error(`Scroll-audit server exited with ${code}: ${diagnostics}`);
  });
  return server;
}

async function waitForServer(url, attempts = 40) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

async function stabilize(page) {
  await page.addStyleTag({
    content: `
      *,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}
      html{scroll-behavior:auto!important;scrollbar-width:none!important}
      html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}
    `
  });
  await page.evaluate(async () => {
    const year = document.querySelector("#current-year");
    if (year) year.textContent = "2026";
    if (document.fonts?.ready) await document.fonts.ready;
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement;
    const panels = Array.from(document.querySelectorAll(".full-menu-panel"), (panel) => {
      const rect = panel.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height
      };
    });
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
      scrollHeight: root?.scrollHeight ?? 0,
      scrollWidth: root?.scrollWidth ?? 0,
      clientWidth: root?.clientWidth ?? 0,
      touchSafe: matchMedia("(hover:none) and (pointer:coarse)").matches,
      headerPosition: getComputedStyle(document.querySelector(".menu-page .site-header")).position,
      controlsPosition: getComputedStyle(document.querySelector(".menu-controls")).position,
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      panels
    };
  });
}

async function scrollToRatio(page, ratio) {
  return page.evaluate(async (targetRatio) => {
    const root = document.scrollingElement;
    const maxScroll = Math.max(0, (root?.scrollHeight ?? 0) - window.innerHeight);
    const target = Math.round(maxScroll * targetRatio);
    window.scrollTo(0, target);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { target, actual: window.scrollY };
  }, ratio);
}

function compareScreenshots(beforeBuffer, afterBuffer, diffPath) {
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  if (before.width !== after.width || before.height !== after.height) {
    return { passed: false, diffPixelRatio: 1, reason: "screenshot dimensions changed" };
  }
  const diff = new PNG({ width: before.width, height: before.height });
  const diffPixels = pixelmatch(before.data, after.data, diff.data, before.width, before.height, {
    threshold: 0.08,
    includeAA: false,
    alpha: 0.65,
    diffColor: [255, 0, 80],
    aaColor: [255, 190, 0]
  });
  const totalPixels = before.width * before.height;
  const diffPixelRatio = diffPixels / totalPixels;
  const passed = diffPixelRatio <= maxStabilityDiffRatio;
  if (!passed) writeFileSync(diffPath, PNG.sync.write(diff));
  return { passed, diffPixels, totalPixels, diffPixelRatio, maxDiffPixelRatio: maxStabilityDiffRatio };
}

const server = startServer();
let browser;
const results = [];

try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      screen: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      colorScheme: "light",
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      bypassCSP: true
    });
    const page = await context.newPage();
    const url = new URL("menu.html", baseUrl);
    url.searchParams.set("scroll-audit", viewport.id);
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(".full-menu-panel").first().waitFor({ state: "visible", timeout: 15000 });
    await stabilize(page);

    const initial = await readMetrics(page);
    assert(initial.touchSafe, viewport.id, "coarse-pointer safe mode did not activate");
    assert(initial.headerPosition === "static", viewport.id, `header position is ${initial.headerPosition}, expected static`);
    assert(initial.controlsPosition === "static", viewport.id, `menu controls position is ${initial.controlsPosition}, expected static`);
    assert(initial.scrollWidth <= initial.clientWidth + 1, viewport.id, `horizontal overflow: ${initial.scrollWidth}px > ${initial.clientWidth}px`);
    assert(initial.scrollHeight > initial.innerHeight * 3, viewport.id, "menu is unexpectedly short or failed to render");
    assert(initial.panels.length === expectedPanelCount, viewport.id, `expected ${expectedPanelCount} menu panels from menu-data.js, found ${initial.panels.length}`);
    assert(initial.htmlBackground !== "rgba(0, 0, 0, 0)", viewport.id, "html background is transparent");
    assert(initial.bodyBackground !== "rgba(0, 0, 0, 0)", viewport.id, "body background is transparent");

    initial.panels.forEach((panel, index) => {
      assert(panel.width > 0 && panel.height > 0, viewport.id, `panel ${index + 1} has invalid dimensions`);
      assert(panel.left >= -1 && panel.right <= initial.innerWidth + 1, viewport.id, `panel ${index + 1} escapes the viewport`);
      if (index > 0) assert(panel.top >= initial.panels[index - 1].bottom, viewport.id, `panel ${index + 1} overlaps panel ${index}`);
    });

    await scrollToRatio(page, 0.55);
    await page.waitForTimeout(80);
    const beforePath = path.join(resultsDir, `${viewport.id}-before.png`);
    const afterPath = path.join(resultsDir, `${viewport.id}-after.png`);
    const diffPath = path.join(resultsDir, `${viewport.id}-diff.png`);
    const beforeBuffer = await page.screenshot({ path: beforePath, animations: "disabled" });

    for (const ratio of scrollSequence) {
      const scroll = await scrollToRatio(page, ratio);
      assert(Math.abs(scroll.actual - scroll.target) <= 2, viewport.id, `scroll target drift at ratio ${ratio}: ${scroll.actual}px vs ${scroll.target}px`);
      const metrics = await readMetrics(page);
      assert(Math.abs(metrics.scrollHeight - initial.scrollHeight) <= 2, viewport.id, `document height changed during scrolling: ${initial.scrollHeight}px → ${metrics.scrollHeight}px`);
      assert(metrics.scrollWidth <= metrics.clientWidth + 1, viewport.id, `horizontal overflow appeared during scrolling: ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
      await page.waitForTimeout(35);
    }

    await scrollToRatio(page, 0.55);
    await page.waitForTimeout(80);
    const afterBuffer = await page.screenshot({ path: afterPath, animations: "disabled" });
    const comparison = compareScreenshots(beforeBuffer, afterBuffer, diffPath);
    assert(comparison.passed, viewport.id, `same-position screenshot changed by ${(comparison.diffPixelRatio * 100).toFixed(4)}% after rapid scrolling`);

    results.push({ viewport: viewport.id, width: viewport.width, height: viewport.height, scrollHeight: initial.scrollHeight, panelCount: initial.panels.length, ...comparison });
    console.log(`✅ SCROLL-001 / ${viewport.id}: no overflow, stable height, ${(comparison.diffPixelRatio * 100).toFixed(4)}% repaint diff`);
    await context.close();
  }

  writeFileSync(path.join(resultsDir, "summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`✅ SCROLL-001 passed at ${viewports.map((viewport) => `${viewport.width}px`).join(" and ")}.`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
