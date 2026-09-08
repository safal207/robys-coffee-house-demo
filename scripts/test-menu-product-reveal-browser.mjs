import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4197;
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
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));

  await page.goto(`${base}menu.html?entry=off`, { waitUntil: "networkidle" });
  await page.locator('[data-lang="ru"]').click();

  assert.equal(
    requests.some((path) => path.endsWith("/menu-product-reveal-runtime.js")),
    false,
    "Reveal runtime must not load on initial menu navigation"
  );

  const sanSebastian = page.locator(
    '[data-product-id="desserts:san-sebastian-cheesecake"] .full-menu-item-media'
  );
  await sanSebastian.scrollIntoViewIfNeeded();
  await sanSebastian.click();
  await page.locator("#menu-product-dialog").waitFor({ state: "visible" });

  const control = page.locator(".menu-product-reveal-control");
  await control.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    requests.some((path) => path.endsWith("/menu-product-reveal-runtime.js")),
    true,
    "Reveal runtime must load after San Sebastian is opened"
  );
  assert.match(await control.getAttribute("aria-label"), /другой ракурс/i);
  assert.equal(
    await page.locator(".menu-product-visual").getAttribute("data-menu-reveal-active"),
    "true"
  );

  await control.evaluate((node) => {
    node.value = "35";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(
    await page.locator(".menu-product-visual").evaluate((node) => (
      node.style.getPropertyValue("--menu-reveal-position").trim()
    )),
    "35%",
    "Range interaction must move the reveal boundary"
  );
  assert.match(await control.getAttribute("aria-valuetext"), /65%/);

  await page.keyboard.press("Escape");
  await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });

  const lotus = page.locator(
    '[data-product-id="desserts:lotus-cheesecake"] .full-menu-item-media'
  );
  await lotus.click();
  await page.locator("#menu-product-dialog").waitFor({ state: "visible" });
  assert.equal(await control.isHidden(), true, "Reveal control must hide for Lotus cheesecake");
  assert.equal(
    await page.locator(".menu-product-visual").getAttribute("data-menu-reveal-active"),
    null,
    "Non-mapped products must not retain reveal state"
  );

  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);
  await context.close();
  console.log("menu product reveal browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
