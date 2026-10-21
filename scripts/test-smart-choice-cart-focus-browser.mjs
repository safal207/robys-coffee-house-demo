import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const repository = fileURLToPath(new URL("..", import.meta.url));
const directory = resolve(process.env.ROBYS_CART_FOCUS_QA_DIR ?? join(repository, ".artifacts/smart-choice-cart-focus"));
mkdirSync(directory, { recursive: true });
const assets = ["src/smart-choice/cart.ts", "smart-choice/cart-v2.js", "smart-choice/app-v2.js", "smart-choice/index.html"];
const hashes = () => Object.fromEntries(assets.map(path => [path,
  createHash("sha256").update(readFileSync(join(repository, path))).digest("hex")]));
const selected = (process.env.CHECKOUT_BROWSERS ?? "chromium,firefox,webkit").split(",").map(value => value.trim());
const engines = { chromium, firefox, webkit };
assert.ok(selected.length && selected.every(name => engines[name]), "CHECKOUT_BROWSERS must name supported browsers");
const report = { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(), assets: hashes(), requestedBrowsers: selected,
  harnessSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  environment: { server: "local HTTPS; emitted assets and CSP unchanged", serviceWorkers: "blocked", externalRequests: "blocked",
    setup: "seeded valid selected wizard state; production cart modules and real IndexedDB", reducedMotion: "reduce",
    asyncCases: "controlled delivery of completed IndexedDB callbacks; production reads and writes" }, cases: [] };
const temporary = mkdtempSync(join(tmpdir(), "robys-cart-focus-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout",
  join(temporary, "key.pem"), "-out", join(temporary, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
// Serve emitted files unchanged, including the real CSP. HTTPS avoids browser-
// specific upgrades of local HTTP resources by upgrade-insecure-requests.
const server = createServer({ key: readFileSync(join(temporary, "key.pem")), cert: readFileSync(join(temporary, "cert.pem")) }, (request, response) => {
  let path = resolve(repository, `.${decodeURIComponent(new URL(request.url, "https://localhost").pathname)}`);
  if (!path.startsWith(resolve(repository) + sep) || !existsSync(path)) { response.writeHead(404).end(); return; }
  if (statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(path).pipe(response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const labels = { ru: "Добавить второй Latte", en: "Add a second Latte", tr: "İkinci bir Latte ekle" };
const scenarios = [
  { name: "keyboard/ru", language: "ru", width: 320, height: 568, kind: "keyboard" },
  { name: "keyboard/en", language: "en", width: 1440, height: 900, kind: "keyboard" },
  { name: "keyboard/tr", language: "tr", width: 390, height: 844, kind: "keyboard" },
  { name: "pointer/ru", language: "ru", width: 320, height: 568, kind: "pointer" },
  { name: "await-outside/ru", language: "ru", width: 320, height: 568, kind: "outside" },
  { name: "await-inside/ru", language: "ru", width: 320, height: 568, kind: "inside" },
  { name: "stale-render/ru", language: "ru", width: 320, height: 568, kind: "stale" },
  { name: "background/ru", language: "ru", width: 320, height: 568, kind: "background" }
].filter(scenario => !process.env.ROBYS_CART_FOCUS_FILTER || scenario.name.includes(process.env.ROBYS_CART_FOCUS_FILTER));
assert.ok(scenarios.length, "The case filter must select at least one scenario");

async function state(page, language) {
  return page.evaluate(label => {
    const button = [...document.querySelectorAll(".cart-choice")].find(node => node.textContent.includes(label));
    const active = document.activeElement;
    return { pressed: button?.getAttribute("aria-pressed"), total: document.querySelector(".cart-total strong")?.textContent,
      upgradeFocused: active === button, activeTag: active?.tagName, activeClass: active?.className,
      activeText: active?.tagName === "BODY" ? "" : active?.textContent?.trim().slice(0, 160),
      cartRenders: window.cartFocusRenderCount };
  }, labels[language]);
}

async function waitForCart(page, language, active) {
  await page.waitForFunction(({ label, active }) => {
    const button = [...document.querySelectorAll(".cart-choice")].find(node => node.textContent.includes(label));
    return button?.getAttribute("aria-pressed") === String(active) &&
      document.querySelector(".cart-total strong")?.textContent.replace(/\D/g, "") === (active ? "550" : "370");
  }, { label: labels[language], active });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function holdCompletions(page) {
  await page.evaluate(() => {
    // Keep real IndexedDB reads/writes. Delay only delivery of completed
    // callbacks, as in the checkout-staleness regression harness.
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
    window.cartFocusHeld = [];
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      configurable: descriptor.configurable, enumerable: descriptor.enumerable, get: descriptor.get,
      set(handler) {
        descriptor.set.call(this, function(event) {
          if (this.db.name === "robys-order-transactions.v1") window.cartFocusHeld.push(() => handler.call(this, event));
          else return handler.call(this, event);
        });
      }
    });
    window.releaseCartFocusCompletions = async () => {
      Object.defineProperty(IDBTransaction.prototype, "oncomplete", descriptor);
      await Promise.all(window.cartFocusHeld.splice(0).reverse().map(complete => complete()));
    };
  });
}

async function refreshFromStorage(page) {
  // Exercise the production storage listener without fabricating a cart write.
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "robys-menu-order.v1" })));
}

async function runScenario(browser, engine, scenario) {
  const { language, width, height, kind } = scenario;
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce",
    ignoreHTTPSErrors: true, serviceWorkers: "block" });
  const entry = { ...scenario, browser: engine, version: browser.version(), status: "running", observations: [] };
  report.cases.push(entry);
  let page;
  try {
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(language => {
      localStorage.setItem("robys-language", language);
      // Restore a valid selected wizard result; mounting, pricing, persistence,
      // keyboard activation and DOM replacement all use production modules.
      sessionStorage.setItem("robys-smart-choice-session.v1", JSON.stringify({ version: 1, screen: "selected", questionIndex: 4,
        answers: { intent: "refresh", temperature: "cold", taste: "sweet", partySize: "two", budgetKey: "400" },
        locale: language, selectedCandidateId: "combo-iced-san-sebastian", selectionToken: "cart-focus-regression" }));
    }, language);
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/smart-choice/#selected`);
    await waitForCart(page, language, false);
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.cartFocusRenderCount = 0;
      new MutationObserver(records => {
        if (records.some(record => record.removedNodes.length)) window.cartFocusRenderCount++;
      }).observe(document.querySelector(".cart-builder"), { childList: true });
    });
    const upgrade = page.locator(".cart-choice").filter({ hasText: labels[language] });
    const outside = page.locator(".smart-header .brand");
    const more = page.locator(".cart-choose-more");
    entry.observations.push({ step: "initial", ...await state(page, language) });
    if (kind === "background") {
      await outside.focus();
      await refreshFromStorage(page);
      await page.waitForFunction(() => window.cartFocusRenderCount >= 1);
      assert.equal(await outside.evaluate(node => document.activeElement === node), true,
        "Background storage refresh must leave focus outside the cart");
    } else {
      await upgrade.focus();
      if (["outside", "inside", "stale"].includes(kind)) {
        await holdCompletions(page);
        await page.keyboard.press("Space");
        await page.waitForFunction(() => window.cartFocusHeld.length >= 1);
        if (kind === "outside") await outside.focus();
        else await more.focus();
        if (kind === "stale") {
          await refreshFromStorage(page);
          await page.waitForFunction(() => window.cartFocusHeld.length >= 2);
        }
        entry.observations.push({ step: "while-save-pending", ...await state(page, language) });
        await page.evaluate(() => window.releaseCartFocusCompletions());
        if (kind === "stale") await page.waitForFunction(() => window.cartFocusRenderCount >= 2);
      } else if (kind === "pointer") await upgrade.click();
      else await page.keyboard.press("Space");
      await waitForCart(page, language, true);
      entry.observations.push({ step: "after-add", ...await state(page, language) });
      if (kind === "keyboard" && language === "ru") {
        entry.screenshot = `${engine}-320-ru-keyboard-after-add.png`;
        await page.locator(".cart-builder").screenshot({ path: join(directory, entry.screenshot) });
      }
      if (kind === "outside") assert.equal(await outside.evaluate(node => document.activeElement === node), true,
        "An awaited save must not steal focus after the user leaves the cart");
      else if (kind === "inside" || kind === "stale") assert.equal(await more.evaluate(node => document.activeElement === node), true,
        "Render must preserve the current control, not the earlier toggle that started the save");
      else {
        assert.equal(await upgrade.evaluate(node => document.activeElement === node), true,
          "SC-FOCUS-001: toggling the second Latte must keep focus on its replacement button");
        await page.keyboard.press("Enter");
        await waitForCart(page, language, false);
        assert.equal(await upgrade.evaluate(node => document.activeElement === node), true, "Removing the upgrade must also preserve focus");
        entry.observations.push({ step: "after-remove", ...await state(page, language) });
        await page.keyboard.press("Tab");
        assert.equal(await page.locator(".cart-bump-actions button").first().evaluate(node => document.activeElement === node), true,
          "The next Tab must advance after the upgrade instead of restarting at the cart handoff");
      }
    }
    entry.observations.push({ step: "finished", ...await state(page, language) });
    assert.deepEqual(errors, [], "The page must not throw an application exception");
    entry.status = "passed";
    console.log(`PASS ${engine}/${scenario.name} ${width}x${height}`);
  } catch (error) {
    entry.status = "failed";
    entry.error = error.stack ?? String(error);
    if (page) {
      entry.failureState = await state(page, language).catch(() => null);
      if (!entry.screenshot) {
        entry.screenshot = `${engine}-${scenario.name.replaceAll("/", "-")}-failure.png`;
        await page.screenshot({ path: join(directory, entry.screenshot), fullPage: true }).catch(() => {});
      }
    }
    console.error(`FAIL ${engine}/${scenario.name}: ${error.message}`);
  } finally { await context.close(); }
}

try {
  for (const engine of selected) {
    let browser;
    try {
      browser = await engines[engine].launch({ headless: true });
      for (const scenario of scenarios) await runScenario(browser, engine, scenario);
    } catch (error) {
      report.cases.push({ browser: engine, name: "browser-launch", status: "failed", error: error.stack ?? String(error) });
      console.error(`FAIL ${engine}: ${error.message}`);
    } finally { await browser?.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  report.assetsAfter = hashes();
  report.assetsUnchanged = JSON.stringify(report.assets) === JSON.stringify(report.assetsAfter);
  report.counts = { passed: report.cases.filter(entry => entry.status === "passed").length,
    failed: report.cases.filter(entry => entry.status === "failed").length, skipped: 0 };
  writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report.counts, assetsUnchanged: report.assetsUnchanged, report: join(directory, "report.json") }));
  if (report.counts.failed || !report.assetsUnchanged) process.exitCode = 1;
}
