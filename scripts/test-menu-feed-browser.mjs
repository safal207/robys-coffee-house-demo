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
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `${output}/${engine}-${width}-${language}.png` });
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
    report.cases.push({ width, language, result: "PASS", totalAfterCrossPageAdd: 310, sharedCart: true, qr: true, focus: true, overflow: false });
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
