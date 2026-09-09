import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const out = resolve(process.env.DECK_RESULTS_DIR ?? ".artifacts/discover-deck");
mkdirSync(out, { recursive: true });

const port = 4198;
const base = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  stdio: "ignore"
});

async function waitForRenderedPoster(page, expectedJourneyId) {
  await page.waitForFunction((expected) => {
    const root = document.querySelector("#pairing-products");
    const figure = root?.querySelector("[data-pairing-poster]");
    const image = figure?.querySelector("img");
    return root?.dataset.pairingId === expected
      && figure?.dataset.pairingPoster === expected
      && image instanceof HTMLImageElement
      && image.complete
      && image.naturalWidth > 0
      && getComputedStyle(figure).visibility !== "hidden";
  }, expectedJourneyId, { timeout: 8000 });
}

let browser;
try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("https://api.open-meteo.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 22, precipitation: 0, weather_code: 0 }
      })
    });
  });

  await page.goto(`${base}discover.html?entry=off`, { waitUntil: "networkidle" });
  await page.locator('[data-lang="ru"]').click();
  await page.waitForFunction(() => document.querySelector("#weather-context")?.textContent.includes("🌤️"));
  await page.waitForFunction(() => Boolean(document.querySelector("#pairing-products")?.dataset.pairingId));

  const products = page.locator("#pairing-products");
  const preview = page.locator(".discover-deck-preview");
  await preview.waitFor({ state: "visible" });

  const currentBefore = await products.getAttribute("data-pairing-id");
  const previewBefore = await preview.getAttribute("data-journey-id");
  assert.ok(currentBefore, "Discover must expose the currently selected journey");
  assert.ok(previewBefore, "Deck must expose the alternate active journey");
  assert.notEqual(currentBefore, previewBefore, "Preview must not duplicate the active journey");
  await waitForRenderedPoster(page, currentBefore);

  const expectedPreview = previewBefore === "iced-san-sebastian"
    ? { text: /Айс-латте \+ чизкейк Сан-Себастьян/i, price: "370 ₺" }
    : { text: /Cool Lime \+ макарон/i, price: "290 ₺" };
  assert.match(await preview.locator(".discover-deck-preview-name").innerText(), expectedPreview.text);
  assert.equal((await preview.locator(".discover-deck-preview-price").innerText()).trim(), expectedPreview.price);
  assert.equal(await preview.evaluate((node) => getComputedStyle(node).position), "sticky");

  await page.locator(".discover-deck-shell").scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `Deck must not create horizontal overflow: ${overflow}px`);
  await page.screenshot({ path: `${out}/discover-deck-390.png` });

  await preview.click();
  await page.waitForFunction(
    (expected) => document.querySelector("#pairing-products")?.dataset.pairingId === expected,
    previewBefore
  );
  await waitForRenderedPoster(page, previewBefore);

  const currentAfter = await products.getAttribute("data-pairing-id");
  const previewAfter = await preview.getAttribute("data-journey-id");
  assert.equal(currentAfter, previewBefore, "Deck preview must delegate to the existing next-pairing selection");
  assert.equal(previewAfter, currentBefore, "Deck must expose the previous journey as the new alternate");

  const currentMenuLink = await page.locator("#pairing-menu-link").getAttribute("href");
  assert.ok(currentMenuLink?.startsWith("menu.html#"), "Existing Discover menu handoff must remain intact");
  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);

  await context.close();
  console.log("discover stacked deck browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
