import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { MENU_STYLE_INPUTS, MENU_STYLESHEET_FILE, readMenuStylesBundleInputs, verifyMenuStylesBundle } from "./menu-styles-bundle.mjs";
import { pairingPosterDimensions, verifyPairingCssFallback } from "./test-pairing-css-fallback-browser.mjs";
import { verifyPairingGeometry } from "./test-pairing-discovery-browser.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const output = resolve(process.env.ROBYS_PAIRING_QA_DIR ?? ".artifacts/pairing-price");
mkdirSync(output, { recursive: true });
const browserName = process.env.ROBYS_PAIRING_BROWSER ?? "chromium";
const type = { chromium, firefox, webkit }[browserName];
assert.ok(type, "ROBYS_PAIRING_BROWSER must be chromium, firefox or webkit");
const inputPaths = [...new Set([
  "scripts/test-pairing-price-browser.mjs", "scripts/test-pairing-css-fallback-browser.mjs",
  "scripts/test-pairing-discovery-browser.mjs", "scripts/menu-styles-bundle.mjs",
  ...MENU_STYLE_INPUTS.map(({ source }) => source),
  "menu.html", "menu-runtime.css", "menu-stability-v2.css", "menu-app.js", "menu-catalog.js",
  "menu-interactions.js", "menu-pairing.js", "sw-core-v64.js"
])];
const hashes = () => Object.fromEntries(inputPaths.map(path => [path,
  createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")]));
const report = {
  startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  browser: browserName, environment: { builtRuntime: true, viewport: { width: 320, height: 1080 },
    rootFontPx: 32, locales: ["tr", "en", "ru"], localTLS: true, bypassCSP: false,
    serviceWorkers: "blocked", externalRequests: "blocked", physicalDevice: false },
  sourceHashes: hashes(), cases: [], status: "running"
};
const save = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const certificate = mkdtempSync(join(tmpdir(), "robys-pairing-price-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
  "-keyout", join(certificate, "key.pem"), "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  const path = resolve(root, `.${decodeURIComponent(new URL(request.url, "https://127.0.0.1").pathname)}`);
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const bytes = readFileSync(path);
    response.writeHead(200, { "content-type": mime[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
let browser;
try {
  const inputs = readMenuStylesBundleInputs(root);
  report.styles = verifyMenuStylesBundle(inputs);
  await new Promise(accept => server.listen(0, "127.0.0.1", accept));
  const origin = `https://127.0.0.1:${server.address().port}`;
  browser = await type.launch({ headless: true });
  report.version = browser.version();
  const context = await browser.newContext({ viewport: { width: 320, height: 1080 }, hasTouch: true,
    ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  // Start enlarged before the poster subtree is created. Dynamic enlargement is
  // also covered by the full unsupported-cqw fixture matrix.
  await context.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.style.fontSize = "32px";
  }, { once: true }));
  for (const language of ["tr", "en", "ru"]) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/${MENU_STYLESHEET_FILE}`));
      await page.goto(`${origin}/menu.html#pairing-offers`, { waitUntil: "domcontentloaded" });
      const response = await responsePromise;
      assert.equal(response.status(), 200, "Native price proof must receive the emitted bundle");
      assert.deepEqual(await response.body(), inputs.bundleBytes, "Native price proof must use the entire emitted bundle unchanged");
      await page.locator(`.lang-button[data-lang="${language}"]`).click();
      await page.locator("#pairing-offers .pairing-poster-overlay").nth(1).waitFor({ state: "attached" });
      await page.evaluate(async () => { await document.fonts.ready; });
      const geometry = await verifyPairingGeometry(page, `native/${language}/320/200%`);
      const cards = await pairingPosterDimensions(page);
      assert.equal(cards.length, 2);
      assert.ok(cards.every(card => card.rootFont === 32 && card.titleFont >= 47.9 && card.plusFont >= 47.9 &&
        card.accentFont >= 35.1 && card.priceFont >= 38.3 && !card.documentOverflow),
      "Native proof must retain actual 200% type and both prices without document overflow");
      assert.deepEqual(errors, [], "Native proof must have no uncaught page errors");
      report.cases.push({ id: `native/${language}/320/200%`, status: "PASS", cards, geometry });
    } catch (error) {
      await page.screenshot({ path: join(output, `native-${language}-failure.png`), fullPage: true }).catch(() => {});
      report.cases.push({ id: `native/${language}/320/200%`, status: "FAIL", error: error.stack, errors });
    } finally { await page.close(); save(); }
  }
  await verifyPairingCssFallback(context, origin, (id, ok, message, evidence) => {
    report.cases.push({ id: evidence.label, status: ok ? "PASS" : "FAIL", check: id, message, evidence });
    save();
  }, { widths: [320], languages: ["tr", "en", "ru"], scales: [2] });
  await context.close();
  assert.equal(report.cases.length, 6, "All native and rejected-cqw locale cases must execute");
  assert.deepEqual(report.cases.filter(item => item.status !== "PASS"), [], "Both prices must stay inside every enlarged poster");
  report.finalSourceHashes = hashes();
  assert.deepEqual(report.finalSourceHashes, report.sourceHashes, "Source and emitted bundle bytes must remain unchanged throughout the proof");
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL"; report.error = error.stack; process.exitCode = 1;
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(accept => server.close(accept));
  rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); save();
  console.log(`${report.status} ${browserName}: ${report.cases.filter(item => item.status === "PASS").length}/6 pairing-price cases; ${join(output, "report.json")}`);
}
