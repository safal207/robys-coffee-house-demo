import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.CONTEXTUAL_ROUTING_PORT ?? 4193);
const baseUrl = `http://127.0.0.1:${port}/`;
const resultsDir = path.resolve(process.env.CONTEXTUAL_ROUTING_RESULTS_DIR ?? "visual-results/contextual-routing");

function assert(condition, message) {
  if (!condition) throw new Error(`[MOTION-CONTEXT-ROUTING-001] ${message}`);
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

async function installFixedHour(context, hour) {
  await context.addInitScript(({ fixedHour }) => {
    const RealDate = Date;
    const timestamp = new RealDate(2026, 7, 9, fixedHour, 0, 0, 0).getTime();
    class FixedDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [timestamp]));
      }
      static now() {
        return timestamp;
      }
    }
    globalThis.Date = FixedDate;
  }, { fixedHour: hour });
}

async function autoScene(browser, hour, expectedScene) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  await installFixedHour(context, hour);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const selector = expectedScene === "morning"
    ? ".robys-morning-entry"
    : `.robys-contextual-entry.robys-${expectedScene}-entry`;
  await page.locator(selector).waitFor({ state: "visible", timeout: 1_800 });

  const evidence = await page.evaluate(() => ({
    scene: document.documentElement.dataset.robysEntryScene ?? "",
    state: document.documentElement.dataset.robysEntryState ?? "",
    poseCount: document.documentElement.dataset.robysEntryPoseCount ?? ""
  }));
  assert(evidence.scene === expectedScene, `${hour}:00 routed to ${evidence.scene || "none"}, expected ${expectedScene}`);
  assert(evidence.state === "brand-frame", `${hour}:00 did not enter BRAND_FRAME`);
  assert(evidence.poseCount === "20", `${hour}:00 did not use 20-pose motion grammar`);

  await page.locator('html[data-robys-entry-state="done"]').waitFor({ state: "attached", timeout: 3_200 });
  await context.close();
  return evidence;
}

async function historyTraversalBypass(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  await context.addInitScript(() => {
    const originalGetEntriesByType = performance.getEntriesByType.bind(performance);
    Object.defineProperty(performance, "getEntriesByType", {
      configurable: true,
      value(type) {
        if (type === "navigation") return [{ type: "back_forward" }];
        return originalGetEntriesByType(type);
      }
    });
  });

  const page = await context.newPage();
  await page.goto(`${baseUrl}?entry=day`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(260);

  const evidence = await page.evaluate(() => ({
    morningOverlay: Boolean(document.querySelector(".robys-morning-entry")),
    contextualOverlay: Boolean(document.querySelector(".robys-contextual-entry")),
    scene: document.documentElement.dataset.robysEntryScene ?? "",
    inlineBackground: document.documentElement.style.backgroundColor
  }));
  assert(!evidence.morningOverlay && !evidence.contextualOverlay, "back_forward fixture replayed an entry overlay despite forced ?entry=day");
  assert(evidence.scene === "", `back_forward fixture exposed scene ${evidence.scene}`);
  assert(evidence.inlineBackground === "", `back_forward fixture left prepaint background ${evidence.inlineBackground}`);

  await page.screenshot({ path: path.join(resultsDir, "back-forward-forced-day-bypass.png") });
  await context.close();
  return evidence;
}

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

const server = startServer();
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const boundaries = {
    "05:00": await autoScene(browser, 5, "morning"),
    "12:00": await autoScene(browser, 12, "day"),
    "18:00": await autoScene(browser, 18, "night")
  };
  const history = await historyTraversalBypass(browser);

  writeFileSync(
    path.join(resultsDir, "contextual-routing-evidence.json"),
    `${JSON.stringify({ boundaries, history }, null, 2)}\n`
  );

  console.log("✅ MOTION-CONTEXT-ROUTING-001 passed: no-query boundaries route 05:00→Morning, 12:00→Day, 18:00→Night, and back_forward bypass wins over a forced Day override.");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
