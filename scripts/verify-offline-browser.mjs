import assert from "node:assert/strict";
import { chromium } from "playwright";
import { verifyMenuStabilityLegacyWorker } from "./menu-stability-cache-proof.mjs";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";

async function waitForServiceWorker(context, timeout = 30000) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;
  return context.waitForEvent("serviceworker", { timeout });
}

async function waitForControlledPage(page, label, timeout = 15000) {
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker?.controller),
    undefined,
    { timeout }
  ).catch((error) => {
    throw new Error(`Timed out waiting for service-worker control during ${label}`, { cause: error });
  });
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {})
});
const context = await browser.newContext();
const page = await context.newPage();
const browserMessages = [];

page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));

try {
  await verifyMenuStabilityLegacyWorker(browser);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  const legacyCacheIsolation = await page.evaluate(async () => {
    const cacheName = "robys-test-legacy-smart-choice-v40";
    const cache = await caches.open(cacheName);
    const smartChoiceRoot = new URL("smart-choice/", location.href);
    const legacyFiles = ["app.js", "cart.js", "experiments.js", "analytics.js", "decision-trace.js", "simulator.js"];
    const cacheNewFiles = legacyFiles.map((file) => file.replace(".js", "-v2.js"));
    const entryPathPairs = [
      ["bootstrap.js", "bootstrap-v2.js"],
      ["morning-entry.js", "morning-entry-v2.js"],
      ["styles.css", "styles-v2.css"],
      ["menu-security.css", "menu-security-v2.css"]
    ];
    await Promise.all(legacyFiles.map((file) => cache.put(
      new Request(new URL(`${file}?v=legacy`, smartChoiceRoot)),
      new Response(`legacy:${file}`, { headers: { "Content-Type": "text/javascript" } })
    )));
    await Promise.all(entryPathPairs.map(([legacyFile]) => cache.put(
      new Request(new URL(`${legacyFile}?v=legacy`, location.href)),
      new Response(`legacy:${legacyFile}`)
    )));
    const collisions = [];
    for (const file of cacheNewFiles) {
      const matched = await cache.match(new Request(new URL(`${file}?v=current`, smartChoiceRoot)), { ignoreSearch: true });
      if (matched) collisions.push(file);
    }
    for (const [, cacheNewFile] of entryPathPairs) {
      const matched = await cache.match(new Request(new URL(`${cacheNewFile}?v=current`, location.href)), { ignoreSearch: true });
      if (matched) collisions.push(cacheNewFile);
    }
    await caches.delete(cacheName);
    return collisions;
  });
  assert.deepEqual(legacyCacheIsolation, [], "Cache-new entry or Smart Choice paths collided with legacy ignoreSearch entries");
  assert.equal(
    await page.locator(".android-app-section, .mobile-install-section, a[download$='.apk'], link[rel='manifest']").count(),
    0,
    "The web-only homepage must not offer installation"
  );

  await page.locator("html[data-offline-ready='true']").waitFor({ state: "attached", timeout: 15000 });
  const worker = await waitForServiceWorker(context);
  assert.match(worker.url(), /\/sw\.js(?:\?|$)/, "Unexpected service worker script URL");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForControlledPage(page, "home page reload");

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root > *").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("html[data-offline-ready='true']").waitFor({ state: "attached", timeout: 15000 });
  await waitForControlledPage(page, "menu page bootstrap");

  await context.setOffline(true);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  await page.locator(".hero-actions a[href='menu.html']").waitFor({ state: "visible", timeout: 15000 });
  assert.equal(
    await page.locator(".android-app-section, .mobile-install-section, a[download$='.apk'], link[rel='manifest']").count(),
    0,
    "Cached homepage must not revive the install offer"
  );
  await page.goto(`${baseUrl}/missing-offline-check`, { waitUntil: "domcontentloaded" });
  await page.locator(".offline-code").waitFor({ state: "visible", timeout: 15000 });
  assert.match(await page.locator("h1").textContent(), /Нет интернета/i);

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root > *").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#menu-search").fill("latte");
  assert.match(await page.locator("#menu-root").innerText(), /latte/i, "Offline menu search did not return latte items");

  await page.goto(`${baseUrl}/smart-choice/`, { waitUntil: "domcontentloaded" });
  await page.locator("#smart-choice-app[aria-busy='false']").waitFor({ state: "visible", timeout: 15000 });
  assert.match(await page.title(), /Roby's Smart Choice/, "Offline Smart Choice route returned the wrong page");

  const fatalMessages = browserMessages.filter((message) => /pageerror|TrustedScript|offline mode could not start/i.test(message));
  assert.deepEqual(fatalMessages, [], `Browser emitted fatal offline errors: ${JSON.stringify(fatalMessages)}`);
  console.log("✅ Offline browser gate passed: cached homepage, menu search and Smart Choice remain usable without an install offer.");
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
}
