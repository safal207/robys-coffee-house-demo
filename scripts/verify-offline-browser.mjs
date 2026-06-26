import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const expectedSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

try {
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  const downloadLink = page.locator("a.android-download-button[data-apk-download='direct']");
  await downloadLink.waitFor({ state: "visible" });
  await page.locator(".android-app-screen-pill img[src*='android-mark.svg']").waitFor({ state: "visible" });

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
