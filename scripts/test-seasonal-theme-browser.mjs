import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { chromium, webkit } from "playwright";

// Render the shipped files under their original CSP; only the test origin uses
// a temporary local certificate. No production resources or styles are replaced.
const root = resolve(new URL("..", import.meta.url).pathname);
process.chdir(root);
const output = resolve(process.env.ROBYS_SEASONAL_QA_DIR ?? ".artifacts/seasonal-theme");
mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-seasonal-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    let file = resolve(root, "." + decodeURIComponent(new URL(request.url, "https://127.0.0.1").pathname));
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const subjects = ["index.html", "menu.html", "discover.html", "smart-choice/index.html", "experience/index.html", "ru/coffee-gazipasa.html",
  "src/seasonal-theme.ts", "src/bootstrap-v2.js", "bootstrap-v2.js", "seasonal-theme.js", "seasonal.css", "menu-runtime.css", "sw-core-v64.js", "integrity-manifest.json", "scripts/test-seasonal-theme-browser.mjs"];
const hashes = () => Object.fromEntries(subjects.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = { generatedAt: new Date().toISOString(), baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  environment: "Unchanged built files; original CSP; local HTTPS; fresh contexts; external requests blocked; desktop browser engines with touch viewport emulation, not physical devices",
  assetHashesStart: hashes(), browsers: {}, cases: [] };

async function visit(browser, path, { width = 390, height = 844, language = "ru", time = "2026-10-19T12:00:00+03:00", javaScriptEnabled = true, rollover = false, reducedMotion = "reduce" } = {}, callback) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800, reducedMotion, serviceWorkers: "block", ignoreHTTPSErrors: true, javaScriptEnabled });
  const errors = [];
  try {
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
    await context.addInitScript(({ language, origin }) => {
      if (location.origin === origin) localStorage.setItem("robys-language", language);
    }, { language, origin });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    if (javaScriptEnabled) {
      if (rollover) await page.clock.install({ time: new Date(time) });
      else await page.clock.setFixedTime(new Date(time));
    }
    const response = await page.goto(`${origin}/${path}?entry=off`, { waitUntil: "load" });
    assert.equal(response.status(), 200);
    await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
    await callback(page);
    assert.deepEqual(errors, [], "No uncaught application exceptions");
  } finally { await context.close(); }
}

async function run(id, callback) {
  try { await callback(); report.cases.push({ id, passed: true }); }
  catch (error) { report.cases.push({ id, passed: false, error: error.message }); throw error; }
}

async function checkBadge(page, { visible = true, language = "ru" } = {}) {
  const badge = page.locator(".robys-seasonal-mark").first();
  assert.equal(await badge.isVisible(), visible);
  if (!visible) return;
  await page.waitForFunction(language => document.documentElement.lang === language, language);
  const visibleCopies = badge.locator("span[lang]:visible");
  assert.equal(await visibleCopies.count(), 1);
  assert.equal(await visibleCopies.getAttribute("lang"), language);
  const box = await badge.boundingBox();
  const width = page.viewportSize().width;
  assert.ok(box.width > 0 && box.x >= -1 && box.x + box.width <= width + 1, "Badge remains in the viewport");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `No document overflow; actual ${overflow}px`);
  assert.equal(await badge.evaluate(element => getComputedStyle(element).animationName), "none", "Seasonal decoration stays still");
}

try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    report.browsers[name] = browser.version();
    try {
      for (const path of ["index.html", "menu.html"]) {
        for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [1440, 900]]) {
          for (const language of ["tr", "en", "ru"]) {
            await run(`${name}/${path}/${width}x${height}/${language}`, () => visit(browser, path, { width, height, language }, async page => {
              if (path === "menu.html") await page.locator(".full-menu-item").first().waitFor();
              await checkBadge(page, { language });
              if (name === "chromium" && language === "ru" && [390, 1440].includes(width)) {
                await page.screenshot({ path: join(output, `${path.replace(".html", "")}-${name}-${width}-ru.png`), animations: "disabled" });
              }
            }));
          }
        }
        for (const [time, visible] of [
          ["2026-10-14T23:59:59+03:00", false], ["2026-10-15T00:00:00+03:00", true],
          ["2026-10-31T23:59:59+03:00", true], ["2026-11-01T00:00:00+03:00", false], ["2027-10-19T12:00:00+03:00", false]
        ]) await run(`${name}/${path}/date/${time}`, () => visit(browser, path, { time }, page => checkBadge(page, { visible })));

        await run(`${name}/${path}/midnight-sunset-without-reload`, () => visit(browser, path, { time: "2026-10-31T23:59:59+03:00", rollover: true }, async page => {
          await checkBadge(page);
          await page.clock.runFor(1100);
          await checkBadge(page, { visible: false });
          assert.equal(await page.evaluate(() => document.documentElement.dataset.robysSeason), undefined);
        }));
        await run(`${name}/${path}/language-switch`, () => visit(browser, path, {}, async page => {
          for (const language of ["en", "tr", "ru"]) {
            await page.locator(`button[data-lang="${language}"]`).first().click();
            await checkBadge(page, { language });
          }
        }));
        await run(`${name}/${path}/no-javascript-fallback`, () => visit(browser, path, { javaScriptEnabled: false }, async page => {
          assert.equal(await page.locator(".robys-seasonal-mark").isVisible(), false);
          assert.ok(await page.locator("h1").innerText());
        }));
      }
      for (const path of ["discover.html", "smart-choice/index.html", "experience/index.html", "ru/coffee-gazipasa.html"]) {
        for (const language of path.startsWith("ru/") ? ["ru"] : ["tr", "en", "ru"]) {
          await run(`${name}/${path}/390/${language}`, () => visit(browser, path, { language }, page => checkBadge(page, { language })));
        }
      }
      await run(`${name}/normal-motion-still-decoration`, () => visit(browser, "index.html", { reducedMotion: "no-preference" }, page => checkBadge(page)));
      for (const width of [679, 680, 681]) {
        await run(`${name}/menu.html/seasonal-breakpoint/${width}`, () => visit(browser, "menu.html", { width }, page => checkBadge(page)));
      }
    } finally { await browser.close(); }
  }
} finally {
  report.assetHashesEnd = hashes();
  report.hashesUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.passed = report.cases.filter(result => result.passed).length;
  report.failed = report.cases.filter(result => !result.passed).length;
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await new Promise(resolve => server.close(resolve));
  rmSync(certificate, { recursive: true, force: true });
}
assert.ok(report.hashesUnchanged, "Source and emitted assets must not change during capture");
console.log(`Seasonal theme: ${report.passed}/${report.cases.length} passed; source hashes unchanged.`);
