import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { menuCategories, menuCopy } from "../menu-catalog.js";

const cartKey = "robys-menu-order.v1";
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
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{"version":1,"lines":[]}'), cartKey);
}

async function prepare(page, base, { language = "tr", fallback = false, seed } = {}) {
  if (fallback) {
    await page.addInitScript(() => {
      // Legacy dialog fallback lacks both methods and the native open property.
      for (const name of ["showModal", "close"]) Object.defineProperty(HTMLDialogElement.prototype, name, { configurable: true, value: undefined });
      Object.defineProperty(HTMLDialogElement.prototype, "open", { configurable: true, get: () => undefined });
    });
  }
  if (seed) {
    await page.addInitScript(({ key, draft }) => {
      if (sessionStorage.getItem("qa-custom-pairing-seeded")) return;
      sessionStorage.setItem("qa-custom-pairing-seeded", "true");
      sessionStorage.setItem(key, JSON.stringify(draft));
    }, { key: cartKey, draft: seed });
  }
  await page.goto(new URL("menu.html?entry=off", base).href, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root[data-ready='true']").waitFor({ state: "visible" });
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
  return trigger;
}

async function close(page, trigger, escape = false) {
  if (escape) await page.keyboard.press("Escape");
  else await page.locator('#menu-product-dialog [data-menu-dialog-close="product"]').click();
  await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
  assert.equal(await trigger.evaluate((node) => document.activeElement === node), true, "closing returns focus to the drink");
}

async function choose(page, id) {
  const radio = page.locator(`#menu-pairing-picker input[name="menu-dessert"][value="${id}"]`);
  await radio.locator("..").click();
  assert.equal(await radio.isChecked(), true);
  return radio;
}

async function assertPreview(page, drink, sweet, language) {
  const preview = page.locator("#menu-pairing-preview");
  await preview.waitFor({ state: "visible" });
  assert.equal(await page.locator("#menu-product-title").textContent(), drink.item.name[language], "main title remains the drink");
  assert.equal(money(await page.locator("#menu-product-price").textContent()), drink.item.price, "main price remains the drink's unit price");
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
    const content = dialog.querySelector(".menu-product-content").getBoundingClientRect();
    const clippedText = [];
    for (const node of dialog.querySelectorAll("h2, #menu-product-price, #menu-pairing-preview h3, #menu-pairing-preview figcaption, .menu-pairing-preview-total, .menu-pairing-summary, #menu-add-to-cart")) {
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
      optionsTouchable: [...dialog.querySelectorAll(".menu-pairing-option")].every((node) => node.getBoundingClientRect().height >= 43.5),
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
  const readable = page.locator("#menu-product-dialog #menu-pairing-preview figcaption, #menu-product-dialog .menu-pairing-preview-total, #menu-product-dialog .menu-pairing-summary, #menu-quantity-label, #menu-product-dialog .menu-quantity-stepper");
  for (let index = 0; index < await readable.count(); index++) {
    const node = readable.nth(index);
    await node.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const measured = await node.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const shell = element.closest(".menu-dialog-shell").getBoundingClientRect();
      const action = document.querySelector("#menu-add-to-cart").getBoundingClientRect();
      const overlap = Math.min(bounds.right, action.right) - Math.max(bounds.left, action.left) > 1 &&
        Math.min(bounds.bottom, action.bottom) - Math.max(bounds.top, action.top) > 1;
      return { text: element.textContent, top: bounds.top, bottom: bounds.bottom,
        clipTop: Math.max(shell.top, 0), clipBottom: Math.min(shell.bottom, innerHeight), overlap };
    });
    assert.equal(measured.top >= measured.clipTop - 1 && measured.bottom <= measured.clipBottom + 1, true, `${label}: ${measured.text} is reachable in the dialog scroll area`);
    assert.equal(measured.overlap, false, `${label}: the purchase action does not cover ${measured.text}`);
    reachability.push(measured);
  }
  return { label, ...result, reachability };
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

  await run("CUSTOM-PAIRING-CATALOG-001", "all27 hot drinks are eligible; cold and dessert products remain ordinary", async (page, requests) => {
    assert.equal(hot.length, 27);
    assert.equal(sweetIds.length, 12);
    await prepare(page, base);
    assert.equal(requests.some((path) => path.endsWith("/menu-pairing.js")), false, "pairing view is absent from initial menu requests");
    for (const product of [products.get("cold-coffee:iced-caffe-latte"), dessert]) {
      const trigger = await open(page, product, false);
      assert.equal(await page.locator("#menu-pairing-picker").isHidden(), true);
      assert.equal(await page.locator("#menu-pairing-preview").isHidden(), true);
      await close(page, trigger);
    }
    assert.equal(requests.some((path) => path.endsWith("/menu-pairing.js")), false, "cold and dessert dialogs do not request pairing code");
    const eligible = [];
    for (const drink of hot) {
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
    await run("CUSTOM-PAIRING-ORDER-001", `${language}/${fallback ? "fallback" : "native"}: quantity2 adds two lines and preserves existing order`, async (page) => {
      const recommendation = { token: "existing-browser-draft", signature: "independent-existing-selection", lines: [{ id: existing.id, quantity: 1 }] };
      await prepare(page, base, { language, fallback, seed: { version: 1, lines: [{ id: existing.id, quantity: 3 }], recommendation } });
      await open(page, espresso);
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
      assert.equal((await page.locator("#menu-add-to-cart").textContent()).startsWith(copy[language].addPair), true);
      assert.equal(await page.locator("#menu-product-draft-note").textContent(), menuCopy[language].orderDraft);
      await page.locator("#menu-add-to-cart").focus();
      await page.keyboard.press("Tab");
      assert.equal(await page.locator('#menu-product-dialog [data-menu-dialog-close="product"]').evaluate((node) => document.activeElement === node), true, "Tab stays within the native/fallback dialog");
      await page.locator("#menu-add-to-cart").click();
      await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
      const draft = await cart(page);
      assert.deepEqual(entries(draft), sortedEntries([[existing.id, 3], [espresso.id, 2], [dessert.id, 2]]));
      assert.deepEqual(draft.recommendation, recommendation, "custom pairs preserve the existing recommendation contribution");
      assert.equal(Number(await page.locator("#menu-cart-count").textContent()), 7);
      await page.locator("#menu-cart-trigger").click();
      await page.locator("#menu-cart-dialog").waitFor({ state: "visible" });
      assert.equal(await page.locator(".menu-cart-line").count(), 3, "pair additions remain two ordinary cart lines");
      assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), existing.item.price * 3 + (espresso.item.price + dessert.item.price) * 2);
      await page.keyboard.press("Escape");
      await page.locator("#menu-cart-dialog").waitFor({ state: "hidden" });
      const trigger = await open(page, espresso);
      assert.equal(await page.locator('input[name="menu-dessert"][value=""]').isChecked(), true, "reopening resets the uncommitted dessert in both dialog modes");
      await choose(page, dessert.id);
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
    await page.locator("#menu-add-to-cart").click();
    const committed = entries(await cart(page));
    assert.deepEqual(committed, [[otherDrink.id, 1]], "default/deselected choices add only the drink");
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
    return { committed, reopenResetsDessert: true, backAndReloadPreserve: true };
  });

  for (const capped of [espresso, dessert]) {
    await run("CUSTOM-PAIRING-CAPACITY-001", `${capped.id}: tighter remaining capacity limits both lines atomically`, async (page) => {
      await prepare(page, base, { seed: { version: 1, lines: [{ id: capped.id, quantity: 98 }, { id: existing.id, quantity: 3 }] } });
      await open(page, espresso);
      if (capped.id !== espresso.id) await page.locator("#menu-quantity-increase").click();
      await choose(page, dessert.id);
      assert.equal(await page.locator("#menu-product-quantity").textContent(), "1", "selection clamps to the tighter remaining line");
      assert.equal(await page.locator("#menu-quantity-increase").isDisabled(), true);
      await page.locator("#menu-add-to-cart").click();
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
    await page.locator("#menu-add-to-cart").click();
    const draft = await cart(page);
    assert.deepEqual(entries(draft), sortedEntries([...entries(seed), [espresso.id, 1]]));
    return { remainingPairCapacity: 0, drinkOnlyStillAvailable: true, draft };
  });

  await run("CUSTOM-PAIRING-FALLBACK-FOCUS-001", "fallback Tab cycles the actual checked radio and close when all order controls are disabled", async (page) => {
    const seed = { version: 1, lines: [{ id: espresso.id, quantity: 99 }] };
    await prepare(page, base, { seed, fallback: true });
    const trigger = await open(page, espresso);
    for (const id of ["#menu-add-to-cart", "#menu-quantity-increase", "#menu-quantity-decrease"]) {
      assert.equal(await page.locator(id).isDisabled(), true, `${id}: no remaining drink capacity`);
    }
    const checked = page.locator('input[name="menu-dessert"][value=""]');
    const dismiss = page.locator('#menu-product-dialog [data-menu-dialog-close="product"]');
    await checked.focus();
    await page.keyboard.press("Tab");
    assert.equal(await dismiss.evaluate((node) => document.activeElement === node), true, "Tab from the last actual radio tab stop wraps to close");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await checked.evaluate((node) => document.activeElement === node), true, "reverse Tab wraps to the checked radio rather than an unchecked option");
    await close(page, trigger, true);
    assert.deepEqual(entries(await cart(page)), entries(seed));
    return { fallback: true, drinkCapacity: 0, actualTabStops: ["close", "checked drink-only radio"] };
  });

  await run("CUSTOM-PAIRING-GEOMETRY-001", "representative long names fit320/390/768/1440 at100/200% text", async (page) => {
    await prepare(page, base, { language: "ru" });
    const drink = hot.reduce((longest, product) => product.item.name.ru.length > longest.item.name.ru.length ? product : longest);
    await page.setViewportSize({ width: 320, height: 844 });
    await open(page, drink);
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
      states.push(await geometry(page, label));
      if ((width === 390 && fontSize === 16) || width === 320 || (width === 1440 && fontSize === 16)) {
        await page.locator("#menu-add-to-cart").scrollIntoViewIfNeeded();
        const path = `.artifacts/custom-pairing/ru-${width}-${fontSize === 32 ? "200" : "100"}.png`;
        await page.screenshot({ path });
        screenshots.push({ path, width, textScale: fontSize === 32 ? 200 : 100, selection: dessert.id });
      }
    }
    return { drink: drink.id, dessert: dessert.id, states, screenshots, textScaleMethod: "document root font16/32px; text enlargement, not browser zoom" };
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
    await page.locator("#menu-add-to-cart").click();
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
    await page.locator("#menu-add-to-cart").click();
    const draft = await cart(page);
    assert.deepEqual(entries(draft), sortedEntries([[espresso.id, 1], [dessert.id, 1]]));
    return { recoveredAfterRetry: true, preview, draft };
  });
}
