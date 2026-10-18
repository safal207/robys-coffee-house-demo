import assert from "node:assert/strict";
import { createServer } from "node:https";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, createReadStream, rmSync } from "node:fs";
import { resolve, join, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium, devices } from "playwright";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

// Focused source-level browser regression: compile in memory so this can run
// before a coordinated build without changing generated files or cache records.
const repo = process.cwd();
const fixture = mkdtempSync(join(tmpdir(), "robys-share-loader-"));
const runtime = compileMenuRuntime();
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceEvidence = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  runtimeSha256: hash(runtime),
  helperSha256: hash(readFileSync("src/menu-actions-loader.js")),
  menuSourceSha256: hash(readFileSync("src/menu-app.js"))
};
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
  "-keyout", join(fixture, "key.pem"), "-out", join(fixture, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4" };
let origin;
const server = createServer({ key: readFileSync(join(fixture, "key.pem")), cert: readFileSync(join(fixture, "cert.pem")) }, (request, response) => {
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (pathname === "/menu-app.js") { response.writeHead(200, { "content-type": "application/javascript" }).end(runtime); return; }
    let file = resolve(repo, "." + decodeURIComponent(pathname));
    if (file !== repo && !file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
origin = `https://127.0.0.1:${server.address().port}`;
let browser;
const results = [];

async function verify(language, { faults = 0, native = "absent" } = {}) {
  const { defaultBrowserType, ...profile } = devices["Pixel 7"];
  const context = await browser.newContext({ ...profile, ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "no-preference" });
  const requests = [], errors = [];
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (url.pathname === "/menu-interactions.js") {
      const fail = requests.length < faults;
      requests.push({ url: url.href, failed: fail });
      if (fail) return route.abort("failed");
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ origin, language, native }) => {
    if (location.origin === origin) localStorage.setItem("robys-language", language);
    window.__qaShare = { calls: 0, writes: [] };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async value => { window.__qaShare.writes.push(value); }
    } });
    Object.defineProperty(navigator, "share", { configurable: true, value: native === "absent" ? undefined : () => {
      window.__qaShare.calls += 1;
      if (native === "cancel-sync") throw new DOMException("Cancelled", "AbortError");
      if (native === "reject-sync") throw new Error("Native share unavailable");
      if (native === "cancel") return Promise.reject(new DOMException("Cancelled", "AbortError"));
      if (native === "reject") return Promise.reject(new Error("Native share unavailable"));
      return Promise.resolve();
    } });
  }, { origin, language, native });
  try {
    await page.goto(origin + "/menu.html?entry=off", { waitUntil: "load" });
    await page.locator('#menu-root[data-ready="true"]').waitFor();
    if (language !== "tr") await page.waitForTimeout(150); // Let the optional localized-copy prefetch settle.
    const status = page.locator("#menu-share-status"), button = page.locator("#menu-share-button");
    assert.equal(await status.getAttribute("role"), "status");
    assert.equal(await status.getAttribute("aria-live"), "polite");
    const before = requests.length;
    await button.tap();
    let first;
    if (faults && native === "absent") {
      const expected = { tr: "Paylaşım açılamadı", en: "Sharing could not load", ru: "Не удалось открыть отправку меню" }[language];
      await page.waitForFunction(text => document.querySelector("#menu-share-status").textContent.includes(text), expected);
      first = { status: await status.textContent(), requests: requests.length, ...await page.evaluate(() => window.__qaShare) };
      assert.equal(first.writes.length, 0);
      await button.tap();
      await page.waitForFunction(() => window.__qaShare.writes.length === 1);
      assert.equal(requests.length, before + 2, "The next explicit tap must request and load a fresh URL");
      assert.notEqual(requests.at(-1).url, requests.at(-2).url, "Retry must bypass the browser's failed-module URL cache");
    } else if (native.startsWith("cancel")) {
      await page.waitForFunction(() => window.__qaShare.calls === 1);
      await page.waitForTimeout(100);
      assert.equal(requests.length, 0, "User cancellation must not load fallback or completion code");
      assert.equal(await status.textContent(), "");
    } else if (native === "success") {
      await page.waitForFunction(() => document.querySelector("#menu-share-status").textContent.includes("Paylaşım menüsü açıldı"));
      await page.waitForTimeout(100);
      assert.equal((await page.evaluate(() => window.__qaShare)).writes.length, 0, "Native success must not invoke link-copy fallback");
    } else {
      await page.waitForFunction(() => window.__qaShare.writes.length === 1);
      if (native === "absent") {
        await button.tap();
        await page.waitForFunction(() => window.__qaShare.writes.length === 2);
        assert.equal(requests.length, Math.max(before, 1), "Healthy actions reuse one module request");
      }
    }
    const after = await page.evaluate(() => window.__qaShare);
    if (native !== "absent") assert.equal(after.calls, 1, "Each tap invokes the native API once, including rejection fallback");
    assert.deepEqual(errors, [], "Optional module failures must not produce unhandled page errors");
    results.push({ language, faults, native, first, requests, after, status: await status.textContent(), pageErrors: errors });
  } finally { await context.close(); }
}

try {
  browser = await chromium.launch({ headless: true });
  for (const language of ["tr", "en", "ru"]) {
    await verify(language, { faults: language === "tr" ? 1 : 2 });
    await verify(language);
  }
  await verify("tr", { native: "cancel" });
  await verify("tr", { native: "cancel-sync" });
  await verify("tr", { native: "reject" });
  await verify("tr", { native: "reject-sync" });
  await verify("tr", { native: "success", faults: 1 });
  if (process.env.ROBYS_SHARE_REPORT) writeFileSync(process.env.ROBYS_SHARE_REPORT,
    JSON.stringify({ browser: browser.version(), sourceEvidence, fixture: "HTTPS; source runtime compiled in memory; original CSP", cases: results }, null, 2) + "\n");
  console.log(`Menu share browser regression: PASS (${results.length} cases; TR/EN/RU retry/recovery and healthy controls; native cancel/reject/success; zero unhandled errors)`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(fixture, { recursive: true, force: true });
}
