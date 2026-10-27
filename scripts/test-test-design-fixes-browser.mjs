import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium, firefox, webkit } from "playwright";

const root = resolve(new URL("..", import.meta.url).pathname);
const output = resolve(process.env.ROBYS_TEST_DESIGN_QA_DIR ?? ".artifacts/test-design-fixes");
mkdirSync(output, { recursive: true });
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer((request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let file = resolve(root, "." + path);
    if (file !== root && !file.startsWith(root + sep)) return response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const engines = { chromium, firefox, webkit };
const selected = (process.env.ROBYS_TEST_DESIGN_BROWSERS ?? "chromium").split(",");
const titles = {
  tr: "Roby's Coffee House | Gazipaşa",
  en: "Roby's Coffee House | Gazipaşa",
  ru: "Roby's Coffee House | Газипаша"
};
const priceLabels = { tr: "Fiyat: 370 ₺", en: "Price: 370 ₺", ru: "Цена: 370 ₺" };
const errors = {
  tr: { "-1": /negatif/, "1.5": /tam sayı/, "": /Bir adet gir/, "21": /en fazla 20/ },
  en: { "-1": /negative/, "1.5": /whole number/, "": /Enter a quantity/, "21": /at most 20/ },
  ru: { "-1": /отрицательным/, "1.5": /целым числом/, "": /Укажи количество/, "21": /не больше 20/ }
};

async function openContext(browser, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort("blockedbyclient"));
  return context;
}

async function verifyHome(browser, engine) {
  const context = await openContext(browser);
  try {
    console.log(`RUN ${engine}: homepage locale matrix`);
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    page.setDefaultNavigationTimeout(10000);
    await page.goto(`${origin}/?entry=off`, { waitUntil: "domcontentloaded" });
    for (const saved of ["tr", "en", "ru"]) {
      for (const requested of ["tr", "en", "ru"]) {
        console.log(`RUN ${engine}: saved ${saved}, URL ${requested}`);
        await page.evaluate(value => localStorage.setItem("robys-language", value), saved);
        await page.goto(`${origin}/?entry=off&lang=${requested}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(expected => document.documentElement.lang === expected &&
          document.querySelector(`.lang-button[data-lang="${expected}"]`)?.getAttribute("aria-pressed") === "true", requested);
        await page.waitForFunction(expected => document.title === expected, titles[requested]);
        assert.equal(await page.locator("html").getAttribute("lang"), requested, `${saved} + ${requested}`);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(expected => document.documentElement.lang === expected, requested);
        assert.equal(await page.locator("html").getAttribute("lang"), requested);
        await page.waitForFunction(expected => document.title === expected, titles[requested]);
      }
    }
    await page.goto(`${origin}/?entry=off&lang=ru`, { waitUntil: "domcontentloaded" });
    await page.locator('.lang-button[data-lang="en"]').click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(new URL(page.url()).searchParams.get("lang"), "en");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(await page.title(), titles.en);
    console.log(`PASS ${engine}: homepage locale precedence, metadata, switching and reload`);
  } finally { await context.close(); }
}

async function verifyPair(browser, engine) {
  for (const [width, height] of [[390, 844], [1363, 936]]) {
    const context = await openContext(browser, { width, height });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      page.setDefaultNavigationTimeout(10000);
      await page.goto(`${origin}/discover.html?entry=off&pair=iced-san-sebastian`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const figure = document.querySelector('[data-pairing-poster="iced-san-sebastian"]');
        const image = figure?.querySelector("img");
        return document.querySelector("#pairing-products")?.dataset.pairingId === "iced-san-sebastian" &&
          image?.complete && image.naturalWidth > 0 && getComputedStyle(figure).visibility === "visible" &&
          Number(getComputedStyle(figure).opacity) === 1;
      });
      for (const lang of ["tr", "en", "ru"]) {
        await page.locator(`.lang-button[data-lang="${lang}"]`).click();
        await page.waitForFunction(expected => document.documentElement.lang === expected, lang);
        const snapshot = await page.locator("#pairing-card").ariaSnapshot();
        assert.ok(snapshot.includes(priceLabels[lang]), `${lang}: current pair price absent from accessibility tree: ${snapshot}`);
      }
      assert.equal(await page.locator("#pairing-menu-link").getAttribute("href"),
        "menu.html?product=pairing-offers%3Aiced-san-sebastian-pairing#pairing-offers");
      if (engine === "chromium" && width === 390) {
        await page.locator("#pairing-products").scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
          const figure = document.querySelector('[data-pairing-poster="iced-san-sebastian"]');
          const image = figure?.querySelector("img");
          return image?.complete && image.naturalWidth > 0 && getComputedStyle(figure).visibility === "visible" &&
            Number(getComputedStyle(figure).opacity) === 1;
        });
        await page.locator('[data-pairing-poster="iced-san-sebastian"] img').evaluate(image => image.decode());
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.screenshot({ path: join(output, "selected-pair-390.png") });
      }
      await page.locator("#pairing-menu-link").click();
      await page.locator("#menu-product-dialog[open]").waitFor();
      // The dialog opens while the editable pair is still being initialized.
      // Wait for the requested dessert and total, not just the open shell.
      await page.waitForFunction(() => {
        const title = document.querySelector("#menu-product-title")?.textContent ?? "";
        const price = document.querySelector("#menu-product-price")?.textContent ?? "";
        const dessert = document.querySelector('input[name="menu-dessert"][value="desserts:san-sebastian-cheesecake"]');
        return /Айс латте.*Сан-Себастьян/i.test(title) && /370\s*₺/.test(price) && dessert?.checked === true;
      }, null, { timeout: 15000 });
      assert.match(await page.locator("#menu-product-title").innerText(), /Айс латте.*Сан-Себастьян/i);
      assert.match(await page.locator("#menu-product-price").innerText(), /370\s*₺/);
      assert.equal(await page.locator('input[name="menu-dessert"][value="desserts:san-sebastian-cheesecake"]').isChecked(), true);
      await page.locator("#menu-add-to-cart").click();
      await page.locator("#menu-cart-dialog[open]").waitFor();
      assert.match(await page.locator("#menu-cart-dialog-total").innerText(), /370\s*₺/);
      console.log(`PASS ${engine}: direct pairing and accessible price at ${width}px`);
    } finally { await context.close(); }
  }
}

async function verifyQuantity(browser, engine) {
  for (const lang of ["tr", "en", "ru"]) {
    const context = await openContext(browser);
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      page.setDefaultNavigationTimeout(10000);
      await page.goto(`${origin}/menu.html?entry=off&view=list&lang=${lang}#menu-combos`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-combo-recipe="student"] .menu-combos-choose').click();
      const dialog = page.locator(".menu-combos-dialog[open]");
      const tea = dialog.locator('[data-combo-quantity="brew-hot:black-tea"]');
      const simit = dialog.locator('[data-combo-quantity="food:sesame-simit"]');
      const status = dialog.locator(".menu-combos-status");
      for (const [value, message] of Object.entries(errors[lang])) {
        await tea.fill(value);
        await tea.press("Tab");
        assert.equal(await tea.getAttribute("aria-invalid"), "true", `${lang}: ${value}`);
        assert.equal(await dialog.locator(".menu-combos-add").isDisabled(), true);
        assert.match(await status.innerText(), message, `${lang}: ${value}`);
        const description = await tea.getAttribute("aria-describedby");
        assert.ok(description, `${lang}: invalid field needs its own accessible explanation`);
        assert.match(await dialog.locator(`[id="${description}"]`).textContent(), message);
      }
      // Correcting one invalid field must not silently clear another's error.
      await tea.fill("-1");
      await simit.fill("21");
      assert.match(await dialog.locator(`[id="${await tea.getAttribute("aria-describedby")}"]`).textContent(), errors[lang]["-1"]);
      assert.match(await dialog.locator(`[id="${await simit.getAttribute("aria-describedby")}"]`).textContent(), errors[lang]["21"]);
      await dialog.locator('[data-combo-product="brew-hot:black-tea"] .menu-combos-remove').click();
      assert.equal(await simit.inputValue(), "21", `${lang}: removing another item preserves the invalid draft`);
      assert.equal(await simit.getAttribute("aria-invalid"), "true");
      assert.equal(await dialog.locator(".menu-combos-add").isDisabled(), true);
      await dialog.locator(".menu-combos-add-product").selectOption("brew-hot:black-tea");
      assert.equal(await simit.inputValue(), "21", `${lang}: adding an item preserves the invalid draft`);
      assert.match(await dialog.locator(`[id="${await simit.getAttribute("aria-describedby")}"]`).textContent(), errors[lang]["21"]);
      assert.equal(await dialog.locator(".menu-combos-add").isDisabled(), true);
      await tea.fill("2");
      assert.equal(await dialog.locator(".menu-combos-add").isDisabled(), true);
      assert.match(await status.innerText(), errors[lang]["21"]);
      await simit.fill("1"); await simit.press("Tab");
      assert.equal(await dialog.locator(".menu-combos-add").isEnabled(), true);
      assert.match(await dialog.locator(".menu-combos-total").innerText(), /135\s*₺/);
      assert.equal(await tea.getAttribute("aria-describedby"), null);
      await tea.fill("20"); await tea.press("Tab");
      assert.equal(await dialog.locator('[data-combo-increase="brew-hot:black-tea"]').isDisabled(), true);
      assert.match(await dialog.locator(".menu-combos-total").innerText(), /1[\s.,]?035\s*₺/);
      if (engine === "chromium" && lang === "ru") {
        await tea.fill("-1"); await tea.press("Tab");
        await status.scrollIntoViewIfNeeded();
        await dialog.screenshot({ path: join(output, "quantity-error-ru-390.png") });
      }
      console.log(`PASS ${engine}: ${lang} quantity boundaries, feedback and recovery`);
    } finally { await context.close(); }
  }
}

try {
  for (const name of selected) {
    assert.ok(engines[name], `Unknown browser: ${name}`);
    const browser = await engines[name].launch({ headless: true });
    try { await verifyHome(browser, name); await verifyPair(browser, name); await verifyQuantity(browser, name); }
    finally { await browser.close(); }
  }
} finally { await new Promise(done => server.close(done)); }
