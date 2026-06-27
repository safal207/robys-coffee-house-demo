import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const browserMessages = [];
page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));

try {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  const baseLink = page.locator("a.android-download-button");
  await baseLink.waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".android-app-screen-pill img[src*='android-mark.svg']").waitFor({ state: "visible" });

  try {
    await page.waitForFunction(() => document.querySelector("a.android-download-button")?.dataset.apkDownload === "verified-blob", null, { timeout: 15000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const link = document.querySelector("a.android-download-button");
      return {
        secureContext: window.isSecureContext,
        hasCrypto: Boolean(window.crypto),
        hasSubtle: Boolean(window.crypto?.subtle),
        link: link ? {
          href: link.getAttribute("href"),
          ariaDisabled: link.getAttribute("aria-disabled"),
          ariaBusy: link.getAttribute("aria-busy"),
          dataApkDownload: link.getAttribute("data-apk-download")
        } : null,
        status: document.querySelector("#android-download-status")?.textContent ?? null
      };
    });
    throw new Error(`APK link was not prepared. Diagnostics: ${JSON.stringify(diagnostics)}. Browser messages: ${JSON.stringify(browserMessages)}`, { cause: error });
  }

  const downloadLink = page.locator("a.android-download-button[data-apk-download='verified-blob']");
  const downloadPromise = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "robys-coffee-house-v1.1.apk");
  const downloadPath = await download.path();
  assert.ok(downloadPath, "APK download did not create a file");
  const apk = await readFile(downloadPath);
  assert.equal(apk.length, 25231, "Downloaded APK byte size changed");
  assert.equal(apk.subarray(0, 2).toString("ascii"), "PK", "Downloaded file is not an APK/ZIP");
  assert.equal(createHash("sha256").update(apk).digest("hex"), expectedSha256, "Downloaded APK checksum changed");

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#menu-root")?.children.length > 0);

  await context.setOffline(true);
  await page.goto(`${baseUrl}/missing-offline-check`, { waitUntil: "domcontentloaded" });
  await page.locator(".offline-code").waitFor({ state: "visible" });
  assert.match(await page.locator("h1").textContent(), /Нет интернета/i);

  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#menu-root")?.children.length > 0);
  await page.locator("#menu-search").fill("latte");
  assert.ok(await page.locator("#menu-root").innerText(), "Offline menu search produced no content");

  console.log("✅ Offline browser gate passed: Android APK downloads and the cached menu works behind the 404 fallback.");
} finally {
  await context.setOffline(false).catch(() => {});
  await context.close();
  await browser.close();
}
