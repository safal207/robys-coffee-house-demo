import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const expectedBytes = 25231;

async function waitForOfflineRuntime(page) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.endsWith("/menu.html")) {
      try {
        const ready = await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration("./");
          if (!registration) return false;
          await navigator.serviceWorker.ready;
          return Boolean(navigator.serviceWorker.controller);
        });
        if (ready) return;
      } catch {
        // The registration bridge may be navigating back to the menu.
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Offline runtime did not take control. Current URL: ${page.url()}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const messages = [];
page.on("console", (message) => messages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  const link = page.locator("a.android-download-button[data-apk-download='verified-blob']");
  await link.waitFor({ state: "visible", timeout: 30000 });
  await page.locator(".android-download-logo img[src*='android-mark.svg']").waitFor({ state: "visible" });
  assert.match(await link.getAttribute("href"), /^blob:/, "Verified APK link is not backed by a Blob URL");
  assert.equal(await link.getAttribute("aria-disabled"), null, "Verified APK link is still disabled");

  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "robys-coffee-house-v1.1.apk");
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, "APK click did not create a downloaded file");
  const downloadedApk = await readFile(downloadedPath);
  assert.equal(downloadedApk.length, expectedBytes, "Clicked APK byte size changed");
  assert.equal(downloadedApk.subarray(0, 2).toString("ascii"), "PK", "Clicked file is not an APK/ZIP");
  assert.equal(createHash("sha256").update(downloadedApk).digest("hex"), expectedSha256, "Clicked APK checksum changed");

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await waitForOfflineRuntime(page);
  await page.locator("#menu-root .full-menu-item").first().waitFor({ state: "visible", timeout: 15000 });

  await context.setOffline(true);
  await page.goto(`${baseUrl}/missing-offline-check`, { waitUntil: "domcontentloaded" });
  await page.locator(".offline-code").waitFor({ state: "visible" });
  assert.match(await page.locator("h1").textContent(), /Нет интернета/i);

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root .full-menu-item").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#menu-search").fill("latte");
  assert.ok(await page.locator("#menu-root").innerText(), "Offline menu search produced no content");

  console.log(`✅ Android click and offline menu browser contract passed for ${expectedSha256.slice(0, 12)}…`);
} catch (error) {
  throw new Error(`${error.message}. Browser messages: ${JSON.stringify(messages)}`, { cause: error });
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
}
