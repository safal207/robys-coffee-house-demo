import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.HITS_SMOKE_PORT ?? 4185);
const resultsDir = path.resolve(process.env.HITS_RESULTS_DIR ?? "visual-results/hits-feed");
const viewports = [
  { id: "phone-320", width: 320, height: 900, mobile: true },
  { id: "phone-390", width: 390, height: 1000, mobile: true },
  { id: "tablet-768", width: 768, height: 1024, mobile: false },
  { id: "desktop-1440", width: 1440, height: 1100, mobile: false }
];
const expectedPrices = ["190 ₺", "180 ₺", "170 ₺", "190 ₺"];

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

function assert(condition, viewport, message) {
  if (!condition) throw new Error(`[HITS-002/${viewport}] ${message}`);
}

function startServer() {
  return spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      reducedMotion: "reduce",
      serviceWorkers: "block",
      bypassCSP: true
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}index.html?hits-smoke=${viewport.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const section = page.locator(".hits-section");
    await section.waitFor({ state: "visible", timeout: 15000 });
    await section.scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".hits-card img")).every((image) => image.complete && image.naturalWidth > 0)
    );

    const metrics = await page.evaluate(() => {
      const track = document.querySelector(".hits-track");
      const cards = Array.from(document.querySelectorAll(".hits-card"));
      const prices = cards.map((card) => card.querySelector(".hits-price")?.textContent?.trim());
      const images = cards.map((card) => {
        const image = card.querySelector("img");
        return { complete: image?.complete, naturalWidth: image?.naturalWidth, src: image?.getAttribute("src") };
      });
      const rects = cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      });
      const root = document.scrollingElement;
      return {
        count: cards.length,
        prices,
        images,
        rects,
        trackClientWidth: track?.clientWidth ?? 0,
        trackScrollWidth: track?.scrollWidth ?? 0,
        scrollSnapType: getComputedStyle(track).scrollSnapType,
        pageScrollWidth: root?.scrollWidth ?? 0,
        pageClientWidth: root?.clientWidth ?? 0,
        stylesheetLoaded: Array.from(document.styleSheets).some((sheet) => sheet.href?.includes("hits-feed.css"))
      };
    });

    assert(metrics.count === 4, viewport.id, `expected 4 cards, found ${metrics.count}`);
    assert(JSON.stringify(metrics.prices) === JSON.stringify(expectedPrices), viewport.id, `prices changed: ${metrics.prices.join(", ")}`);
    assert(metrics.images.every((image) => image.complete && image.naturalWidth > 0), viewport.id, "one or more product images failed to load");
    assert(metrics.stylesheetLoaded, viewport.id, "hits-feed.css did not load");
    assert(metrics.pageScrollWidth <= metrics.pageClientWidth + 1, viewport.id, "hits feed introduced page-level horizontal overflow");

    if (viewport.width <= 680) {
      assert(metrics.trackScrollWidth > metrics.trackClientWidth + 100, viewport.id, "mobile feed is not horizontally scrollable");
      assert(metrics.scrollSnapType.includes("x"), viewport.id, `scroll snap is ${metrics.scrollSnapType}`);
      const start = await page.locator(".hits-track").evaluate((track) => track.scrollLeft);
      await page.locator(".hits-track").evaluate((track) => track.scrollTo({ left: track.scrollWidth, behavior: "instant" }));
      await page.waitForTimeout(80);
      const end = await page.locator(".hits-track").evaluate((track) => track.scrollLeft);
      assert(end > start + 100, viewport.id, "mobile feed did not move horizontally");
    } else if (viewport.width >= 1000) {
      const tops = metrics.rects.map((rect) => Math.round(rect.top));
      assert(Math.max(...tops) - Math.min(...tops) <= 2, viewport.id, "desktop cards are not aligned in one row");
    }

    await page.evaluate(() => document.documentElement.setAttribute("lang", "ru"));
    await page.waitForFunction(() => document.querySelector("[data-hits-title]")?.textContent === "Хиты кафе");
    assert(await page.locator("[data-hits-title]").textContent() === "Хиты кафе", viewport.id, "Russian title did not update");

    await section.screenshot({
      path: path.join(resultsDir, `${viewport.id}.png`),
      animations: "disabled"
    });

    results.push({ viewport: viewport.id, ...metrics });
    console.log(`✅ HITS-002 / ${viewport.id}: 4 cards, images loaded, layout valid`);
    await context.close();
  }

  writeFileSync(path.join(resultsDir, "summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log("✅ HITS-002 passed across phone, tablet and desktop viewports.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
