import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";

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
  runtimeSha256: createHash("sha256").update(readFileSync("menu-feed.js")).digest("hex"), cases: [] };
let browser;
try {
  browser = await ({ chromium, firefox, webkit })[engine].launch({ headless: true });
  for (const [width, language] of [[320, "ru"], [390, "tr"], [390, "en"], [390, "ru"], [1440, "en"], [1440, "ru"]]) {
    const context = await browser.newContext({ viewport: { width, height: width > 800 ? 1000 : 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(lang => localStorage.setItem("robys-language", lang), language);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
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
    await page.screenshot({ path: `${output}/${engine}-${width}-${language}.png` });
    await page.locator(".feed-like").first().click();
    await page.locator('.feed-like[aria-pressed="true"]').first().waitFor();
    await page.locator(".feed-card").first().evaluate(card => card.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.locator(".feed-avatar").first().evaluate(image => image.decode());
    await page.screenshot({ path: `${output}/${engine}-${width}-${language}-liked-card.png` });
    // Filtering, atomic add, repeat add and removal use the actual user controls.
    await page.locator('[data-category="hot-coffee"]').click();
    const espresso = page.locator('[data-product-id="hot-coffee:espresso"]');
    await espresso.locator(".feed-add").click();
    await page.waitForFunction(() => document.querySelector("#feed-cart-count").textContent === "1");
    await espresso.locator(".feed-add").click();
    await page.waitForFunction(() => document.querySelector("#feed-cart-count").textContent === "2");
    assert.match(await page.locator("#feed-cart-total").textContent(), /220/);
    await page.locator("#feed-search").fill("missing-zx984");
    assert.equal(await page.locator("#feed-empty").isVisible(), true);
    await page.locator("#feed-search-clear").click();
    await page.locator('[data-category="cold-coffee"]').click();
    const flavoured = page.locator('[data-product-id="cold-coffee:flavoured-iced-caffe-latte"]');
    await flavoured.locator(".feed-add").click();
    assert.equal(await flavoured.locator("select").evaluate(node => node === document.activeElement), true);
    assert.equal(await page.locator("#feed-cart-count").textContent(), "2");
    await flavoured.locator("select").selectOption("vanilla");
    await flavoured.locator(".feed-add").click();
    await page.waitForFunction(() => document.querySelector("#feed-cart-count").textContent === "3");
    assert.match(await page.locator("#feed-cart-total").textContent(), /420/);
    await page.locator("#feed-cart-open").click();
    await page.locator("#feed-cart[open]").waitFor();
    const firstLine = page.locator(".feed-cart-line").filter({ hasText: /Espresso|Эспрессо/ });
    await firstLine.locator(".feed-remove").click();
    await page.waitForFunction(() => document.querySelector("#feed-cart-count").textContent === "1");
    assert.match(await page.locator("#feed-cart-sum").textContent(), /200/);
    await page.locator("#feed-checkout").click();
    await page.locator(".order-checkout-dialog[open]").waitFor();
    await page.locator(".order-ticket-qr").waitFor();
    assert.equal(await page.locator(".order-ticket-qr").count(), 1);
    assert.match(await page.locator(".order-ticket-total").textContent(), /200/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#feed-checkout").evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#feed-cart-open").evaluate(node => node === document.activeElement), true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#feed-cart-count").textContent === "1");
    const other = await context.newPage();
    await other.goto(`${origin}/menu.html#hot-coffee`);
    await other.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
    assert.match(await other.locator("#menu-cart-total").textContent(), /200/);
    await other.locator('[data-product-id="hot-coffee:espresso"] .full-menu-item-media').click();
    await other.locator("#menu-add-to-cart").click();
    await other.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "2");
    await page.bringToFront();
    await page.waitForFunction(() => document.querySelector("#feed-cart-count").textContent === "2");
    assert.match(await page.locator("#feed-cart-total").textContent(), /310/);
    assert.deepEqual(errors, []);
    report.cases.push({ width, language, result: "PASS", totalAfterCrossPageAdd: 310, sharedCart: true, qr: true,
      focus: true, overflow: false, photoUncropped: true, photoWidth: photo.width, canonicalResponsiveBrand: true });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => localStorage.setItem("robys-language", "en"));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
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
    other.on("pageerror", error => errors.push(error.message));
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
      const url = new URL(image.src); url.searchParams.set("feed-test", "recovered"); image.src = url.href;
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
      for (const method of ["getItem", "setItem", "removeItem"]) Object.defineProperty(Storage.prototype, method, {
        configurable: true, value() { throw new DOMException("Injected unavailable browser storage", "SecurityError"); }
      });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
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
  for (const moduleName of ["storage", "checkout"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const requests = [];
    await context.route(`**/order-${moduleName}.js*`, route => {
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
    await page.locator('[data-category="hot-coffee"]').click();
    await page.locator('[data-product-id="hot-coffee:espresso"] .feed-add').click();
    await page.waitForFunction(() => document.querySelector("#feed-cart-count").textContent === "1");
    await page.locator("#feed-cart-open").click();
    await page.locator("#feed-checkout").click();
    if (moduleName === "checkout") {
      await page.locator("#feed-cart-error").filter({ hasText: /try again/i }).waitFor();
      assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0);
      await page.locator("#feed-checkout").click();
    }
    await page.locator(".order-checkout-dialog[open]").waitFor();
    await page.locator(".order-ticket-qr").waitFor();
    assert.equal(await page.locator(".order-ticket-qr").count(), 1);
    assert.match(await page.locator(".order-ticket-total").textContent(), /110/);
    assert.equal(await page.locator("#feed-cart-count").textContent(), "1");
    assert.equal(requests.length, 2);
    assert.notEqual(requests[0], requests[1]);
    assert.equal(new URL(requests[1]).origin, origin);
    assert.equal(new URL(requests[1]).searchParams.get("retry"), "1");
    report.cases.push({ case: `${moduleName}-module-recovery`, result: "PASS", injectedFirstLoadFailure: true, freshRetryUrl: true, quantity: 1, total: 110, qr: true });
    await context.close();
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  const fallback = await noJs.newPage(); await fallback.goto(`${origin}/menu-feed.html`);
  assert.equal(await fallback.locator(".feed-fallback").isVisible(), true);
  assert.equal(await fallback.locator("#feed-cart-open").isVisible(), false);
  report.cases.push({ case: "no-JavaScript", result: "PASS" });
  await noJs.close();
  console.log(`PASS: ${report.cases.length} menu-feed journeys (${engine})`);
} finally {
  writeFileSync(`${output}/${engine}-report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser?.close(); await new Promise(resolve => server.close(resolve)); rmSync(certificate, { recursive: true, force: true });
}
