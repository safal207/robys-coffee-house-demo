import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { menuCategories } from "../menu-catalog.js";

// Exercise emitted production bytes. A DOM stub cannot detect the description
// moving the next touch target in a scrolled, sticky-header/footer dialog.
const repo = resolve(process.env.ROBYS_QUICK_BUILDER_ROOT ?? new URL("..", import.meta.url).pathname);
process.chdir(repo);
const output = resolve(process.env.ROBYS_QUICK_BUILDER_QA_DIR ?? ".artifacts/quick-builder-scroll");
mkdirSync(output, { recursive: true });
const assets = ["src/smart-choice/quick-builder.ts", "smart-choice/app-v2.js", "smart-choice/index.html", "smart-choice/style.css"];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = { head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(), assetHashesStart: hashes(), browsers: {}, cases: [],
  harnessSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
  environment: "Local HTTPS with a temporary self-signed certificate, original CSP, emitted runtime, external requests and service workers blocked; desktop engines at responsive sizes, not physical-device certification" };
const certificate = mkdtempSync(join(tmpdir(), "robys-quick-builder-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
  "-keyout", join(certificate, "key.pem"), "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  const path = resolve(repo, "." + new URL(request.url, "http://localhost").pathname);
  if (path !== repo && !path.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
  const file = existsSync(path) && statSync(path).isDirectory() ? join(path, "index.html") : path;
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const classic = "cold-coffee:iced-caffe-latte", flavoured = "cold-coffee:flavoured-iced-caffe-latte";
const san = "desserts:san-sebastian-cheesecake", lotus = "desserts:lotus-cheesecake";
const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const prices = new Map(menuCategories.flatMap(category => (category.items ?? category.groups.flatMap(group => group.items))
  .map(item => [`${category.id}:${item.id ?? slug(item.name.en)}`, item.price])));
const money = value => Number(value.replace(/[^\d]/g, ""));
const basket = page => page.evaluate(async validIds => {
  const { readLatestStoredOrderDraft } = await import("../src/order-storage.js");
  return JSON.stringify(await readLatestStoredOrderDraft(new Set(validIds)));
}, [...prices.keys()]);
const engines = { chromium, firefox, webkit };

async function stableTap(page, dialog, selector) {
  const target = dialog.locator(selector);
  await target.evaluate(element => {
    const dialog = element.closest("dialog");
    dialog.scrollTop += element.getBoundingClientRect().top - dialog.getBoundingClientRect().top - 160;
  });
  const before = await target.boundingBox();
  if (page.viewportSize().width < 800) await target.tap();
  else await target.click();
  const after = await target.boundingBox();
  assert.ok(Math.abs(after.y - before.y) <= 2,
    `${selector} moved ${after.y - before.y}px after selection (expected <= 2px)`);
  assert.equal(await target.getAttribute("aria-pressed"), "true");
  assert.equal(await target.evaluate(element => element === document.activeElement), true);
  return { selector, beforeY: before.y, afterY: after.y, movement: after.y - before.y };
}

try {
  for (const name of (process.env.ROBYS_QUICK_BUILDER_BROWSERS ?? "chromium,firefox,webkit").split(",")) {
    assert.ok(engines[name], `Unknown browser: ${name}`);
    const browser = await engines[name].launch({ headless: true });
    report.browsers[name] = browser.version();
    try {
      for (const [width, height] of [[390, 844], [360, 720], [1280, 900]]) for (const language of ["tr", "en", "ru"]) {
        const id = `${name}/${width}x${height}/${language}`;
        if (process.env.ROBYS_QUICK_BUILDER_FILTER && !id.includes(process.env.ROBYS_QUICK_BUILDER_FILTER)) continue;
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800, ignoreHTTPSErrors: true,
          isMobile: name !== "firefox" && width < 800, colorScheme: "dark", reducedMotion: "reduce", serviceWorkers: "block" });
        const page = await context.newPage(), errors = [];
        page.setDefaultTimeout(30000);
        page.on("pageerror", error => errors.push(error.message));
        await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript(language => { localStorage.setItem("robys-language", language); }, language);
        const result = { id, passed: false, transitions: [] };
        try {
          await page.goto(`${origin}/smart-choice/`, { waitUntil: "domcontentloaded" });
          await page.evaluate(() => document.fonts.ready);
          await page.locator(`.qb-product[data-product-id="${classic}"]`).click();
          const dialog = page.locator(".qb-customizer[open]");
          await dialog.locator(`[data-dessert-id="${san}"]`).click();
          await dialog.locator(".qb-add").click();
          await dialog.locator(".qb-confirmation-line .qb-edit").click();
          const original = await basket(page);
          const capture = name !== "webkit" && width === 390 && language === "ru";
          // Reproduce the user's classic -> flavour -> classic loop while
          // keeping both the selected target and its keyboard focus in place.
          for (const choice of [`${flavoured}/caramel`, `${flavoured}/chocolate-cookie`, `${classic}/plain`, `${flavoured}/caramel`]) {
            const selector = `[data-choice-id="${choice}"]`;
            result.transitions.push(await stableTap(page, dialog, selector));
            assert.equal(await basket(page), original, "Changing the editor must not save the basket");
            if (capture && choice === `${flavoured}/chocolate-cookie`) await page.screenshot({ path: join(output, `${name}-flavour.png`), caret: "initial" });
          }
          await dialog.locator(".qb-customizer-close").click();
          assert.equal(await basket(page), original, "Closing cancels the unsaved flavour");
          await page.locator("#qb-cart .qb-edit").click();
          assert.equal(await dialog.locator(`[data-choice-id="${classic}/plain"]`).getAttribute("aria-pressed"), "true");
          result.transitions.push(await stableTap(page, dialog, `[data-choice-id="${flavoured}/caramel"]`));
          result.transitions.push(await stableTap(page, dialog, `[data-dessert-id="${lotus}"]`));
          result.transitions.push(await stableTap(page, dialog, ".qb-no-sweet"));
          result.transitions.push(await stableTap(page, dialog, `[data-dessert-id="${san}"]`));
          const up = dialog.locator('[data-step="up"]');
          const previousY = (await up.boundingBox()).y;
          await up.click();
          assert.ok(Math.abs((await up.boundingBox()).y - previousY) <= 2, "Quantity must keep the footer control stable");
          assert.equal(await up.evaluate(element => element === document.activeElement), true);
          assert.equal(await dialog.locator(".qb-stepper output").textContent(), "2");
          assert.equal(money(await dialog.locator(".qb-add-total strong").textContent()), 2 * (prices.get(flavoured) + prices.get(san)));
          assert.equal(await basket(page), original, "Only explicit Save may commit the edit");
          if (capture) await page.screenshot({ path: join(output, `${name}-before-save.png`), caret: "initial" });
          await dialog.locator(".qb-add").click();
          await dialog.locator(".qb-confirmation-line").waitFor();
          const saved = JSON.parse(await basket(page));
          assert.equal(saved.groups.length, 1);
          assert.equal(saved.groups[0].quantity, 2);
          assert.deepEqual(saved.groups[0].items, [{ id: flavoured, quantity: 1, variant: "caramel" }, { id: san, quantity: 1 }]);
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.locator("#qb-cart .qb-edit").click();
          assert.equal(await dialog.locator(`[data-choice-id="${flavoured}/caramel"]`).getAttribute("aria-pressed"), "true");
          assert.equal(await dialog.locator(".qb-stepper output").textContent(), "2");
          assert.deepEqual(errors, [], "The journey must not throw browser errors");
          result.passed = true;
        } catch (error) {
          result.error = error.stack ?? String(error);
          if (name !== "webkit") await page.screenshot({ path: join(output, `${name}-${width}-${language}-failure.png`), caret: "initial" }).catch(() => {});
        } finally {
          report.cases.push(result);
          writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
          console.log(`${id}: ${result.passed ? "PASS" : result.error}`);
          await context.close();
        }
      }
    } finally { await browser.close(); }
  }
} finally {
  server.close();
  rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); report.assetHashesEnd = hashes();
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
assert.deepEqual(report.assetHashesEnd, report.assetHashesStart, "Tested application bytes must remain unchanged during collection");
assert.ok(report.cases.length, "The browser filter must execute at least one case");
const failures = report.cases.filter(item => !item.passed);
for (const failure of failures) console.error(`${failure.id}: ${failure.error}`);
console.log(`Quick builder scroll: ${report.cases.length - failures.length}/${report.cases.length} passed`);
assert.equal(failures.length, 0);
