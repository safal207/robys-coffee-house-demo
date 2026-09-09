import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4198;
const base = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  stdio: "ignore"
});

const weatherPayload = JSON.stringify({
  current: { temperature_2m: 24, precipitation: 0, weather_code: 1 }
});

async function stubWeather(page) {
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: weatherPayload
  }));
}

let browser;
try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await stubWeather(page);

  await page.goto(`${base}discover.html`, { waitUntil: "networkidle" });
  await page.locator('#journey-deck[data-ready="true"]').waitFor();
  await page.locator('[data-lang="ru"]').click();

  const cards = page.locator(".journey-deck-card");
  assert.equal(await cards.count(), 2, "P0 deck must render exactly two verified journeys");
  assert.deepEqual(
    (await cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.journeyId))).sort(),
    ["cool-lime-macaron", "iced-san-sebastian"].sort()
  );

  const sticky = await cards.evaluateAll((nodes) => nodes.map((node) => ({
    position: getComputedStyle(node).position,
    top: parseFloat(getComputedStyle(node).top)
  })));
  assert.ok(sticky.every((entry) => entry.position === "sticky"), JSON.stringify(sticky));
  assert.ok(sticky[1].top > sticky[0].top, `second card must leave a visible first-card edge: ${JSON.stringify(sticky)}`);

  const sanCard = page.locator('[data-journey-id="iced-san-sebastian"]');
  const sanLink = sanCard.locator(".journey-deck-cta");
  assert.match(await sanLink.getAttribute("href"), /product=desserts%3Asan-sebastian-cheesecake/);
  await sanLink.click();
  await page.waitForURL(/menu\.html\?product=desserts%3Asan-sebastian-cheesecake#desserts/);
  await page.locator("#menu-product-dialog").waitFor({ state: "visible" });
  await page.locator(".menu-product-reveal-control").waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await page.locator(".menu-product-visual").getAttribute("data-menu-reveal-active"),
    "true",
    "San Sebastian deck path must land on the existing reveal"
  );
  assert.equal(
    requests.some((path) => path.endsWith("/menu-product-reveal-runtime.js")),
    true,
    "San Sebastian deck path must lazy-load reveal runtime"
  );

  requests.length = 0;
  await page.goto(`${base}discover.html`, { waitUntil: "networkidle" });
  await page.locator('#journey-deck[data-ready="true"]').waitFor();
  const coolCard = page.locator('[data-journey-id="cool-lime-macaron"]');
  const coolLink = coolCard.locator(".journey-deck-cta");
  assert.match(await coolLink.getAttribute("href"), /product=pairing-offers%3Acool-lime-macaron-pairing/);
  await coolLink.click();
  await page.waitForURL(/menu\.html\?product=pairing-offers%3Acool-lime-macaron-pairing#pairing-offers/);
  await page.locator("#menu-product-dialog").waitFor({ state: "visible" });
  assert.equal(
    requests.some((path) => path.endsWith("/menu-product-reveal-runtime.js")),
    false,
    "Cool Lime pairing must not pay the San Sebastian reveal runtime cost"
  );
  assert.equal(
    await page.locator(".menu-product-reveal-control").count(),
    0,
    "Cool Lime pairing must not inherit reveal controls"
  );

  await page.locator("#menu-add-to-cart").click();
  assert.equal(Number(await page.locator("#menu-cart-count").innerText()), 1);
  assert.equal(
    Number((await page.locator("#menu-cart-total").innerText()).replace(/\D/g, "")),
    290,
    "Cool Lime deck path must reuse the real 290 ₺ pairing price"
  );

  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);
  await context.close();

  const landscape = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
    serviceWorkers: "block"
  });
  const landscapePage = await landscape.newPage();
  const landscapeErrors = [];
  landscapePage.on("pageerror", (error) => landscapeErrors.push(error.message));
  await stubWeather(landscapePage);
  await landscapePage.goto(`${base}discover.html`, { waitUntil: "networkidle" });
  await landscapePage.locator('#journey-deck[data-ready="true"]').waitFor();
  const landscapeCards = landscapePage.locator(".journey-deck-card");
  assert.equal(await landscapeCards.count(), 2);
  const fallback = await landscapeCards.evaluateAll((nodes) => nodes.map((node) => ({
    position: getComputedStyle(node).position,
    top: getComputedStyle(node).top
  })));
  assert.ok(
    fallback.every((entry) => entry.position === "relative" && entry.top === "auto"),
    `short landscape must disable sticky stacking: ${JSON.stringify(fallback)}`
  );
  for (const cta of await landscapePage.locator(".journey-deck-cta").all()) {
    await cta.scrollIntoViewIfNeeded();
    const box = await cta.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 390, `landscape CTA must be fully reachable: ${JSON.stringify(box)}`);
  }
  const overflow = await landscapePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `landscape deck must not create horizontal overflow: ${overflow}px`);
  assert.deepEqual(landscapeErrors, [], `Landscape browser errors: ${landscapeErrors.join(" | ")}`);
  await landscape.close();

  console.log("discover journey deck browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
