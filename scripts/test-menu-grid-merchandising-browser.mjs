import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const port = 4198;
const base = `http://127.0.0.1:${port}/`;
const out = ".artifacts/menu-grid-merch";
const cases = [
  { width: 320, height: 800, lang: "ru", columns: 1 },
  { width: 390, height: 844, lang: "ru", columns: 1, interaction: true },
  { width: 768, height: 1024, lang: "tr", columns: 1 },
  { width: 1024, height: 900, lang: "en", columns: 2 },
  { width: 1440, height: 1000, lang: "ru", columns: 2 }
];
const labels = { ru: "Выбрать пару", tr: "Bu ikiliyi seç", en: "Choose this pairing" };
const prices = ["220", "370"];
mkdirSync(out, { recursive: true });

const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
let browser;
const report = { cases: [], failures: [] };
try {
  let online = false;
  for (let i = 0; i < 60; i += 1) {
    try { online = (await fetch(base)).ok; } catch {}
    if (online) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(online, "Local menu server did not start");
  browser = await chromium.launch({ headless: true });
  for (const testCase of cases) {
    const context = await browser.newContext({
      viewport: { width: testCase.width, height: testCase.height },
      reducedMotion: "reduce", serviceWorkers: "block"
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    try {
      await page.goto(`${base}menu-grid.html?view=grid&lang=${testCase.lang}&entry=off`, { waitUntil: "domcontentloaded" });
      const cards = page.locator(".full-menu-panel--featured .full-menu-item--visual[data-pairing]");
      await cards.first().locator(".pairing-merch-choose").waitFor({ state: "visible", timeout: 15000 });
      assert.equal(await cards.count(), 2, "Two catalog pairings must be visible");
      assert.equal(await page.locator("html").getAttribute("lang"), testCase.lang);
      await page.locator(".full-menu-panel--featured").scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForFunction(() => [...document.querySelectorAll(".full-menu-panel--featured .full-menu-item--visual img")].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 15000 });

      const geometry = await cards.evaluateAll(nodes => nodes.map(card => {
        const photo = card.querySelector(".full-menu-item-media").getBoundingClientRect();
        const details = card.querySelector(".full-menu-item-details").getBoundingClientRect();
        const price = card.querySelector(".full-menu-price").getBoundingClientRect();
        const choose = card.querySelector(".pairing-merch-choose").getBoundingClientRect();
        const box = card.getBoundingClientRect();
        const posterTitle = card.querySelector(".pairing-poster-title");
        return {
          x: box.x, y: box.y, w: box.width, h: box.height,
          mediaBottom: photo.bottom, detailsTop: details.top, detailsBottom: details.bottom,
          priceTop: price.top, priceBottom: price.bottom, buttonTop: choose.top, buttonBottom: choose.bottom,
          photoW: photo.width, buttonW: choose.width,
          posterTitleVisible: posterTitle && getComputedStyle(posterTitle).display !== "none"
        };
      }));
      for (const [index, card] of geometry.entries()) {
        assert.ok(card.w >= 250, `Card ${index}: width is too narrow: ${card.w}px`);
        assert.ok(card.mediaBottom <= card.detailsTop + 2, `Card ${index}: text overlaps photo`);
        assert.ok(card.priceTop >= card.detailsTop - 1, `Card ${index}: price outside details`);
        assert.ok(card.buttonTop >= card.priceBottom - 1, `Card ${index}: CTA overlaps price`);
        assert.ok(card.buttonBottom <= card.detailsBottom + 2, `Card ${index}: CTA spills outside card`);
        assert.ok(card.buttonW >= 220, `Card ${index}: CTA width too narrow`);
        assert.equal(card.posterTitleVisible, false, `Card ${index}: legacy title still covers image`);
        assert.match(await cards.nth(index).locator(".full-menu-price").innerText(), new RegExp(`${prices[index]}\\s*₺`));
        assert.equal((await cards.nth(index).locator(".pairing-merch-choose").innerText()).trim(), labels[testCase.lang]);
      }
      if (testCase.columns === 1) {
        assert.ok(geometry[1].y > geometry[0].y + geometry[0].h - 2, "Mobile featured cards must stack vertically");
      } else {
        assert.ok(geometry[1].x > geometry[0].x + geometry[0].w - 2, "Desktop featured cards must render in two columns");
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `Horizontal scroll detected: ${overflow}px`);
      await page.locator(".full-menu-panel--featured").screenshot({
        path: `${out}/pairings-${testCase.width}-${testCase.lang}.png`,
        animations: "disabled", timeout: 15000
      });

      if (testCase.interaction) {
        const first = cards.first();
        await first.locator(".full-menu-item-media").click();
        const story = page.locator(".pairing-discovery-panel");
        await story.waitFor({ state: "visible" });
        assert.match(await story.innerText(), /лайм|макарон/i, "Photo must open taste story");
        await story.locator(".pairing-discovery-close").click();
        await story.waitFor({ state: "hidden" });

        const choose = first.locator(".pairing-merch-choose");
        await choose.focus();
        await page.keyboard.press("Enter");
        await page.locator("#menu-product-dialog[open]").waitFor({ state: "visible" });
        assert.match(await page.locator("#menu-product-title").innerText(), /Cool Lime/i);
        assert.match(await page.locator("#menu-product-price").innerText(), /220\s*₺/);
        await page.locator("#menu-add-to-cart").click();
        await page.locator("#menu-cart-dialog[open]").waitFor({ state: "visible" });
        assert.equal(Number(await page.locator("#menu-cart-count").textContent()), 1, "One composite pairing expected");
        assert.equal(Number((await page.locator("#menu-cart-dialog-total").innerText()).replace(/\D/g, "")), 220);
      }
      assert.deepEqual(pageErrors, [], `Unhandled page errors at ${testCase.width}px: ${pageErrors.join(" | ")}`);
      report.cases.push({ ...testCase, passed: true, overflow });
      console.log(`PASS PHOTO-GRID ${testCase.width}px ${testCase.lang}: ${testCase.columns} column(s), labels, media, prices and CTA`);
    } catch (error) {
      report.failures.push({ testCase, error: error.stack || String(error) });
      throw error;
    } finally {
      await context.close();
    }
  }
  // Regression: PWA upgrade must not reuse old CSS/JS by pathname alone.
  const offlineContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce", serviceWorkers: "allow"
  });
  try {
    const pwaPage = await offlineContext.newPage();
    const pwaErrors = [];
    pwaPage.on("pageerror", error => pwaErrors.push(error.message));
    await pwaPage.goto(base + "menu-grid.html?view=grid&lang=ru&entry=off", { waitUntil: "domcontentloaded" });
    await pwaPage.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
    const cacheName = await pwaPage.evaluate(async () => {
      const names = (await caches.keys()).filter(name => name.startsWith("robys-offline-v64"));
      if (names.length !== 1) throw new Error("Expected one current Roby's offline cache: " + names.length);
      const cache = await caches.open(names[0]);
      const cssUrl = new URL("menu-grid.css", location.href);
      const jsUrl = new URL("menu-grid-merchandising.js", location.href);
      for (const req of await cache.keys()) {
        const path = new URL(req.url).pathname;
        if (path === cssUrl.pathname || path === jsUrl.pathname) await cache.delete(req);
      }
      cssUrl.search = "?v=old-pre-merge";
      jsUrl.search = "?v=old-pre-merge";
      await cache.put(cssUrl.href, new Response(
        '.menu-photo-grid .full-menu-panel--featured .full-menu-list{grid-template-columns:repeat(2,minmax(0,1fr))}',
        { headers: { "Content-Type": "text/css" } }
      ));
      await cache.put(jsUrl.href, new Response(
        'throw new Error("STALE_MERCH_JS_REUSED");',
        { headers: { "Content-Type": "application/javascript" } }
      ));
      return names[0];
    });
    await pwaPage.reload({ waitUntil: "domcontentloaded" });
    const featured = pwaPage.locator(".full-menu-panel--featured .full-menu-item--visual[data-pairing]");
    await featured.first().locator(".pairing-merch-choose").waitFor({ state: "visible", timeout: 15000 });
    const boxes = await featured.evaluateAll(nodes => nodes.map(card => {
      const rect = card.getBoundingClientRect();
      return { x: rect.x, y: rect.y, height: rect.height,
        details: getComputedStyle(card.querySelector(".full-menu-item-details")).display,
        title: getComputedStyle(card.querySelector(".pairing-poster-title")).display };
    }));
    assert.equal(boxes.length, 2);
    assert.ok(boxes[1].y >= boxes[0].y + boxes[0].height - 2,
      "Stale cached CSS cannot force featured cards into two phone-width columns");
    assert.ok(boxes.every(x => x.details === "flex" && x.title === "none"),
      "Stale poster CSS cannot hide details or expose the huge poster titles");
    assert.deepEqual(pwaErrors, [], "Stale JS cannot replace revisioned merchandising module");
    report.cases.push({ label: "PWA upgrade with obsolete CSS/JS cache entries", passed: true, cache: cacheName });
    console.log("PASS PHOTO-GRID PWA exact-revision cache regression");
  } finally {
    await offlineContext.close();
  }
  console.log("menu grid merchandising: PASS");
} finally {
  await browser?.close();
  server.kill();
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
}
