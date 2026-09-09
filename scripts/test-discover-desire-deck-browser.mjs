import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4198;
const base = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  stdio: "ignore"
});

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
    reducedMotion: "reduce",
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
        current: { temperature_2m: 24, precipitation: 0, weather_code: 1 }
      })
    });
  });

  await page.goto(`${base}discover.html?entry=off`, { waitUntil: "networkidle" });
  await page.locator('[data-lang="ru"]').click();
  await page.locator("#discover-desire-deck").waitFor({ state: "visible" });

  const cards = page.locator(".discover-desire-card");
  assert.equal(await cards.count(), 2, "P0 deck must expose exactly the two real active journeys");
  assert.deepEqual(
    await cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.journeyId)),
    ["cool-lime-macaron", "iced-san-sebastian"],
    "Existing Discover recommendation must stay first while the alternate remains visible"
  );

  const first = cards.nth(0);
  const second = cards.nth(1);
  assert.equal(await first.evaluate((node) => getComputedStyle(node).position), "sticky");
  assert.equal(await second.evaluate((node) => getComputedStyle(node).position), "sticky");
  const tops = await cards.evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).top)));
  assert.ok(tops[1] > tops[0], `Second card must stack below the first: ${JSON.stringify(tops)}`);

  assert.equal(await page.locator("#pairing-card").isHidden(), true, "Legacy pairing card hides only after deck enhancement succeeds");
  assert.match(await second.locator("h3").innerText(), /Айс-латте.*Сан-Себастьян/i);
  assert.match(await second.locator(".discover-desire-card-footer span").innerText(), /Открыть десерт/i);
  assert.ok((await second.getAttribute("href"))?.endsWith("menu.html#desserts"));
  assert.match(await second.locator(".discover-desire-card-footer strong").innerText(), /370/);

  await second.scrollIntoViewIfNeeded();
  const overlap = await cards.evaluateAll((nodes) => {
    const a = nodes[0].getBoundingClientRect();
    const b = nodes[1].getBoundingClientRect();
    return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  });
  assert.ok(overlap > 40, `Cards must visibly stack during native scroll: overlap=${overlap}`);

  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);
  await context.close();
  console.log("discover desire deck browser contract: PASS");
} finally {
  await browser?.close();
  server.kill();
}
