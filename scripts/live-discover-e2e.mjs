import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = new URL(process.env.ROBYS_LIVE_BASE ?? "https://safal207.github.io/robys-coffee-house-demo/");
const attempts = Number(process.env.ROBYS_LIVE_ATTEMPTS ?? 15);
const delayMs = Number(process.env.ROBYS_LIVE_DELAY_MS ?? 20000);
const out = resolve(process.env.ROBYS_LIVE_RESULTS_DIR ?? ".artifacts/live-discover-e2e");
mkdirSync(out, { recursive: true });
const reportPath = resolve(out, "report.json");

const localDiscover = readFileSync("discover.html", "utf8");
const localMenu = readFileSync("menu.html", "utf8");
const requiredFragments = [
  localDiscover.match(/discover-deck\.css\?v=[a-f0-9]{12}/)?.[0],
  localDiscover.match(/discover-deck\.js\?v=[a-f0-9]{12}/)?.[0],
  localMenu.match(/menu-product-reveal\.css\?v=[a-f0-9]{12}/)?.[0],
  localMenu.match(/menu-product-reveal\.js\?v=[a-f0-9]{12}/)?.[0]
];
assert.ok(requiredFragments.every(Boolean), "Local canonical Deck/Reveal revision tags are missing");

const report = { base: base.href, requiredFragments, attempts: [], passed: false };
const sleep = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function fetchText(pathname) {
  const url = new URL(pathname, base);
  url.searchParams.set("live-discover-e2e", `${Date.now()}`);
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "cache-control": "no-cache", pragma: "no-cache" }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  return body;
}

async function verifyPublishedRevisions() {
  const [discover, menu] = await Promise.all([fetchText("discover.html"), fetchText("menu.html")]);
  for (const fragment of requiredFragments.slice(0, 2)) {
    if (!discover.includes(fragment)) throw new Error(`Published Discover is missing exact revision ${fragment}`);
  }
  for (const fragment of requiredFragments.slice(2)) {
    if (!menu.includes(fragment)) throw new Error(`Published Menu is missing exact revision ${fragment}`);
  }
}

async function runJourney(browser, attempt) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: "ru-RU",
    timezoneId: "Europe/Istanbul",
    serviceWorkers: "allow",
    extraHTTPHeaders: { "cache-control": "no-cache", pragma: "no-cache" }
  });
  const page = await context.newPage();
  const pageErrors = [];
  const sameOriginFailures = [];
  const baseOrigin = base.origin;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(baseOrigin) && response.status() >= 400) {
      sameOriginFailures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    if (!location || location.startsWith(baseOrigin)) sameOriginFailures.push(`console: ${message.text()}`);
  });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ current: { temperature_2m: 22, precipitation: 0, weather_code: 0 } })
  }));

  try {
    const discoverUrl = new URL("discover.html?entry=off", base);
    discoverUrl.searchParams.set("live-discover-e2e", `${Date.now()}`);
    await page.goto(discoverUrl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator('[data-lang="ru"]').click();
    await page.locator(".discover-deck-preview").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => Boolean(document.querySelector("#pairing-products")?.dataset.pairingId));

    const products = page.locator("#pairing-products");
    const preview = page.locator(".discover-deck-preview");
    const previewPrice = preview.locator(".discover-deck-preview-price");
    const menuLink = page.locator("#pairing-menu-link");
    const current = await products.getAttribute("data-pairing-id");
    const next = await preview.getAttribute("data-journey-id");
    assert.ok(current && next && current !== next, "Live Deck must expose two distinct active journeys");

    await page.locator(".discover-deck-shell").scrollIntoViewIfNeeded();

    const [menuBox, previewBox, priceBox, viewportHeight] = await Promise.all([
      menuLink.boundingBox(), preview.boundingBox(), previewPrice.boundingBox(), page.evaluate(() => innerHeight)
    ]);
    assert.ok(menuBox && previewBox && priceBox, "Live Deck geometry is not measurable");
    assert.ok(menuBox.y + menuBox.height + 8 <= previewBox.y, "Live next-card preview overlaps the primary CTA");
    const visiblePreview = Math.max(0, Math.min(viewportHeight, previewBox.y + previewBox.height) - Math.max(0, previewBox.y));
    assert.ok(visiblePreview >= 64, `Live next-card preview exposes only ${visiblePreview.toFixed(1)}px`);
    assert.ok(priceBox.y >= 0 && priceBox.y + priceBox.height <= viewportHeight - 4, "Live next-card price is outside the first viewport");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `Live Deck creates ${overflow}px horizontal overflow`);

    if (current !== "iced-san-sebastian") {
      assert.equal(next, "iced-san-sebastian", "With two P0 journeys the alternate must be San Sebastian");
      await preview.click();
      await page.waitForFunction(() => document.querySelector("#pairing-products")?.dataset.pairingId === "iced-san-sebastian");
    }

    assert.equal(await products.getAttribute("data-pairing-id"), "iced-san-sebastian");
    assert.equal(
      await menuLink.getAttribute("href"),
      "menu.html?product=desserts%3Asan-sebastian-cheesecake#desserts",
      "Live San journey must target the exact existing product"
    );

    await menuLink.click();
    await page.waitForURL(/menu\.html\?product=/, { timeout: 15000 });
    await page.locator("#menu-product-dialog").waitFor({ state: "visible", timeout: 15000 });
    assert.match(await page.locator("#menu-product-title").innerText(), /Сан-Себастьян/i);
    assert.match(await page.locator("#menu-product-price").innerText(), /190\s*₺/);

    const reveal = page.locator(".menu-product-reveal-control");
    await reveal.waitFor({ state: "visible", timeout: 10000 });
    await reveal.evaluate((node) => {
      node.value = "35";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.match(await reveal.getAttribute("aria-valuetext"), /65%/);

    const bridge = page.locator(".menu-product-pairing-bridge");
    await bridge.waitFor({ state: "visible", timeout: 10000 });
    assert.match(await bridge.innerText(), /Айс-латте \+ чизкейк Сан-Себастьян/i);
    assert.match(await bridge.innerText(), /370\s*₺/);
    await page.locator(".menu-product-pairing-action").click();
    await page.waitForFunction(() => {
      const dialog = document.querySelector("#menu-product-dialog");
      const title = document.querySelector("#menu-product-title")?.textContent ?? "";
      return dialog?.hasAttribute("open") && title.includes("Айс-латте + чизкейк Сан-Себастьян");
    }, { timeout: 10000 });
    assert.match(await page.locator("#menu-product-price").innerText(), /370\s*₺/);
    assert.equal(await reveal.isHidden(), true, "Live pairing must not inherit dessert reveal controls");

    await page.locator("#menu-add-to-cart").click();
    assert.equal(Number(await page.locator("#menu-cart-count").innerText()), 1, "Live journey must add exactly one cart line");
    await page.locator("#menu-cart-trigger").click();
    await page.locator("#menu-cart-dialog").waitFor({ state: "visible", timeout: 5000 });
    const total = Number((await page.locator("#menu-cart-dialog-total").innerText()).replace(/\D/g, ""));
    assert.equal(total, 370, "Live journey must end at the catalog-backed 370 ₺ total");

    await page.screenshot({ path: resolve(out, `live-discover-to-cart-${attempt}.png`), fullPage: true });
    assert.deepEqual(pageErrors, [], `Live page errors: ${pageErrors.join(" | ")}`);
    assert.deepEqual(sameOriginFailures, [], `Live same-origin failures: ${sameOriginFailures.join(" | ")}`);
    return { current, next, visiblePreview, overflow, total, pageErrors: 0, sameOriginFailures: 0 };
  } finally {
    await context.close();
  }
}

let browser;
let lastError;
try {
  browser = await chromium.launch({ headless: true });
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const item = { attempt, startedAt: new Date().toISOString() };
    try {
      await verifyPublishedRevisions();
      item.journey = await runJourney(browser, attempt);
      item.passed = true;
      report.attempts.push(item);
      report.passed = true;
      report.completedAt = new Date().toISOString();
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log("✅ LIVE-DISCOVER-E2E passed: published Deck → San → Reveal → Pairing → Cart.");
      break;
    } catch (error) {
      lastError = error;
      item.passed = false;
      item.error = error.message;
      report.attempts.push(item);
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.warn(`LIVE-DISCOVER-E2E attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
} finally {
  await browser?.close();
}

if (!report.passed) {
  report.completedAt = new Date().toISOString();
  report.finalError = lastError?.message ?? "Unknown live Discover failure";
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  throw lastError ?? new Error("LIVE-DISCOVER-E2E failed");
}
