import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, createReadStream, rmSync } from "node:fs";
import { dirname, resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime, compileMenuOrderRuntime, compileOrderStorageRuntime } from "./menu-runtime-source.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repo);
const output = resolve(process.env.ROBYS_FAMILY_QA_DIR ?? join(repo, ".artifacts/menu-family"));
mkdirSync(output, { recursive: true });
const fixture = mkdtempSync(join(tmpdir(), "robys-family-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
  "-keyout", join(fixture, "key.pem"), "-out", join(fixture, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
// Test the current sources before a coordinated build, without changing outputs.
const compiled = new Map([
  ["/order-storage.js", compileOrderStorageRuntime()],
  ["/menu-app.js", compileMenuRuntime()],
  ["/menu-family-ui.js", compileMenuRuntime(readFileSync("src/menu-family-ui.js", "utf8"))],
  ["/menu-order-ui.js", compileMenuOrderRuntime()]
]);
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
let origin;
const server = createServer({ key: readFileSync(join(fixture, "key.pem")), cert: readFileSync(join(fixture, "cert.pem")) }, (request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (compiled.has(pathname)) {
      response.writeHead(200, { "content-type": "application/javascript", "cache-control": "no-store" }).end(compiled.get(pathname));
      return;
    }
    let file = resolve(repo, "." + decodeURIComponent(pathname));
    if (!file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
origin = `https://127.0.0.1:${server.address().port}`;
const report = {
  startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  mode: "Desktop browser engines in Linux with phone-sized touch viewports; local HTTPS source fixture, not physical Android or vendor browsers",
  sourceHashes: Object.fromEntries(["scripts/test-menu-family-browser.mjs", "src/menu-app.js", "src/order-storage.js", "src/order-storage-notice.js", "src/menu-family-ui.js", "src/menu-family.js", "src/order-draft.js", "src/menu-order-ui.js", "menu-family.css", "menu.html", "menu-catalog.js",
    "src/products/family-sets-v1/milk-cookie.webp", "src/products/family-sets-v1/simit-break.webp", "src/products/family-sets-v1/milk-roll.webp",
    "src/products/family-sets-v1/kids-box.webp"]
    .map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")])), cases: []
};
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
let browser;
const browserName = process.env.ROBYS_FAMILY_BROWSER ?? "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(browserName), "Choose chromium, firefox or webkit");

async function run(id, callback, { width = 390, height = 844, javaScriptEnabled = true } = {}) {
  if (process.env.ROBYS_FAMILY_FILTER && !id.includes(process.env.ROBYS_FAMILY_FILTER)) return;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800,
    ignoreHTTPSErrors: true, serviceWorkers: "block", javaScriptEnabled, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort("blockedbyclient"));
  const startedAt = new Date().toISOString();
  try {
    const facts = await callback(page, context);
    assert.deepEqual(errors, [], "No uncaught runtime errors");
    report.cases.push({ id, status: "PASS", startedAt, finishedAt: new Date().toISOString(), facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    const screenshot = `${id}-failure.png`;
    await page.screenshot({ path: join(output, screenshot), fullPage: true }).catch(() => {});
    report.cases.push({ id, status: "FAIL", startedAt, finishedAt: new Date().toISOString(),
      error: error.stack, uncaughtErrors: errors, screenshot });
    console.error(`FAIL ${id}: ${error.stack}`);
  } finally { await context.close(); persist(); }
}

async function openMenu(page, language = "ru", { fallback = false, deepLink = false, reveal = true } = {}) {
  await page.addInitScript(({ language, fallback }) => {
    localStorage.setItem("robys-language", language);
    if (fallback) HTMLDialogElement.prototype.showModal = undefined;
  }, { language, fallback });
  await page.goto(`${origin}/menu.html${deepLink ? "#menu-family" : ""}`);
  await page.locator('#menu-root[data-ready="true"]').waitFor();
  if (reveal) {
    if (!deepLink) await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
  }
}

async function clearCart(page, returnButton) {
  const cart = page.locator("#menu-cart-dialog[open]");
  while (await cart.locator(".menu-cart-remove").count()) {
    const previous = await cart.locator(".menu-cart-remove").count();
    await cart.locator(".menu-cart-remove").first().click();
    await page.waitForFunction(count => document.querySelectorAll("#menu-cart-dialog .menu-cart-remove").length < count, previous);
  }
  await page.keyboard.press("Escape");
  assert.equal(await returnButton.evaluate(button => document.activeElement === button), true, "Cart returns focus to its recipe card");
}

async function assertRecipePhotos(page, language) {
  const recipeIds = ["milk-cookie", "simit-break", "milk-roll"];
  for (const recipeId of recipeIds) {
    const image = page.locator(`[data-family-recipe="${recipeId}"] .menu-family-photos > img`);
    await image.scrollIntoViewIfNeeded();
    const actual = await image.evaluate(async node => {
      await node.decode();
      return { src: new URL(node.currentSrc).pathname, width: node.naturalWidth, height: node.naturalHeight };
    });
    assert.deepEqual(actual, { src: `/src/products/family-sets-v1/${recipeId}.webp`, width: 900, height: 900 });
  }
  const title = { tr: "Çocuklarla", en: "With kids", ru: "С ребёнком" }[language];
  assert.deepEqual(await page.locator(".menu-family-ribbon").allTextContents(), Array(3).fill(`❤${title}`));
  assert.equal(await page.locator('.menu-family-ribbon span[aria-hidden="true"]').count(), 3);
  for (const ribbon of await page.locator(".menu-family-ribbon").all())
    assert.equal(await ribbon.isHidden(), true, "Loaded set photos already contain their ribbon and must not show a duplicate overlay");
}

async function captureCard(page, recipeId, filename) {
  const card = page.locator(`[data-family-recipe="${recipeId}"]`);
  await card.evaluate(node => node.scrollIntoView({ block: "center" }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await card.screenshot({ path: join(output, filename) });
}

async function canonicalDraft(page, { seedMilk = false } = {}) {
  return page.evaluate(async seedMilk => {
    const orders = await import("./src/order-draft.js");
    const { menuCategories } = await import("./menu-catalog.js");
    const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const ids = new Set(menuCategories.flatMap(category =>
      (category.items ?? category.groups?.flatMap(group => group.items) ?? [])
        .map(item => `${category.id}:${item.id ?? slug(item.name.en)}`)));
    if (seedMilk) await orders.transactStoredOrderDraft(current =>
      orders.addOrderGroup(current, [{ id: "brew-hot:milk", quantity: 1 }], 2, ids), ids);
    return orders.readLatestStoredOrderDraft(ids);
  }, seedMilk);
}

async function assertKidsBox(page, language) {
  const text = {
    tr: { status: "Yakında satışta. Kasada sorun.", concept: "Set konsepti", alt: "Roby’s Kids Box ambalaj konsepti" },
    en: { status: "Coming soon. Ask at the counter.", concept: "Set concept", alt: "Roby’s Kids Box packaging concept" },
    ru: { status: "Скоро в продаже. Спрашивайте у кассира.", concept: "Концепт набора", alt: "Концепт фирменной коробки Roby’s Kids Box" }
  }[language];
  const before = await canonicalDraft(page);
  const box = page.locator(".menu-family-coming-soon");
  const image = box.locator(".menu-family-box-image");
  await image.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const image = document.querySelector(".menu-family-box-image");
    return image?.complete && image.naturalWidth > 0;
  });
  const photo = await image.evaluate(async node => {
    await node.decode();
    const bounds = node.getBoundingClientRect();
    return { src: new URL(node.currentSrc).pathname, width: node.naturalWidth, height: node.naturalHeight,
      loading: node.loading, decoding: node.decoding, left: bounds.left, right: bounds.right, renderedWidth: bounds.width,
      renderedHeight: bounds.height, viewportWidth: innerWidth, objectFit: getComputedStyle(node).objectFit };
  });
  assert.deepEqual({ src: photo.src, width: photo.width, height: photo.height, loading: photo.loading, decoding: photo.decoding },
    { src: "/src/products/family-sets-v1/kids-box.webp", width: 900, height: 900, loading: "lazy", decoding: "async" });
  assert.ok(photo.left >= 0 && photo.right <= photo.viewportWidth && photo.renderedWidth > 0);
  assert.ok(Math.abs(photo.renderedWidth - photo.renderedHeight) < 1, "Kids Box keeps its square composition");
  assert.equal(photo.objectFit, "cover");
  assert.equal(await image.getAttribute("alt"), text.alt);
  assert.equal(await box.locator("h3").textContent(), "Roby’s Kids Box");
  assert.equal(await box.locator(".menu-family-box-caption").textContent(), text.concept);
  assert.equal(await box.locator(".menu-family-box-status").textContent(), text.status);
  assert.equal(await box.locator('button,a,[role="button"],input,[data-family-recipe],.menu-family-price,[data-product-id]').count(), 0,
    "The packaging concept exposes no sale, cart, recipe, price or order action");
  const dialogs = page.locator(".menu-family-dialog[open],#menu-cart-dialog[open],#menu-product-dialog[open],.order-checkout-dialog[open]");
  assert.equal(await dialogs.count(), 0);
  await image.click();
  await box.locator(".menu-family-box-status").scrollIntoViewIfNeeded();
  await box.locator(".menu-family-box-status").click();
  assert.equal(await dialogs.count(), 0, "Reading and clicking the concept opens neither recipe nor cart/checkout dialogs");
  assert.deepEqual(await canonicalDraft(page), before, "Viewing, scrolling and clicking Kids Box cannot change the current order");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  return { language, photo, concept: text.concept, status: text.status, nonOrderable: true, dialogsClosed: true, canonicalDraftUnchanged: true };
}

try {
  browser = await ({ chromium, firefox, webkit })[browserName].launch({ headless: true });
  report.browserName = browserName;
  report.browserVersion = browser.version();
  await run("thin-catalog-family-do-not-load-order-storage", async page => {
    const storageLoads = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/order-storage.js") storageLoads.push(request.url());
    });
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      window.orderDraftWrites = [];
      window.setTestProjection = draft => setItem.call(localStorage, "robys-menu-order.v2", JSON.stringify(draft));
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("robys-menu-order.")) window.orderDraftWrites.push({ key, value });
        return setItem.call(this, key, value);
      };
    });
    await openMenu(page, "ru", { reveal: false });
    assert.deepEqual(storageLoads, [], "The initial catalog does not load authoritative order storage");
    await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
    await page.locator('[data-family-recipe="milk-cookie"] button').click();
    await page.locator(".menu-family-dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const draft = { version: 1, lines: [{ id: "brew-hot:milk", quantity: 2 }] };
      window.setTestProjection(draft);
      window.dispatchEvent(new StorageEvent("storage", { key: "robys-menu-order.v2", newValue: JSON.stringify(draft) }));
      window.dispatchEvent(new Event("focus"));
    });
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2");
    assert.match(await page.locator("#menu-cart-total").textContent(), /120 ₺/);
    assert.deepEqual(storageLoads, [], "Family reveal, preview, focus and projection notifications keep storage lazy");
    assert.deepEqual(await page.evaluate(() => window.orderDraftWrites), [], "Read-only catalog interactions never persist an order");
    return { authoritativeStorageRequests: 0, orderWrites: 0, familyRevealAndPreviewReadOnly: true,
      focusAndV2ProjectionReadOnly: true, thinBadge: { quantity: 2, total: "120 ₺" } };
  });
  for (const language of ["tr", "en", "ru"]) await run(`kids-box-${language}`, async page => {
    await openMenu(page, language);
    const before = await canonicalDraft(page, { seedMilk: true });
    assert.deepEqual(before.lines, [{ id: "brew-hot:milk", quantity: 2 }], "Use a nonempty order to detect accidental clearing");
    const facts = await assertKidsBox(page, language);
    const languageChanges = [];
    for (const next of [...["tr", "en", "ru"].filter(value => value !== language), language]) {
      await page.locator(`.lang-button[data-lang="${next}"]`).click();
      await page.waitForFunction(next => document.documentElement.lang === next, next);
      await assertKidsBox(page, next);
      languageChanges.push(next);
    }
    assert.deepEqual(await canonicalDraft(page), before, "Changing the concept language preserves the nonempty canonical order");
    await page.locator(".menu-family-coming-soon").screenshot({ path: join(output, `kids-box-${language}-390.png`) });
    return { ...facts, languageChanges, existingOrder: before.lines };
  });
  for (const language of ["tr", "en", "ru"]) await run(`recipes-${language}`, async page => {
    await openMenu(page, language);
    assert.equal(await page.locator(".menu-family-card").count(), 3);
    assert.deepEqual(await page.locator(".menu-family-price").allTextContents(), ["160 ₺", "195 ₺", "230 ₺"]);
    await assertRecipePhotos(page, language);
    await captureCard(page, "milk-cookie", `card-${language}-390.png`);
    const first = page.locator('[data-family-recipe="milk-cookie"] button');
    await first.click();
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Opening a recipe never adds it");
    const dialog = page.locator(".menu-family-dialog[open]");
    for (const checkbox of await dialog.locator("input").all()) await checkbox.uncheck();
    assert.equal(await dialog.locator(".menu-family-add").isDisabled(), true);
    await dialog.locator('input[value="brew-hot:milk"]').check();
    assert.match(await dialog.locator(".menu-family-total").textContent(), /60 ₺/);
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines), [{ id: "brew-hot:milk", quantity: 1 }]);
    await clearCart(page, first);

    const second = page.locator('[data-family-recipe="simit-break"] button');
    await second.click();
    await dialog.locator('input[value="desserts:cookie"]').uncheck();
    assert.match(await dialog.locator(".menu-family-total").textContent(), /95 ₺/);
    await page.screenshot({ path: join(output, `${language}-preview-390.png`), fullPage: false });
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    const groups = await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v2")).groups);
    assert.equal(groups.length, 2);
    assert.ok(groups.every(group => group.items.length === 1), "Each component remains independently editable");
    await page.locator("#menu-cart-dialog .menu-cart-line").filter({ hasText: language === "ru" ? "Молоко" : language === "en" ? "Milk" : "Süt" })
      .locator(".menu-cart-remove").click();
    await page.waitForFunction(() => document.querySelectorAll("#menu-cart-dialog .menu-cart-line").length === 1);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines), [{ id: "food:sesame-simit", quantity: 1 }]);
    await clearCart(page, second);

    const third = page.locator('[data-family-recipe="milk-roll"] button');
    await third.click();
    await page.keyboard.press("Escape");
    assert.equal(await third.evaluate(button => document.activeElement === button), true);
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Cancel leaves the order unchanged");
    await third.click();
    assert.equal(await dialog.locator("input:checked").count(), 2);
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.equal(await page.locator("#menu-cart-dialog .menu-cart-line").count(), 2);
    assert.match(await page.locator("#menu-cart-dialog-total").textContent(), /230 ₺/);
    await clearCart(page, third);
    return { recipes: 3, completedSelections: 3, cancelPreservedDraft: true, separateComponentRemoval: true, focusRestored: true };
  });

  for (const width of [320, 390, 1440]) await run(`layout-${width}`, async page => {
    await openMenu(page);
    await assertRecipePhotos(page, "ru");
    const kidsBox = await assertKidsBox(page, "ru");
    await page.locator(".menu-family-coming-soon").screenshot({ path: join(output, `kids-box-layout-${width}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const strips = await page.locator(".menu-family-photos").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)));
    assert.equal(new Set(strips).size, 1, "Recipe image strips align despite different component counts");
    for (const recipeId of ["milk-cookie", "simit-break", "milk-roll"])
      await captureCard(page, recipeId, `card-${recipeId}-${width}.png`);
    await page.locator('[data-family-recipe="milk-cookie"]').evaluate(node => node.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: join(output, `cards-${width}.png`), fullPage: false });
    await page.locator('[data-family-recipe="simit-break"] button').click();
    const bounds = await page.locator(".menu-family-dialog").evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height);
    return { viewport: { width, height: width === 1440 ? 900 : 844 }, bounds, photoStripHeights: strips, kidsBox };
  }, { width, height: width === 1440 ? 900 : 844 });

  await run("missing-composite-photo-fallback", async page => {
    await page.route("**/src/products/family-sets-v1/milk-cookie.webp", route => route.abort("failed"));
    await openMenu(page);
    const card = page.locator('[data-family-recipe="milk-cookie"]');
    await card.locator(".menu-family-photos.is-fallback").waitFor();
    const images = card.locator(".menu-family-photos > img");
    assert.equal(await images.count(), 2, "Both ordinary component images replace the failed combined photo");
    for (const image of await images.all()) await image.evaluate(node => node.decode());
    assert.deepEqual(await images.evaluateAll(nodes => nodes.map(node => new URL(node.currentSrc).pathname)),
      ["/src/products/menu-v1/brew-hot--milk.webp", "/src/products/menu-v1/desserts--cookie.webp"]);
    assert.equal(await card.locator(".menu-family-ribbon").textContent(), "❤С ребёнком");
    assert.equal(await card.locator(".menu-family-ribbon").isVisible(), true, "Component-photo fallback restores the localized ribbon");
    assert.equal(await card.locator(".menu-family-price").textContent(), "160 ₺");
    await card.locator("button").click();
    assert.equal(await page.locator(".menu-family-dialog[open] input:checked").count(), 2);
    assert.match(await page.locator(".menu-family-total").textContent(), /160 ₺/);
    return { combinedPhotoBlocked: true, existingComponentPhotosLoaded: 2, localizedRibbonRetained: true, chooseAndPricePreserved: true };
  });

  await run("text-200-percent", async page => {
    await openMenu(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.locator('[data-family-recipe="simit-break"] button').click();
    const dialog = page.locator(".menu-family-dialog[open]");
    assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    await dialog.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.equal(await page.locator("#menu-cart-dialog .menu-cart-line").count(), 3);
    return { textScale: "200%", allThreeComponentsAdded: true, noDialogHorizontalOverflow: true };
  });

  await run("dialog-fallback-keyboard", async page => {
    await openMenu(page, "ru", { fallback: true });
    const trigger = page.locator('[data-family-recipe="simit-break"] button');
    await trigger.click();
    const dialog = page.locator(".menu-family-dialog[open]");
    assert.equal(await dialog.evaluate(node => node.classList.contains("is-fallback")), true);
    await page.keyboard.press("Tab");
    assert.equal(await dialog.locator(".menu-family-close").evaluate(button => document.activeElement === button), true);
    await page.keyboard.press("Shift+Tab");
    assert.equal(await dialog.locator(".menu-family-add").evaluate(button => document.activeElement === button), true);
    await page.keyboard.press("Escape");
    assert.equal(await trigger.evaluate(button => document.activeElement === button), true);
    return { showModalUnavailable: true, keyboardLoop: true, escapeReturnsFocus: true };
  }, { width: 320 });

  await run("late-capacity-atomic-and-double-click", async page => {
    await openMenu(page);
    await page.locator('[data-family-recipe="milk-cookie"] button').click();
    // A change after preview must be seen at confirmation, even without storage events.
    await page.evaluate(async () => {
      const orders = await import("./src/order-draft.js");
      const ids = new Set(["desserts:cookie"]);
      await orders.transactStoredOrderDraft(() => ({ applied: true, blocked: false,
        draft: orders.normalizeOrderDraft({ version: 1, lines: [{ id: "desserts:cookie", quantity: 99 }] }, ids) }), ids,
      { origin: "menu-app" });
    });
    await page.locator(".menu-family-add").click();
    await page.locator('.menu-family-status[data-message="limit"]').waitFor();
    assert.equal(await page.locator(".menu-family-dialog[open]").count(), 1);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines), [{ id: "desserts:cookie", quantity: 99 }]);
    await page.locator('.menu-family-dialog input[value="desserts:cookie"]').uncheck();
    await page.locator(".menu-family-add").evaluate(button => { button.click(); button.click(); });
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines),
      [{ id: "brew-hot:milk", quantity: 1 }, { id: "desserts:cookie", quantity: 99 }]);
    return { reReadLatestDraft: true, blockedWholeSelection: true, doubleActivationAddsMilkOnce: true };
  });

  await run("lazy-load-escape-and-retry", async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/menu-family-ui.js*", async route => { requested(); await gate; await route.continue(); });
    await openMenu(page, "ru", { reveal: false });
    assert.equal(await page.locator(".menu-family-card").count(), 0, "Optional family UI stays lazy");
    await page.locator("#menu-family-trigger").click();
    await pending;
    await page.keyboard.press("Escape");
    release();
    await page.waitForFunction(() => !document.querySelector("#menu-family-trigger").hasAttribute("aria-busy"));
    assert.equal(await page.locator("#menu-family").isHidden(), true, "Escape cancels pending reveal");
    await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    return { lazyUntilIntent: true, escapeCancelsPendingReveal: true, nextClickOpensWithoutAdding: true };
  });

  for (const latest of ["product", "cart"]) await run(`latest-${latest}-supersedes-family`, async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/menu-family-ui.js*", async route => { requested(); await gate; await route.continue(); });
    await openMenu(page, "ru", { reveal: false });
    await page.locator("#menu-family-trigger").click();
    await pending;
    if (latest === "product") await page.locator('[data-product-id="food:sesame-simit"] .full-menu-item-media').click();
    else await page.locator("#menu-cart-trigger").click();
    const dialog = page.locator(latest === "product" ? "#menu-product-dialog[open]" : "#menu-cart-dialog[open]");
    await dialog.waitFor();
    const before = await page.evaluate(() => ({ scroll: scrollY, focus: document.activeElement?.id }));
    release();
    await page.locator(".menu-family-card").first().waitFor({ state: "attached" });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator("#menu-family").isHidden(), true, "A superseded family load cannot expand the background");
    assert.equal(await dialog.count(), 1, "The latest selection stays open");
    const after = await page.evaluate(() => ({ scroll: scrollY, focus: document.activeElement?.id }));
    assert.deepEqual(after, before, "A superseded family load cannot steal focus or scroll");
    return { delayedFamilyLoad: true, latest, backgroundStayedHidden: true, before, after };
  });

  await run("latest-family-supersedes-product", async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/menu-order-ui.js*", async route => { requested(); await gate; await route.continue(); });
    await openMenu(page, "ru", { reveal: false });
    await page.locator('[data-product-id="food:sesame-simit"] .full-menu-item-media').click();
    await pending;
    await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator("#menu-family-title").evaluate(node => document.activeElement === node), true);
    release();
    await page.locator("#menu-product-unit-price").waitFor({ state: "attached" });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator(".menu-dialog[open]").count(), 0);
    assert.equal(await page.locator("#menu-family-title").evaluate(node => document.activeElement === node), true);
    return { delayedProductLoad: true, latestFamilyKeptFocus: true, noDelayedProductPopup: true };
  });

  await run("repeated-family-intent-latest-language", async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let downloads = 0;
    await page.addInitScript(() => {
      window.__familyScrollCount = 0;
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (...args) {
        if (this.id === "menu-family") window.__familyScrollCount += 1;
        return original.apply(this, args);
      };
    });
    await page.route("**/menu-family-ui.js*", async route => { downloads += 1; requested(); await gate; await route.continue(); });
    await openMenu(page, "ru", { reveal: false });
    await page.locator("#menu-family-trigger").evaluate(button => { button.click(); button.click(); });
    await pending;
    await page.locator('.lang-button[data-lang="en"]').click();
    release();
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(downloads, 1);
    assert.equal(await page.locator("#menu-family-title").textContent(), "With kids");
    assert.equal(await page.evaluate(() => window.__familyScrollCount), 1, "Only the latest repeated intent reveals and scrolls");
    await page.locator(".menu-family-hide").click();
    assert.equal(await page.locator("#menu-family").isHidden(), true);
    await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator("#menu-family-trigger").getAttribute("aria-busy"), null);
    return { repeatedClicks: 2, downloads, latestLanguage: "en", singleInitialReveal: true, hideAndReopen: true };
  });

  await run("family-preview-supersedes-product", async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/menu-order-ui.js*", async route => { requested(); await gate; await route.continue(); });
    await openMenu(page);
    await page.locator('[data-product-id="food:sesame-simit"] .full-menu-item-media').click();
    await pending;
    await page.locator('[data-family-recipe="milk-cookie"] button').click();
    await page.locator(".menu-family-dialog[open]").waitFor();
    release();
    await page.locator("#menu-product-unit-price").waitFor({ state: "attached" });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator(".menu-dialog[open]").count(), 0);
    assert.equal(await page.locator(".menu-family-dialog[open]").count(), 1);
    assert.equal(await page.locator("#menu-family-preview-title").evaluate(node => document.activeElement === node), true);
    await page.locator(".menu-family-close").click();
    assert.equal(await page.locator(".menu-family-dialog[open]").count(), 0);
    return { familyCardWinsOverPendingProduct: true, noFocusTheft: true, closeWorks: true };
  });

  await run("deep-link", async page => {
    await openMenu(page, "en", { deepLink: true });
    assert.equal(await page.locator("#menu-family-title").textContent(), "With kids");
    assert.equal(await page.locator("#menu-family-trigger").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    return { directMenuFamilyHash: true, noAutomaticAddition: true };
  });

  await run("optional-module-failure-recovery", async page => {
    const requestedUrls = [];
    await page.route("**/menu-family-ui.js*", route => {
      requestedUrls.push(route.request().url());
      return requestedUrls.length === 1 ? route.abort("failed") : route.continue();
    });
    await openMenu(page, "ru", { reveal: false });
    await page.locator("#menu-family-trigger").click();
    await page.locator("#menu-cart-status.is-visible").waitFor();
    assert.equal(await page.locator("#menu-family").isHidden(), true);
    await page.locator("#menu-family-trigger").click();
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator("#menu-cart-status").evaluate(node => node.classList.contains("is-visible")), false,
      "Successful recovery clears the old failure notice");
    assert.equal(requestedUrls.length, 2);
    assert.notEqual(requestedUrls[0], requestedUrls[1], "Explicit retry bypasses the failed module URL");
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    return { firstOptionalImportBlocked: true, secondIntentRecovered: true, distinctModuleUrls: true };
  });

  await run("escape-during-cart-load", async page => {
    let release, requested;
    const pending = new Promise(resolve => { requested = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/menu-order-ui.js*", async route => { requested(); await gate; await route.continue(); });
    await openMenu(page);
    await page.locator('[data-family-recipe="milk-cookie"] button').click();
    await page.locator(".menu-family-add").click();
    await pending;
    await page.keyboard.press("Escape");
    release();
    // This element is created only when the delayed order UI initializes.
    await page.locator("#menu-product-unit-price").waitFor({ state: "attached" });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator("#menu-cart-dialog[open]").count(), 0, "Cancelled async feedback must not reopen later");
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines),
      [{ id: "brew-hot:milk", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }]);
    return { orderUiLoadDelayed: true, escapeCancelledPopup: true, explicitlyAddedSelectionPreserved: true };
  });

  await run("pending-family-save-keeps-new-preview-busy", async (page, context) => {
    await openMenu(page);
    await page.evaluate(() => {
      window.__orderTransactionsRequested = 0;
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (this.name === "robys-order-transactions.v1" && args[1] === "readwrite") window.__orderTransactionsRequested += 1;
        return original.apply(this, args);
      };
    });
    const gate = await context.newPage();
    await gate.goto(`${origin}/menu.html`);
    const hold = async label => gate.evaluate(async label => {
      const request = indexedDB.open("robys-order-transactions.v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("shared-order");
      const database = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const transaction = database.transaction("shared-order", "readwrite");
      const store = transaction.objectStore("shared-order");
      const keepAlive = () => { const request = store.get("keep-alive"); request.onsuccess = keepAlive; };
      keepAlive();
      window.__orderHolds ??= {};
      window.__orderHolds[label] = { transaction, database };
    }, label);
    const release = async label => gate.evaluate(label => {
      const held = window.__orderHolds[label];
      held.transaction.abort(); held.database.close();
    }, label);
    try {
      await hold("before-first");
      await page.locator('[data-family-recipe="milk-cookie"] button').click();
      const beforeFirst = await page.evaluate(() => window.__orderTransactionsRequested);
      await page.locator(".menu-family-add").click();
      await page.waitForFunction(previous => window.__orderTransactionsRequested > previous, beforeFirst);
      // Queue a second lock behind the first Add, then queue the new preview's
      // Add behind it. This lets the old operation finish while the new one waits.
      await hold("before-second");
      await page.locator(".menu-family-close").click();
      await page.locator('[data-family-recipe="simit-break"] button').click();
      const beforeSecond = await page.evaluate(() => window.__orderTransactionsRequested);
      await page.locator(".menu-family-add").click();
      await page.waitForFunction(previous => window.__orderTransactionsRequested > previous, beforeSecond);
      await release("before-first");
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("robys-menu-order.v2") ?? "null")?.lines.length === 2);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator(".menu-family-dialog[open]").count(), 1, "The old completion cannot close the latest preview");
      const cookie = page.locator('.menu-family-dialog input[value="desserts:cookie"]');
      await cookie.uncheck();
      assert.equal(await page.locator(".menu-family-add").isDisabled(), true,
        "Finishing the old Add cannot clear the new pending Add's busy state");
      await cookie.check();
      await release("before-second");
      await page.locator("#menu-cart-dialog[open]").waitFor();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines),
        [{ id: "brew-hot:milk", quantity: 2 }, { id: "desserts:cookie", quantity: 2 }, { id: "food:sesame-simit", quantity: 1 }]);
      return { twoQueuedAdds: true, oldCompletionPreservesNewBusyState: true, eachConfirmedSelectionAddedOnce: true };
    } finally { await gate.close(); }
  });

  await run("no-js-fallback", async page => {
    await page.goto(`${origin}/menu.html`);
    await page.locator("#menu-family-trigger").click();
    assert.equal(new URL(page.url()).hash, "#menu-family-fallback");
    assert.equal(await page.locator("#menu-family-fallback a").count(), 4);
    await page.locator("#menu-family-fallback a").first().click();
    assert.equal(new URL(page.url()).pathname, "/src/products/menu-v1/brew-hot--milk.webp");
    return { javaScriptDisabled: true, anchorReached: true, existingProductPhotoOpened: true };
  }, { javaScriptEnabled: false });
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(fixture, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.cases.filter(entry => entry.status === "PASS").length,
    failed: report.cases.filter(entry => entry.status === "FAIL").length };
  persist();
}
console.log(JSON.stringify(report.summary));
if (report.summary.failed) process.exitCode = 1;
