import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4187;
const BASE = `http://127.0.0.1:${PORT}/`;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Static server did not start");
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "tr-TR" });
  const page = await context.newPage();
  const runtimeErrors = [];
  const failedRequests = [];

  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url()}`));

  await page.goto(`${BASE}menu.html#hot-coffee`, { waitUntil: "domcontentloaded" });
  await page.locator('body[data-menu-integrity-ready="true"]').waitFor();

  const chips = page.locator("#menu-category-nav .menu-category-chip");
  assert.ok(await chips.count() > 2, "category navigation did not render");
  assert.equal(await chips.nth(0).getAttribute("aria-pressed"), "false", "direct hash must begin in the requested category");

  const search = page.locator("#menu-search");
  await search.fill("San Sebastian");
  await page.waitForFunction(() => document.querySelector("#menu-category-nav .menu-category-chip")?.getAttribute("aria-pressed") === "true");
  await page.waitForFunction(() => document.body.innerText.includes("San Sebastian"));
  await page.waitForFunction(() => /1 ürün bulundu/i.test(document.querySelector("#menu-results-status")?.textContent ?? ""));

  assert.equal(await chips.nth(0).getAttribute("aria-pressed"), "true", "search must expand to all categories");
  assert.equal(await page.locator("#menu-empty").isHidden(), true, "cross-category search must not show a false empty state");
  assert.match(await page.locator("#menu-search-scope").innerText(), /tüm menü kategorilerinde/i);
  assert.match(await page.locator("#menu-results-status").innerText(), /1 ürün bulundu/i);

  const hotCoffeeChip = page.getByRole("button", { name: "Sıcak Kahveler" });
  await hotCoffeeChip.click();
  assert.equal(await search.inputValue(), "", "explicit category selection must exit global search");
  assert.equal(await hotCoffeeChip.getAttribute("aria-pressed"), "true", "selected category must become active");
  assert.match(page.url(), /#hot-coffee$/);

  await chips.nth(0).click();
  const firstPairing = page.locator('.full-menu-item--visual[data-pairing="cool-lime-macaron"]').first();
  await firstPairing.waitFor();
  assert.equal(await firstPairing.locator(".pairing-poster-old-price").count(), 0, "fake crossed-out price must not exist");
  assert.equal((await firstPairing.innerText()).includes("340 ₺"), false, "unsupported 340 ₺ comparison must not be visible");
  assert.match(await firstPairing.innerText(), /290 ₺/);
  assert.match(await firstPairing.innerText(), /ayrı bir eşleşme teklifi/i);

  const showBarista = firstPairing.getByRole("button", { name: /Baristaya göster/ });
  assert.equal(await showBarista.isVisible(), true, "barista action must be visibly rendered below the poster");
  await showBarista.click();
  const dialog = page.locator("#pairing-fulfilment-dialog");
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.getAttribute("open"), "", "barista dialog must be open");
  assert.match(await dialog.innerText(), /Cool Lime \+ Makaron/);
  assert.match(await dialog.innerText(), /290 ₺/);
  assert.match(await dialog.innerText(), /indirim olarak gösterilmez/i);
  await dialog.getByRole("button", { name: "Kapat" }).click();
  await dialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "EN" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await page.locator("#menu-search-scope").innerText(), /all menu categories/i);
  assert.equal(await firstPairing.getByRole("button", { name: /Show barista/ }).isVisible(), true);

  await page.getByRole("button", { name: "RU" }).click();
  assert.equal(await page.locator("html").getAttribute("lang"), "ru");
  assert.match(await page.locator("#menu-search-scope").innerText(), /всем категориям меню/i);
  assert.equal(await firstPairing.getByRole("button", { name: /Показать бариста/ }).isVisible(), true);
  assert.match(await page.locator(".menu-truth-note").innerText(), /Версия меню 2026-06-30/);

  const storageKeys = await page.evaluate(() => Object.keys(localStorage).sort());
  assert.deepEqual(storageKeys, ["robys-language"], "menu integrity must not create persistent profile keys");
  assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${runtimeErrors.join(" | ")}`);
  assert.deepEqual(failedRequests, [], `failed requests: ${failedRequests.join(" | ")}`);

  console.log("✅ MENU-TRUTH-BROWSER-001 passed: global search, explicit category exit, visible truthful pairing actions, barista dialog and TR/EN/RU behavior work in Chromium mobile.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
