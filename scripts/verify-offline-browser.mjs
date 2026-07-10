import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";

async function waitForAttribute(locator, name, expected, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.getAttribute(name) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${name}=${expected}`);
}

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
page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "domcontentloaded" });
  const downloadLink = page.locator("a.android-download-button");
  await downloadLink.waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".android-app-screen-pill img[src*='android-mark.svg']").waitFor({ state: "visible" });
  await waitForAttribute(downloadLink, "data-apk-download", "verified-blob");
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

  const fatalMessages = browserMessages.filter((message) => /pageerror|TrustedScript|offline mode could not start/i.test(message));
  assert.deepEqual(fatalMessages, [], `Browser emitted fatal offline errors: ${JSON.stringify(fatalMessages)}`);
  console.log("✅ Offline browser gate passed: verified APK click, branded 404 fallback and interactive cached menu.");
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
}
