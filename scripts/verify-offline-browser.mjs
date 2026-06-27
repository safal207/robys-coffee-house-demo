import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const expectedBytes = 25231;
const directApkUrl = new URL("../downloads/robys-coffee-house-v1.1.apk", import.meta.url);

async function stageReviewedApk() {
  const parts = [];
  for (let index = 1; index <= 6; index += 1) {
    const path = new URL(`../downloads/android-v1.1/part-${String(index).padStart(2, "0")}.b64`, import.meta.url);
    parts.push(await readFile(path, "utf8"));
  }
  const apk = Buffer.from(parts.join("").replace(/\s+/g, ""), "base64");
  assert.equal(apk.length, expectedBytes, "Reconstructed APK byte size changed");
  assert.equal(createHash("sha256").update(apk).digest("hex"), expectedSha256, "Reconstructed APK checksum changed");
  await writeFile(directApkUrl, apk);
}

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
        // The bridge may be navigating back to menu.html.
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`Offline runtime did not take control. Current URL: ${page.url()}`);
}

await stageReviewedApk();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const browserMessages = [];
page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  const downloadLink = page.locator("a.android-download-button[data-apk-download='direct-apk']");
  await downloadLink.waitFor({ state: "visible", timeout: 15000 });
  const androidIcon = page.locator("a.android-download-button .android-download-icon");
  await androidIcon.waitFor({ state: "visible" });
  assert.match(await androidIcon.evaluate((element) => getComputedStyle(element).backgroundImage), /android-mark\.svg/, "Android mark is not rendered on the download button");

  const downloadPromise = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "robys-coffee-house-v1.1.apk");
  const downloadPath = await download.path();
  assert.ok(downloadPath, "APK download did not create a file");
  const apk = await readFile(downloadPath);
  assert.equal(apk.length, expectedBytes, "Downloaded APK byte size changed");
  assert.equal(apk.subarray(0, 2).toString("ascii"), "PK", "Downloaded file is not an APK/ZIP");
  assert.equal(createHash("sha256").update(apk).digest("hex"), expectedSha256, "Downloaded APK checksum changed");

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await waitForOfflineRuntime(page);
  await page.locator("#menu-root > *").first().waitFor({ state: "attached", timeout: 15000 });

  await context.setOffline(true);
  await page.goto(`${baseUrl}/missing-offline-check`, { waitUntil: "domcontentloaded" });
  await page.locator(".offline-code").waitFor({ state: "visible" });
  assert.match(await page.locator("h1").textContent(), /Нет интернета/i);

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root > *").first().waitFor({ state: "attached", timeout: 15000 });
  await page.locator("#menu-search").fill("latte");
  assert.ok(await page.locator("#menu-root").innerText(), "Offline menu search produced no content");

  console.log("✅ Offline browser gate passed: the real Android button downloads the reviewed APK and the cached menu works behind the 404 fallback.");
} catch (error) {
  throw new Error(`${error.message}. Browser messages: ${JSON.stringify(browserMessages)}`, { cause: error });
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
}
