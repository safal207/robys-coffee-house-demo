import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const editablePairTitle = "Айс латте + Чизкейк Сан-Себастьян";
async function assertSavedEditablePair(page) {
  const draft = await page.evaluate(async () => {
    const [{ readLatestStoredOrderDraft }, { menuCategories }] = await Promise.all([
      import("./src/order-draft.js"), import("./menu-catalog.js")
    ]);
    const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const ids = new Set(menuCategories.flatMap(category =>
      (category.items ?? category.groups.flatMap(group => group.items)).map(item => `${category.id}:${item.id ?? slug(item.name.en)}`)));
    return readLatestStoredOrderDraft(ids);
  });
  const items = [{ id: "cold-coffee:iced-caffe-latte", quantity: 1 }, { id: "desserts:san-sebastian-cheesecake", quantity: 1 }];
  assert.deepEqual(draft.groups.map(({ source, quantity, items }) => ({ source, quantity, items })),
    [{ source: "menu", quantity: 1, items }], "The journey saves exactly one editable ordinary-product pair");
  assert.deepEqual(draft.lines, items, "San Sebastian is included once and no legacy offer SKU is added");
}

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

async function assertLocalizedSkipLinks(browser) {
  const labels = { tr: "İçeriğe geç", en: "Skip to content", ru: "Перейти к содержанию" };
  const languages = Object.keys(labels);
  for (const [index, initialLanguage] of languages.entries()) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, serviceWorkers: "block"
    });
    try {
      await context.addInitScript(language => localStorage.setItem("robys-language", language), initialLanguage);
      await context.route("https://api.open-meteo.com/**", route => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}discover.html?entry=off`, { waitUntil: "networkidle" });

      for (let offset = 0; offset <= languages.length; offset += 1) {
        const language = languages[(index + offset) % languages.length];
        if (offset > 0) await page.locator(`.lang-button[data-lang="${language}"]`).click();
        await page.waitForFunction(expected => document.documentElement.lang === expected, language);
        const skip = page.getByRole("link", { name: labels[language], exact: true });
        assert.equal(await skip.count(), 1,
          `LOC-001: ${language} skip link must have the localized accessible name after ${offset ? "switching" : "initial load"}`);
        assert.equal((await skip.textContent()).trim(), labels[language],
          `LOC-001: ${language} visible and accessible labels must agree`);
        assert.equal(await skip.getAttribute("href"), "#discover-main");
        assert.equal(await page.getByRole("main").getAttribute("id"), "discover-main");

        if (offset === 0) await page.keyboard.press("Tab");
        else await skip.focus();
        assert.equal(await skip.evaluate(node => node === document.activeElement), true,
          `LOC-001: ${language} skip link must be keyboard focusable and first on initial entry`);
        assert.equal(await skip.isVisible(), true, `LOC-001: Focused ${language} skip label must be visible`);
        const bounds = await skip.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0
          && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844,
          `LOC-001: Focused ${language} skip label must remain within the viewport`);
        if (offset === 0) await page.screenshot({ path: `${out}/discover-skip-${language}-390.png` });

        await page.evaluate(() => history.replaceState(null, "", location.pathname + location.search));
        await page.keyboard.press("Enter");
        await page.waitForURL(url => url.hash === "#discover-main");
      }
      assert.deepEqual(errors, [], `LOC-001: Unhandled browser errors: ${errors.join(" | ")}`);
    } finally {
      await context.close();
    }
  }
  console.log("LOC-001: Discover skip labels, accessible names and targets: 3 initial locales + 9 locale switches PASS");
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
  await assertLocalizedSkipLinks(browser);
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
  const previewPrice = preview.locator(".discover-deck-preview-price");
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
    : { text: /Cool Lime \+ макарон/i, price: "220 ₺" };
  assert.match(await preview.locator(".discover-deck-preview-name").innerText(), expectedPreview.text);
  assert.equal((await previewPrice.innerText()).trim(), expectedPreview.price);
  assert.equal(await preview.evaluate((node) => getComputedStyle(node).position), "sticky");

  await page.locator(".discover-deck-shell").scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `Deck must not create horizontal overflow: ${overflow}px`);

  const [menuLinkBox, secondaryActionBox, previewBox, priceBox, viewportHeight] = await Promise.all([
    menuLink.boundingBox(),
    page.locator("#mark-discovered").boundingBox(),
    preview.boundingBox(),
    previewPrice.boundingBox(),
    page.evaluate(() => window.innerHeight)
  ]);
  assert.ok(menuLinkBox && secondaryActionBox && previewBox && priceBox, "Both actions, next-card preview and price must be measurable");
  const menuLinkBottom = menuLinkBox.y + menuLinkBox.height;
  assert.ok(
    menuLinkBottom + 8 <= previewBox.y,
    `Next-card preview must stay clear of primary CTA: CTA bottom ${menuLinkBottom.toFixed(1)}px, preview top ${previewBox.y.toFixed(1)}px`
  );
  assert.ok(secondaryActionBox.y + secondaryActionBox.height + 8 <= previewBox.y,
    "Next-card preview must also stay clear of the secondary discovery action");
  const visiblePreviewHeight = Math.max(
    0,
    Math.min(viewportHeight, previewBox.y + previewBox.height) - Math.max(0, previewBox.y)
  );
  assert.ok(
    visiblePreviewHeight >= 64,
    `Next-card preview must visibly signal another journey on 390px: only ${visiblePreviewHeight.toFixed(1)}px visible`
  );
  assert.ok(
    priceBox.y >= 0 && priceBox.y + priceBox.height <= viewportHeight - 4,
    `Next-card price must be fully visible on 390px: price bottom ${(priceBox.y + priceBox.height).toFixed(1)}px, viewport ${viewportHeight}px`
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
  assert.match(await page.locator("#pairing-card").ariaSnapshot(), /Цена:\s*370\s*₺/,
    "The settled poster must expose the catalog price in the accessible card");

  const currentMenuLink = await menuLink.getAttribute("href");
  assert.equal(
    currentMenuLink,
    "menu.html?product=pairing-offers%3Aiced-san-sebastian-pairing#pairing-offers",
    "San Sebastian journey must hand off to the selected pairing"
  );

  await menuLink.click();
  await page.waitForURL(/menu\.html\?product=/);
  await page.locator("#menu-product-dialog").waitFor({ state: "visible", timeout: 5000 });
  await page.waitForFunction(expectedTitle => {
    const dialog = document.querySelector("#menu-product-dialog");
    const title = document.querySelector("#menu-product-title")?.textContent ?? "";
    return dialog?.hasAttribute("open") && title === expectedTitle;
  }, editablePairTitle);
  assert.equal(await page.locator('input[name="menu-dessert"][value="desserts:san-sebastian-cheesecake"]').isChecked(), true);
  assert.match(await page.locator("#menu-product-price").innerText(), /370\s*₺/);

  await page.locator("#menu-add-to-cart").click();
  await page.locator("#menu-cart-dialog").waitFor({ state: "visible" });
  assert.equal(Number(await page.locator("#menu-cart-count").textContent()), 1, "Journey must end in one editable pairing cart line");
  assert.equal(Number(await page.locator("#menu-cart-dialog .menu-cart-line-controls span").textContent()), 1);
  await page.waitForFunction(() => document.activeElement === document.querySelector("#menu-cart-title"));
  assert.equal(await page.locator("#menu-cart-added-summary").isVisible(), true, "Adding the pairing must show persistent confirmation");
  assert.match(await page.locator("#menu-cart-added-summary").innerText(), /Айс латте \+ Чизкейк Сан-Себастьян/i);
  await assertSavedEditablePair(page);
  assert.equal(await page.locator("#menu-checkout-trigger").isEnabled(), true, "The next checkout action must be available");
  assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0, "Adding a pairing must not automatically create its QR");
  assert.equal(
    Number((await page.locator("#menu-cart-dialog-total").innerText()).replace(/\D/g, "")),
    370,
    "Discover → product → editable pair must retain the verified 370 ₺ total"
  );

  await page.screenshot({ path: `${out}/discover-to-cart-390.png` });

  // The separate dessert → pair bridge remains useful when a guest starts
  // from the dessert itself, even though Discover now opens the pair directly.
  await page.goto(`${base}menu.html?product=desserts%3Asan-sebastian-cheesecake#desserts`, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-product-dialog").waitFor({ state: "visible", timeout: 5000 });
  assert.match(await page.locator("#menu-product-price").innerText(), /190\s*₺/);
  const reveal = page.locator(".menu-product-reveal-control");
  const bridge = page.locator(".menu-product-pairing-bridge");
  await bridge.waitFor({ state: "visible" });
  assert.equal(await reveal.count(), 1, "The product reveal runtime must have mounted");
  assert.equal(await reveal.isHidden(), true, "Identical catalog and fallback photos must not promise another angle");
  assert.equal(await page.locator(".menu-product-reveal-image").isHidden(), true);
  assert.match(await bridge.innerText(), /Айс-латте \+ чизкейк Сан-Себастьян/i);
  assert.match(await bridge.innerText(), /370\s*₺/);
  await page.locator(".menu-product-pairing-action").click();
  await page.waitForFunction(expectedTitle => document.querySelector("#menu-product-title")?.textContent === expectedTitle, editablePairTitle);
  assert.equal(await reveal.isHidden(), true, "Pairing product must not inherit dessert reveal controls");
  assert.deepEqual(errors, [], `Unhandled browser errors: ${errors.join(" | ")}`);

  await context.close();
  console.log("discover deck → product → pairing → order confirmation browser smoke: PASS");
} finally {
  await browser?.close();
  server.kill();
}
