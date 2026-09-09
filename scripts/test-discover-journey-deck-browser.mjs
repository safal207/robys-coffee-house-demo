import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4199;
const base = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Deck test server did not become ready");
}

async function stubWeather(page) {
  await page.route("https://api.open-meteo.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 24, precipitation: 0, weather_code: 1 }
      })
    });
  });
}

try {
  await waitForServer();
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
  await stubWeather(page);
  await page.goto(`${base}discover.html?entry=off`, { waitUntil: "networkidle" });

  const cards = page.locator(".journey-deck-card");
  await cards.first().waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await cards.count(), 2, "Discover must render exactly two verified journey cards");

  const ids = await page.locator(".journey-deck-item").evaluateAll((nodes) => nodes.map((node) => node.dataset.journeyId));
  assert.deepEqual(ids, ["cool-lime-macaron", "iced-san-sebastian"]);

  const images = await cards.locator("img").evaluateAll((nodes) => nodes.map((node) => new URL(node.src).pathname));
  assert.deepEqual(images, [
    "/src/products/sets-v1/cool-lime-macaron.webp",
    "/src/products/sets-v1/iced-san-sebastian.webp"
  ]);

  const sticky = await page.locator(".journey-deck-item").evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return { position: style.position, top: Number.parseFloat(style.top) };
  }));
  assert.equal(sticky[0].position, "sticky");
  assert.equal(sticky[1].position, "sticky");
  assert.equal(Math.round(sticky[1].top - sticky[0].top), 16, "Deck cards must retain a 16 px stacked reveal");

  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    "Journey deck must not introduce horizontal overflow"
  );

  assert.equal(await cards.first().getAttribute("aria-pressed"), "true");
  await cards.nth(1).focus();
  await page.keyboard.press("Enter");
  await page.locator('#pairing-products[data-pairing-id="iced-san-sebastian"]').waitFor({ state: "attached" });
  const selected = page.locator('[data-journey-select="iced-san-sebastian"][aria-pressed="true"]');
  await selected.waitFor({ state: "attached" });
  await page.waitForFunction(() => document.activeElement?.dataset?.journeySelect === "iced-san-sebastian");
  assert.equal(await selected.evaluate((node) => document.activeElement === node), true, "Keyboard focus must survive deck rerender");

  assert.deepEqual(errors, [], `Unhandled deck browser errors: ${errors.join(" | ")}`);
  await context.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    serviceWorkers: "block"
  });
  const reducedPage = await reducedContext.newPage();
  await stubWeather(reducedPage);
  await reducedPage.goto(`${base}discover.html?entry=off`, { waitUntil: "networkidle" });
  await reducedPage.locator(".journey-deck-card").first().waitFor({ state: "visible", timeout: 5000 });
  const reducedPositions = await reducedPage.locator(".journey-deck-item").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).position));
  assert.deepEqual(reducedPositions, ["relative", "relative"], "Reduced motion must disable sticky deck behavior");
  await reducedContext.close();

  console.log("discover journey deck browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
