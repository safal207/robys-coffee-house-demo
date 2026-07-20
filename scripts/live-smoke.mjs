import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  ACTIVE_HERO_FETCH,
  ACTIVE_HERO_PATH,
  TRUSTED_HERO_PATH,
  fetchReference,
} from "./media-contract-config.mjs";

const LIVE_HERO_PATH = "src/robys-ambience-clean.mp4";
const LIVE_POSTER_PATH = "src/robys-hero-poster.jpg";
const NETWORK_TIMEOUT_MS = 30_000;
const profile = JSON.parse(readFileSync("qa/business-profile.json", "utf8"));
const localIndex = readFileSync("index.html", "utf8");
const expectedBuild = localIndex.match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
if (!expectedBuild) throw new Error("[LIVE-001] Local robys-build marker is missing");
if (ACTIVE_HERO_PATH !== LIVE_HERO_PATH || TRUSTED_HERO_PATH !== LIVE_HERO_PATH) {
  throw new Error("[LIVE-001] Active hero escaped the trusted live path");
}

const baseUrl = new URL(process.env.ROBYS_LIVE_BASE ?? profile.siteUrl);
const attempts = Number(process.env.ROBYS_LIVE_ATTEMPTS ?? 15);
const delayMs = Number(process.env.ROBYS_LIVE_DELAY_MS ?? 20000);
const reportPath = process.env.ROBYS_LIVE_REPORT ?? "live-smoke-report.json";
const report = {
  schemaVersion: 2,
  expectedBuild,
  activeHeroPath: LIVE_HERO_PATH,
  attempts: [],
  passed: false,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(pathname) {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set("live-smoke", `${expectedBuild}-${Date.now()}`);
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return { body, contentType: response.headers.get("content-type") ?? "" };
}

function normalizedContentType(response) {
  return response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
}

async function verifyPublishedFiles() {
  const [landing, menu, robots, sitemap, video, poster] = await Promise.all([
    fetchText("index.html"),
    fetchText("menu.html"),
    fetchText("robots.txt"),
    fetchText("sitemap.xml"),
    fetch(new URL(LIVE_HERO_PATH, baseUrl), {
      headers: { range: "bytes=0-2047", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    }),
    fetch(new URL(LIVE_POSTER_PATH, baseUrl), {
      headers: { range: "bytes=0-2047", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    }),
  ]);

  try {
    for (const [name, page] of [["landing", landing], ["menu", menu]]) {
      if (!page.body.includes(`name="robys-build" content="${expectedBuild}"`)) {
        throw new Error(`${name} does not expose build ${expectedBuild}`);
      }
    }
    if (!robots.body.includes(`${profile.siteUrl}sitemap.xml`)) throw new Error("robots.txt does not expose the canonical sitemap");
    if (!sitemap.body.includes(`<loc>${profile.siteUrl}</loc>`) || !sitemap.body.includes(`<loc>${profile.menuUrl}</loc>`)) {
      throw new Error("sitemap.xml does not expose both public pages");
    }

    const videoType = normalizedContentType(video);
    const posterType = normalizedContentType(poster);
    if (![200, 206].includes(video.status) || videoType !== "video/mp4") {
      throw new Error(`Active hero response is invalid: HTTP ${video.status}, type ${videoType || "unknown"}`);
    }
    if (![200, 206].includes(poster.status) || posterType !== "image/jpeg") {
      throw new Error(`Hero poster response is invalid: HTTP ${poster.status}, type ${posterType || "unknown"}`);
    }

    console.log("LIVE-001 published assets verified with exact media types");
  } finally {
    await Promise.allSettled([video.body?.cancel(), poster.body?.cancel()]);
  }
}

async function verifyBrowser(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  const sameOriginFailures = [];
  const pageErrors = [];
  const baseOrigin = baseUrl.origin;

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const locationUrl = message.location().url;
    if (!locationUrl || locationUrl.startsWith(baseOrigin)) sameOriginFailures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(baseOrigin) && response.status() >= 400) {
      sameOriginFailures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  await page.route(/https:\/\/maps\.google\./, (route) => route.abort());

  try {
    const landingUrl = new URL("index.html", baseUrl);
    landingUrl.searchParams.set("live-smoke", `${expectedBuild}-${Date.now()}`);
    await page.goto(landingUrl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(".hero h1").waitFor({ state: "visible", timeout: 15000 });
    await page.locator('html[data-offline-ready="true"]').waitFor({ state: "attached", timeout: 15000 });

    const publishedBuild = await page.locator('meta[name="robys-build"]').getAttribute("content");
    if (publishedBuild !== expectedBuild) throw new Error(`Browser received build ${publishedBuild ?? "missing"}`);

    const mobileCta = page.locator(".mobile-cta");
    if (!(await mobileCta.isVisible())) throw new Error("Mobile CTA is not visible at 390px");
    if ((await mobileCta.locator("a").count()) !== 2) throw new Error("Mobile CTA must expose exactly two links");

    const mapSrc = await page.locator(".map-live-frame").getAttribute("src");
    if (!mapSrc?.includes("output=embed")) throw new Error("Embedded map source is invalid");

    const sourceValue = await page.locator(".hero-video source").getAttribute("src");
    const publishedHeroFetch = sourceValue ? fetchReference(sourceValue, "published hero source") : null;
    if (publishedHeroFetch !== ACTIVE_HERO_FETCH) {
      throw new Error(`Published hero source drifted: ${publishedHeroFetch ?? "missing"}`);
    }

    const videoState = await page.locator(".hero-video").evaluate(async (video) => {
      video.muted = true;
      try {
        await video.play();
      } catch {
        return { started: false, mediaErrorCode: video.error?.code ?? null, readyState: video.readyState };
      }
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !(video.currentTime > 0 && !video.paused)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return {
        started: !video.paused && video.currentTime > 0,
        currentTime: video.currentTime,
        readyState: video.readyState,
        mediaErrorCode: video.error?.code ?? null,
      };
    });
    if (!videoState.started) throw new Error(`Hero video did not start: code=${videoState.mediaErrorCode}, ready=${videoState.readyState}`);

    const menuUrl = new URL("menu.html", baseUrl);
    menuUrl.searchParams.set("live-smoke", `${expectedBuild}-${Date.now()}`);
    await page.goto(menuUrl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(".full-menu-item").first().waitFor({ state: "visible", timeout: 15000 });
    const initialItems = await page.locator(".full-menu-item").count();
    if (initialItems < 20) throw new Error(`Full menu rendered only ${initialItems} products`);

    const search = page.locator("#menu-search");
    await search.fill("Lotus");
    await page.waitForTimeout(150);
    const filteredText = await page.locator("#menu-root").innerText();
    if (!/Lotus/i.test(filteredText)) throw new Error("Menu search did not return Lotus");
    await search.press("Escape");
    if ((await search.inputValue()) !== "") throw new Error("Escape did not clear menu search");
    if ((await page.locator(".full-menu-item").count()) < initialItems) throw new Error("Menu did not restore after clearing search");

    await page.locator('.lang-button[data-lang="en"]').click();
    if ((await page.locator("html").getAttribute("lang")) !== "en") throw new Error("Language switch did not update html lang");
    await page.reload({ waitUntil: "domcontentloaded" });
    if ((await page.locator("html").getAttribute("lang")) !== "en") throw new Error("Language choice did not persist after reload");

    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(" | ")}`);
    if (sameOriginFailures.length) throw new Error(`Same-origin browser failures: ${sameOriginFailures.join(" | ")}`);

    console.log(`LIVE-001 browser journey verified: items=${initialItems}, videoTime=${videoState.currentTime}`);
  } finally {
    await context.close();
  }
}

let browser;
let lastError;
try {
  browser = await chromium.launch({ headless: true });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptReport = { attempt, startedAt: new Date().toISOString() };
    try {
      await verifyPublishedFiles();
      await verifyBrowser(browser);
      attemptReport.passed = true;
      attemptReport.verdict = "LIVE_JOURNEY_VERIFIED";
      report.attempts.push(attemptReport);
      report.passed = true;
      report.completedAt = new Date().toISOString();
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(JSON.stringify(report, null, 2));
      console.log("✅ LIVE-001 passed: the published site and customer journeys work in a real browser.");
      process.exitCode = 0;
      break;
    } catch (error) {
      lastError = error;
      attemptReport.passed = false;
      attemptReport.verdict = "LIVE_ATTEMPT_FAILED";
      report.attempts.push(attemptReport);
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.warn(`LIVE-001 attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
} finally {
  await browser?.close();
}

if (!report.passed) {
  report.completedAt = new Date().toISOString();
  report.finalVerdict = "LIVE_SMOKE_FAILED";
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  throw lastError ?? new Error("[LIVE-001] Live smoke failed");
}
