import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

// Exercise shipped HTML/JS/CSS unchanged, under the production CSP. Nothing in
// this harness recompiles, substitutes or invokes production mutation helpers.
const repo = resolve(new URL("..", import.meta.url).pathname);
process.chdir(repo);
for (const name of ["menu-combos-ui", "choice-help-entry", "choice-help"]) {
  assert.equal(readFileSync(`${name}.js`, "utf8"), compileMenuRuntime(readFileSync(`src/${name}.js`, "utf8")),
    `${name}.js must exactly match the built current source before runtime verification`);
}
const output = resolve(process.env.ROBYS_COMBO_QA_DIR ?? ".artifacts/menu-combos");
mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-combo-built-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4" };
const requests = new Map();
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    const pathname = new URL(request.url, "https://127.0.0.1").pathname;
    let file = resolve(repo, "." + decodeURIComponent(pathname));
    if (file !== repo && !file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    requests.set(pathname, (requests.get(pathname) ?? 0) + 1);
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const storageKey = "robys-menu-order.v2";
// Shared local runners can take longer to schedule browser work. This only
// adjusts harness waits; the virtual 45-second product threshold is unchanged.
const timeoutMs = Number(process.env.ROBYS_QA_TIMEOUT_MS ?? 10_000);
assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0, "Browser harness timeout must be a positive finite number");
const assets = ["app.js", "src/app.ts", "menu.html", "menu-app.js", "menu-runtime.css", "menu-combos-ui.js", "menu-combos.css", "menu-order-ui.js", "menu-catalog.js",
  "index.html", "coffee-paths.css", "src/products/sets-v1/cool-lime-macaron.webp", "discover.html", "experience/index.html", "smart-choice/index.html", "ru/coffee-gazipasa.html",
  "combo-entry.css", "choice-help-entry.js", "choice-help.js", "choice-help.css", "sw.js", "sw-core-v64.js", "scripts/test-menu-combos-browser.mjs",
  "src/menu-app.js", "src/menu-combos-ui.js", "src/menu-combos.js", "src/choice-help-entry.js", "src/choice-help.js", "order-storage.js",
  "src/brand/robys-compact-master-v1.svg", "src/brand/robys-takeaway-cup-v1.webp",
  ...["student", "cycle", "rain", "tea", "refresh", "together", "family", "local", "go", "morning", "sweet", "hearty"]
    .map(id => `src/products/occasion-sets-v1/${id}.webp`)];
const hashes = () => Object.fromEntries(assets.filter(existsSync).map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = {
  startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirtyFilesAtStart: execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().split("\n").filter(Boolean),
  mode: "Unchanged emitted runtime over local HTTPS; original CSP; desktop browser engines with touch-sized viewports, not physical phones",
  environment: { bypassCSP: false, selfSignedLocalHttps: true, externalRequests: "blocked", authoritativeStore: "readonly IDB verification", timeoutMs },
  assetHashesStart: hashes(), browsers: {}, cases: []
};
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const sortLines = lines => [...lines].sort((a, b) => a.id.localeCompare(b.id, "en"));
// Independent expected compositions, including the often ambiguous shared
// dessert and the quantities for two adults and two children.
const recipes = {
  student: [["brew-hot:black-tea", 1], ["food:sesame-simit", 1]],
  cycle: [["cold-coffee:iced-americano", 1], ["food:white-cheese-baguette-sandwich", 1]],
  rain: [["brew-hot:salep", 1], ["desserts:cookie", 1]],
  tea: [["herbal-tea:balance-tea-detox-green-tea", 1], ["food:sesame-simit", 1]],
  refresh: [["refreshers:cool-lime", 1], ["desserts:macaron", 1]],
  together: [["hot-coffee:caffe-latte", 2], ["desserts:san-sebastian-cheesecake", 1]],
  family: [["hot-coffee:cappuccino", 2], ["food:sesame-simit", 2], ["brew-hot:milk", 2], ["desserts:cookie", 2]],
  local: [["brew-hot:turkish-coffee", 1], ["food:sesame-simit", 1]],
  go: [["hot-coffee:americano", 1], ["food:sesame-simit", 1]],
  morning: [["hot-coffee:cappuccino", 1], ["food:three-cheese-croissant", 1]],
  sweet: [["hot-coffee:caffe-latte", 1], ["desserts:cookie", 1]],
  hearty: [["brew-hot:filter-coffee", 1], ["food:white-cheese-baguette-sandwich", 1]]
};
const quantityErrors = {
  tr: { "-1": /negatif/, "1.5": /tam sayı/, "": /Bir adet gir/, "21": /en fazla 20/ },
  en: { "-1": /negative/, "1.5": /whole number/, "": /Enter a quantity/, "21": /at most 20/ },
  ru: { "-1": /отрицательным/, "1.5": /целым числом/, "": /Укажи количество/, "21": /не больше 20/ }
};
const linesFor = id => sortLines(recipes[id].map(([id, quantity]) => ({ id, quantity })));

// Observation only: retain bounded evidence before existing failure cleanup.
function observeFailureLifecycle(context, browser) {
  const events = [], failedRequests = [], pageIds = new WeakMap();
  const moduleRequests = [], moduleFacts = new WeakMap();
  const modulePaths = new Set(["/menu-app.js", "/menu-combos-ui.js", "/src/menu-combos.js", "/menu-combos.css"]);
  let nextPageId = 0, nextRequestId = 0;
  const retain = (buffer, value, limit) => {
    buffer.push(value);
    if (buffer.length > limit) buffer.shift();
  };
  const record = (event, facts = {}) => retain(events, { at: new Date().toISOString(), event, ...facts }, 80);
  const observe = page => {
    const pageId = ++nextPageId;
    pageIds.set(page, pageId);
    record("page-created", { pageId, url: page.url().slice(0, 1000) });
    page.on("crash", () => record("page-crash", { pageId, url: page.url().slice(0, 1000) }));
    page.on("close", () => record("page-close", { pageId, url: page.url().slice(0, 1000) }));
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) record("main-frame-navigated", { pageId, url: frame.url().slice(0, 1000) });
    });
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin !== origin || !modulePaths.has(url.pathname)) return;
      const facts = { requestId: ++nextRequestId, pageId, url: request.url().slice(0, 1000),
        resourceType: request.resourceType(), requestedAt: new Date().toISOString(), state: "pending" };
      moduleFacts.set(request, facts);
      retain(moduleRequests, { request, facts }, 40);
      record("combo-module-request", facts);
    });
    page.on("response", response => {
      const facts = moduleFacts.get(response.request());
      if (!facts) return;
      facts.responseAt = new Date().toISOString(); facts.status = response.status(); facts.state = "response";
      record("combo-module-response", { requestId: facts.requestId, pageId, url: facts.url, status: facts.status });
    });
    page.on("requestfinished", request => {
      const facts = moduleFacts.get(request);
      if (!facts) return;
      facts.finishedAt = new Date().toISOString(); facts.state = "finished";
      record("combo-module-finished", { requestId: facts.requestId, pageId, url: facts.url });
    });
    page.on("requestfailed", request => {
      const failure = { pageId, url: request.url().slice(0, 1000), resourceType: request.resourceType(),
        error: request.failure()?.errorText };
      retain(failedRequests, failure, 20);
      record("request-failed", failure);
      const facts = moduleFacts.get(request);
      if (facts) {
        facts.failedAt = new Date().toISOString(); facts.state = "failed"; facts.error = failure.error;
      }
    });
  };
  context.pages().forEach(observe);
  context.on("page", observe);
  context.on("close", () => record("context-close"));
  return () => ({ observedAt: new Date().toISOString(), browserConnected: browser.isConnected(),
    pages: context.pages().map(page => ({ pageId: pageIds.get(page), url: page.url().slice(0, 1000), closed: page.isClosed() })),
    events: events.slice(), lastFailedRequests: failedRequests.slice(),
    comboModuleRequests: moduleRequests.map(({ request, facts }) => ({ ...facts, timing: request.timing() })) });
}

function captureError(error) {
  return { name: String(error?.name ?? "Error").slice(0, 100), message: String(error?.message ?? error).slice(0, 2000),
    ...(typeof error?.stack === "string" ? { stack: error.stack.slice(0, 4000) } : {}) };
}

async function captureFailureDiagnostics(context, browser, id, diagnostics = [], checkpoint = () => {}) {
  for (const [index, page] of context.pages().entries()) {
    const state = () => ({ observedAt: new Date().toISOString(), browserConnected: browser.isConnected(),
      url: page.url().slice(0, 1000), closed: page.isClosed() });
    const diagnostic = { pageIndex: index, beforeCapture: state() };
    const screenshot = { file: `${id}-failure-${index}.png`, startedAt: new Date().toISOString(), status: "PENDING" };
    diagnostic.screenshot = screenshot; diagnostics.push(diagnostic); checkpoint();
    try { await page.screenshot({ path: join(output, screenshot.file) }); screenshot.status = "PASS"; }
    catch (error) { screenshot.status = "FAIL"; screenshot.error = captureError(error); }
    screenshot.finishedAt = new Date().toISOString(); screenshot.afterCapture = state();
    checkpoint();
    const evaluation = { startedAt: new Date().toISOString(), status: "PENDING" };
    diagnostic.evaluation = evaluation; checkpoint();
    try {
      evaluation.result = await page.evaluate(() => ({ url: location.href, lang: document.documentElement.lang,
        active: document.activeElement?.outerHTML.slice(0, 250), openDialogs: [...document.querySelectorAll("dialog[open]")].map(node => node.className || node.id),
        helperActivity: window.__qaHelperActivity,
        text: document.body.innerText.slice(-3500) }));
      evaluation.status = "PASS";
    } catch (error) { evaluation.status = "FAIL"; evaluation.error = captureError(error); }
    evaluation.finishedAt = new Date().toISOString(); evaluation.afterCapture = state();
    checkpoint();
  }
  return diagnostics;
}

async function newContext(browser, { width = 390, height = 844, language = "ru", serviceWorkers = "block" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800,
    reducedMotion: "reduce", serviceWorkers, ignoreHTTPSErrors: true });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  await context.addInitScript(({ language, origin }) => {
    if (location.origin === origin) localStorage.setItem("robys-language", language);
  }, { language, origin });
  return context;
}

async function run(browser, id, callback, options = {}) {
  if (process.env.ROBYS_COMBO_FILTER && !id.includes(process.env.ROBYS_COMBO_FILTER)) return;
  const context = await newContext(browser, options);
  const failureLifecycle = observeFailureLifecycle(context, browser);
  const errors = [];
  context.on("page", page => {
    page.setDefaultTimeout(timeoutMs);
    page.on("pageerror", error => errors.push(error.message));
  });
  const startedAt = new Date().toISOString();
  try {
    const facts = await callback(context);
    assert.deepEqual(errors, [], "No uncaught application errors");
    report.cases.push({ id, status: "PASS", startedAt, facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    const lifecycle = failureLifecycle();
    const failure = { id, status: "FAIL", startedAt, error: error.stack, errors, diagnostics: [], lifecycle };
    report.cases.push(failure); persist();
    await captureFailureDiagnostics(context, browser, id, failure.diagnostics, () => {
      failure.lifecycleDuringDiagnostics = failureLifecycle(); persist();
    });
    failure.lifecycleAfterDiagnostics = failureLifecycle(); persist();
    console.error(`FAIL ${id}: ${error.stack}`);
  } finally { await context.close(); persist(); }
}

async function openMenu(page, hash = "menu-combos") {
  await page.goto(`${origin}/menu.html?entry=off${hash ? `#${hash}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.locator('#menu-root[data-ready="true"]').waitFor();
  if (hash.startsWith("menu-combos")) await page.locator(".menu-combos-card").first().waitFor();
}

async function installClock(page) {
  await page.clock.install({ time: new Date("2026-10-18T12:00:00Z") });
  // Freeze while still on about:blank, before the app creates any timers. CI
  // asset-loading latency must not consume part of the45second threshold.
  await page.clock.pauseAt(new Date("2026-10-18T12:01:00Z"));
}

const preview = page => page.locator(".menu-combos-dialog[open]");
const choose = (page, id) => page.locator(`[data-combo-recipe="${id}"] .menu-combos-choose`);
const comboTotal = (prices, id) => recipes[id].reduce((sum, [product, quantity]) => sum + prices[product] * quantity, 0);
const money = text => Number(text.replace(/[^\d]/g, ""));

async function openRecipe(page, id) {
  await choose(page, id).click();
  await preview(page).waitFor();
}

async function clearCart(page) {
  const cart = page.locator("#menu-cart-dialog[open]");
  await cart.waitFor();
  let removed = 0;
  while (await cart.locator(".menu-cart-remove").count()) {
    const before = await cart.locator(".menu-cart-remove").count();
    await cart.locator(".menu-cart-remove").first().click();
    await page.waitForFunction(count => document.querySelectorAll("#menu-cart-dialog .menu-cart-remove").length < count, before);
    assert.ok(++removed < 30, "Cart cleanup is bounded");
  }
  await assertLines(page, []);
  await page.locator('[data-menu-dialog-close="cart"]').first().click();
  await cart.waitFor({ state: "hidden" });
}

async function catalogPrices(page) {
  // Reading served catalog data independently catches hardcoded/stale card
  // totals; no combo domain or production quote function is imported.
  return page.evaluate(async () => {
    const { menuCategories } = await import("/menu-catalog.js");
    const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return Object.fromEntries(menuCategories.flatMap(category => (category.items ?? category.groups?.flatMap(group => group.items) ?? [])
      .map(item => [`${category.id}:${item.id ?? slug(item.name.en)}`, item.price])));
  });
}

async function waitLines(page, expected) {
  await page.waitForFunction(({ key, lines }) => {
    try { return JSON.stringify(JSON.parse(localStorage.getItem(key)).lines) === JSON.stringify(lines); } catch { return false; }
  }, { key: storageKey, lines: sortLines(expected) });
}

async function canonical(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open("robys-order-transactions.v1", 1);
    opening.onupgradeneeded = () => { opening.transaction.abort(); reject(new Error("Canonical store was not created")); };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction("shared-order", "readonly");
      const request = transaction.objectStore("shared-order").get("robys-menu-order.v1");
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }));
}

async function assertLines(page, expected) {
  await waitLines(page, expected);
  const record = await canonical(page);
  assert.ok(record.revision > 0);
  assert.deepEqual(record.draft.lines, sortLines(expected));
  assert.ok(record.draft.groups.every(group => group.items.length === 1), "Components remain independently removable");
  return record.revision;
}

async function geometry(page, selector) {
  return page.locator(selector).evaluate(root => {
    const rect = root.getBoundingClientRect();
    return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      contained: rect.left >= -1 && rect.right <= innerWidth + 1,
      clippedControls: [...root.querySelectorAll("button,input,select,a")].filter(node => node.getClientRects().length)
        .filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent?.trim().slice(0, 100)),
      dialogFits: root.tagName !== "DIALOG" || rect.top >= -1 && rect.bottom <= innerHeight + 1 };
  });
}

// Scenario definitions are below the harness so every check shares the same
// immutable built-byte hashes and independent canonical-store verification.
try {
  const selected = (process.env.ROBYS_COMBO_BROWSERS ?? "chromium").split(",");
  for (const name of selected) {
    assert.ok(["chromium", "firefox", "webkit"].includes(name));
    const browser = await ({ chromium, firefox, webkit })[name].launch({ headless: true });
    report.browsers[name] = browser.version();
    try {
      for (const language of ["tr", "en", "ru"]) {
        await run(browser, `${name}-catalog-and-edit-${language}`, async context => {
          const page = await context.newPage(); await openMenu(page);
          assert.equal(await page.locator("html").getAttribute("lang"), language);
          assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
          assert.equal(await page.locator(".menu-combos-card").count(), 12);
          const prices = await catalogPrices(page), observed = [];
          for (const id of Object.keys(recipes)) {
            const card = page.locator(`[data-combo-recipe="${id}"]`);
            const expected = comboTotal(prices, id);
            assert.equal(money(await card.locator(".menu-combos-price strong").textContent()), expected, `${id}: current catalog total`);
            await card.locator(".menu-combos-photo > img").scrollIntoViewIfNeeded();
            const photo = await card.locator(".menu-combos-photo > img").evaluate(async image => {
              await image.decode(); return { src: new URL(image.currentSrc).pathname, width: image.naturalWidth, height: image.naturalHeight };
            });
            assert.equal(photo.src, `/src/products/occasion-sets-v1/${id}.webp`);
            assert.ok(photo.width > 0 && photo.height > 0);
            assert.equal(await card.locator(".menu-combos-logo").getAttribute("src"), "src/brand/robys-compact-master-v1.svg");
            await openRecipe(page, id);
            assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), expected);
            const quantities = await preview(page).locator("[data-combo-quantity]").evaluateAll(nodes =>
              nodes.map(node => ({ id: node.dataset.comboQuantity, quantity: Number(node.value) })));
            assert.deepEqual(sortLines(quantities), linesFor(id), `${id}: exact starting quantities`);
            assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Preview never adds products");
            if (language !== "ru") assert.doesNotMatch(await preview(page).innerText(), /[А-Яа-яЁё]/, "All preview copy follows the selected language");
            await page.keyboard.press("Escape");
            assert.equal(await choose(page, id).evaluate(button => document.activeElement === button), true, "Escape restores the chosen card's focus");
            observed.push({ id, total: expected, quantities, photo });
          }
          for (const [filter, count] of [["takeaway", 4], ["family", 1], ["together", 2], ["pause", 6], ["all", 12]]) {
            await page.locator(`[data-combo-filter="${filter}"]`).click();
            assert.equal(await page.locator(".menu-combos-card").count(), count, `${filter}: matching cards only`);
            assert.equal(await page.locator(`[data-combo-filter="${filter}"]`).getAttribute("aria-pressed"), "true");
          }
          await openRecipe(page, "student");
          const quantity = preview(page).locator('[data-combo-quantity="brew-hot:black-tea"]');
          await quantity.fill("99"); await quantity.press("Tab");
          assert.equal(await quantity.getAttribute("aria-invalid"), "true");
          assert.equal(await preview(page).locator(".menu-combos-add").isDisabled(), true, "Invalid quantities cannot silently add an earlier value");
          for (const [value, expected] of Object.entries(quantityErrors[language])) {
            await quantity.fill(value); await quantity.press("Tab");
            assert.equal(await quantity.getAttribute("aria-invalid"), "true", `${language}: ${value} is invalid`);
            assert.equal(await preview(page).locator(".menu-combos-add").isDisabled(), true);
            assert.match(await preview(page).locator(".menu-combos-status").innerText(), expected);
            const description = await quantity.getAttribute("aria-describedby");
            assert.ok(description, `${language}: invalid field has a descriptive error`);
            assert.match(await preview(page).locator(`[id="${description}"]`).textContent(), expected);
          }
          await preview(page).locator('[data-combo-increase="brew-hot:black-tea"]').click();
          assert.equal(await quantity.inputValue(), "2", "Plus recovers from invalid text using the last valid quantity");
          assert.notEqual(await quantity.getAttribute("aria-invalid"), "true", "A valid step clears the previous validation error");
          assert.equal(await quantity.getAttribute("aria-describedby"), null, "Recovery removes the stale error description");
          assert.equal(await preview(page).locator(".menu-combos-add").isDisabled(), false);
          await quantity.fill("3"); await quantity.press("Tab");
          await preview(page).locator('[data-combo-product="food:sesame-simit"] .menu-combos-remove').click();
          await preview(page).locator("#menu-combos-add-product").selectOption("desserts:cookie");
          assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 3 * prices["brew-hot:black-tea"] + prices["desserts:cookie"]);
          await preview(page).locator(".menu-combos-add").click();
          await page.locator("#menu-cart-dialog[open]").waitFor();
          const edited = [{ id: "brew-hot:black-tea", quantity: 3 }, { id: "desserts:cookie", quantity: 1 }];
          await assertLines(page, edited);
          const editedTotal = money(await page.locator("#menu-cart-dialog-total").textContent());
          assert.equal(editedTotal, 3 * prices["brew-hot:black-tea"] + prices["desserts:cookie"]);
          await clearCart(page);
          await openRecipe(page, "student");
          while (await preview(page).locator(".menu-combos-remove").count()) await preview(page).locator(".menu-combos-remove").first().click();
          assert.equal(await preview(page).locator(".menu-combos-add").isDisabled(), true, "An empty selection cannot be added");
          assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 0);
          await page.keyboard.press("Escape"); await assertLines(page, []);
          return { language, recipes: observed, filterCounts: { takeaway: 4, family: 1, together: 2, pause: 6, all: 12 },
            editedLines: edited, editedTotal, emptySelectionDisabled: true, originalLogo: true, focusRestoredForAllRecipes: true };
        }, { language });

        for (const id of ["together", "family"]) await run(browser, `${name}-exact-add-${id}-${language}`, async context => {
          const page = await context.newPage(); await openMenu(page); const prices = await catalogPrices(page);
          await openRecipe(page, id);
          await preview(page).locator(".menu-combos-add").click();
          await page.locator("#menu-cart-dialog[open]").waitFor();
          const revision = await assertLines(page, linesFor(id));
          assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), comboTotal(prices, id));
          assert.equal(await page.locator(".order-checkout-dialog[open]").count(), 0, "Add opens the editable cart, not QR checkout");
          await page.keyboard.press("Escape");
          assert.equal(await choose(page, id).evaluate(button => document.activeElement === button), true);
          return { language, recipe: id, lines: linesFor(id), total: comboTotal(prices, id), canonicalRevision: revision, separateEditableLines: true };
        }, { language });
      }

      for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1440, 1000], [844, 390]]) {
        for (const language of ["tr", "en", "ru"]) await run(browser, `${name}-layout-${width}x${height}-${language}`, async context => {
          const page = await context.newPage();
          let initialMenu;
          if (width === 320 || width === 390) {
            await openMenu(page, "");
            initialMenu = await page.evaluate(() => ({
              firstCategoryTop: document.querySelector(".full-menu-panel").getBoundingClientRect().top,
              pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
              viewBeforeCombos: document.querySelector(".menu-view-switch").getBoundingClientRect().bottom
                <= document.querySelector(".combo-entry-links").getBoundingClientRect().top,
              viewLinks: [...document.querySelectorAll(".menu-view-switch a")].map(link => {
                const box = link.getBoundingClientRect();
                return { href: link.getAttribute("href"), text: link.innerText.trim(), current: link.getAttribute("aria-current"), width: box.width, height: box.height };
              }),
              heroLinks: [...document.querySelectorAll(".menu-page-hero-copy > .combo-entry-links a")].map(link => {
                const box = link.getBoundingClientRect();
                return { id: link.id, href: link.getAttribute("href"), width: box.width, height: box.height };
              })
            }));
            const viewUrls = initialMenu.viewLinks.map(link => new URL(link.href, page.url()));
            assert.deepEqual(viewUrls.map(url => url.pathname.split("/").pop()), ["menu.html", "menu-feed.html"], "Both menu views remain available");
            assert.deepEqual(viewUrls.map(url => url.searchParams.get("view")), ["list", "feed"], "View links explicitly select their destination");
            assert.deepEqual(initialMenu.viewLinks.map(link => link.text), { tr: ["Liste", "Akış"], en: ["List", "Feed"], ru: ["Список", "Лента"] }[language],
              "Menu view labels follow the selected language");
            assert.deepEqual(initialMenu.viewLinks.map(link => link.current), ["page", null], "The list view is identified as the current page");
            assert.equal(initialMenu.viewBeforeCombos, true, "View choice appears before the separate combo choices");
            assert.equal(initialMenu.pageOverflow, false, "Menu view and combo routes fit the narrow viewport");
            assert.deepEqual(initialMenu.heroLinks.map(link => link.href), ["#menu-combos-fallback", "#menu-combos-fallback", "#menu-family-fallback"],
              "All three existing combo routes remain available without a duplicate feed entry");
            assert.ok([...initialMenu.heroLinks, ...initialMenu.viewLinks].every(link => link.width >= 44 && link.height >= 44), "Every menu view and combo route retains a 44-pixel touch target");
            assert.ok(initialMenu.firstCategoryTop < 600, "Hero routes preserve the first menu category within600pixels on narrow screens");
            if (width === 320 && language === "ru") await page.screenshot({ path: join(output, "menu-hero-320-ru.png") });
          }
          await openMenu(page, "menu-combos-takeaway");
          assert.equal(await page.locator(".menu-combos-card").count(), 4, "Takeaway deep-link selects its filter");
          const cards = await geometry(page, ".menu-combos-section");
          assert.deepEqual(cards, { pageOverflow: false, contained: true, clippedControls: [], dialogFits: true });
          await openRecipe(page, "morning");
          const dialog = await geometry(page, ".menu-combos-dialog[open]");
          assert.deepEqual(dialog, { pageOverflow: false, contained: true, clippedControls: [], dialogFits: true });
          await preview(page).locator(".menu-combos-close").focus();
          await page.keyboard.press("Shift+Tab");
          assert.equal(await preview(page).locator(".menu-combos-add").evaluate(button => button === document.activeElement), true, "Shift+Tab wraps inside the dialog");
          await page.keyboard.press("Tab");
          assert.equal(await preview(page).locator(".menu-combos-close").evaluate(button => button === document.activeElement), true, "Tab wraps back to Close");
          if (language === "ru" && [320, 390, 1440, 844].includes(width)) {
            await preview(page).screenshot({ path: join(output, `dialog-${width}x${height}-${language}.png`) });
            await page.keyboard.press("Escape");
            await page.locator(".menu-combos-card").first().screenshot({ path: join(output, `takeaway-card-${width}x${height}-${language}.png`) });
          }
          return { width, height, language, initialMenu, cards, dialog, keyboardFocusContained: true };
        }, { width, height, language });
      }

      await run(browser, `${name}-two-tabs-preserve-combo-additions`, async context => {
        const pages = await Promise.all([context.newPage(), context.newPage()]);
        await Promise.all(pages.map(page => openMenu(page)));
        await Promise.all(pages.map((page, index) => openRecipe(page, index ? "rain" : "student")));
        await Promise.all(pages.map(page => preview(page).locator(".menu-combos-add").click()));
        await Promise.all(pages.map(page => page.locator("#menu-cart-dialog[open]").waitFor()));
        const expected = sortLines([...linesFor("student"), ...linesFor("rain")]);
        await Promise.all(pages.map(page => assertLines(page, expected)));
        const cold = await context.newPage(); await openMenu(cold, "");
        assert.equal(await cold.locator("#menu-cart-count").textContent(), "4", "A new view recovers all accepted additions");
        await cold.locator("#menu-cart-trigger").click(); await cold.locator("#menu-cart-dialog[open]").waitFor();
        await assertLines(cold, expected);
        return { nativeAddHandlers: 2, exactLines: expected, newTabRecoversBoth: true, lostUpdates: 0 };
      });

      await run(browser, `${name}-busy-double-activation-adds-once`, async context => {
        const page = await context.newPage(); await openMenu(page); await openRecipe(page, "family");
        // Two same-task DOM activations reach the real click handler. The first
        // immediately makes the control busy, before its asynchronous commit.
        await preview(page).locator(".menu-combos-add").evaluate(button => { button.click(); button.click(); });
        await page.locator("#menu-cart-dialog[open]").waitFor();
        const revision = await assertLines(page, linesFor("family"));
        return { activation: "Two immediate DOM button.click() attempts, actual production handler", commits: 1,
          exactLines: linesFor("family"), canonicalRevision: revision };
      });

      await run(browser, `${name}-delayed-combo-loader-keeps-newer-cart-intent`, async context => {
        let release, entered;
        const gate = new Promise(resolve => { release = resolve; });
        const waiting = new Promise(resolve => { entered = resolve; });
        await context.route("**/menu-combos-ui.js*", async route => { entered(); await gate; await route.continue(); });
        try {
          const page = await context.newPage(); await openMenu(page, "");
          await page.locator("#menu-combos-trigger").click(); await waiting;
          await page.locator("#menu-cart-trigger").click();
          await page.locator("#menu-cart-dialog[open]").waitFor(); release();
          await page.waitForLoadState("networkidle");
          assert.equal(await page.locator(".menu-combos-dialog[open]").count(), 0);
          assert.equal(await page.locator("#menu-cart-dialog[open]").count(), 1);
          assert.equal(await page.locator("#menu-cart-dialog").evaluate(dialog => dialog.contains(document.activeElement)), true,
            "Late loading must not steal focus from the newer cart");
          return { delayedModule: "menu-combos-ui.js", newerCartRemainsOpen: true, focusPreserved: true };
        } finally { release(); }
      });

      for (const next of ["category", "search", "hash"]) await run(browser, `${name}-delayed-combo-loader-keeps-newer-${next}`, async context => {
        let release, entered;
        const gate = new Promise(resolve => { release = resolve; });
        const waiting = new Promise(resolve => { entered = resolve; });
        await context.route("**/menu-combos-ui.js*", async route => { entered(); await gate; await route.continue(); });
        try {
          const page = await context.newPage(); await openMenu(page, "");
          await page.locator("#menu-combos-trigger").click(); await waiting;
          if (next === "category") await page.locator('#menu-category-nav [data-category="hot-coffee"]').click();
          if (next === "search") await page.locator("#menu-search").fill("latte");
          if (next === "hash") await page.evaluate(() => { location.hash = "cold-coffee"; });
          const expectedFocus = await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("data-category"));
          release(); await page.waitForLoadState("networkidle");
          assert.equal(await page.locator(".menu-combos-section").isHidden(), true, "An older reveal cannot override the latest catalog choice");
          assert.equal(await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute("data-category")), expectedFocus);
          return { delayedModule: "menu-combos-ui.js", newerChoice: next, olderRevealCancelled: true, focusPreserved: true };
        } finally { release(); }
      });

      await run(browser, `${name}-same-hash-helper-reopens-hidden-combos`, async context => {
        const page = await context.newPage(); await openMenu(page, "menu-combo-sweet");
        await preview(page).waitFor();
        await page.keyboard.press("Escape");
        // The helper's target has no entry query. Match it exactly so this
        // cannot pass by reloading the document instead of reopening in place.
        await page.evaluate(() => {
          history.replaceState(null, "", location.pathname + location.hash);
          window.__comboSameDocument = true;
        });
        await page.locator(".menu-combos-hide").click();
        assert.equal(await page.locator(".menu-combos-section").isHidden(), true);
        assert.equal(new URL(page.url()).hash, "#menu-combo-sweet");
        await page.locator(".choice-help-entry").click(); await page.locator(".choice-help-panel:not([hidden])").waitFor();
        assert.equal(new URL(await page.locator(".choice-help-actions a").first().getAttribute("href")).hash, "#menu-combo-sweet");
        await page.locator(".choice-help-actions a").first().click();
        await page.locator(".menu-combos-section").waitFor();
        await preview(page).waitFor();
        assert.equal(await page.evaluate(() => window.__comboSameDocument), true, "The same document handles an identical hash target");
        assert.equal(await page.locator(".menu-combos-card").count(), 12);
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), comboTotal(await catalogPrices(page), "sweet"));
        assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "The contextual route only previews its recipe");
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true);
        await page.keyboard.press("Escape");
        assert.equal(await choose(page, "sweet").evaluate(button => document.activeElement === button), true,
          "Closing a contextual preview restores focus to its visible grid card");
        return { sameHash: "#menu-combo-sweet", hiddenThenReopened: true, explicitHelperNavigationWorks: true,
          matchingRecipePreviewed: "sweet", cartUnchanged: true, visibleGridFocusRestored: true };
      });

      for (const language of ["tr", "en", "ru"]) await run(browser, `${name}-all-view-entry-points-${language}`, async context => {
        const page = await context.newPage(), observations = [];
        for (const path of ["index.html?entry=off", "discover.html", "smart-choice/", "experience/", "ru/coffee-gazipasa.html"]) {
          await page.goto(`${origin}/${path}`, { waitUntil: "domcontentloaded" });
          const links = page.locator(".combo-entry .combo-entry-link");
          await links.first().waitFor();
          const actual = await links.evaluateAll(nodes => nodes.map(node => ({ href: new URL(node.href).pathname + new URL(node.href).hash, text: node.textContent.trim() })));
          assert.deepEqual(actual.map(link => link.href), ["/menu.html#menu-combos", "/menu.html#menu-combos-takeaway", "/menu.html#menu-family"]);
          const entry = page.locator(".combo-entry");
          await entry.scrollIntoViewIfNeeded();
          const layout = await geometry(page, ".combo-entry");
          assert.equal(layout.pageOverflow, false); assert.equal(layout.contained, true); assert.deepEqual(layout.clippedControls, []);
          if (language !== "ru" && !path.startsWith("ru/")) assert.doesNotMatch(await entry.innerText(), /[А-Яа-яЁё]/);
          await links.nth(1).click(); await page.locator(".menu-combos-card").first().waitFor();
          assert.equal(await page.locator(".menu-combos-card").count(), 4);
          observations.push({ path, links: actual, layout, takeawayNavigation: true });
        }
        return { language, views: observations };
      }, { language });

      await run(browser, `${name}-helper-notifications-keep-storage-lazy-until-eligible`, async context => {
        const page = await context.newPage(); await installClock(page);
        const storageRequests = [];
        page.on("request", request => {
          if (new URL(request.url()).pathname === "/order-storage.js") storageRequests.push(request.url());
        });
        await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
        await page.locator(".choice-help-entry").waitFor();
        await page.evaluate(() => {
          // Notifications are advisory, including their newValue payload. They
          // must neither start ordering nor treat a disposable projection as
          // the canonical basket. Do not seed or mutate an authoritative order.
          const projection = JSON.stringify({ version: 1, lines: [{ id: "brew-hot:milk", quantity: 2 }] });
          window.dispatchEvent(new StorageEvent("storage", { key: "robys-menu-order.v2", newValue: projection }));
          window.dispatchEvent(new CustomEvent("robys:order-change", { detail: { origin: "qa-peer-notification" } }));
          window.dispatchEvent(new Event("focus"));
        });
        await page.waitForLoadState("networkidle");
        assert.deepEqual(storageRequests, [], "Projection, order-change and focus notifications do not download authoritative storage");
        await page.clock.runFor(44_000);
        assert.deepEqual(storageRequests, [], "The45second offer threshold remains a lazy boundary after notifications");
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true);

        const peer = await context.newPage(); await openMenu(peer); await openRecipe(peer, "student");
        await preview(peer).locator(".menu-combos-add").click(); await peer.locator("#menu-cart-dialog[open]").waitFor();
        const revision = await assertLines(peer, linesFor("student"));
        await peer.evaluate(() => {
          // Simulate a failed disposable mirror after a real UI commit. Keep
          // the independently verified IndexedDB record entirely untouched.
          for (const storage of [localStorage, sessionStorage]) for (const key of
            ["robys-menu-order.v2", "robys-menu-order.v1", "robys-menu-order.tab.v1"]) storage.removeItem(key);
        });
        await page.bringToFront();
        await page.waitForFunction(() => !document.hidden);
        await page.locator(".choice-help-entry").evaluate(button => button.focus({ preventScroll: true }));
        assert.deepEqual(storageRequests, [], "A peer commit notification is still not local ordering intent");
        assert.deepEqual((await canonical(page)).draft.lines, linesFor("student"));
        // Keep the45second module boundary and the eight-second idle window
        // separate. Real module loading can finish after runFor has advanced
        // virtual time, so networkidle alone is not a mounted-helper barrier.
        await page.clock.runFor(1_000);
        await page.locator('[data-choice-help-mounted="true"]').waitFor({ state: "attached" });
        await page.locator(".back-top").evaluate(link => link.focus({ preventScroll: true }));
        assert.deepEqual(storageRequests, [], "Mounting the helper before its idle window does not download authoritative storage");
        await page.clock.runFor(7_000);
        assert.deepEqual(storageRequests, [], "The mounted helper still waits for eight seconds of idle");
        await Promise.all([
          page.waitForRequest(request => new URL(request.url()).pathname === "/order-storage.js"),
          page.clock.runFor(1_000)
        ]);
        await page.waitForLoadState("networkidle");
        assert.equal(storageRequests.length, 1, "An eligible idle offer must read the actual basket even when its mirror is absent");
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "The nonempty canonical basket suppresses the automatic offer");
        assert.deepEqual((await canonical(page)).draft.lines, linesFor("student"), "Assistance cannot mutate the peer's order");
        return { notificationTypes: ["storage projection", "robys:order-change", "focus"], before44sStorageRequests: 0,
          mountedBeforeIdleWindow: true, before7sIdleStorageRequests: 0, after8sIdleStorageRequests: storageRequests.length,
          eligibleStorageRequests: storageRequests.length, authoritativePeerOrder: linesFor("student"), canonicalRevision: revision,
          missingDisposableMirror: true, nonemptyCanonicalOrderSuppressesOffer: true };
      });

      for (const language of ["tr", "en", "ru"]) await run(browser, `${name}-quiet-helper-once-${language}`, async context => {
        const page = await context.newPage();
        await installClock(page);
        await openMenu(page, "");
        await page.locator(".choice-help-entry").waitFor();
        await page.evaluate(() => {
          window.__qaHelperActivity = [];
          for (const type of ["scroll", "focusin"]) document.addEventListener(type, event => {
            window.__qaHelperActivity.push({ type, time: performance.now(), target: event.target.id, scrollY });
          }, { capture: true });
        });
        await page.locator("#menu-search").focus();
        await page.clock.runFor(50_000);
        // At45seconds the small entry driver imports the suggestion module.
        // Let that real network work settle before measuring a new idle window
        // with frozen virtual time; otherwise its initialization can straddle
        // the focus change and require a subsequent timer tick to revalidate.
        await page.waitForLoadState("networkidle");
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "No interruption while typing/search has focus");
        // This case measures the idle window after editing. Focusing the
        // distant footer with default scrolling delivers a later native scroll
        // in WebKit, correctly restarting the app's idle clock. Keep focus and
        // scroll independent here; other cases cover scrolling/layout behavior.
        await page.locator("#menu-share-button").evaluate(button => button.focus({ preventScroll: true }));
        await page.clock.runFor(7_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "Wait for eight seconds of idle after editing");
        await page.clock.runFor(2_000);
        await page.locator(".choice-help-panel:not([hidden])").waitFor();
        const idleActivity = await page.evaluate(() => window.__qaHelperActivity);
        assert.equal(await page.locator("#menu-share-button").evaluate(button => document.activeElement === button), true, "Automatic hint never moves focus");
        assert.equal(await page.locator(".choice-help-panel").getAttribute("aria-modal"), null);
        const actions = await page.locator(".choice-help-actions a").evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, href: new URL(node.href).pathname + new URL(node.href).hash })));
        assert.deepEqual(actions.map(action => action.href), ["/menu.html#menu-combo-sweet", "/smart-choice/"]);
        assert.equal(await page.locator(".choice-help-actions a:visible").count(), 1, "A successful suggestion has one contextual action");
        assert.equal(await page.locator(".choice-help-actions a").nth(1).isHidden(), true, "Smart Choice remains available only in the generic fallback");
        assert.equal(await page.locator(".choice-help-panel").getAttribute("data-combo-recipe"), "sweet");
        assert.equal(money(await page.locator(".choice-help-price").textContent()), comboTotal(await catalogPrices(page), "sweet"),
          "The compact suggestion uses the current catalog price");
        if (language !== "ru") assert.doesNotMatch(await page.locator(".choice-help-panel").innerText(), /[А-Яа-яЁё]/);
        if (language === "ru") await page.locator(".choice-help-panel").screenshot({ path: join(output, "quiet-helper-390-ru.png") });
        await page.locator(".choice-help-close").click();
        await page.clock.runFor(50_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true);
        await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
        await page.locator(".choice-help-entry").waitFor(); await page.clock.runFor(50_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "Dismissal persists across existing views in the same session");
        await page.locator(".choice-help-entry").click();
        await page.locator(".choice-help-panel:not([hidden])").waitFor();
        assert.equal(await page.locator(".choice-help-entry").evaluate(button => document.activeElement === button), true, "Manual offer leaves keyboard focus on its entry");
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true);
        await page.locator(".choice-help-entry").click();
        await page.locator(".choice-help-panel:not([hidden])").waitFor();
        assert.equal(await page.locator(".choice-help-entry").evaluate(button => document.activeElement === button), true,
          "The mounted helper preserves focus on repeated manual activation");
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true);
        return { language, virtualVisibleTimeBeforeOffer: 59_000, editingSuppressed: true, idleThresholdRespected: true,
          noFocusSteal: true, nonmodal: true, oncePerSessionAcrossViews: true, manualStillAvailable: true, idleActivity, actions };
      }, { language });

      await run(browser, `${name}-helper-timing-and-immediate-dismissal`, async context => {
        const page = await context.newPage(); await installClock(page);
        await openMenu(page, ""); await page.locator(".choice-help-entry").waitFor();
        // Keep this idle-only clock fixture independent of the footer's native
        // focus scroll, which WebKit can deliver after virtual time advances.
        const readingPosition = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
        await page.locator("#menu-share-button").evaluate(button => button.focus({ preventScroll: true }));
        assert.deepEqual(await page.locator("#menu-share-button").evaluate(button => ({ focused: document.activeElement === button, x: scrollX, y: scrollY })),
          { focused: true, ...readingPosition }, "The idle timing anchor preserves focus and the current reading position");
        await page.clock.runFor(44_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "Offer is not immediate or before45seconds");
        await page.clock.runFor(2_000); await page.locator(".choice-help-panel:not([hidden])").waitFor();
        await page.locator("#menu-search").focus();
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "Focusing search immediately hides an existing hint");
        await page.locator(".choice-help-entry").click(); await page.locator(".choice-help-panel:not([hidden])").waitFor();
        await page.locator("#menu-cart-trigger").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "Opening a cart immediately hides an existing hint");
        return { before44s: "hidden", after46s: "visible", activeSearchImmediatelyHides: true, openCartImmediatelyHides: true };
      });

      await run(browser, `${name}-helper-suppressed-by-order-and-dialog`, async context => {
        const page = await context.newPage(); await installClock(page);
        await openMenu(page); await openRecipe(page, "student");
        await page.clock.runFor(50_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "No automatic offer over an open selection dialog");
        await preview(page).locator(".menu-combos-add").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        await page.clock.runFor(50_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "No automatic offer over the cart");
        await page.keyboard.press("Escape"); await page.clock.runFor(50_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true, "An existing order suppresses later upselling even after its cart closes");
        await page.locator(".choice-help-entry").click(); await page.locator(".choice-help-panel:not([hidden])").waitFor();
        return { selectionDialogSuppressed: true, cartSuppressed: true, nonemptyOrderAutomaticallySuppressed: true,
          explicitHelpAvailableWithExistingOrder: true, expectedLines: linesFor("student") };
      });

      for (const kind of ["combo", "family"]) await run(browser, `${name}-closed-${kind}-dialog-allows-helper`, async context => {
        const page = await context.newPage(); await installClock(page);
        await openMenu(page);
        if (kind === "combo") await openRecipe(page, "student");
        else {
          await page.locator("#menu-family-trigger").click();
          await page.locator('[data-family-recipe="milk-cookie"] button').click();
          await page.locator(".menu-family-dialog[open]").waitFor();
        }
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("dialog[open]").count(), 0);
        await page.locator("#menu-share-button").focus(); await page.clock.runFor(46_000);
        await page.locator(".choice-help-panel:not([hidden])").waitFor();
        await page.locator(".choice-help-close").click();
        await page.locator(".choice-help-entry").click(); await page.locator(".choice-help-panel:not([hidden])").waitFor();
        return { closedDialog: kind, automaticHelpAllowedAfterClosing: true, explicitHelpAllowedAfterClosing: true };
      });

      for (const language of ["tr", "en", "ru"]) await run(browser, `${name}-smart-choice-helper-has-useful-exit-${language}`, async context => {
        const page = await context.newPage(); await page.goto(`${origin}/smart-choice/`, { waitUntil: "domcontentloaded" });
        await page.locator(".choice-help-entry").click(); await page.locator(".choice-help-panel:not([hidden])").waitFor();
        const links = page.locator(".choice-help-actions a:visible");
        assert.equal(await links.count(), 1, "Smart Choice never links the visitor back to the screen already open");
        assert.equal(new URL(await links.first().getAttribute("href")).hash, "#menu-combo-sweet");
        return { language, usefulExit: "menu.html#menu-combo-sweet", selfLinkHidden: true };
      }, { language });

      for (const selection of ["family-section", "family-filter"]) await run(browser, `${name}-helper-follows-${selection}`, async context => {
        const page = await context.newPage();
        if (selection === "family-section") {
          await openMenu(page, "menu-family");
          await page.locator(".menu-family-card").first().waitFor();
        } else {
          await openMenu(page);
          await page.locator('[data-combo-filter="family"]').click();
          assert.equal(await page.locator(".menu-combos-card").count(), 1);
        }
        await page.locator(".choice-help-entry").click();
        await page.locator(".choice-help-panel:not([hidden])").waitFor();
        assert.equal(await page.locator(".choice-help-panel").getAttribute("data-combo-recipe"), "family");
        assert.equal(await page.locator(".choice-help-actions a:visible").count(), 1);
        assert.equal(new URL(await page.locator(".choice-help-actions a").first().getAttribute("href")).hash, "#menu-combo-family");
        const expected = comboTotal(await catalogPrices(page), "family");
        assert.equal(money(await page.locator(".choice-help-price").textContent()), expected);
        assert.equal(await page.locator("#menu-cart-count").textContent(), "0", "Contextual help never adds its suggested recipe");
        return { selection, suggestedRecipe: "family", total: expected, singleAction: true, cartUnchanged: true };
      });

      await run(browser, `${name}-helper-data-failure-keeps-generic-navigation`, async context => {
        await context.route("**/menu-catalog.js*", route => route.abort("failed"));
        const page = await context.newPage();
        await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
        await page.locator(".choice-help-entry").click();
        await page.locator(".choice-help-panel:not([hidden])").waitFor();
        assert.equal(await page.locator(".choice-help-panel").getAttribute("data-combo-recipe"), null);
        const links = await page.locator(".choice-help-actions a:visible").evaluateAll(nodes =>
          nodes.map(node => new URL(node.href).pathname + new URL(node.href).hash));
        assert.deepEqual(links, ["/menu.html#menu-combos", "/smart-choice/"]);
        assert.equal(await page.locator(".choice-help-price").isHidden(), true, "Unavailable data cannot produce an invented price");
        assert.equal(await page.locator(".choice-help-photo").isHidden(), true);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true);
        return { failure: "catalog module request", usefulFallbackLinks: links, noInventedPrice: true, dismissible: true };
      });

      for (const [view, path] of [["home", "index.html?entry=off"], ["ru-local", "ru/coffee-gazipasa.html"]]) {
        await run(browser, `${name}-mobile-navigation-suppresses-helper-${view}`, async context => {
          const page = await context.newPage(); await installClock(page);
          const storageRequests = [];
          page.on("request", request => {
            if (new URL(request.url()).pathname === "/order-storage.js") storageRequests.push(request.url());
          });
          await page.goto(`${origin}/${path}`, { waitUntil: "domcontentloaded" });
          const toggle = page.locator(".menu-toggle");
          const navigationFocus = page.locator("#main-navigation a").first();
          await toggle.click();
          assert.equal(await toggle.getAttribute("aria-expanded"), "true");
          assert.equal(await navigationFocus.evaluate(node => document.activeElement === node), true,
            "Opening navigation focuses its intended entry point");
          assert.equal(await page.locator("body").evaluate(body => body.classList.contains("menu-open")), true);
          await page.clock.runFor(50_000); await page.waitForLoadState("networkidle");
          assert.equal(await page.locator(".choice-help-panel").isHidden(), true,
            "The full mobile navigation suppresses an automatic suggestion beyond both timing thresholds");
          assert.deepEqual(storageRequests, [], "An open navigation does not trigger an unnecessary basket read");

          await toggle.click();
          assert.equal(await toggle.getAttribute("aria-expanded"), "false");
          await page.clock.runFor(9_000);
          await page.locator(".choice-help-panel:not([hidden])").waitFor();
          await toggle.click();
          assert.equal(await navigationFocus.evaluate(node => document.activeElement === node), true,
            "Reopening navigation focuses its intended entry point before suggestion suppression");
          await page.clock.runFor(20); // One frame, before the next one-second eligibility tick.
          assert.equal(await page.locator("body").evaluate(body => body.classList.contains("menu-open")), true);
          assert.equal(await page.locator(".choice-help-panel").isHidden(), true,
            "Opening mobile navigation immediately hides a suggestion that is already visible");
          assert.equal(await navigationFocus.evaluate(node => document.activeElement === node), true,
            "Hiding a suggestion preserves the intended navigation focus");

          await toggle.click();
          await page.locator(".choice-help-entry").click();
          await page.locator(".choice-help-panel:not([hidden])").waitFor();
          return { view, viewport: { width: 390, height: 844 }, navigationOpenSuppressesAutomaticOffer: true,
            navigationOpenBasketRequests: 0, closeThenIdleAllowsOffer: true, openingNavigationHidesVisibleOfferWithinMs: 20,
            navigationFocusPreserved: true, navigationFocusTarget: "first-navigation-link",
            explicitHelpAfterNavigationClose: true };
        });
      }

      await run(browser, `${name}-helper-short-viewport-remains-quiet`, async context => {
        const page = await context.newPage(); await installClock(page);
        await openMenu(page, ""); await page.clock.runFor(50_000);
        assert.equal(await page.locator(".choice-help-panel").isHidden(), true);
        await page.locator(".choice-help-entry").click(); await page.locator(".choice-help-panel:not([hidden])").waitFor();
        assert.deepEqual(await geometry(page, ".choice-help-panel"), { pageOverflow: false, contained: true, clippedControls: [], dialogFits: true });
        return { automaticOfferSuppressed: true, manualPanelFits: true, viewport: { width: 844, height: 390 } };
      }, { width: 844, height: 390 });
    } finally { await browser.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); report.assetHashesEnd = hashes();
  report.assetsUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.requests = Object.fromEntries([...requests.entries()].sort(([a], [b]) => a.localeCompare(b)));
  report.passed = report.cases.filter(test => test.status === "PASS").length;
  report.failed = report.cases.length - report.passed;
  persist();
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, assetsUnchanged: report.assetsUnchanged, report: join(output, "report.json") }));
if (!report.cases.length || report.failed || !report.assetsUnchanged) process.exitCode = 1;
