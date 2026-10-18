import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { menuCategories, menuCopy } from "../menu-catalog.js";

const sweetIds = [
  "desserts:san-sebastian-cheesecake", "desserts:lotus-cheesecake", "desserts:raspberry-cheesecake",
  "desserts:chocolate-cake", "desserts:almond-tart", "desserts:cake-roll", "desserts:mosaic-cake",
  "desserts:tiramisu", "desserts:brownie", "desserts:cookie", "desserts:macaron", "food:nutella-croissant"
];
const copy = {
  tr: { legend: "İçeceğinin yanına tatlı", drinkOnly: "Sadece içecek", addPair: "Çifti siparişe ekle", quantity: "Çift adedi" },
  en: { legend: "Sweet with your drink", drinkOnly: "Just the drink", addPair: "Add pair to order", quantity: "Number of pairs" },
  ru: { legend: "Сладкое к напитку", drinkOnly: "Только напиток", addPair: "Добавить пару в заказ", quantity: "Количество пар" }
};
const confirmationCopy = {
  tr: { title: "Siparişine eklendi", checkout: "Kasa için QR oluştur", more: "Başka bir şey seç" },
  en: { title: "Added to your order", checkout: "Get QR for the counter", more: "Choose something else" },
  ru: { title: "Добавлено в заказ", checkout: "Получить QR для кассы", more: "Выбрать ещё" }
};

// Expectations come from the catalog, independently of the pairing domain/view.
const products = new Map();
for (const category of menuCategories) {
  for (const item of category.items ?? category.groups.flatMap((group) => group.items)) {
    const slug = item.name.en.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `${category.id}:${item.id ?? slug}`;
    products.set(id, { id, category, item, image: item.image ?? `src/products/menu-v1/${category.id}--${slug}.webp` });
  }
}
const hot = [...products.values()].filter((product) => ["hot-coffee", "brew-hot", "herbal-tea"].includes(product.category.id));
const espresso = products.get("hot-coffee:espresso");
const dessert = products.get(sweetIds[0]);
const existing = products.get("refreshers:cool-lime");
const money = (text) => Number((String(text).match(/\d[\d\s.,\u00a0\u202f]*₺/g)?.at(-1) ?? "").replace(/\D/g, ""));
const imageMatches = (source, product) => new URL(source, "https://example.test/").pathname.endsWith(`/${product.image}`);
const entries = (draft) => draft.lines.map((line) => [line.id, line.quantity]).sort(([a], [b]) => a.localeCompare(b, "en"));
const sortedEntries = (lines) => lines.slice().sort(([a], [b]) => a.localeCompare(b, "en"));

// Node polling avoids waitForFunction's injected string evaluation under strict CSP
// in both the locked Playwright and the separately installed CI browser runner.
async function poll(read, accepts, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let actual;
  do {
    actual = await read();
    if (accepts(actual)) return actual;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.fail(`${message}; observed ${JSON.stringify(actual)}`);
}

async function cart(page) {
  return page.evaluate(async validIds => {
    const orders = await import("./src/order-draft.js");
    return orders.readLatestStoredOrderDraft(new Set(validIds));
  }, [...products.keys()]);
}

async function prepare(page, base, { language = "tr", fallback = false, seed } = {}) {
  if (fallback) {
    await page.addInitScript(() => {
      // Legacy dialog fallback lacks both methods and the native open property.
      for (const name of ["showModal", "close"]) Object.defineProperty(HTMLDialogElement.prototype, name, { configurable: true, value: undefined });
      Object.defineProperty(HTMLDialogElement.prototype, "open", { configurable: true, get: () => undefined });
    });
  }
  await page.addInitScript(() => {
    if (sessionStorage.getItem("qa-custom-pairing-seeded")) return;
    sessionStorage.setItem("qa-custom-pairing-seeded", "true");
    localStorage.removeItem("robys-menu-preferences.v1");
  });
  await page.goto(new URL("menu.html?entry=off", base).href, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root[data-ready='true']").waitFor({ state: "visible" });
  // These scenarios reuse one origin and IndexedDB across pages. Set each
  // scenario's starting basket through its production transaction boundary;
  // the read-only legacy v1 value is not a test reset API.
  await page.evaluate(async ({ draft, validIds }) => {
    const orders = await import("./src/order-draft.js");
    await orders.transactStoredOrderDraft(() => ({ draft, applied: true, blocked: false }), new Set(validIds));
  }, { draft: seed ?? { version: 1, groups: [], lines: [] }, validIds: [...products.keys()] });
  await page.locator(`.lang-button[data-lang="${language}"]`).click();
}

async function open(page, product, eligible = true) {
  const trigger = page.locator(`[data-product-id="${product.id}"] .full-menu-item-media`);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator("#menu-product-dialog[open]");
  await dialog.waitFor({ state: "visible" });
  const support = await dialog.evaluate((node) => ({
    fallback: node.classList.contains("menu-dialog--fallback"),
    openAttribute: node.hasAttribute("open"), openPropertyMissing: node.open === undefined,
    methodsMissing: typeof node.showModal !== "function" && typeof node.close !== "function"
  }));
  assert.equal(support.openAttribute, true, "dialog exposes its actual open state through the attribute");
  if (support.fallback) assert.equal(support.openPropertyMissing && support.methodsMissing, true, "legacy fallback is exercised without native dialog methods or open property");
  if (eligible) await poll(() => page.locator("#menu-pairing-picker").getAttribute("data-ready"), (value) => value === "true", `${product.id}: picker is ready`);
  // Fallback focus is scheduled for the next animation frame. On reopening,
  // picker readiness is synchronous and does not imply focus has moved yet.
  // Verify the actual focus boundary before sending modal keyboard input.
  await poll(() => dialog.evaluate((node) => node.contains(document.activeElement)), Boolean,
    `${product.id}: opening moves focus inside the dialog`);
  return trigger;
}

async function close(page, trigger, escape = false) {
  if (escape) await page.keyboard.press("Escape");
  else await page.locator('#menu-product-dialog [data-menu-dialog-close="product"]').click();
  await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
  assert.equal(await trigger.evaluate((node) => document.activeElement === node), true, "closing returns focus to the drink");
}

async function addAndConfirm(page) {
  const language = await page.locator("html").getAttribute("lang");
  const text = confirmationCopy[language];
  const chosenName = await page.locator("#menu-product-title").textContent();
  const chosenQuantity = await page.locator("#menu-product-quantity").textContent();
  const chosenTotal = money(await page.locator("#menu-add-to-cart").textContent());
  await page.locator("#menu-add-to-cart").click();
  await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
  await page.locator("#menu-cart-dialog[open]").waitFor({ state: "visible" });
  assert.equal(await page.locator("#menu-cart-title").textContent(), text.title);
  const summary = await page.locator("#menu-cart-added-summary").textContent();
  assert.equal(await page.locator("#menu-cart-added-summary").isVisible(), true);
  assert.equal(summary.includes(`${chosenName} × ${chosenQuantity}`), true, "confirmation preserves the chosen composition and quantity");
  assert.equal(money(summary), chosenTotal, "confirmation amount equals the explicit Add amount");
  assert.equal(await page.getByRole("button", { name: text.checkout, exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: text.more, exact: true }).isVisible(), true);
  await poll(() => page.locator("#menu-cart-title").evaluate(node => document.activeElement === node), Boolean,
    "confirmation heading receives focus after Add");
  assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0, "Add alone does not open checkout");
}

async function continueMenu(page, trigger) {
  const language = await page.locator("html").getAttribute("lang");
  await page.getByRole("button", { name: confirmationCopy[language].more, exact: true }).click();
  await page.locator("#menu-cart-dialog").waitFor({ state: "hidden" });
  if (trigger) assert.equal(await trigger.evaluate(node => document.activeElement === node), true,
    "Choose more returns focus to the product that was added");
}

async function choose(page, id) {
  const radio = page.locator(`#menu-pairing-picker input[name="menu-dessert"][value="${id}"]`);
  if (!await radio.locator("..").isVisible()) await page.locator(".menu-pairing-expand").click();
  await radio.locator("..").click();
  assert.equal(await radio.isChecked(), true);
  return radio;
}

async function assertPreview(page, drink, sweet, language) {
  const preview = page.locator("#menu-pairing-preview");
  await preview.waitFor({ state: "visible" });
  assert.equal(await page.locator("#menu-product-title").textContent(), `${drink.item.name[language]} + ${sweet.item.name[language]}`, "main title describes the complete selected pair");
  const quantity = Number(await page.locator("#menu-product-quantity").textContent());
  assert.equal(money(await page.locator("#menu-product-price").textContent()), (drink.item.price + sweet.item.price) * quantity, "primary total follows the selected quantity");
  assert.equal(money(await page.locator("#menu-product-unit-price").textContent()), drink.item.price + sweet.item.price, "unit price remains explicitly separate from the total");
  assert.equal(imageMatches(await page.locator("#menu-product-pair-image").getAttribute("src"), sweet), true, "large pair image shows the selected dessert");
  assert.equal(await preview.locator(".menu-pairing-preview-title").textContent(), `${drink.item.name[language]} + ${sweet.item.name[language]}`);
  assert.equal(money(await preview.locator(".menu-pairing-preview-total").textContent()), drink.item.price + sweet.item.price);
  const photos = await preview.locator("img").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
  assert.equal(photos.length, 2, "selected pair uses two existing product photos");
  assert.equal(imageMatches(photos[0], drink) && imageMatches(photos[1], sweet), true, "preview shows the current drink and selected dessert");
  assert.deepEqual(await preview.locator(".menu-pairing-figure-name").allTextContents(), [drink.item.name[language], sweet.item.name[language]]);
  assert.deepEqual((await preview.locator(".menu-pairing-unit-price").allTextContents()).map(money), [drink.item.price, sweet.item.price]);
  const announcement = page.locator(".menu-pairing-summary[aria-live='polite']");
  assert.equal(await announcement.getAttribute("aria-atomic"), "true");
  assert.equal(money(await announcement.textContent()), drink.item.price + sweet.item.price);
  return { drink: drink.id, dessert: sweet.id, photos, unitTotal: drink.item.price + sweet.item.price };
}

async function geometry(page, label) {
  await page.locator("#menu-pairing-preview").scrollIntoViewIfNeeded();
  await page.locator("#menu-pairing-preview img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const result = await page.locator("#menu-product-dialog").evaluate((dialog) => {
    const shell = dialog.querySelector(".menu-dialog-shell");
    const bounds = dialog.getBoundingClientRect();
    const rect = (node) => {
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const images = [...dialog.querySelectorAll("#menu-pairing-preview img")].map((node) => ({ ...rect(node), loaded: node.naturalWidth > 0 }));
    const clippedText = [];
    for (const node of dialog.querySelectorAll("h2, #menu-product-price, #menu-pairing-preview h3, #menu-pairing-preview figcaption, .menu-pairing-preview-total, .menu-pairing-summary, #menu-add-to-cart")) {
      const content = node.closest(".menu-product-content, .menu-product-actions").getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((part) => part.left < content.left - 1 || part.right > content.right + 1)) clippedText.push(node.textContent);
    }
    return {
      viewport: document.documentElement.clientWidth,
      overflow: dialog.scrollWidth > dialog.clientWidth + 1 || shell.scrollWidth > shell.clientWidth + 1 ||
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      insideViewport: bounds.left >= -1 && bounds.right <= document.documentElement.clientWidth + 1,
      photos: images,
      sideBySide: images.length === 2 && images.every((image) => image.loaded && image.width > 0 && image.height > 0) &&
        Math.abs(images[0].top - images[1].top) <= 1 && images[0].right <= images[1].left + 1,
      photosSeparate: images.length === 2 && images.every((image) => image.loaded && image.width > 0 && image.height > 0) &&
        (images[0].right <= images[1].left + 1 || images[0].bottom <= images[1].top + 1),
      actionHeight: dialog.querySelector("#menu-add-to-cart").getBoundingClientRect().height,
      optionsTouchable: [...dialog.querySelectorAll(".menu-pairing-option:not([hidden])")].every((node) => node.getBoundingClientRect().height >= 43.5),
      clippedText
    };
  });
  assert.equal(result.overflow, false, `${label}: the complete dialog must not overflow horizontally`);
  assert.equal(result.insideViewport, true, `${label}: dialog stays inside the viewport`);
  assert.equal(result.photosSeparate, true, `${label}: both decoded product photos remain separate after reflow`);
  assert.equal(result.actionHeight >= 43.5 && result.optionsTouchable, true, `${label}: action and dessert choices reach44px height`);
  assert.deepEqual(result.clippedText, [], `${label}: names, amounts and actions remain readable`);
  // Scrollable dialogs must expose each caption/amount, including enlarged text;
  // a sticky purchase action cannot count as success when it paints over them.
  const reachability = [];
  const readable = page.locator("#menu-product-price, #menu-product-dialog #menu-pairing-preview figcaption, #menu-product-dialog .menu-pairing-preview-total, #menu-product-dialog .menu-pairing-summary, #menu-quantity-label, #menu-product-dialog .menu-quantity-stepper");
  for (let index = 0; index < await readable.count(); index++) {
    const node = readable.nth(index);
    await node.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const measured = await node.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const shell = element.closest(".menu-dialog-shell").getBoundingClientRect();
      const region = element.closest(".menu-product-main, .menu-product-actions").getBoundingClientRect();
      const action = document.querySelector("#menu-add-to-cart").getBoundingClientRect();
      const overlap = Math.min(bounds.right, action.right) - Math.max(bounds.left, action.left) > 1 &&
        Math.min(bounds.bottom, action.bottom) - Math.max(bounds.top, action.top) > 1;
      return { text: element.textContent, top: bounds.top, bottom: bounds.bottom,
        clipTop: Math.max(shell.top, region.top, 0), clipBottom: Math.min(shell.bottom, region.bottom, innerHeight), overlap };
    });
    assert.equal(measured.top >= measured.clipTop - 1 && measured.bottom <= measured.clipBottom + 1, true, `${label}: ${measured.text} is reachable in the dialog scroll area: ${JSON.stringify(measured)}`);
    assert.equal(measured.overlap, false, `${label}: the purchase action does not cover ${measured.text}`);
    reachability.push(measured);
  }
  return { label, ...result, reachability };
}

async function headingVisibility(page, label) {
  const title = page.locator("#menu-product-title");
  await title.scrollIntoViewIfNeeded();
  const initial = await title.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const photo = document.querySelector(".menu-product-visual").getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      text: element.textContent,
      photoOverlap: Math.min(bounds.right, photo.right) - Math.max(bounds.left, photo.left) > 1 &&
        Math.min(bounds.bottom, photo.bottom) - Math.max(bounds.top, photo.top) > 1,
      lineCount: [...range.getClientRects()].filter((line) => line.width > 0 && line.height > 0).length
    };
  });
  assert.equal(initial.photoOverlap, false, `${label}: product photo does not overlap its title`);
  assert.equal(initial.lineCount > 0, true, `${label}: product title has rendered text`);
  const lines = [];
  // Enlarged titles can be taller than the content viewport; each rendered line
  // must remain readable through scrolling rather than fit all at once.
  for (let index = 0; index < initial.lineCount; index++) {
    await title.evaluate((element, lineIndex) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const line = [...range.getClientRects()].filter((part) => part.width > 0 && part.height > 0)[lineIndex];
      const main = element.closest(".menu-product-main");
      const region = main.getBoundingClientRect();
      main.scrollTop += line.top + line.height / 2 - (region.top + region.height / 2);
    }, index);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const measured = await title.evaluate((element, lineIndex) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = [...range.getClientRects()].filter((part) => part.width > 0 && part.height > 0)[lineIndex];
      const region = element.closest(".menu-product-main").getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return {
        top: bounds.top, bottom: bounds.bottom, regionTop: region.top, regionBottom: region.bottom,
        paintedAtCenter: hit === element || element.contains(hit)
      };
    }, index);
    assert.equal(measured.top >= Math.max(measured.regionTop, 0) - 1 && measured.bottom <= Math.min(measured.regionBottom, await page.evaluate(() => innerHeight)) + 1, true, `${label}: title line ${index + 1} is reachable: ${JSON.stringify(measured)}`);
    assert.equal(measured.paintedAtCenter, true, `${label}: title line ${index + 1} is not obscured: ${JSON.stringify(measured)}`);
    lines.push(measured);
  }
  return { ...initial, lines };
}

export async function verifyMenuCustomPairing(context, base, check) {
  const run = async (id, label, scenario) => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    try {
      const evidence = await scenario(page, requests);
      assert.deepEqual(errors, [], `${label}: no unhandled browser exceptions`);
      check(id, true, label, { ...evidence, errors });
    } catch (error) { check(id, false, label, { error: String(error?.stack ?? error), errors }); }
    finally { await page.close().catch(() => {}); }
  };

  await run("CUSTOM-PAIRING-CATALOG-001", "all27 hot drinks and the two verified cold-pair drinks are eligible; other cold products and desserts remain ordinary", async (page, requests) => {
    assert.equal(hot.length, 27);
    assert.equal(sweetIds.length, 12);
    await prepare(page, base);
    assert.equal(requests.some((path) => path.endsWith("/menu-pairing.js")), false, "pairing view is absent from initial menu requests");
    for (const product of [products.get("cold-coffee:iced-americano"), dessert]) {
      const trigger = await open(page, product, false);
      assert.equal(await page.locator("#menu-pairing-picker").isHidden(), true);
      assert.equal(await page.locator("#menu-pairing-preview").isHidden(), true);
      await close(page, trigger);
    }
    assert.equal(requests.some((path) => path.endsWith("/menu-pairing.js")), false, "ordinary cold and dessert dialogs do not request pairing code");
    const eligible = [];
    for (const drink of [...hot, products.get("cold-coffee:iced-caffe-latte"), products.get("refreshers:cool-lime")]) {
      const trigger = await open(page, drink);
      const values = await page.locator('#menu-pairing-picker input[name="menu-dessert"]').evaluateAll((nodes) => nodes.map((node) => node.value));
      assert.deepEqual(values, ["", ...sweetIds], `${drink.id}: all12 sweets plus the optional drink-only choice`);
      assert.equal(await page.locator('input[name="menu-dessert"][value=""]').isChecked(), true);
      assert.equal(await page.locator("#menu-product-title").textContent(), drink.item.name.tr);
      assert.equal(money(await page.locator("#menu-product-price").textContent()), drink.item.price);
      assert.equal(imageMatches(await page.locator("#menu-product-image").getAttribute("src"), drink), true);
      const firstSweetPhoto = await page.locator(".menu-pairing-option").nth(1).locator("img").first().getAttribute("src");
      assert.equal(imageMatches(firstSweetPhoto, drink), true, "changing drinks refreshes the choice photos");
      eligible.push(drink.id);
      await close(page, trigger);
    }
    assert.equal(requests.filter((path) => path.endsWith("/menu-pairing.js")).length, 1, "one lazy module request serves all subsequent hot dialogs");
    return { eligible, choices: sweetIds, lazyViewRequests: 1 };
  });

  await run("CUSTOM-PAIRING-PHOTOS-001", "all12 sweet choices use actual catalog photos, names and summed prices", async (page) => {
    await prepare(page, base, { language: "ru" });
    const trigger = await open(page, espresso);
    const choices = [];
    for (const id of sweetIds) {
      const sweet = products.get(id);
      const radio = await choose(page, id);
      const option = radio.locator("..");
      assert.equal(await option.locator(".menu-pairing-name").textContent(), sweet.item.name.ru);
      assert.equal(money(await option.locator(".menu-pairing-price").textContent()), espresso.item.price + sweet.item.price);
      const photos = await option.locator("img").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
      assert.deepEqual(photos.map((source, index) => imageMatches(source, [espresso, sweet][index])), [true, true]);
      choices.push(await assertPreview(page, espresso, sweet, "ru"));
    }
    await choose(page, "");
    assert.equal(await page.locator("#menu-pairing-preview").isHidden(), true);
    assert.equal(money(await page.locator("#menu-add-to-cart").textContent()), espresso.item.price);
    await close(page, trigger, true);
    return { choices, deselectRestoresDrinkOnly: true };
  });

  for (const language of ["tr", "en", "ru"]) for (const fallback of [false, true]) {
    await run("CUSTOM-PAIRING-ORDER-001", `${language}/${fallback ? "fallback" : "native"}: quantity2 adds one pair group and preserves existing order`, async (page) => {
      const recommendation = { token: "existing-browser-draft", signature: "independent-existing-selection", lines: [{ id: existing.id, quantity: 1 }] };
      await prepare(page, base, { language, fallback, seed: { version: 1, lines: [{ id: existing.id, quantity: 3 }], recommendation } });
      const addedProductTrigger = await open(page, espresso);
      assert.equal(await page.locator("#menu-product-dialog").evaluate((node) => node.classList.contains("menu-dialog--fallback")), fallback);
      assert.equal(await page.locator("#menu-pairing-picker legend").textContent(), copy[language].legend);
      assert.equal(await page.locator(".menu-pairing-option").first().locator(".menu-pairing-name").textContent(), copy[language].drinkOnly);
      const noSweet = page.locator('input[name="menu-dessert"][value=""]');
      await noSweet.focus();
      await page.keyboard.press("ArrowRight");
      const selected = page.locator(`input[name="menu-dessert"][value="${dessert.id}"]`);
      assert.equal(await selected.isChecked(), true, "native radio ArrowRight selects the first dessert");
      assert.equal(await selected.evaluate((node) => document.activeElement === node), true, "selection updates preserve native radio focus");
      assert.equal(await selected.locator("..").evaluate((node) => getComputedStyle(node).outlineStyle !== "none"), true, "keyboard focus remains visible");
      await assertPreview(page, espresso, dessert, language);
      assert.equal(await page.locator("#menu-quantity-label").textContent(), copy[language].quantity);
      await page.locator("#menu-quantity-increase").click();
      assert.equal(await page.locator("#menu-product-quantity").textContent(), "2");
      assert.equal(money(await page.locator("#menu-add-to-cart").textContent()), (espresso.item.price + dessert.item.price) * 2);
      assert.equal(money(await page.locator("#menu-product-price").textContent()), (espresso.item.price + dessert.item.price) * 2, "primary and action totals agree");
      assert.equal((await page.locator("#menu-add-to-cart").textContent()).startsWith(copy[language].addPair), true);
      assert.equal(await page.locator("#menu-product-draft-note").textContent(), menuCopy[language].orderDraft);
      await page.locator("#menu-add-to-cart").focus();
      await page.keyboard.press("Tab");
      assert.equal(await page.locator('#menu-product-dialog [data-menu-dialog-close="product"]').evaluate((node) => document.activeElement === node), true, "Tab stays within the native/fallback dialog");
      await addAndConfirm(page);
      await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
      const draft = await cart(page);
      assert.deepEqual(entries(draft), sortedEntries([[existing.id, 3], [espresso.id, 2], [dessert.id, 2]]));
      assert.equal(draft.recommendation.token, recommendation.token);
      assert.equal(draft.recommendation.signature, recommendation.signature);
      assert.deepEqual(draft.recommendation.lines, recommendation.lines, "custom pairs preserve the existing recommendation contribution");
      const pair = draft.groups.find(group => group.items.some(item => item.id === espresso.id));
      assert.equal(pair.quantity, 2);
      assert.deepEqual(pair.items.map(item => item.id).sort(), [espresso.id, dessert.id].sort(), "pair identities remain together");
      assert.equal(Number(await page.locator("#menu-cart-count").textContent()), 5, "cart count counts selections, including each pair once");
      await page.locator("#menu-cart-dialog").waitFor({ state: "visible" });
      assert.equal(await page.locator(".menu-cart-line").count(), 3, "two migrated selections plus one grouped pair");
      const pairRow = page.locator(".menu-cart-line").filter({ hasText: espresso.item.name[language] });
      assert.equal(await pairRow.locator(".menu-cart-group-images img").count(), 2, "pair row preserves both product photos");
      assert.equal((await pairRow.textContent()).includes(dessert.item.name[language]), true);
      assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), existing.item.price * 3 + (espresso.item.price + dessert.item.price) * 2);
      await page.keyboard.press("Escape");
      await page.locator("#menu-cart-dialog").waitFor({ state: "hidden" });
      assert.equal(await addedProductTrigger.evaluate(node => document.activeElement === node), true,
        "Escape from confirmation returns focus to the drink");
      const trigger = await open(page, espresso);
      assert.equal(await page.locator(`input[name="menu-dessert"][value="${dessert.id}"]`).isChecked(), true, "reopening restores the chosen dessert in both dialog modes");
      assert.equal(await page.locator("#menu-product-quantity").textContent(), "2", "reopening restores quantity and clearly offers another selection");
      await close(page, trigger, true);
      assert.deepEqual(entries(await cart(page)), entries(draft), "Escape cancels the new draft without altering committed lines");
      return { language, fallback, draft, pairQuantity: 2 };
    });
  }

  await run("CUSTOM-PAIRING-RESET-001", "Escape, reopening, deselection, drink-only addition, Back and reload preserve only committed lines", async (page, requests) => {
    await prepare(page, base, { language: "ru" });
    let trigger = await open(page, espresso);
    await choose(page, dessert.id);
    await close(page, trigger, true);
    assert.deepEqual((await cart(page)).lines, [], "closing cancels an uncommitted pair");
    const otherDrink = products.get("brew-hot:black-tea");
    trigger = await open(page, otherDrink);
    assert.equal(await page.locator('input[name="menu-dessert"][value=""]').isChecked(), true);
    assert.equal(await page.locator("#menu-pairing-preview").isHidden(), true);
    assert.equal(await page.locator("#menu-product-quantity").textContent(), "1");
    await choose(page, dessert.id);
    await choose(page, "");
    assert.equal(await page.locator("#menu-quantity-label").textContent(), menuCopy.ru.quantity);
    await addAndConfirm(page);
    const committed = entries(await cart(page));
    assert.deepEqual(committed, [[otherDrink.id, 1]], "default/deselected choices add only the drink");
    await continueMenu(page, trigger);
    await page.locator(".menu-page-back").click();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.locator("#menu-root[data-ready='true']").waitFor({ state: "visible" });
    assert.deepEqual(entries(await cart(page)), committed, "Back preserves the committed order");
    requests.length = 0;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#menu-root[data-ready='true']").waitFor({ state: "visible" });
    assert.deepEqual(entries(await cart(page)), committed, "reload preserves the committed order");
    assert.equal(requests.some((path) => path.endsWith("/menu-pairing.js")), false, "reload keeps the pairing view lazy");
    trigger = await open(page, otherDrink);
    assert.equal(await page.locator('input[name="menu-dessert"][value=""]').isChecked(), true);
    await close(page, trigger, true);
    return { committed, reopenedChoiceMatchesLastPreference: true, backAndReloadPreserve: true };
  });

  await run("CUSTOM-PAIRING-GROUP-EDIT-001", "two drinks sharing one dessert stay separate pairs when edited or removed", async (page) => {
    await prepare(page, base, { language: "ru" });
    const tea = products.get("brew-hot:black-tea");
    for (const drink of [tea, espresso]) {
      const trigger = await open(page, drink);
      await choose(page, dessert.id);
      await addAndConfirm(page);
      await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
      await continueMenu(page, trigger);
    }
    await page.locator("#menu-cart-trigger").click();
    assert.equal(await page.locator(".menu-cart-line").count(), 2);
    const teaRow = page.locator(".menu-cart-line").filter({ hasText: tea.item.name.ru });
    await teaRow.locator(".menu-cart-step").last().click();
    const incremented = sortedEntries([[tea.id, 2], [espresso.id, 1], [dessert.id, 3]]);
    await poll(() => cart(page).then(entries), value => JSON.stringify(value) === JSON.stringify(incremented),
      "incrementing the tea pair commits its matching dessert quantity");
    const incrementedTotal = (tea.item.price + dessert.item.price) * 2 + espresso.item.price + dessert.item.price;
    await poll(() => page.locator("#menu-cart-dialog-total").textContent().then(money), value => value === incrementedTotal,
      "the visible cart converges to the committed incremented total");
    await teaRow.locator(".menu-cart-remove").click();
    const remaining = sortedEntries([[espresso.id, 1], [dessert.id, 1]]);
    await poll(() => cart(page).then(entries), value => JSON.stringify(value) === JSON.stringify(remaining),
      "removing the tea pair removes only its matching dessert quantities");
    await poll(() => page.locator(".menu-cart-line").count(), value => value === 1,
      "the visible cart removes only the committed tea pair");
    await poll(() => page.locator("#menu-cart-dialog-total").textContent().then(money), value => value === espresso.item.price + dessert.item.price,
      "the visible remaining pair total matches the committed cart");
    return { groups: (await cart(page)).groups };
  });

  await run("MENU-VARIANT-IDENTITY-001", "flavor is required and distinct flavors remain distinct cart selections", async (page) => {
    await prepare(page, base, { language: "ru" });
    const drink = products.get("cold-coffee:flavoured-iced-caffe-latte");
    const flavors = drink.item.variants.slice(0, 2);
    await open(page, drink, false);
    assert.equal(await page.locator("#menu-add-to-cart").isDisabled(), true, "a flavored item cannot be ordered without choosing its flavor");
    for (const [index, flavor] of flavors.entries()) {
      if (index) await open(page, drink, false);
      await page.locator("#menu-product-variant").selectOption(flavor.id);
      assert.equal(await page.locator("#menu-add-to-cart").isEnabled(), true);
      await addAndConfirm(page);
      await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
      await continueMenu(page);
    }
    await page.locator("#menu-cart-trigger").click();
    assert.equal(await page.locator(".menu-cart-line").count(), 2);
    const draft = await cart(page);
    assert.deepEqual(draft.groups.map(group => group.items[0].variant).sort(), flavors.map(flavor => flavor.id).sort());
    for (const flavor of flavors) assert.equal((await page.locator("#menu-cart-lines").textContent()).includes(flavor.name.ru), true);
    assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), drink.item.price * 2);
    return { variants: flavors.map(flavor => flavor.id), groups: draft.groups };
  });

  await run("MENU-LEGACY-FLAVOR-001", "a restored order can choose its missing flavor directly in the cart", async (page) => {
    const product = [...products.values()].find(entry => entry.item.variants?.length > 1);
    const flavor = product.item.variants[0];
    await prepare(page, base, { language: "ru", seed: { version: 1, lines: [{ id: product.id, quantity: 2 }] } });
    await page.locator("#menu-cart-trigger").click();
    assert.equal(await page.locator("#menu-checkout-trigger").isDisabled(), true, "an unspecified flavor cannot reach checkout");
    const selector = page.locator("#menu-cart-lines select");
    assert.equal(await selector.inputValue(), "");
    await selector.selectOption(flavor.id);
    await poll(() => cart(page), draft => draft.groups.length === 1 && draft.groups[0].quantity === 2 &&
      draft.groups[0].items[0].variant === flavor.id, "the restored cart commits its exact chosen flavor and quantity");
    await poll(() => page.locator("#menu-checkout-trigger").isEnabled(), Boolean,
      "checkout becomes available after the chosen flavor commits");
    const draft = await cart(page);
    assert.equal(draft.groups.length, 1);
    assert.equal(draft.groups[0].quantity, 2);
    assert.equal(draft.groups[0].items[0].variant, flavor.id);
    assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), product.item.price * 2);
    assert.equal((await page.locator("#menu-cart-lines").textContent()).includes(flavor.name.ru), true);
    return { product: product.id, flavor: flavor.id, quantity: 2, correctedInCart: true };
  });

  await run("MENU-CATEGORY-SEARCH-001", "category-name searches and Turkish I work across languages", async (page) => {
    await prepare(page, base, { language: "tr" });
    await page.locator("#menu-search").fill("Cold Coffee");
    assert.equal(await page.locator("#menu-root [data-product-id]").count(), menuCategories.find(category => category.id === "cold-coffee").items.length);
    await page.locator("#menu-search").fill("SICAK");
    assert.equal(await page.locator("#menu-root [data-product-id]").count(), hot.filter(product => product.category.id !== "herbal-tea").length);
    await page.goto(new URL("menu.html?entry=off#brew-hot", base).href, { waitUntil: "domcontentloaded" });
    await poll(() => page.locator("#menu-root .full-menu-panel").count(), count => count === 1, "same-page hash activates one category");
    assert.equal(await page.locator("#menu-root .full-menu-panel").getAttribute("id"), "brew-hot");
    assert.equal(await page.locator(".menu-search-clear").isHidden(), true, "hash navigation also clears the search reset control");
    return { categorySearch: true, turkishCasefold: true, hashFilter: "brew-hot" };
  });

  for (const capped of [espresso, dessert]) {
    await run("CUSTOM-PAIRING-CAPACITY-001", `${capped.id}: tighter remaining capacity limits both lines atomically`, async (page) => {
      await prepare(page, base, { seed: { version: 1, lines: [{ id: capped.id, quantity: 98 }, { id: existing.id, quantity: 3 }] } });
      await open(page, espresso);
      if (capped.id !== espresso.id) await page.locator("#menu-quantity-increase").click();
      await choose(page, dessert.id);
      assert.equal(await page.locator("#menu-product-quantity").textContent(), "1", "selection clamps to the tighter remaining line");
      assert.equal(await page.locator("#menu-quantity-increase").isDisabled(), true);
      await addAndConfirm(page);
      const expected = new Map([[capped.id, 98], [existing.id, 3]]);
      for (const product of [espresso, dessert]) expected.set(product.id, (expected.get(product.id) ?? 0) + 1);
      const draft = await cart(page);
      assert.deepEqual(entries(draft), sortedEntries([...expected]));
      return { capped: capped.id, draft, bothLinesAdded: 1 };
    });
  }

  await run("CUSTOM-PAIRING-ZERO-CAPACITY-001", "a full dessert line blocks the complete pair without partially adding the drink", async (page) => {
    const seed = { version: 1, lines: [{ id: dessert.id, quantity: 99 }, { id: existing.id, quantity: 3 }] };
    await prepare(page, base, { seed });
    await open(page, espresso);
    await choose(page, dessert.id);
    assert.equal(await page.locator("#menu-product-quantity").textContent(), "0");
    assert.equal(await page.locator("#menu-add-to-cart").isDisabled(), true);
    assert.equal(await page.locator("#menu-quantity-increase").isDisabled(), true);
    assert.equal(await page.locator("#menu-quantity-decrease").isDisabled(), true);
    await page.locator("#menu-add-to-cart").dispatchEvent("click");
    assert.deepEqual(entries(await cart(page)), entries(seed), "even a stale synthetic activation cannot partially add a zero-capacity pair");
    await choose(page, "");
    assert.equal(await page.locator("#menu-add-to-cart").isEnabled(), true, "full dessert capacity still permits the drink alone");
    await addAndConfirm(page);
    const draft = await cart(page);
    assert.deepEqual(entries(draft), sortedEntries([...entries(seed), [espresso.id, 1]]));
    return { remainingPairCapacity: 0, drinkOnlyStillAvailable: true, draft };
  });

  await run("CUSTOM-PAIRING-FALLBACK-FOCUS-001", "fallback Tab cycles the checked radio, disclosure and close when order controls are disabled", async (page) => {
    // Reproduce the slow-frame ordering that formerly let the reopened-dialog
    // test send Escape to its outside opener before fallback focus was ready.
    await page.addInitScript(() => {
      const requestFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => requestFrame((time) => {
        window.setTimeout(() => callback(time), 100);
      });
    });
    const seed = { version: 1, lines: [{ id: espresso.id, quantity: 99 }] };
    await prepare(page, base, { seed, fallback: true });
    const trigger = await open(page, espresso);
    for (const id of ["#menu-add-to-cart", "#menu-quantity-increase", "#menu-quantity-decrease"]) {
      assert.equal(await page.locator(id).isDisabled(), true, `${id}: no remaining drink capacity`);
    }
    const checked = page.locator('input[name="menu-dessert"][value=""]');
    const dismiss = page.locator('#menu-product-dialog [data-menu-dialog-close="product"]');
    const disclosure = page.locator(".menu-pairing-expand");
    await checked.focus();
    await page.keyboard.press("Tab");
    assert.equal(await disclosure.evaluate(node => document.activeElement === node), true, "Tab reaches the dessert disclosure");
    await page.keyboard.press("Tab");
    assert.equal(await dismiss.evaluate((node) => document.activeElement === node), true, "Tab from the final control wraps to close");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await disclosure.evaluate(node => document.activeElement === node), true, "reverse Tab wraps to disclosure");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await checked.evaluate((node) => document.activeElement === node), true, "reverse Tab wraps to the checked radio rather than an unchecked option");
    await close(page, trigger, true);
    const reopened = await open(page, espresso);
    await close(page, reopened, true);
    assert.deepEqual(entries(await cart(page)), entries(seed));
    return { fallback: true, drinkCapacity: 0, actualTabStops: ["close", "checked drink-only radio", "dessert disclosure"], delayedFocusFrameMs: 100, reopenedEscapeCloses: true };
  });

  await run("CUSTOM-PAIRING-GEOMETRY-001", "representative long names fit320/390/768/1440 at100/200% text", async (page) => {
    await prepare(page, base, { language: "ru" });
    const drink = hot.reduce((longest, product) => product.item.name.ru.length > longest.item.name.ru.length ? product : longest);
    await page.setViewportSize({ width: 320, height: 844 });
    await open(page, drink);
    const drinkOnlyHeading = await headingVisibility(page, "ru/320px/100%/drink-only");
    mkdirSync(".artifacts/custom-pairing", { recursive: true });
    await page.locator("#menu-add-to-cart").scrollIntoViewIfNeeded();
    const defaultScreenshot = ".artifacts/custom-pairing/ru-320-100-drink-only.png";
    await page.screenshot({ path: defaultScreenshot });
    const screenshots = [{ path: defaultScreenshot, width: 320, textScale: 100, selection: "drink-only" }];
    await choose(page, dessert.id);
    const states = [];
    for (const width of [320, 390, 768, 1440]) for (const fontSize of [16, 32]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate((size) => { document.documentElement.style.fontSize = `${size}px`; }, fontSize);
      const label = `ru/${width}px/${fontSize === 32 ? "200" : "100"}%`;
      const heading = await headingVisibility(page, label);
      states.push({ ...await geometry(page, label), heading });
      if ((width === 390 && fontSize === 16) || width === 320 || (width === 1440 && fontSize === 16)) {
        await page.locator("#menu-add-to-cart").scrollIntoViewIfNeeded();
        const path = `.artifacts/custom-pairing/ru-${width}-${fontSize === 32 ? "200" : "100"}.png`;
        await page.screenshot({ path });
        screenshots.push({ path, width, textScale: fontSize === 32 ? 200 : 100, selection: dessert.id });
      }
    }
    return { drink: drink.id, dessert: dessert.id, drinkOnlyHeading, states, screenshots, textScaleMethod: "document root font16/32px; text enlargement, not browser zoom" };
  });

  await run("CUSTOM-PAIRING-LAZY-FAILURE-001", "blocked optional view reports failure and retains drink-only ordering", async (page) => {
    await page.route("**/menu-pairing.js*", (route) => route.abort());
    await prepare(page, base, { language: "ru" });
    await open(page, espresso, false);
    const retry = page.locator("#menu-pairing-picker .menu-pairing-retry");
    await retry.waitFor({ state: "visible" });
    const feedback = await page.locator("#menu-pairing-picker [role='status']").textContent();
    assert.equal(Boolean(feedback?.trim()), true, "failed optional loading has explicit feedback");
    assert.equal(await page.locator("#menu-pairing-picker").getAttribute("data-ready"), null);
    assert.equal(await page.locator("#menu-pairing-preview").isHidden(), true);
    assert.equal(await page.locator("#menu-add-to-cart").isEnabled(), true);
    assert.equal(money(await page.locator("#menu-add-to-cart").textContent()), espresso.item.price);
    assert.deepEqual((await cart(page)).lines, [], "failed optional loading does not commit an order");
    await addAndConfirm(page);
    const draft = await cart(page);
    assert.deepEqual(entries(draft), [[espresso.id, 1]]);
    return { feedback, optionalLoadBlocked: true, draft };
  });

  await run("CUSTOM-PAIRING-RETRY-001", "a previously blocked optional module recovers after explicit retry without silently ordering", async (page) => {
    const pattern = "**/menu-pairing.js*";
    const block = (route) => route.abort();
    await page.route(pattern, block);
    await prepare(page, base, { language: "ru" });
    await open(page, espresso, false);
    const retry = page.locator("#menu-pairing-picker .menu-pairing-retry");
    await retry.waitFor({ state: "visible" });
    const before = await cart(page);
    await page.unroute(pattern, block);
    await retry.click();
    await poll(() => page.locator("#menu-pairing-picker").getAttribute("data-ready"), (value) => value === "true", "explicit retry recovers the optional choices");
    assert.equal(await page.locator('#menu-pairing-picker input[name="menu-dessert"]').count(), 13);
    assert.deepEqual(entries(await cart(page)), entries(before), "retry only restores the draft UI");
    await choose(page, dessert.id);
    const preview = await assertPreview(page, espresso, dessert, "ru");
    await addAndConfirm(page);
    const draft = await cart(page);
    assert.deepEqual(entries(draft), sortedEntries([[espresso.id, 1], [dessert.id, 1]]));
    return { recoveredAfterRetry: true, preview, draft };
  });
}
