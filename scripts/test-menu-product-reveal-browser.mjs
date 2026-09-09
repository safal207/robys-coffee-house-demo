import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 4197;
const base = `http://127.0.0.1:${port}/`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  stdio: "ignore"
});

async function revealTo(page, value) {
  const control = page.locator(".menu-product-reveal-control");
  await control.waitFor({ state: "visible", timeout: 5000 });
  await control.evaluate((node, nextValue) => {
    node.value = String(nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  return control;
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

  const control = await revealTo(page, 35);
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
  assert.equal(
    await page.locator(".menu-product-visual").evaluate((node) => (
      node.style.getPropertyValue("--menu-reveal-position").trim()
    )),
    "35%",
    "Range interaction must move the reveal boundary"
  );
  assert.match(await control.getAttribute("aria-valuetext"), /65%/);

  const bridge = page.locator(".menu-product-pairing-bridge");
  await bridge.waitFor({ state: "visible" });
  assert.match(await bridge.innerText(), /Айс-латте \+ чизкейк Сан-Себастьян/i);
  assert.match(await bridge.innerText(), /370\s*₺/);
  assert.match(await page.locator(".menu-product-pairing-action").innerText(), /Посмотреть сочетание/i);

  await page.keyboard.press("Escape");
  await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });

  const lotus = page.locator(
    '[data-product-id="desserts:lotus-cheesecake"] .full-menu-item-media'
  );
  await lotus.click();
  await page.locator("#menu-product-dialog").waitFor({ state: "visible" });
  assert.equal(await control.isHidden(), true, "Reveal control must hide for Lotus cheesecake");
  assert.equal(await bridge.isHidden(), true, "Pairing bridge must hide for Lotus cheesecake");
  assert.equal(
    await page.locator(".menu-product-visual").getAttribute("data-menu-reveal-active"),
    null,
    "Non-mapped products must not retain reveal state"
  );

  await page.keyboard.press("Escape");
  await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });

  await sanSebastian.click();
  await page.locator("#menu-product-dialog").waitFor({ state: "visible" });
  await revealTo(page, 35);
  await page.locator(".menu-product-pairing-action").click();

  await page.waitForFunction(() => {
    const dialog = document.querySelector("#menu-product-dialog");
    const title = document.querySelector("#menu-product-title")?.textContent ?? "";
    return dialog?.hasAttribute("open") && title.includes("Айс-латте + чизкейк Сан-Себастьян");
  });

  assert.match(await page.locator("#menu-product-title").innerText(), /Айс-латте \+ чизкейк Сан-Себастьян/i);
  assert.match(await page.locator("#menu-product-price").innerText(), /370\s*₺/);
  assert.equal(await control.isHidden(), true, "Pairing product must not inherit dessert reveal controls");
  assert.equal(await bridge.isHidden(), true, "Pairing product must not recursively show the pairing bridge");

  await page.locator("#menu-add-to-cart").click();
  assert.equal(Number(await page.locator("#menu-cart-count").innerText()), 1, "Pairing must add as one existing catalog line");
  await page.locator("#menu-cart-trigger").click();
  await page.locator("#menu-cart-dialog").waitFor({ state: "visible" });
  assert.equal(
    Number((await page.locator("#menu-cart-dialog-total").innerText()).replace(/\D/g, "")),
    370,
    "Pairing bridge must reuse the existing 370 ₺ cart item without double-adding San Sebastian"
  );

  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);
  await context.close();
  console.log("menu product reveal + pairing browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
