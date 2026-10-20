import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";

// Repository CI browser test: public bytes over HTTPS and the real CSP.
// Recovery cases explicitly replace one module response with a failed module.
const repo = resolve(new URL("..", import.meta.url).pathname);
process.chdir(repo);
const output = resolve(".artifacts/menu-feed"); mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-feed-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    let file = resolve(repo, "." + decodeURIComponent(new URL(request.url, "https://localhost").pathname));
    if (!file.startsWith(repo + sep)) return response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const engine = process.env.CHECKOUT_BROWSERS ?? "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(engine));
const report = { head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), engine,
  runtimeSha256: createHash("sha256").update(readFileSync("menu-feed.js")).digest("hex"),
  expectedWebKitScreenshotCspRejections: 0, cases: [] };
const catalog = feedProducts(menuCategories);
const screenshotCspBudget = new WeakMap();
const webkitScreenshotCspMessage = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
function observeErrors(page, errors) {
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() !== "error") return;
    // Playwright's WebKit screenshot preparation appends one inline `body {}`
    // stylesheet to sync animations (server/screenshotter.js). Our real CSP
    // rejects that test-only style. Permit exactly that one message during the
    // awaited capture; application CSP errors and additional errors still fail.
    if (engine === "webkit" && screenshotCspBudget.get(page) === 1 && message.text() === webkitScreenshotCspMessage) {
      screenshotCspBudget.set(page, 0);
      report.expectedWebKitScreenshotCspRejections++;
      return;
    }
    errors.push(`console.error: ${message.text()}`);
  });
}
async function captureScreenshot(page, options) {
  if (engine === "webkit") screenshotCspBudget.set(page, 1);
  try { await page.screenshot(options); }
  finally { screenshotCspBudget.delete(page); }
}
async function waitForMenuMode(page, mode) {
  await page.locator('html[data-menu-view-ready="true"]').waitFor();
  assert.equal(new URL(page.url()).pathname, mode === "feed" ? "/menu-feed.html" : "/menu.html");
  await page.locator(mode === "feed" ? '#feed[data-ready="true"]' : '#menu-root[data-ready="true"]').waitFor();
}
const storedOrder = page => page.evaluate(async ids => {
  const storage = await import("/order-storage.js");
  return storage.readLatestStoredOrderDraft(new Set(ids));
}, catalog.map(product => product.id));
const moneyValue = value => Number(value.replace(/[^\d]/g, ""));
const expectedTotal = draft => draft.lines.reduce((sum, line) =>
  sum + catalog.find(product => product.id === line.id).item.price * line.quantity, 0);
async function assertSharedOrder(page, expected) {
  const total = expectedTotal(expected), quantity = expected.groups.reduce((sum, group) => sum + group.quantity, 0);
  await page.waitForFunction(({ quantity, total }) =>
    Number(document.querySelector("#menu-cart-count").textContent) === quantity
      && Number(document.querySelector("#menu-cart-total").textContent.replace(/[^\d]/g, "")) === total,
  { quantity, total });
  assert.deepEqual(await storedOrder(page), expected, "Switching presentation preserves every item, flavor and group quantity");
}
async function roundTripOrder(page, expected, language = "en") {
  const productId = new URL(page.url()).searchParams.get("item");
  await page.locator('.feed-view-switch [data-menu-view="list"]').click();
  await waitForMenuMode(page, "list");
  assert.equal(await page.locator("html").getAttribute("lang"), language);
  assert.equal(new URL(page.url()).searchParams.get("product"), productId, "The list preserves the feed's product deep link");
  await assertSharedOrder(page, expected);
  if (productId) {
    // The canonical list opens an explicit product link as a preview.
    await page.locator("#menu-product-dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("#menu-product-dialog[open]").waitFor({ state: "hidden" });
    assert.deepEqual(await storedOrder(page), expected, "Closing the linked preview leaves the order unchanged");
  }
  await page.locator("#menu-cart-trigger").click();
  await page.locator("#menu-cart-dialog[open]").waitFor();
  assert.equal(moneyValue(await page.locator("#menu-cart-dialog-total").textContent()), expectedTotal(expected));
  await page.keyboard.press("Escape");
  await page.locator('.menu-view-switch [data-menu-view="feed"]').click();
  await waitForMenuMode(page, "feed");
  assert.equal(await page.locator("html").getAttribute("lang"), language);
  await assertSharedOrder(page, expected);
}
async function assertStickySwitch(page, mode) {
  const selector = mode === "feed" ? ".feed-view-switch" : ".menu-view-switch";
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
  await page.waitForFunction(selector => {
    const link = document.querySelector(`${selector} a`), box = link.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return scrollY > 0 && box.top >= 0 && box.bottom <= innerHeight && (link === hit || link.contains(hit));
  }, selector);
  assert.equal(await page.locator(`${selector} [aria-current="page"]`).getAttribute("data-menu-view"), mode);
}
async function openDiscovery(page) {
  await page.locator("#feed-discover-open").click();
  await page.locator("#feed-discover[open]").waitFor();
  assert.equal(await page.locator("#feed-search").evaluate(node => node === document.activeElement), true);
}
async function closeDiscovery(page) {
  await page.locator("#feed-discover-done").click();
  await page.locator("#feed-discover[open]").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement === document.querySelector("#feed-discover-open"));
}
async function chooseCategory(page, id) {
  await openDiscovery(page);
  await page.locator(`[data-category="${id}"]`).click();
  assert.equal(await page.locator("#feed-discover").evaluate(node => node.open), true, "Category selection keeps discovery open until Done");
  await closeDiscovery(page);
}
async function waitForCounter(page, index, count = catalog.length) {
  await page.waitForFunction(({ index, count }) => document.querySelector("#feed-counter").textContent === `${index + 1} / ${count}`, { index, count });
}
async function secondCardPosition(page) {
  return page.locator(".feed-card").nth(1).evaluate(card => {
    const rect = card.getBoundingClientRect();
    const top = Math.max(document.querySelector(".feed-header").getBoundingClientRect().bottom,
      document.querySelector(".feed-tools").getBoundingClientRect().bottom);
    return { product: card.dataset.productId, top: rect.top, gapBelowTools: rect.top - top, scrollY };
  });
}
async function assertLandingPhotoFits(page) {
  // Instagram posts are continuous content: the full-width photograph leads
  // the first screen, while the purchase controls may follow below it.
  await page.waitForFunction(() => {
    const card = document.querySelector(".feed-card");
    const top = Math.max(document.querySelector(".feed-header").getBoundingClientRect().bottom,
      document.querySelector(".feed-tools").getBoundingClientRect().bottom);
    const bottom = document.querySelector("#menu-cart-trigger").getBoundingClientRect().top;
    return [".feed-card-header", ".feed-photo>img"].every(selector => {
      const node = card.querySelector(selector), box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return box.width > 0 && box.top >= top - 1 && box.bottom <= bottom + 1 && (node === hit || node.contains(hit));
    });
  });
}
async function assertPurchaseControlsReachable(page, index = 0) {
  const card = page.locator(".feed-card").nth(index);
  const delta = await card.locator(".feed-card-content").evaluate(node => {
    const bottom = document.querySelector("#menu-cart-trigger").getBoundingClientRect().top;
    return Math.max(0, node.getBoundingClientRect().bottom - bottom + 12);
  });
  if (delta) {
    await page.mouse.move(185, 400);
    await page.mouse.wheel(0, delta);
  }
  await page.waitForFunction(index => {
    const card = document.querySelectorAll(".feed-card")[index];
    const top = Math.max(document.querySelector(".feed-header").getBoundingClientRect().bottom,
      document.querySelector(".feed-tools").getBoundingClientRect().bottom);
    const bottom = document.querySelector("#menu-cart-trigger").getBoundingClientRect().top;
    return ["h3", ".feed-price", ".feed-add"].every(selector => {
      const node = card.querySelector(selector), box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return box.width > 0 && box.top >= top - 1 && box.bottom <= bottom + 1 && (node === hit || node.contains(hit));
    });
  }, index);
}
let browser;
try {
  browser = await ({ chromium, firefox, webkit })[engine].launch({ headless: true });
  for (const [width, language] of [[320, "ru"], [390, "tr"], [390, "en"], [390, "ru"], [1440, "en"], [1440, "ru"]]) {
    const context = await browser.newContext({ viewport: { width, height: width > 800 ? 1000 : 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(lang => localStorage.setItem("robys-language", lang), language);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    await page.locator(".feed-card").first().locator(".feed-photo>img").evaluate(image => image.decode());
    await page.locator(".feed-brand img").evaluate(image => image.decode());
    await page.evaluate(() => document.fonts.ready);
    const photo = await page.locator(".feed-photo>img").first().evaluate(image => {
      const rect = image.getBoundingClientRect();
      return { width: rect.width, height: rect.height, fit: getComputedStyle(image).objectFit,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        widthAttribute: image.getAttribute("width"), heightAttribute: image.getAttribute("height") };
    });
    assert.deepEqual([photo.naturalWidth, photo.naturalHeight], [1024, 1024]);
    assert.deepEqual([photo.widthAttribute, photo.heightAttribute], ["1024", "1024"]);
    assert.ok(Math.abs(photo.width - photo.height) <= 1, `Square photo has ${photo.width} × ${photo.height} rendered bounds`);
    assert.ok(photo.width > 0 && photo.width <= 460, `Photo width ${photo.width} exceeds the bounded feed column`);
    assert.equal(photo.fit, "contain", "The full product photograph must remain visible");
    const brand = await page.locator(".feed-brand img").evaluate(image => image.currentSrc);
    assert.match(brand, width <= 760 ? /robys-compact-master-v1\.svg/ : /robys-header-master-v1\.svg/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (width <= 760) {
      assert.ok(photo.width >= width - 2, `Mobile photograph must fill the ${width}px feed column, received ${photo.width}px`);
      await assertLandingPhotoFits(page);
    }
    await captureScreenshot(page, { path: `${output}/${engine}-${width}-${language}.png` });
    if (width <= 760) await assertPurchaseControlsReachable(page);
    await page.locator(".feed-like").first().click();
    await page.locator('.feed-like[aria-pressed="true"]').first().waitFor();
    await page.locator(".feed-card").first().evaluate(card => card.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.locator(".feed-avatar").first().evaluate(image => image.decode());
    await captureScreenshot(page, { path: `${output}/${engine}-${width}-${language}-liked-card.png` });
    // Filtering, atomic add, repeat add and removal use the actual user controls.
    await chooseCategory(page, "hot-coffee");
    const espresso = page.locator('[data-product-id="hot-coffee:espresso"]');
    await espresso.locator(".feed-add").click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    await espresso.locator(".feed-add").click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2");
    assert.match(await page.locator("#menu-cart-total").textContent(), /220/);
    await openDiscovery(page);
    await page.locator("#feed-search").fill("missing-zx984");
    assert.equal(await page.locator("#feed-discover").evaluate(node => node.open), true);
    await closeDiscovery(page);
    assert.equal(await page.locator("#feed-empty").isVisible(), true);
    await openDiscovery(page);
    await page.locator("#feed-search-clear").click();
    await page.locator('[data-category="cold-coffee"]').click();
    await closeDiscovery(page);
    const flavoured = page.locator('[data-product-id="cold-coffee:flavoured-iced-caffe-latte"]');
    await flavoured.locator(".feed-add").click();
    assert.equal(await flavoured.locator("select").evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator("#menu-cart-count").textContent(), "2");
    await flavoured.locator("select").selectOption("vanilla");
    await flavoured.locator(".feed-add").click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "3");
    assert.match(await page.locator("#menu-cart-total").textContent(), /420/);
    await page.locator("#menu-cart-trigger").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    const firstLine = page.locator(".menu-cart-line").filter({ hasText: /Espresso|Эспрессо/ });
    await firstLine.locator(".menu-cart-remove").click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    assert.match(await page.locator("#menu-cart-dialog-total").textContent(), /200/);
    await page.locator("#menu-checkout-trigger").click();
    await page.locator(".order-checkout-dialog[open]").waitFor();
    await page.locator(".order-ticket-qr").waitFor();
    assert.equal(await page.locator(".order-ticket-qr").count(), 1);
    assert.match(await page.locator(".order-ticket-total").textContent(), /200/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#menu-checkout-trigger").evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#menu-cart-trigger").evaluate(node => node === document.activeElement), true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    const other = await context.newPage(); observeErrors(other, errors);
    await other.goto(`${origin}/menu.html#hot-coffee`);
    await other.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    assert.match(await other.locator("#menu-cart-total").textContent(), /200/);
    await other.locator('[data-product-id="hot-coffee:espresso"] .full-menu-item-media').click();
    await other.locator("#menu-add-to-cart").click();
    await other.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2");
    await page.bringToFront();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2");
    assert.match(await page.locator("#menu-cart-total").textContent(), /310/);
    assert.deepEqual(errors, []);
    report.cases.push({ width, language, result: "PASS", totalAfterCrossPageAdd: 310, sharedCart: true, qr: true,
      focus: true, overflow: false, photoUncropped: true, photoWidth: photo.width, canonicalResponsiveBrand: true,
      discoveryFocus: true, firstMobilePhotoVisibleWithoutScrolling: width <= 760, purchaseControlsReachableByNaturalScroll: width <= 760, consoleErrors: false });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => localStorage.setItem("robys-language", "en"));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    const espresso = page.locator('[data-product-id="hot-coffee:espresso"]');
    await espresso.locator(".feed-like").focus();
    assert.match(await espresso.locator(".feed-like").getAttribute("aria-label"), /like.*espresso/i);
    await page.keyboard.press("Space");
    assert.equal(await espresso.locator(".feed-like").getAttribute("aria-pressed"), "true");
    assert.match(await espresso.locator(".feed-like").getAttribute("aria-label"), /unlike.*espresso/i);
    await page.locator("#feed-liked-filter").click();
    assert.equal(await page.locator("#feed-liked-filter").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".feed-card").count(), 1);
    assert.equal(await page.locator(".feed-card").getAttribute("data-product-id"), "hot-coffee:espresso");
    await page.reload();
    await page.locator('#feed[data-ready="true"]').waitFor();
    assert.equal(await espresso.locator(".feed-like").getAttribute("aria-pressed"), "true");
    assert.equal(await page.evaluate(() => localStorage.getItem("robys-feed-like-v1:hot-coffee:espresso")), "1");
    // The view filter need not persist; ensure both tabs show the whole feed.
    if (await page.locator("#feed-liked-filter").getAttribute("aria-pressed") === "true") await page.locator("#feed-liked-filter").click();
    const other = await context.newPage(); other.setDefaultTimeout(15000);
    observeErrors(other, errors);
    await other.goto(`${origin}/menu-feed.html`);
    await other.locator('#feed[data-ready="true"]').waitFor();
    const otherChoice = other.locator(".feed-card").first();
    const otherId = await otherChoice.getAttribute("data-product-id");
    assert.notEqual(otherId, "hot-coffee:espresso", "The cross-tab addition must target a different product");
    await otherChoice.locator(".feed-like").click();
    await page.waitForFunction(id => [...document.querySelectorAll(".feed-card")].find(card => card.dataset.productId === id)
      ?.querySelector(".feed-like")?.getAttribute("aria-pressed") === "true", otherId);
    await other.locator('[data-product-id="hot-coffee:espresso"] .feed-like').click();
    await page.waitForFunction(() => document.querySelector('[data-product-id="hot-coffee:espresso"] .feed-like')?.getAttribute("aria-pressed") === "false");
    await page.bringToFront();
    await page.locator("#feed-liked-filter").click();
    assert.equal(await page.locator(".feed-card").count(), 1);
    assert.equal(await page.locator(".feed-card").getAttribute("data-product-id"), otherId);
    await otherChoice.locator(".feed-like").click();
    await page.locator("#feed-empty").waitFor({ state: "visible" });
    assert.equal(await page.locator(".feed-card").count(), 0);
    // Seed ten real catalog choices through the other tab's storage boundary,
    // then load the second page of the liked view using its keyboard control.
    if (await other.locator(".feed-card").count() < 10) {
      await other.locator("#feed-more").evaluate(button => button.focus({ preventScroll: true }));
      await other.keyboard.press("Enter");
    }
    const likedIds = await other.locator(".feed-card").evaluateAll(cards => cards.slice(0, 10).map(card => card.dataset.productId));
    assert.equal(likedIds.length, 10);
    await other.evaluate(ids => { for (const id of ids) localStorage.setItem(`robys-feed-like-v1:${id}`, "1"); }, likedIds);
    await page.waitForFunction(() => /10$/.test(document.querySelector("#feed-liked-label").textContent));
    await page.bringToFront();
    if (await page.locator(".feed-card").count() < 10) {
      await page.locator("#feed-more").evaluate(button => button.focus({ preventScroll: true }));
      await page.keyboard.press("Enter");
    }
    assert.equal(await page.locator(".feed-card").count(), 10);
    const seenOnlyId = likedIds.at(-1);
    await page.evaluate(id => {
      window.__feedRetainedCards = [...document.querySelectorAll(".feed-card")];
      window.__feedRetainedFocus = window.__feedRetainedCards.find(card => card.dataset.productId === id).querySelector(".feed-like");
      window.__feedRetainedFocus.focus({ preventScroll: true });
    }, seenOnlyId);
    assert.equal(await page.evaluate(id => [...document.querySelectorAll(".feed-card")].find(card => card.dataset.productId === id)
      .querySelector(".feed-seen").dataset.seen, seenOnlyId), "false");
    await other.evaluate(id => localStorage.setItem(`robys-feed-seen-v1:${id}`, "1"), seenOnlyId);
    await page.waitForFunction(id => [...document.querySelectorAll(".feed-card")].find(card => card.dataset.productId === id)
      ?.querySelector(".feed-seen")?.dataset.seen === "true", seenOnlyId);
    assert.deepEqual(await page.evaluate(() => {
      const current = [...document.querySelectorAll(".feed-card")];
      return { count: current.length, sameCards: current.every((card, index) => card === window.__feedRetainedCards[index]),
        sameFocus: document.activeElement === window.__feedRetainedFocus };
    }), { count: 10, sameCards: true, sameFocus: true }, "A seen-only storage event must preserve the loaded liked cards and keyboard focus");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "personal-likes", result: "PASS", keyboardToggle: true, reloadPersistence: true,
      crossTabLikeAndUnlike: true, likedFilterTracksExternalRemoval: true, seenOnlyStoragePreservesFocusAndPages: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.route("**/*?feed-test=unavailable", route => route.abort());
    await context.addInitScript(() => {
      localStorage.setItem("robys-language", "en");
      // Controlled Page Visibility input tests the production guard uniformly
      // across engines; it does not claim an operating-system background test.
      window.__feedTestHidden = true;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__feedTestHidden });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__feedTestHidden ? "hidden" : "visible" });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    // This journey deliberately aborts one image response. Keep the existing
    // uncaught-exception check without treating its expected network console
    // error as a happy-path failure; normal image loading is covered above.
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const first = page.locator(".feed-card").nth(0), shortVisit = page.locator(".feed-card").nth(1), delayedPhoto = page.locator(".feed-card").nth(2);
    await first.locator(".feed-photo>img").evaluate(async image => { image.scrollIntoView({ block: "center", behavior: "instant" }); await image.decode(); });
    // This bounded wait is the measured exposure requirement, not an arbitrary
    // readiness delay: hidden or sub-second exposure must never mark a view.
    await page.waitForTimeout(1200);
    assert.equal(await first.locator(".feed-seen").getAttribute("data-seen"), "false");
    assert.equal(await page.locator(".feed-card").nth(5).locator(".feed-seen").getAttribute("data-seen"), "false");
    assert.match(await page.locator("#feed-seen-summary").textContent(), /Viewed by you:\s*0\s*\/\s*63/i);
    await page.evaluate(async () => {
      window.__feedTestHidden = false; document.dispatchEvent(new Event("visibilitychange"));
      await new Promise(resolve => setTimeout(resolve, 250));
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    });
    await page.waitForTimeout(1200);
    assert.equal(await first.locator(".feed-seen").getAttribute("data-seen"), "false", "Pagehide must cancel the incomplete dwell");
    // Exercise the persisted pageshow handler without a reload or another
    // intersection/visibility event that could independently restart the timer.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await page.waitForTimeout(250);
    assert.equal(await first.locator(".feed-seen").getAttribute("data-seen"), "false");
    await page.waitForFunction(() => document.querySelector(".feed-card .feed-seen")?.dataset.seen === "true");
    assert.match(await page.locator("#feed-seen-summary").textContent(), /Viewed by you:\s*1\s*\/\s*63/i);
    await page.evaluate(() => { window.__feedTestHidden = true; document.dispatchEvent(new Event("visibilitychange")); });
    await shortVisit.locator(".feed-photo>img").evaluate(async image => { image.scrollIntoView({ block: "center", behavior: "instant" }); await image.decode(); });
    await page.evaluate(async () => {
      window.__feedTestHidden = false; document.dispatchEvent(new Event("visibilitychange"));
      await new Promise(resolve => setTimeout(resolve, 250));
      window.__feedTestHidden = true; document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1200);
    assert.equal(await shortVisit.locator(".feed-seen").getAttribute("data-seen"), "false");
    const delayedId = await delayedPhoto.getAttribute("data-product-id");
    await delayedPhoto.locator(".feed-photo>img").evaluate(async image => {
      image.scrollIntoView({ block: "center", behavior: "instant" }); await image.decode();
      const url = new URL(image.src); url.searchParams.set("feed-test", "unavailable"); image.src = url.href;
    });
    await page.waitForFunction(id => {
      const image = [...document.querySelectorAll(".feed-card")].find(card => card.dataset.productId === id)?.querySelector(".feed-photo>img");
      return image?.complete && image.naturalWidth === 0;
    }, delayedId);
    await page.evaluate(() => { window.__feedTestHidden = false; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(1200);
    assert.equal(await delayedPhoto.locator(".feed-seen").getAttribute("data-seen"), "false", "A visible failed image is not a product view");
    await delayedPhoto.locator(".feed-photo>img").evaluate(async image => {
      const url = new URL(image.src); url.searchParams.set("feed-test", "recovered");
      // Firefox can still expose the aborted request to decode() immediately
      // after src changes. Wait for this new request's load event first.
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          image.removeEventListener("load", loaded);
          image.removeEventListener("error", failed);
        };
        const loaded = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Recovered product photograph failed to load")); };
        const timeout = setTimeout(() => { cleanup(); reject(new Error("Recovered product photograph load timed out")); }, 10000);
        image.addEventListener("load", loaded, { once: true });
        image.addEventListener("error", failed, { once: true });
        image.src = url.href;
      });
      await image.decode();
    });
    await page.waitForFunction(id => [...document.querySelectorAll(".feed-card")].find(card => card.dataset.productId === id)
      ?.querySelector(".feed-seen")?.dataset.seen === "true", delayedId);
    assert.match(await page.locator("#feed-seen-summary").textContent(), /Viewed by you:\s*2\s*\/\s*63/i);
    assert.equal(await page.evaluate(id => localStorage.getItem(`robys-feed-seen-v1:${id}`), delayedId), "1");
    await page.waitForTimeout(1200);
    assert.match(await page.locator("#feed-seen-summary").textContent(), /Viewed by you:\s*2\s*\/\s*63/i);
    assert.equal(await page.locator(".feed-card").nth(5).locator(".feed-seen").getAttribute("data-seen"), "false");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "personal-views", result: "PASS", controlledVisibilityGuard: true, subSecondExposureExcluded: true,
      controlledPersistedPageRestore: true, failedImageExcluded: true, recoveredImageCounted: true, belowFoldExcluded: true, uniqueProductCount: 2 });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      localStorage.setItem("robys-language", "en");
      window.__feedTestHidden = true;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__feedTestHidden });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__feedTestHidden ? "hidden" : "visible" });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const card = page.locator(".feed-card").first(), photo = card.locator(".feed-photo>img");
    const id = await card.getAttribute("data-product-id");
    await photo.evaluate(image => image.decode());
    await assertLandingPhotoFits(page);
    const exposure = () => photo.evaluate(image => {
      const rect = image.getBoundingClientRect();
      const top = Math.max(document.querySelector(".feed-header").getBoundingClientRect().bottom,
        document.querySelector(".feed-tools").getBoundingClientRect().bottom);
      const bottom = document.querySelector("#menu-cart-trigger").getBoundingClientRect().top;
      return { browser: Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)) / rect.height,
        unobscured: Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top)) / rect.height };
    });
    assert.ok((await exposure()).unobscured >= .5);
    // Keep the entire interruption in one browser task so tool latency cannot
    // accidentally complete the first dwell before the photo is occluded.
    await photo.evaluate(async image => {
      window.__feedTestHidden = false; document.dispatchEvent(new Event("visibilitychange"));
      await new Promise(resolve => setTimeout(resolve, 250));
      const rect = image.getBoundingClientRect();
      const top = Math.max(document.querySelector(".feed-header").getBoundingClientRect().bottom,
        document.querySelector(".feed-tools").getBoundingClientRect().bottom);
      window.scrollTo({ top: scrollY + rect.top - (top - rect.height * .6), behavior: "instant" });
    });
    const obscured = await exposure();
    assert.ok(obscured.browser >= .5 && obscured.unobscured < .5,
      `The same photograph must remain an observer candidate while sticky controls cover it: ${JSON.stringify(obscured)}`);
    await page.waitForTimeout(1200);
    assert.equal(await card.locator(".feed-seen").getAttribute("data-seen"), "false", "Sticky chrome interrupts a continuous product view");
    assert.notEqual(await page.evaluate(productId => localStorage.getItem(`robys-feed-seen-v1:${productId}`), id), "1");
    await photo.evaluate(image => {
      const rect = image.getBoundingClientRect();
      const top = Math.max(document.querySelector(".feed-header").getBoundingClientRect().bottom,
        document.querySelector(".feed-tools").getBoundingClientRect().bottom);
      window.scrollTo({ top: scrollY + rect.top - top - 10, behavior: "instant" });
    });
    const revealed = await exposure();
    assert.ok(revealed.browser >= .5 && revealed.unobscured >= .5,
      `Revealing must stay above the observer threshold: ${JSON.stringify(revealed)}`);
    await page.waitForTimeout(250);
    assert.equal(await card.locator(".feed-seen").getAttribute("data-seen"), "false", "Revealing the photograph starts a fresh full dwell");
    await page.waitForFunction(productId => [...document.querySelectorAll(".feed-card")].find(node => node.dataset.productId === productId)
      ?.querySelector(".feed-seen")?.dataset.seen === "true", id);
    assert.equal(await page.evaluate(productId => localStorage.getItem(`robys-feed-seen-v1:${productId}`), id), "1");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "view-dwell-sticky-occlusion", result: "PASS", product: id,
      interruptedDwellExcluded: true, observerThresholdPreserved: true, revealStartsFreshDwell: true,
      obscuredBrowserFraction: obscured.browser, obscuredUsableFraction: obscured.unobscured });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      for (const method of ["getItem", "setItem", "removeItem"]) Object.defineProperty(Storage.prototype, method, {
        configurable: true, value() { throw new DOMException("Injected unavailable browser storage", "SecurityError"); }
      });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.locator('[data-lang="en"]').click();
    assert.match(await page.locator("#feed-personal-note").textContent(), /this page only/i);
    await page.locator(".feed-like").first().click();
    assert.equal(await page.locator(".feed-like").first().getAttribute("aria-pressed"), "true");
    await page.locator("#feed-liked-filter").click();
    assert.equal(await page.locator(".feed-card").count(), 1);
    await page.reload();
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.locator('[data-lang="en"]').click();
    assert.equal(await page.locator(".feed-like").first().getAttribute("aria-pressed"), "false");
    assert.match(await page.locator("#feed-personal-note").textContent(), /this page only/i);
    await page.locator("#feed-liked-filter").click();
    assert.equal(await page.locator("#feed-empty").isVisible(), true);
    assert.deepEqual(errors, []);
    report.cases.push({ case: "personal-storage-unavailable", result: "PASS", memoryLikesAndFilter: true,
      honestPersistenceCopy: true, noFalseReloadPersistence: true });
    await context.close();
  }
  for (const [kind, fileName] of [["product", "menu-order-ui"], ["combos", "menu-combos-ui"]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const waiting = new Promise(resolve => { entered = resolve; });
    await context.route(`**/${fileName}.js*`, async route => { entered(); await gate; await route.continue(); });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    try {
      await page.goto(`${origin}/menu-feed.html?view=feed&lang=en`);
      await waitForMenuMode(page, "feed");
      const trigger = kind === "product" ? page.locator(".feed-details").first() : page.locator("#menu-combos-trigger");
      await trigger.click(); await waiting;
      await openDiscovery(page);
      if (kind === "combos") await page.locator('[data-category="cold-coffee"]').click();
      const responseReady = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/${fileName}.js`));
      release();
      const response = await responseReady;
      await page.evaluate(async url => {
        await import(url);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, response.url());
      assert.equal(await page.locator("#feed-discover[open]").count(), 1, "A newer search intent keeps its dialog");
      assert.equal(await page.locator("#menu-product-dialog[open],#menu-cart-dialog[open],.menu-combos-dialog[open]").count(), 0,
        "A delayed previous action cannot open a dialog above Search");
      if (kind === "product") assert.equal(await page.locator("#feed-search").evaluate(node => node === document.activeElement), true);
      else {
        assert.equal(await page.locator("#menu-combos").isHidden(), true, "The old collection cannot reveal after a new category choice");
        assert.equal(await page.locator('[data-category="cold-coffee"]').getAttribute("aria-pressed"), "true");
      }
      assert.deepEqual(errors, []);
      report.cases.push({ case: `feed-delayed-${kind}-intent`, result: "PASS", delayedModule: fileName,
        newerSearchPreserved: true, oldDialogNeverOpens: true, categoryChoicePreserved: kind === "combos", consoleErrors: false });
    } finally { release(); await context.close(); }
  }
  for (const [moduleName, fileName] of [["storage", "order-storage"], ["order-ui", "menu-order-ui"], ["checkout", "order-checkout"]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const requests = [];
    await context.route(`**/${fileName}.js*`, route => {
      requests.push(route.request().url());
      return requests.length === 1
        ? route.fulfill({ status: 200, contentType: "application/javascript", body: 'throw new Error("Injected first-load failure");' })
        : route.continue();
    });
    await context.addInitScript(() => localStorage.setItem("robys-language", "en"));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    if (moduleName === "storage") await page.locator("#feed-status").filter({ hasText: /try again/i }).waitFor();
    await chooseCategory(page, "hot-coffee");
    await page.locator('[data-product-id="hot-coffee:espresso"] .feed-add').click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    await page.locator("#menu-cart-trigger").click();
    if (moduleName === "order-ui") {
      await page.locator("#feed-status").filter({ hasText: /try again/i }).waitFor();
      assert.equal(await page.locator("#menu-cart-dialog[open]").count(), 0);
      await page.locator("#menu-cart-trigger").click();
    }
    await page.locator("#menu-cart-dialog[open]").waitFor();
    await page.locator("#menu-checkout-trigger").click();
    if (moduleName === "checkout") {
      await page.locator("#menu-cart-checkout-error").filter({ hasText: /try again/i }).waitFor();
      assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0);
      await page.locator("#menu-checkout-trigger").click();
    }
    await page.locator(".order-checkout-dialog[open]").waitFor();
    await page.locator(".order-ticket-qr").waitFor();
    assert.equal(await page.locator(".order-ticket-qr").count(), 1);
    assert.match(await page.locator(".order-ticket-total").textContent(), /110/);
    assert.equal(await page.locator("#menu-cart-count").textContent(), "1");
    assert.equal(requests.length, 2);
    assert.notEqual(requests[0], requests[1]);
    assert.equal(new URL(requests[1]).origin, origin);
    assert.equal(new URL(requests[1]).searchParams.get("retry"), "1");
    report.cases.push({ case: `${moduleName}-module-recovery`, result: "PASS", injectedFirstLoadFailure: true, freshRetryUrl: true, quantity: 1, total: 110, qr: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => localStorage.setItem("robys-language", "en"));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await assertLandingPhotoFits(page);
    const first = page.locator(".feed-card").nth(0), second = page.locator(".feed-card").nth(1);
    await first.locator(".feed-photo>img").evaluate(image => image.decode());
    const social = await first.evaluate(card => {
      const photo = card.querySelector(".feed-photo").getBoundingClientRect();
      const row = card.querySelector(".feed-social").getBoundingClientRect();
      const like = card.querySelector(".feed-like").getBoundingClientRect();
      const share = card.querySelector(".feed-share").getBoundingClientRect();
      const heading = card.querySelector(".feed-product-heading").getBoundingClientRect();
      return { belowPhoto: row.top >= photo.bottom - 1, beforeDetails: row.bottom <= heading.top + 1,
        horizontal: Math.abs(like.top - share.top) <= 1 && like.right <= share.left + 1,
        touchTargets: [like, share].every(box => box.width >= 44 && box.height >= 44),
        iconOnly: [...card.querySelectorAll(".feed-like span,.feed-share span")].every(node => {
          const box = node.getBoundingClientRect(); return box.width <= 1 && box.height <= 1;
        }) };
    });
    assert.deepEqual(social, { belowPhoto: true, beforeDetails: true, horizontal: true, touchTargets: true, iconOnly: true },
      "Like and share must be accessible icon buttons in one row below the photograph");
    assert.match(await first.locator(".feed-share").getAttribute("aria-label"), /share/i);
    await first.locator(".feed-photo>img").dblclick();
    assert.equal(await first.locator(".feed-like").getAttribute("aria-pressed"), "true");
    await first.locator(".feed-photo>img").dblclick();
    assert.equal(await first.locator(".feed-like").getAttribute("aria-pressed"), "true", "Repeated double taps save, rather than toggle, a like");
    assert.equal(await page.locator("#feed-liked-count").textContent(), "1");
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Photo interactions never add an order item");
    assert.equal(await first.locator(".feed-heart-burst").evaluate(node => getComputedStyle(node).display), "none", "Reduced motion disables the decorative heart burst");
    await first.locator(".feed-photo-next").click();
    await waitForCounter(page, 1);
    assert.equal(await second.evaluate(node => node === document.activeElement), true);
    await second.locator(".feed-photo-prev").click();
    await waitForCounter(page, 0);
    await page.keyboard.press("ArrowDown");
    await waitForCounter(page, 1);
    assert.equal(await second.evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("ArrowUp");
    await waitForCounter(page, 0);
    const firstHeight = await first.evaluate(node => node.getBoundingClientRect().height);
    await page.mouse.move(185, 400);
    await page.mouse.wheel(0, firstHeight + 12);
    await waitForCounter(page, 1);
    assert.ok(await page.evaluate(() => scrollY) > 0, "Native document scrolling advances the active product");
    await openDiscovery(page);
    const counterBeforeTyping = await page.locator("#feed-counter").textContent();
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.locator("#feed-search").evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator("#feed-counter").textContent(), counterBeforeTyping, "Arrow keys in discovery must not navigate the background feed");
    await page.locator("#feed-search").fill("Espresso");
    // Native search inputs may consume Escape to clear their query. Exercise
    // dialog cancellation from its preceding button in the natural tab order.
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator("#feed-discover-close").evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    await page.locator("#feed-discover[open]").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement === document.querySelector("#feed-discover-open"));
    await openDiscovery(page);
    await page.locator("#feed-search-clear").click();
    await page.locator("#feed-discover-close").click();
    await page.waitForFunction(() => !document.querySelector("#feed-discover").open && document.activeElement === document.querySelector("#feed-discover-open"));
    assert.deepEqual(errors, []);
    report.cases.push({ case: "social-navigation", result: "PASS", doubleTapSavesOnce: true, photoDoesNotAddToOrder: true,
      previousNextControls: true, arrowKeyboardNavigation: true, nativeWheelNavigation: true, discoveryKeepsTypingFocus: true,
      discoveryEscapeAndCloseRestoreFocus: true, reducedMotion: true, horizontalSocialRowBelowPhoto: true,
      accessibleIconButtons: true, minimum44pxTouchTargets: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => localStorage.setItem("robys-language", "en"));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".feed-photo>img").first().evaluate(image => image.decode());
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), false);
    const snapType = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
    assert.equal(snapType, "none", "The Instagram post feed uses continuous scrolling even when motion is enabled");
    const settled = async index => {
      // Poll the actual scroll result on animation frames. A matching counter
      // alone is insufficient because next/previous update it before motion.
      await page.waitForFunction(({ index, count }) => {
        const card = document.querySelectorAll(".feed-card")[index];
        const top = Math.max(document.querySelector(".feed-header").getBoundingClientRect().bottom,
          document.querySelector(".feed-tools").getBoundingClientRect().bottom);
        const rect = card.getBoundingClientRect();
        const photo = card.querySelector(".feed-photo>img"), box = photo.getBoundingClientRect();
        const bottom = document.querySelector("#menu-cart-trigger").getBoundingClientRect().top;
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        const fits = Math.abs(rect.top - top) <= 1
          && document.querySelector("#feed-counter").textContent === `${index + 1} / ${count}`
          && box.width > 0 && box.top >= top - 1 && box.bottom <= bottom + 1 && photo === hit
          && photo.complete && photo.naturalWidth > 0;
        const previous = window.__feedTestScrollState;
        const stable = fits && previous?.index === index && Math.abs(previous.scrollY - scrollY) < .1 ? previous.stable + 1 : 0;
        window.__feedTestScrollState = { index, scrollY, stable };
        return fits && stable >= 4;
      }, { index, count: catalog.length }, { polling: "raf" });
      return page.locator(".feed-card").nth(index).evaluate(card => {
        const rect = card.getBoundingClientRect();
        return { product: card.dataset.productId, top: rect.top, bottom: rect.bottom, scrollY };
      });
    };
    // The non-sticky collection shortcuts precede the first post. Start this
    // scrolling journey with the first card aligned, as next/previous do.
    // Landing photo visibility is independently checked above.
    await page.locator(".feed-card").first().evaluate(card => card.scrollIntoView({ block: "start", behavior: "instant" }));
    await settled(0);
    const distance = await page.locator(".feed-card").evaluateAll(cards => cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().top);
    assert.ok(distance > 32);
    await page.mouse.move(185, 400);
    const initialScrollY = await page.evaluate(() => scrollY);
    // Deliberately stop between posts. Neither browser snapping nor JavaScript
    // may pull the reader to the next product after an ordinary wheel gesture.
    await page.mouse.wheel(0, distance - 32);
    await page.waitForFunction(({ initialScrollY, distance }) => {
      const previous = window.__feedTestWheelState;
      const moved = Math.abs(scrollY - initialScrollY - (distance - 32)) <= 2;
      const stable = moved && previous && Math.abs(previous.scrollY - scrollY) < .1 ? previous.stable + 1 : 0;
      window.__feedTestWheelState = { scrollY, stable };
      return moved && stable >= 8;
    }, { initialScrollY, distance }, { polling: "raf" });
    await waitForCounter(page, 1);
    const afterWheel = await secondCardPosition(page);
    assert.ok(afterWheel.gapBelowTools >= 30 && afterWheel.gapBelowTools <= 34,
      `The wheel must stop at the requested intermediate position: ${JSON.stringify(afterWheel)}`);
    await page.locator(".feed-card").nth(1).locator(".feed-photo-next").click();
    const afterNext = await settled(2);
    assert.equal(await page.locator(".feed-card").nth(2).evaluate(node => node === document.activeElement), true);
    await page.locator(".feed-card").nth(2).locator(".feed-photo-prev").click();
    const afterPrevious = await settled(1);
    assert.equal(await page.locator(".feed-card").nth(1).evaluate(node => node === document.activeElement), true);
    await assertPurchaseControlsReachable(page, 1);
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "normal-motion-continuous-scroll", result: "PASS", width: 390, height: 844, snapType,
      wheelStopsBetweenPosts: true, wheelUndershootPixels: 32, explicitNavigationSettlesBelowStickyControls: true,
      fullPhotoVisibleAfterNavigation: true, purchaseControlsReachableByNaturalScroll: true,
      nextAndPreviousRestoreCardFocus: true, settledCards: [afterWheel, afterNext, afterPrevious] });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => localStorage.setItem("robys-language", "en"));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    const lane = catalog.filter(product => product.category.id === "hot-coffee"), target = lane.at(-1);
    assert.ok(lane.length > 8, "Deep-link fixture must require rendering beyond the first batch");
    const linkedUrl = `${origin}/menu-feed.html?item=${encodeURIComponent(target.id)}&lang=ru#desserts`;
    await page.goto(linkedUrl);
    await page.locator('#feed[data-ready="true"]').waitFor();
    const card = page.locator(`[data-product-id="${target.id}"]`);
    await card.waitFor();
    await card.locator(".feed-photo>img").evaluate(image => image.decode());
    await waitForCounter(page, lane.length - 1, lane.length);
    assert.equal(await page.locator("html").getAttribute("lang"), "ru", "Explicit link language wins over stored language");
    assert.equal(await page.locator('[data-category="hot-coffee"]').getAttribute("aria-pressed"), "true");
    assert.equal(await card.locator("h3").textContent(), target.item.name.ru);
    assert.equal(await card.locator(".feed-photo>img").evaluate(node => {
      const rect = node.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0;
    }), true, "A later shared product must enter the viewport without manual paging");
    await page.reload();
    await page.locator('#feed[data-ready="true"]').waitFor();
    await waitForCounter(page, lane.length - 1, lane.length);
    await chooseCategory(page, "cold-coffee");
    assert.equal(new URL(page.url()).searchParams.has("item"), false);
    await page.goBack();
    await waitForCounter(page, lane.length - 1, lane.length);
    assert.equal(new URL(page.url()).searchParams.get("item"), target.id);
    await page.goto(`${origin}/menu-feed.html?item=missing-product&lang=de#hot-coffee`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.locator(".feed-card").first().getAttribute("data-product-id"), "hot-coffee:espresso");
    assert.equal(await page.locator('[data-category="hot-coffee"]').getAttribute("aria-pressed"), "true");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "shared-product-entry", result: "PASS", product: target.id, categoryIndex: lane.length - 1,
      laterBatchLoadedAndVisible: true, explicitLanguage: true, reloadAndBackRestoreProduct: true, invalidItemAndLanguageFallback: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      localStorage.setItem("robys-language", "en");
      // Controlled native API outcomes exercise our integration; no OS share
      // sheet or external message is opened by the test.
      window.__feedShares = []; window.__feedShareOutcome = "success";
      Object.defineProperty(navigator, "share", { configurable: true, value: async payload => {
        window.__feedShares.push(payload);
        if (window.__feedShareOutcome === "cancel") throw new DOMException("User cancelled sharing", "AbortError");
        if (window.__feedShareOutcome === "failure") throw new Error("Injected unavailable native sharing");
      } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html?campaign=summer#hot-coffee`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    const share = page.locator(".feed-share").first();
    await share.click();
    await page.waitForFunction(() => window.__feedShares.length === 1 && !document.querySelector(".feed-share").disabled);
    assert.equal(await share.evaluate(node => node === document.activeElement), true, "Native share success restores the triggering button's focus");
    const payload = await page.evaluate(() => window.__feedShares[0]);
    const url = new URL(payload.url);
    assert.equal(url.origin, origin); assert.equal(url.pathname, "/menu-feed.html");
    assert.deepEqual([...url.searchParams], [["item", "hot-coffee:espresso"], ["lang", "en"]]);
    assert.equal(url.hash, ""); assert.match(payload.title, /Espresso/);
    assert.equal(await page.locator("#feed-share").evaluate(node => node.open), false);
    await page.evaluate(() => { window.__feedShareOutcome = "cancel"; });
    await share.click();
    await page.waitForFunction(() => window.__feedShares.length === 2 && !document.querySelector(".feed-share").disabled);
    assert.equal(await share.evaluate(node => node === document.activeElement), true, "Native share cancellation restores the triggering button's focus");
    assert.equal(await page.locator("#feed-share").evaluate(node => node.open), false, "Native cancellation should not force a copy dialog");
    assert.equal(await page.locator("#feed-status").textContent(), "");
    await page.evaluate(() => { window.__feedShareOutcome = "failure"; });
    await share.click();
    await page.locator("#feed-share[open]").waitFor();
    assert.equal(await page.locator("#feed-share-url").inputValue(), payload.url);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement === document.querySelector(".feed-share"));
    assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "native-share-boundary", result: "PASS", scopedProductAndLanguageUrl: true,
      controlledSuccessAndCancellation: true, successAndCancelRestoreFocus: true, nativeFailureOffersCopy: true, noOrderMutation: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      localStorage.setItem("robys-language", "en");
      window.__feedClipboardDenied = true; window.__feedCopied = [];
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => {
        if (window.__feedClipboardDenied) throw new DOMException("Injected clipboard denial", "NotAllowedError");
        window.__feedCopied.push(value);
      } } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html?campaign=summer#hot-coffee`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.locator(".feed-share").first().click();
    await page.locator("#feed-share[open]").waitFor();
    const value = await page.locator("#feed-share-url").inputValue(), url = new URL(value);
    assert.deepEqual([...url.searchParams], [["item", "hot-coffee:espresso"], ["lang", "en"]]);
    assert.equal(url.origin, origin); assert.equal(url.hash, "");
    assert.equal(await page.locator("#feed-share-url").evaluate(node => node.readOnly), true);
    await page.locator("#feed-share-copy").click();
    await page.waitForFunction(() => document.activeElement === document.querySelector("#feed-share-url"));
    assert.deepEqual(await page.locator("#feed-share-url").evaluate(node => [node.selectionStart, node.selectionEnd]), [0, value.length]);
    assert.match(await page.locator("#feed-share-help").textContent(), /copy this link/i);
    assert.doesNotMatch(await page.locator("#feed-share-help").textContent(), /copied/i);
    assert.deepEqual(await page.evaluate(() => window.__feedCopied), []);
    await page.locator("#feed-share-close").click();
    await page.waitForFunction(() => document.activeElement === document.querySelector(".feed-share"));
    await page.evaluate(() => { window.__feedClipboardDenied = false; });
    await page.locator(".feed-share").first().click();
    await page.locator("#feed-share-copy").click();
    await page.waitForFunction(() => window.__feedCopied.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__feedCopied), [value]);
    assert.match(await page.locator("#feed-share-help").textContent(), /link copied/i);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement === document.querySelector(".feed-share"));
    assert.deepEqual(errors, []);
    report.cases.push({ case: "copy-link-fallback", result: "PASS", controlledClipboardDenial: true, selectedManualRecovery: true,
      noFalseSuccess: true, controlledClipboardSuccess: true, closeAndEscapeRestoreFocus: true });
    await context.close();
  }
  for (const textScale of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    const id = "cold-coffee:flavoured-iced-caffe-latte";
    await page.goto(`${origin}/menu-feed.html?item=${encodeURIComponent(id)}&lang=ru`);
    await page.locator('#feed[data-ready="true"]').waitFor();
    const card = page.locator(`[data-product-id="${id}"]`);
    await card.waitFor();
    await card.locator(".feed-photo>img").evaluate(image => image.decode());
    await page.evaluate(() => document.fonts.ready);
    const titleSize = await card.locator("h3").evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    if (textScale === 2) {
      // Fixed-pixel product typography is enlarged explicitly. This is a
      // controlled text-size stress case, not native browser zoom.
      await card.evaluate(node => {
        const targets = [...node.querySelectorAll("h3,.feed-price,.feed-description,.feed-variant,.feed-variant select,.feed-add,.feed-selected,.feed-like,.feed-share,.feed-seen")];
        const sizes = targets.map(target => parseFloat(getComputedStyle(target).fontSize) * 2);
        targets.forEach((target, index) => { target.style.fontSize = `${sizes[index]}px`; });
      });
      // The canonical reduced-motion stylesheet still has a .01ms transition.
      // Wait for the computed size to settle before checking the exact scale.
      await page.waitForFunction(({ id, expected }) => {
        const title = document.querySelector(`[data-product-id="${id}"] h3`);
        return title && parseFloat(getComputedStyle(title).fontSize) === expected;
      }, { id, expected: titleSize * textScale });
    }
    assert.equal(await card.locator("h3").evaluate(node => parseFloat(getComputedStyle(node).fontSize)), titleSize * textScale);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType), "none", "Short screens permit natural scrolling through tall products");
    await card.locator("h3").scrollIntoViewIfNeeded();
    const titleBounds = await card.locator("h3").boundingBox();
    assert.ok(titleBounds.x >= -1 && titleBounds.x + titleBounds.width <= 321, "The long product name wraps within the mobile column");
    await card.locator("select").selectOption("vanilla");
    await card.locator(".feed-add").click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    assert.match(await page.locator("#menu-cart-total").textContent(), /200/);
    await page.locator("#menu-cart-trigger").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.match(await page.locator(".menu-cart-line-details > strong").textContent(), /Ваниль/i);
    await page.locator("#menu-checkout-trigger").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#menu-checkout-trigger").isVisible(), true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement === document.querySelector("#menu-cart-trigger"));
    await card.locator("select").scrollIntoViewIfNeeded();
    await captureScreenshot(page, { path: `${output}/${engine}-320-short-text${textScale * 100}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []);
    report.cases.push({ case: `short-viewport-text${textScale * 100}`, result: "PASS", width: 320, height: 568,
      textScale, textScaleMethod: "computed product text size; not browser zoom", longNameWraps: true, variantAndAddReachable: true,
      nativeDocumentScroll: true, noHorizontalOverflow: true, cartFocusRestored: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html?view=feed&lang=en`);
    await waitForMenuMode(page, "feed");
    await page.locator("#menu-combos-trigger").click();
    await page.locator(".menu-combos-card").first().waitFor();
    assert.equal(await page.locator(".menu-combos-card").count(), 12, "The feed exposes all canonical combos");
    await page.locator("#menu-combos-takeaway-trigger").click();
    await page.waitForFunction(() => document.querySelectorAll(".menu-combos-card").length === 4);
    assert.equal(await page.locator('[data-combo-filter="takeaway"]').getAttribute("aria-pressed"), "true");
    await page.locator('[data-combo-filter="all"]').click();
    await page.locator('[data-combo-recipe="student"] .menu-combos-choose').click();
    const preview = page.locator(".menu-combos-dialog[open]");
    await preview.waitFor();
    await preview.locator('[data-combo-quantity="brew-hot:black-tea"]').fill("3");
    await preview.locator('[data-combo-quantity="brew-hot:black-tea"]').press("Tab");
    await preview.locator('[data-combo-product="food:sesame-simit"] .menu-combos-remove').click();
    await preview.locator("#menu-combos-add-product").selectOption("desserts:cookie");
    assert.equal(moneyValue(await preview.locator(".menu-combos-total").textContent()), 250);
    await preview.locator(".menu-combos-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    const expected = await storedOrder(page);
    assert.deepEqual(expected.lines, [{ id: "brew-hot:black-tea", quantity: 3 }, { id: "desserts:cookie", quantity: 1 }]);
    assert.deepEqual(expected.groups.map(({ source, items, quantity }) => ({ source, items, quantity })), [
      { source: "menu", items: [{ id: "brew-hot:black-tea", quantity: 1 }], quantity: 3 },
      { source: "menu", items: [{ id: "desserts:cookie", quantity: 1 }], quantity: 1 }
    ], "Customized combo components remain independently editable, as in the list");
    assert.equal(moneyValue(await page.locator("#menu-cart-dialog-total").textContent()), 250);
    await captureScreenshot(page, { path: `${output}/${engine}-feed-custom-combo.png` });
    await page.keyboard.press("Escape");
    await roundTripOrder(page, expected);
    assert.deepEqual(errors, []);
    report.cases.push({ case: "feed-combo-parity", result: "PASS", allCombos: 12, takeawayCombos: 4,
      customizedContents: true, total: 250, sameOrderAfterListAndFeed: true, consoleErrors: false });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html?view=feed&lang=ru#menu-family`);
    await waitForMenuMode(page, "feed");
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator(".menu-family-card").count(), 3);
    assert.equal(await page.locator("[data-kids-combo]").count(), 2);
    await page.locator('[data-family-recipe="simit-break"] .menu-family-choose').click();
    await page.locator(".menu-family-dialog[open]").waitFor();
    await page.locator('.menu-family-dialog input[value="desserts:cookie"]').uncheck();
    await page.locator(".menu-family-add").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    const editedFamily = await storedOrder(page);
    assert.deepEqual(editedFamily.lines, [{ id: "brew-hot:milk", quantity: 1 }, { id: "food:sesame-simit", quantity: 1 }]);
    assert.equal(editedFamily.groups.length, 2, "Family suggestions retain independent product lines");
    await page.keyboard.press("Escape");
    await page.locator('[data-kids-combo="kids-mini"] .kids-combo-add').click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    const expected = await storedOrder(page);
    assert.deepEqual(expected.lines, [{ id: "brew-hot:milk", quantity: 2 }, { id: "desserts:cookie", quantity: 1 }, { id: "food:sesame-simit", quantity: 1 }]);
    assert.equal(expected.groups.length, 3, "A ready kids combo remains one editable order group");
    assert.equal(moneyValue(await page.locator("#menu-cart-dialog-total").textContent()), 255);
    await captureScreenshot(page, { path: `${output}/${engine}-feed-family-order.png` });
    await page.keyboard.press("Escape");
    await roundTripOrder(page, expected, "ru");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "feed-family-kids-parity", result: "PASS", familyIdeas: 3, kidsCombos: 2,
      unselectedProductExcluded: true, familyLinesSeparate: true, kidsComboGrouped: true, total: 255,
      sameOrderAfterListAndFeed: true, language: "ru", consoleErrors: false });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu-feed.html?view=feed&lang=en&item=pairing-offers%3Acool-lime-macaron-pairing`);
    await waitForMenuMode(page, "feed");
    await page.locator('[data-product-id="pairing-offers:cool-lime-macaron-pairing"] .feed-add').click();
    await page.locator("#menu-product-dialog[open]").waitFor();
    await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
    assert.equal(await page.locator('input[name="menu-dessert"][value="desserts:macaron"]').isChecked(), true);
    assert.deepEqual((await storedOrder(page)).lines, [], "Opening a pair is a preview, not an implicit add");
    await page.locator("#menu-add-to-cart").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.deepEqual((await storedOrder(page)).lines, [{ id: "desserts:macaron", quantity: 1 }, { id: "refreshers:cool-lime", quantity: 1 }]);
    await page.locator(".menu-cart-edit").click();
    await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
    const cookie = page.locator('input[name="menu-dessert"][value="desserts:cookie"]').locator("..");
    if (!await cookie.isVisible()) await page.locator(".menu-pairing-expand").click();
    await cookie.click();
    await page.locator("#menu-add-to-cart").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    const editedPair = await storedOrder(page);
    assert.deepEqual(editedPair.lines, [{ id: "desserts:cookie", quantity: 1 }, { id: "refreshers:cool-lime", quantity: 1 }]);
    assert.equal(editedPair.groups.length, 1, "Editing a pair replaces its old group instead of adding another");
    await page.locator(".menu-cart-replace").click();
    await page.locator("#menu-replacement-component").selectOption("0");
    await page.locator("#menu-replacement-product").selectOption("cold-coffee:flavoured-iced-caffe-latte");
    await page.locator("#menu-replacement-variant").selectOption("vanilla");
    assert.deepEqual(await storedOrder(page), editedPair, "Component replacements wait for explicit Save");
    await page.locator(".menu-cart-replacement-actions button").filter({ hasText: "Save replacement" }).click();
    await page.waitForFunction(() => !document.querySelector(".menu-cart-replacement"));
    await page.locator('#menu-cart-lines select[data-product-id="cold-coffee:flavoured-iced-caffe-latte"]').selectOption("caramel");
    await page.waitForFunction(() => document.querySelector('#menu-cart-lines select[data-product-id="cold-coffee:flavoured-iced-caffe-latte"]')?.value === "caramel"
      && /Caramel/.test(document.querySelector(".menu-cart-line-details > strong").textContent));
    const expected = await storedOrder(page);
    assert.deepEqual(expected.lines, [{ id: "cold-coffee:flavoured-iced-caffe-latte", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }]);
    assert.equal(expected.groups[0].items.find(item => item.id === "cold-coffee:flavoured-iced-caffe-latte").variant, "caramel");
    assert.equal(moneyValue(await page.locator("#menu-cart-dialog-total").textContent()), 300);
    await captureScreenshot(page, { path: `${output}/${engine}-feed-pair-edit.png` });
    await page.keyboard.press("Escape");
    await roundTripOrder(page, expected);
    await page.locator("#menu-cart-trigger").click();
    await page.locator("#menu-cart-dialog[open]").waitFor();
    assert.equal(await page.locator('#menu-cart-lines select[data-product-id="cold-coffee:flavoured-iced-caffe-latte"]').inputValue(), "caramel");
    await page.locator("#menu-checkout-trigger").click();
    await page.locator(".order-ticket-qr").waitFor();
    assert.equal(moneyValue(await page.locator(".order-ticket-total").textContent()), 300);
    assert.deepEqual(errors, []);
    report.cases.push({ case: "feed-editable-pair-parity", result: "PASS", promoExpandedToComponents: true,
      pairEditedWithoutDuplicate: true, replacementSavedExplicitly: true, cartFlavorChange: "caramel",
      sameOrderAfterListAndFeed: true, qrUsesEditedTotal: 300, consoleErrors: false });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    const query = "Эспрессо";
    await page.goto(`${origin}/menu.html?view=list&lang=ru#hot-coffee`);
    await waitForMenuMode(page, "list");
    await assertStickySwitch(page, "list");
    await page.locator("#menu-search").fill(query);
    // Typing intentionally searches all categories in the list. Select the
    // category afterwards so this journey carries both real user choices.
    await page.locator('#menu-category-nav [data-category="hot-coffee"]').click();
    assert.equal(await page.locator("#menu-search").inputValue(), query);
    await page.locator('[data-product-id="hot-coffee:espresso"] .full-menu-item-media').click();
    await page.locator("#menu-add-to-cart").click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    await page.keyboard.press("Escape");
    await page.locator('.menu-view-switch [data-menu-view="feed"]').click();
    await waitForMenuMode(page, "feed");
    await assertStickySwitch(page, "feed");
    assert.equal(await page.locator("html").getAttribute("lang"), "ru");
    assert.equal(await page.locator("#feed-search").inputValue(), query);
    assert.equal(await page.locator('[data-category="hot-coffee"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-product-id="hot-coffee:espresso"]').count(), 1);
    assert.equal(await page.locator("#menu-cart-count").textContent(), "1");
    assert.match(await page.locator("#menu-cart-total").textContent(), /110/);
    assert.equal(new URL(page.url()).searchParams.get("view"), "feed");
    assert.equal(new URL(page.url()).searchParams.get("q"), query);
    await page.locator('[data-product-id="hot-coffee:espresso"] .feed-add').click();
    await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2");
    await page.locator('.feed-view-switch [data-menu-view="list"]').click();
    await waitForMenuMode(page, "list");
    assert.equal(await page.locator("html").getAttribute("lang"), "ru");
    assert.equal(await page.locator("#menu-search").inputValue(), query);
    assert.equal(await page.locator(".menu-search-clear").isVisible(), true, "A restored query keeps its clear button available");
    assert.equal(await page.locator('#menu-category-nav [data-category="hot-coffee"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#menu-cart-count").textContent(), "2");
    assert.match(await page.locator("#menu-cart-total").textContent(), /220/);
    assert.equal(new URL(page.url()).searchParams.get("view"), "list");
    assert.equal(new URL(page.url()).searchParams.get("q"), query);
    assert.equal(await page.evaluate(() => localStorage.getItem("robys-menu-view")), "list");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "menu-mode-roundtrip", result: "PASS", language: "ru", category: "hot-coffee",
      searchPreservedBothWays: true, restoredSearchCanBeCleared: true, sharedCartAfterBothAdds: 2, total: 220,
      explicitModeUrls: true, switchReachableDuringScrollInBothModes: true, consoleErrors: false });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    // Record the history/reload boundary without changing the page's APIs or
    // navigation. Keep this evidence even when the original assertion fails.
    const historyTrace = report.menuModeHistory = { requests: [], snapshots: [] };
    let historyPhase = "initial-list";
    page.on("request", request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        historyTrace.requests.push({ phase: historyPhase, url: request.url() });
      }
    });
    const recordHistory = async (target, phase) => {
      const snapshot = { phase, pageUrl: target.url() };
      try {
        Object.assign(snapshot, await target.evaluate(() => ({ location: location.href, documentUrl: document.URL,
          historyState: history.state, ready: document.documentElement.dataset.menuViewReady,
          hasListRoot: Boolean(document.querySelector("#menu-root")), hasFeedRoot: Boolean(document.querySelector("#feed")),
          navigationEntries: performance.getEntriesByType("navigation").map(entry => ({ type: entry.type, name: entry.name })),
          legacyNavigationType: performance.navigation?.type })));
      } catch (error) { snapshot.readError = error.message; }
      historyTrace.snapshots.push(snapshot);
      return snapshot;
    };
    await page.goto(`${origin}/menu.html`);
    await waitForMenuMode(page, "list");
    historyPhase = "switch-to-feed";
    await page.locator('.menu-view-switch [data-menu-view="feed"]').click();
    await waitForMenuMode(page, "feed");
    assert.equal(await page.evaluate(() => localStorage.getItem("robys-menu-view")), "feed");
    await recordHistory(page, "before-back");
    historyPhase = "back";
    await page.goBack();
    await recordHistory(page, "after-back");
    await waitForMenuMode(page, "list");
    assert.equal(new URL(page.url()).search, "", "Back returns to the original generic list entry");
    await recordHistory(page, "before-reload");
    historyPhase = "native-reload";
    // CI on Playwright 1.55.1 Firefox observed page.reload() request the list
    // and then enter the preferred feed, while this same Back sequence with
    // location.reload() preserved the list history entry and reported reload.
    // Exercise the current document's native reload on every engine; retain
    // the URL, history, navigation type, preference and console assertions.
    const [reloadResponse] = await Promise.all([
      page.waitForNavigation(), page.evaluate(() => { setTimeout(() => location.reload(), 0); })
    ]);
    historyTrace.reloadResponseUrl = reloadResponse?.url() ?? null;
    const afterReload = await recordHistory(page, "after-native-reload");
    assert.equal(historyTrace.reloadResponseUrl, `${origin}/menu.html`, "Reload requests the current list document");
    assert.equal(afterReload.navigationEntries?.[0]?.type, "reload", "The journey must exercise a native reload");
    assert.equal(afterReload.historyState?.robysMenuViewEntry, "list", "Reload preserves the list history entry");
    await waitForMenuMode(page, "list");
    assert.equal(await page.evaluate(() => localStorage.getItem("robys-menu-view")), "feed", "Back and reload do not rewrite the saved choice");
    const fresh = await context.newPage(); fresh.setDefaultTimeout(15000); observeErrors(fresh, errors);
    await fresh.goto(`${origin}/menu.html`);
    await waitForMenuMode(fresh, "feed");
    await fresh.goto(`${origin}/menu.html?view=list&lang=en`);
    await waitForMenuMode(fresh, "list");
    assert.equal(await fresh.evaluate(() => localStorage.getItem("robys-menu-view")), "feed", "An explicit list URL takes precedence without rewriting preference");
    await fresh.goto(`${origin}/menu-feed.html`);
    await waitForMenuMode(fresh, "feed");
    await fresh.locator('.feed-view-switch [data-menu-view="list"]').click();
    await waitForMenuMode(fresh, "list");
    assert.equal(await fresh.evaluate(() => localStorage.getItem("robys-menu-view")), "list");
    await fresh.goto(`${origin}/menu.html`);
    await waitForMenuMode(fresh, "list");
    await fresh.goto(`${origin}/menu-feed.html`);
    await waitForMenuMode(fresh, "feed");
    assert.equal(await fresh.evaluate(() => localStorage.getItem("robys-menu-view")), "list", "The dedicated feed remains accessible with list preferred");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "menu-mode-preference-and-history", result: "PASS", genericEntryUsesChoice: true,
      backAndReloadDoNotRedirect: true, nativeReload: true, reloadHistoryEntryPreserved: true,
      explicitListWins: true, savedChoiceCanChange: true, dedicatedFeedWins: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      localStorage.setItem("robys-menu-view", "feed");
      localStorage.setItem("robys-language", "en");
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    await page.goto(`${origin}/menu.html#cold-coffee`);
    await waitForMenuMode(page, "list");
    assert.equal(await page.locator('#menu-category-nav [data-category="cold-coffee"]').getAttribute("aria-pressed"), "true");
    await page.goto(`${origin}/menu.html?product=${encodeURIComponent("hot-coffee:espresso")}&lang=en#hot-coffee`);
    await waitForMenuMode(page, "list");
    await page.locator("#menu-product-dialog[open]").waitFor();
    assert.match(await page.locator("#menu-product-title").textContent(), /Espresso/);
    await page.keyboard.press("Escape");
    await page.locator('#menu-category-nav [data-category="desserts"]').click();
    const changedCategoryUrl = new URL(page.url());
    assert.equal(changedCategoryUrl.hash, "#desserts");
    assert.equal(changedCategoryUrl.searchParams.has("product"), false, "A new category replaces the shared product intent");
    assert.equal(changedCategoryUrl.searchParams.has("item"), false);
    await page.reload();
    await waitForMenuMode(page, "list");
    assert.equal(await page.locator('#menu-category-nav [data-category="desserts"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#menu-product-dialog[open]").count(), 0, "Reload must not reopen a superseded product");
    await page.goto(`${origin}/menu.html#menu-combos`);
    await waitForMenuMode(page, "list");
    await page.locator(".menu-combos-card").first().waitFor();
    assert.equal(await page.locator("#menu-combos").isVisible(), true);
    await page.goto(`${origin}/menu.html#menu-family`);
    await waitForMenuMode(page, "list");
    await page.locator(".menu-family-card").first().waitFor();
    assert.equal(await page.locator("#menu-family").isVisible(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("robys-menu-view")), "feed");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "menu-mode-semantic-deep-links", result: "PASS", feedPreferenceCannotHijackCategory: true,
      productDialogOpens: true, categoryReplacesProductIntentAcrossReload: true, comboAndFamilySectionsOpen: true, preferenceUnchanged: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      for (const method of ["getItem", "setItem", "removeItem"]) Object.defineProperty(Storage.prototype, method, {
        configurable: true, value() { throw new DOMException("Injected unavailable browser storage", "SecurityError"); }
      });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    const query = "Эспрессо";
    await page.goto(`${origin}/menu.html?view=list&lang=ru&q=${encodeURIComponent(query)}#hot-coffee`);
    await waitForMenuMode(page, "list");
    assert.equal(await page.locator("#menu-search").inputValue(), query);
    assert.equal(await page.locator("html").getAttribute("lang"), "ru");
    await page.locator('.menu-view-switch [data-menu-view="feed"]').click();
    await waitForMenuMode(page, "feed");
    assert.equal(await page.locator("#feed-search").inputValue(), query);
    assert.equal(await page.locator("html").getAttribute("lang"), "ru");
    assert.equal(await page.locator('[data-category="hot-coffee"]').getAttribute("aria-pressed"), "true");
    await page.locator('.feed-view-switch [data-menu-view="list"]').click();
    await waitForMenuMode(page, "list");
    assert.equal(await page.locator("#menu-search").inputValue(), query);
    assert.equal(await page.locator("html").getAttribute("lang"), "ru");
    assert.equal(await page.locator('#menu-category-nav [data-category="hot-coffee"]').getAttribute("aria-pressed"), "true");
    await page.goto(`${origin}/menu.html`);
    await waitForMenuMode(page, "list");
    assert.deepEqual(errors, []);
    report.cases.push({ case: "menu-mode-storage-unavailable", result: "PASS", switchesWorkBothWays: true,
      languageCategoryAndSearchTravelInUrl: true, genericEntryStillUsable: true, consoleErrors: false });
    await context.close();
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  const fallback = await noJs.newPage(); await fallback.goto(`${origin}/menu-feed.html`);
  assert.equal(await fallback.locator(".feed-fallback").isVisible(), true);
  assert.equal(await fallback.locator("#menu-cart-trigger").isVisible(), false);
  report.cases.push({ case: "no-JavaScript", result: "PASS" });
  await noJs.close();
  console.log(`PASS: ${report.cases.length} menu-feed journeys (${engine})`);
} finally {
  writeFileSync(`${output}/${engine}-report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser?.close(); await new Promise(resolve => server.close(resolve)); rmSync(certificate, { recursive: true, force: true });
}
