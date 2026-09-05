import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const expectedSha256 = "9850bd12d07d87dc6eca71d1b64f40c8d3953445855ca65b653bd46d37a53d19";

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
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const browserMessages = [];
const apkPartRequests = [];

page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));
page.on("request", (request) => {
  if (/\/downloads\/android-v1\.2\/part-\d+\.b64(?:\?|$)/.test(request.url())) {
    apkPartRequests.push(request.url());
  }
});

try {
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
  const downloadLink = page.locator("a.android-download-button");
  await downloadLink.waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".android-app-screen-pill img[src*='android-mark.svg']").waitFor({ state: "visible" });

  await page.waitForTimeout(300);
  assert.equal(
    apkPartRequests.length,
    0,
    `APK parts must stay lazy before user intent, saw ${JSON.stringify(apkPartRequests)}`
  );
  assert.equal(await downloadLink.getAttribute("data-apk-download"), null, "APK must not be prepared before user intent");
  assert.doesNotMatch(await downloadLink.getAttribute("href") ?? "", /^blob:/, "APK Blob URL appeared before user intent");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    downloadLink.click()
  ]);

  const uniqueApkParts = new Set(apkPartRequests.map((url) => new URL(url).pathname));
  assert.equal(uniqueApkParts.size, 6, `Expected six APK parts after click, got ${JSON.stringify([...uniqueApkParts])}`);
  assert.equal(await downloadLink.getAttribute("data-apk-download"), "verified-blob");
  assert.match(await downloadLink.getAttribute("href"), /^blob:/, "APK link is not a prepared Blob URL");
  assert.equal(download.suggestedFilename(), "robys-coffee-house-v1.2.apk");
  const downloadPath = await download.path();
  assert.ok(downloadPath, "APK download did not create a file");
  const apk = await readFile(downloadPath);
  assert.equal(apk.length, 1086268, "Downloaded APK byte size changed");
  assert.equal(apk.subarray(0, 2).toString("ascii"), "PK", "Downloaded file is not an APK/ZIP");
  assert.equal(createHash("sha256").update(apk).digest("hex"), expectedSha256, "Downloaded APK checksum changed");

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
  console.log("✅ Offline browser gate passed: APK stays lazy until click, verified download works, and cached menu plus Smart Choice remain interactive offline.");
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
}
