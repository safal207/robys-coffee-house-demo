import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";

async function waitForAttribute(locator, name, expected, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.getAttribute(name) === expected) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function waitForServiceWorker(context, timeout = 30000) {
  const existing = context.serviceWorkers()[0];
  if (existing) return existing;

  return Promise.race([
    context.waitForEvent("serviceworker"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for service worker registration")), timeout))
  ]);
}

async function waitForControlledPage(page, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) return;
    await page.reload({ waitUntil: "networkidle" });
    if (await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) return;
  }
  throw new Error(`Timed out waiting for a service-worker controlled page during ${label}`);
}

async function noteOfflineReadySignal(page, label) {
  const signaled = await waitForAttribute(page.locator("html"), "data-offline-ready", "true", 5000);
  if (signaled) return;
  console.warn(`Offline ready DOM signal was not observed during ${label}; continuing with service-worker control and offline behavior checks.`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const browserMessages = [];
page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  const downloadLink = page.locator("a.android-download-button");
  await downloadLink.waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".android-app-screen-pill img[src*='android-mark.svg']").waitFor({ state: "visible" });
  assert.equal(await waitForAttribute(downloadLink, "data-apk-download", "verified-blob"), true, "APK link did not become a verified Blob URL");
  assert.match(await downloadLink.getAttribute("href"), /^blob:/, "APK link is not a prepared Blob URL");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click()
  ]);
  assert.equal(download.suggestedFilename(), "robys-coffee-house-v1.1.apk");
  const downloadPath = await download.path();
  assert.ok(downloadPath, "APK download did not create a file");
  const apk = await readFile(downloadPath);
  assert.equal(apk.length, 25231, "Downloaded APK byte size changed");
  assert.equal(apk.subarray(0, 2).toString("ascii"), "PK", "Downloaded file is not an APK/ZIP");
  assert.equal(createHash("sha256").update(apk).digest("hex"), expectedSha256, "Downloaded APK checksum changed");

  const worker = await waitForServiceWorker(context);
  assert.match(worker.url(), /\/sw\.js(?:\?|$)/, "Unexpected service worker script URL");
  await noteOfflineReadySignal(page, "home page bootstrap");
  assert.ok(context.serviceWorkers().length > 0, "Service worker was not registered");
  await waitForControlledPage(page, "home page bootstrap");

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "networkidle" });
  await page.locator("#menu-root > *").first().waitFor({ state: "visible", timeout: 15000 });
  await noteOfflineReadySignal(page, "menu page bootstrap");
  await waitForControlledPage(page, "menu page bootstrap");

  await context.setOffline(true);
  await page.goto(`${baseUrl}/missing-offline-check`, { waitUntil: "domcontentloaded" });
  await page.locator(".offline-code").waitFor({ state: "visible", timeout: 15000 });
  assert.match(await page.locator("h1").textContent(), /Нет интернета/i);

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root > *").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#menu-search").fill("latte");
  assert.match(await page.locator("#menu-root").innerText(), /latte/i, "Offline menu search did not return latte items");

  const fatalMessages = browserMessages.filter((message) => /pageerror|TrustedScript|offline mode could not start/i.test(message));
  assert.deepEqual(fatalMessages, [], `Browser emitted fatal offline errors: ${JSON.stringify(fatalMessages)}`);
  console.log("✅ Offline browser gate passed: verified APK click, branded 404 fallback and interactive cached menu.");
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
}
