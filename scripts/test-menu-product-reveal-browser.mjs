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

  const bridge = page.locator(".menu-product-pairing-bridge");
  await bridge.waitFor({ state: "visible" });
  const control = page.locator(".menu-product-reveal-control");
  assert.equal(
    requests.some((path) => path.endsWith("/menu-product-reveal-runtime.js")),
    true,
    "Reveal runtime must load after San Sebastian is opened"
  );
  assert.equal(await control.isHidden(), true, "Identical approved photos must not expose a misleading alternate-angle slider");
  assert.equal(await page.locator(".menu-product-reveal-image").isHidden(), true);
  assert.equal(await page.locator(".menu-product-reveal-cue").isHidden(), true);
  await page.locator("#menu-product-image").evaluate(image => image.decode());
  assert.equal(
    await page.locator(".menu-product-visual").getAttribute("data-menu-reveal-active"),
    null,
    "The catalog photo remains the only active product view"
  );
  assert.equal(
    await page.locator(".menu-product-visual").evaluate((node) => (
      node.style.getPropertyValue("--menu-reveal-position").trim()
    )),
    "",
    "A single photo must not retain a clipping boundary"
  );
  assert.equal(requests.some(path => path.endsWith("/src/products/san-sebastian.webp")), false,
    "Single-photo mode must not download a duplicate overlay image");
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
  await bridge.waitFor({ state: "visible" });
  await page.locator(".menu-product-pairing-action").click();

  await page.locator("#menu-product-dialog[open] #menu-product-title")
    .filter({ hasText: "Айс-латте + чизкейк Сан-Себастьян" }).waitFor({ state: "visible" });

  assert.match(await page.locator("#menu-product-title").innerText(), /Айс-латте \+ чизкейк Сан-Себастьян/i);
  assert.match(await page.locator("#menu-product-price").innerText(), /370\s*₺/);
  assert.equal(await control.isHidden(), true, "Pairing product must not inherit dessert reveal controls");
  assert.equal(await bridge.isHidden(), true, "Pairing product must not recursively show the pairing bridge");

  await page.locator("#menu-add-to-cart").click();
  assert.equal(Number(await page.locator("#menu-cart-count").innerText()), 1, "Pairing must add as one existing catalog line");
  await page.locator("#menu-cart-dialog[open]").waitFor({ state: "visible" });
  assert.equal(await page.locator("#menu-cart-title").innerText(), "Добавлено в заказ");
  assert.match(await page.locator("#menu-cart-added-summary").innerText(), /Айс-латте \+ чизкейк Сан-Себастьян.*× 1.*370\s*₺/i);
  assert.equal(await page.getByRole("button", { name: "Получить QR для кассы", exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Выбрать ещё", exact: true }).isVisible(), true);
  assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0, "Adding must not implicitly create a QR checkout");
  assert.equal(
    Number((await page.locator("#menu-cart-dialog-total").innerText()).replace(/\D/g, "")),
    370,
    "Pairing bridge must reuse the existing 370 ₺ cart item without double-adding San Sebastian"
  );
  await page.getByRole("button", { name: "Выбрать ещё", exact: true }).click();
  await page.locator("#menu-cart-dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator('[data-product-id="pairing-offers:iced-san-sebastian-pairing"] .full-menu-item-media')
    .evaluate(node => document.activeElement === node), true, "Continue browsing returns focus to the chosen pairing");

  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);
  await context.close();
  console.log("menu product reveal + pairing browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
