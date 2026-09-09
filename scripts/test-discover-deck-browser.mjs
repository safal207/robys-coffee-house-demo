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
  const menuLink = page.locator("#pairing-menu-link");
  await preview.waitFor({ state: "visible" });

  const currentBefore = await products.getAttribute("data-pairing-id");
  const previewBefore = await preview.getAttribute("data-journey-id");
  assert.ok(currentBefore, "Discover must expose the currently selected journey");
  assert.ok(previewBefore, "Deck must expose the alternate active journey");
  assert.notEqual(currentBefore, previewBefore, "Preview must not duplicate the active journey");
  await waitForRenderedPoster(page, currentBefore);
  await products.screenshot({ path: `${out}/discover-deck-poster-current.png` });

  const expectedPreview = previewBefore === "iced-san-sebastian"
    ? { text: /Айс-латте \+ чизкейк Сан-Себастьян/i, price: "370 ₺" }
    : { text: /Cool Lime \+ макарон/i, price: "290 ₺" };
  assert.match(await preview.locator(".discover-deck-preview-name").innerText(), expectedPreview.text);
  assert.equal((await preview.locator(".discover-deck-preview-price").innerText()).trim(), expectedPreview.price);
  assert.equal(await preview.evaluate((node) => getComputedStyle(node).position), "sticky");

  await page.locator(".discover-deck-shell").scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `Deck must not create horizontal overflow: ${overflow}px`);

  const [menuLinkBox, previewBox] = await Promise.all([
    menuLink.boundingBox(),
    preview.boundingBox()
  ]);
  assert.ok(menuLinkBox && previewBox, "Primary CTA and next-card preview must be measurable");
  const menuLinkBottom = menuLinkBox.y + menuLinkBox.height;
  assert.ok(
    menuLinkBottom + 8 <= previewBox.y,
    `Next-card preview must stay clear of primary CTA: CTA bottom ${menuLinkBottom.toFixed(1)}px, preview top ${previewBox.y.toFixed(1)}px`
  );
  await page.screenshot({ path: `${out}/discover-deck-390.png` });

  await preview.click();
  await page.waitForFunction(
    (expected) => document.querySelector("#pairing-products")?.dataset.pairingId === expected,
    previewBefore
  );
  await waitForRenderedPoster(page, previewBefore);
  await products.screenshot({ path: `${out}/discover-deck-poster-next.png` });

  const currentAfter = await products.getAttribute("data-pairing-id");
  const previewAfter = await preview.getAttribute("data-journey-id");
  assert.equal(currentAfter, previewBefore, "Deck preview must delegate to the existing next-pairing selection");
  assert.equal(previewAfter, currentBefore, "Deck must expose the previous journey as the new alternate");
  assert.equal(currentAfter, "iced-san-sebastian", "Fresh P0 deck must be able to switch to the San Sebastian journey");

  const currentMenuLink = await menuLink.getAttribute("href");
  assert.equal(
    currentMenuLink,
    "menu.html?product=desserts%3Asan-sebastian-cheesecake#desserts",
    "San Sebastian journey must hand off to the concrete dessert product"
  );

  await menuLink.click();
  await page.waitForURL(/menu\.html\?product=/);
  await page.locator("#menu-product-dialog").waitFor({ state: "visible", timeout: 5000 });
  assert.match(await page.locator("#menu-product-title").innerText(), /Сан-Себастьян/i);
  assert.match(await page.locator("#menu-product-price").innerText(), /190\s*₺/);

  const reveal = page.locator(".menu-product-reveal-control");
  await reveal.waitFor({ state: "visible", timeout: 5000 });
  await reveal.evaluate((node) => {
    node.value = "35";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.match(await reveal.getAttribute("aria-valuetext"), /65%/);

  const bridge = page.locator(".menu-product-pairing-bridge");
  await bridge.waitFor({ state: "visible" });
  assert.match(await bridge.innerText(), /Айс-латте \+ чизкейк Сан-Себастьян/i);
  assert.match(await bridge.innerText(), /370\s*₺/);
  await page.locator(".menu-product-pairing-action").click();

  await page.waitForFunction(() => {
    const dialog = document.querySelector("#menu-product-dialog");
    const title = document.querySelector("#menu-product-title")?.textContent ?? "";
    return dialog?.hasAttribute("open") && title.includes("Айс-латте + чизкейк Сан-Себастьян");
  });
  assert.match(await page.locator("#menu-product-price").innerText(), /370\s*₺/);
  assert.equal(await reveal.isHidden(), true, "Pairing product must not inherit dessert reveal controls");

  await page.locator("#menu-add-to-cart").click();
  assert.equal(Number(await page.locator("#menu-cart-count").innerText()), 1, "Journey must end in one existing pairing cart line");
  await page.locator("#menu-cart-trigger").click();
  await page.locator("#menu-cart-dialog").waitFor({ state: "visible" });
  assert.equal(
    Number((await page.locator("#menu-cart-dialog-total").innerText()).replace(/\D/g, "")),
    370,
    "Discover → reveal → pairing must reuse the existing 370 ₺ cart product"
  );

  await page.screenshot({ path: `${out}/discover-to-cart-390.png` });
  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);

  await context.close();
  console.log("discover deck → product → reveal → pairing → cart browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
