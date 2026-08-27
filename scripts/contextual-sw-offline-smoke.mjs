import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.CONTEXTUAL_SW_PORT ?? 4192);
const baseUrl = `http://127.0.0.1:${port}/`;
const resultsDir = path.resolve(process.env.CONTEXTUAL_SW_RESULTS_DIR ?? "visual-results/contextual-sw");

function assert(condition, message) {
  if (!condition) throw new Error(`[MOTION-CONTEXT-SW-001] ${message}`);
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

async function waitForController(page) {
  await page.evaluate(async () => {
    if (!navigator.serviceWorker) throw new Error("Service workers unavailable");
    await navigator.serviceWorker.ready;
  });

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    if (controlled) return;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(120);
  }
  throw new Error("Service worker never controlled the page");
}

rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

const server = startServer();
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "no-preference",
    serviceWorkers: "allow"
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}?entry=off`, { waitUntil: "domcontentloaded" });
  await waitForController(page);

  const registrationEvidence = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      activeState: registration.active?.state ?? "missing",
      offlineReady: document.documentElement.dataset.offlineReady ?? ""
    };
  });
  assert(registrationEvidence.controlled, "Page is not controlled before offline transition");
  assert(registrationEvidence.activeState === "activated", `Worker state is ${registrationEvidence.activeState}`);

  await context.setOffline(true);
  await page.goto(`${baseUrl}?entry=day`, { waitUntil: "domcontentloaded" });
  await page.locator(".robys-contextual-entry.robys-day-entry").waitFor({ state: "visible", timeout: 2_000 });

  const offlineEvidence = await page.evaluate(() => ({
    online: navigator.onLine,
    controlled: Boolean(navigator.serviceWorker?.controller),
    scene: document.documentElement.dataset.robysEntryScene ?? "",
    poseCount: document.documentElement.dataset.robysEntryPoseCount ?? "",
    family: document.documentElement.dataset.robysEntryFamily ?? "",
    state: document.documentElement.dataset.robysEntryState ?? "",
    moduleEntry: performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("day-night-entry.js"))
      .map((entry) => ({ name: entry.name, transferSize: entry.transferSize, duration: entry.duration }))
  }));

  assert(offlineEvidence.online === false, "Browser did not enter offline mode");
  assert(offlineEvidence.controlled, "Service worker controller was lost offline");
  assert(offlineEvidence.scene === "day", `Offline contextual scene is ${offlineEvidence.scene}`);
  assert(offlineEvidence.poseCount === "20", `Offline contextual pose count is ${offlineEvidence.poseCount}`);
  assert(offlineEvidence.family === "contextual-v1", `Offline contextual family is ${offlineEvidence.family}`);
  assert(offlineEvidence.moduleEntry.length > 0, "Offline page did not request the contextual lazy module");

  await page.screenshot({
    path: path.join(resultsDir, "day-offline-precache.png"),
    animations: "allow"
  });

  await page.locator('html[data-robys-entry-state="done"]').waitFor({ state: "attached", timeout: 3_200 });
  assert(await page.locator(".robys-contextual-entry").count() === 0, "Offline contextual overlay remained after handoff");

  const evidence = { registration: registrationEvidence, offline: offlineEvidence };
  writeFileSync(path.join(resultsDir, "contextual-sw-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);

  await context.close();
  console.log("✅ MOTION-CONTEXT-SW-001 passed: installed/activated service worker controls the page and serves the contextual Day entry plus lazy module from the precache while the browser is offline.");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
