import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
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

  await page.waitForTimeout(780);
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

  console.log("✅ MOTION-ENTRY-001 passed: cold/warm, force/off, skip, handoff, and reduced-motion paths are deterministic.");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
