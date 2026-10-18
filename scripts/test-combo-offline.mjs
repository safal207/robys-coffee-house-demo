import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:https";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { chromium } from "playwright";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
process.chdir(repo);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const revision = bytes => digest(bytes).slice(0, 12);
const photoIds = ["student", "cycle", "rain", "tea", "refresh", "together", "family", "local", "go", "morning", "sweet", "hearty"];
const photoFiles = photoIds.map(id => `src/products/occasion-sets-v1/${id}.webp`);
const surfaces = ["index.html", "menu.html", "discover.html", "experience/index.html", "smart-choice/index.html", "ru/coffee-gazipasa.html"];
const versionedFiles = ["menu-app.js", "menu-combos-ui.js", "menu-combos.css", "combo-entry.css", "choice-help.js", "choice-help.css", "discover-copy.js", "menu-catalog.js", "order-storage.js", "menu-runtime.css"];
const namespaceFiles = ["menu-combos-ui.js", "menu-combos.css", "combo-entry.css", "choice-help.js", "choice-help.css", "discover-copy.js", ...surfaces, ...photoFiles];
const trackedFiles = [...new Set(["sw.js", "sw-core-v64.js", "src/menu-app.js", "src/menu-combos-ui.js", "src/menu-combos.js", "src/choice-help.js", ...versionedFiles, ...surfaces, ...photoFiles])];
const output = resolve(process.env.ROBYS_COMBO_OFFLINE_QA_DIR ?? ".artifacts/combo-offline");
mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), mode: "Unmodified emitted files and production CSP; actual Chromium service worker; server closes all connections during offline phase", cases: [] };
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const readInputs = () => ({ files: Object.fromEntries(trackedFiles.map(file => [file, readFileSync(file)])) });
const input = readInputs();
report.assetHashesStart = Object.fromEntries(Object.entries(input.files).map(([file, bytes]) => [file, digest(bytes)]));

function verifyBuiltContract({ files }) {
  for (const [source, runtime] of [["src/menu-app.js", "menu-app.js"], ["src/menu-combos-ui.js", "menu-combos-ui.js"], ["src/choice-help.js", "choice-help.js"]]) {
    assert.equal(files[runtime].toString(), compileMenuRuntime(files[source].toString()), `${runtime}: emitted bytes must match current source and dependencies`);
  }
  const worker = files["sw-core-v64.js"].toString();
  const precache = worker.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  assert.ok(precache, "Actual worker must declare CORE_ASSETS");
  const namespace = revision(namespaceFiles.map(file => revision(files[file])).join(":"));
  assert.ok(worker.includes(`-occasion-combos-${namespace}-`), "Combo cache namespace must bind the emitted UI/helper, CSS, every entry page and all twelve photo bytes");
  for (const file of versionedFiles) {
    const urls = [...precache.matchAll(new RegExp(`["'](\\./${file.replaceAll(".", "\\.")}(?:\\?[^"']*)?)["']`, "g"))].map(match => match[1]);
    assert.deepEqual(urls, [`./${file}?v=${revision(files[file])}`], `${file}: precache must contain only the exact current revision URL`);
  }
  for (const file of photoFiles) assert.ok(precache.includes(`"./${file}"`), `${file}: missing combo photo in precache`);
  const comboImport = `import("./menu-combos-ui.js?v=${revision(files["menu-combos-ui.js"])}")`;
  for (const file of ["src/menu-app.js", "menu-app.js"]) assert.ok(files[file].toString().includes(comboImport), `${file}: combo loader must use the current exact revision`);
  for (const file of surfaces) {
    const prefix = file.includes("/") ? "../" : "";
    assert.ok(files[file].toString().includes(`src="${prefix}choice-help.js?v=${revision(files["choice-help.js"])}"`), `${file}: helper must use its current exact revision`);
  }
  return { namespace, cacheName: worker.match(/const CACHE_VERSION = "([^"]+)";/)?.[1], worker };
}

function workerCache(worker, entries) {
  const scope = "https://example.test/robys-coffee-house-demo/";
  const context = { URL, Request, Response,
    caches: { async open() { return { async match(request, options) {
      const url = typeof request === "string" ? new URL(request, scope).href : request.url;
      if (!options?.ignoreSearch) return entries.get(url);
      return [...entries].find(([key]) => new URL(key).pathname === new URL(url).pathname)?.[1];
    } }; } },
    self: { registration: { scope }, location: { origin: new URL(scope).origin }, addEventListener() {} },
    async fetch() { throw new Error("Network is unavailable in the worker-cache proof"); }
  };
  // Execute the actual shipped implementation, including its exact-query branch.
  runInNewContext(worker, context);
  return { context, scope };
}

async function verifyExactCacheIdentity(worker, file) {
  const scope = "https://example.test/robys-coffee-house-demo/";
  const fresh = new URL(`./${file}?v=${revision(input.files[file])}`, scope).href;
  const stale = new URL(`./${file}?v=previous-content-revision`, scope).href;
  const { context } = workerCache(worker, new Map([[fresh, `current:${file}`]]));
  assert.equal(await context.cachedResponse(new Request(fresh)), `current:${file}`, `${file}: current exact URL must hit the cache`);
  assert.equal(await context.cachedResponse(new Request(stale)), undefined, `${file}: a stale query must miss rather than return current or unrelated bytes`);
}

async function runStatic() {
  const verified = verifyBuiltContract(input);
  for (const file of versionedFiles) {
    await verifyExactCacheIdentity(verified.worker, file);
    const rule = new RegExp(`url\\.pathname\\.endsWith\\("/${file.replaceAll(".", "\\.")}"\\)\\s*\\|\\|`);
    assert.match(verified.worker, rule, `${file}: negative control must remove the actual exact-query rule`);
    await assert.rejects(verifyExactCacheIdentity(verified.worker.replace(rule, ""), file), /a stale query must miss/,
      `${file}: removing the real cache rule must reproduce unsafe query reuse`);
  }
  const scope = "https://example.test/robys-coffee-house-demo/";
  const cache = workerCache(verified.worker, new Map(photoFiles.map(file => [new URL(`./${file}`, scope).href, file])));
  for (const file of photoFiles) assert.equal(await cache.context.cachedResponse(new Request(new URL(`./${file}`, scope))), file);
  const missingPhotoWorker = verified.worker.replace(`"./${photoFiles[0]}",`, "");
  assert.notEqual(missingPhotoWorker, verified.worker, "Missing-photo control must change the actual precache");
  assert.throws(() => verifyBuiltContract({ files: { ...input.files, "sw-core-v64.js": Buffer.from(missingPhotoWorker) } }), /missing combo photo in precache/);
  for (const file of [...photoFiles, "menu-combos.css", "choice-help.css", "index.html"]) {
    assert.throws(() => verifyBuiltContract({ files: { ...input.files, [file]: Buffer.concat([input.files[file], Buffer.from("\n")]) } }), /namespace must bind/,
      `${file}: byte drift must invalidate the cache namespace`);
  }
  report.cases.push({ id: "built-byte-and-actual-worker-contract", status: "PASS", namespace: verified.namespace,
    exactRevisionFiles: versionedFiles.length, photos: photoFiles.length, negativeControls: versionedFiles.length + 1 + photoFiles.length + 3 });
  console.log("PASS combo emitted-byte parity, exact-revision cache identity, twelve precached photos and namespace drift controls");
  return verified;
}

async function runBrowser({ cacheName }) {
  assert.ok(cacheName, "Worker cache namespace must be readable");
  const certificate = mkdtempSync(join(tmpdir(), "robys-combo-offline-"));
  execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"), "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
  let offline = false;
  const blockedRequests = [];
  const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4" };
  const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
    // Playwright context.setOffline does not reliably block fetches initiated
    // by a service worker. Closing the actual server connection blocks both.
    if (offline) { blockedRequests.push(request.url); request.socket.destroy(); return; }
    try {
      let file = resolve(repo, "." + decodeURIComponent(new URL(request.url, "https://127.0.0.1").pathname));
      if (file !== repo && !file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(400).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `https://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  report.browser = { name: "Chromium", version: browser.version(), localHttps: true, bypassCSP: false, navigatorOfflineEmulation: false };
  const expectedAssets = [...photoFiles, ...versionedFiles].map(file => ({ file, url: `${origin}/${file}${versionedFiles.includes(file) ? `?v=${revision(input.files[file])}` : ""}`, sha256: digest(input.files[file]) }));
  async function auditCache(page) {
    return page.evaluate(async ({ cacheName, expectedAssets }) => {
      const names = await caches.keys();
      if (!names.includes(cacheName)) return { missing: [`cache:${cacheName}`], mismatched: [] };
      const cache = await caches.open(cacheName);
      const missing = [], mismatched = [];
      for (const entry of expectedAssets) {
        const response = await cache.match(entry.url);
        if (!response?.ok) { missing.push(entry.file); continue; }
        const bytes = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
        if (hash !== entry.sha256) mismatched.push(entry.file);
      }
      return { missing, mismatched };
    }, { cacheName, expectedAssets });
  }
  try {
    for (const language of ["tr", "en", "ru"]) {
      offline = false;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "allow", ignoreHTTPSErrors: true });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.addInitScript(language => localStorage.setItem("robys-language", language), language);
      try {
        await page.goto(`${origin}/menu.html?entry=off`, { waitUntil: "domcontentloaded" });
        await page.locator('#menu-root[data-ready="true"]').waitFor();
        await page.waitForFunction(() => document.documentElement.dataset.offlineReady === "true" && Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 45000 });
        assert.equal(await page.locator(".menu-combos-card").count(), 0, "Combo panel must not have been revealed online");
        assert.deepEqual(await auditCache(page), { missing: [], mismatched: [] }, "All current photos and exact revision modules must already be in CacheStorage before first reveal");
        const blockedStart = blockedRequests.length;
        offline = true;
        await page.goto(`${origin}/menu.html?entry=off&offline-probe=${language}#menu-combos`, { waitUntil: "domcontentloaded" });
        await page.locator(".menu-combos-card").first().waitFor();
        assert.equal(await page.locator(".menu-combos-card").count(), 12);
        assert.equal(await page.locator("html").getAttribute("lang"), language);
        const title = { tr: "Menüden seçmeler", en: "Menu selections", ru: "Подборки из меню" }[language];
        assert.equal(await page.locator("#menu-combos-title").innerText(), title);
        for (const id of photoIds) {
          const image = page.locator(`[data-combo-recipe="${id}"] .menu-combos-photo > img`);
          assert.equal(await image.count(), 1, `${id}: hero photo must remain intact rather than showing item-image fallback`);
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(image => image.decode());
          assert.deepEqual(await image.evaluate(image => [image.naturalWidth, image.naturalHeight, new URL(image.currentSrc).pathname]), [640, 640, `/${photoFiles[photoIds.indexOf(id)]}`]);
        }
        await page.locator(".choice-help-entry").scrollIntoViewIfNeeded();
        await page.locator(".choice-help-entry").click();
        await page.locator(".choice-help-panel").waitFor({ state: "visible" });
        assert.equal(await page.locator('.choice-help-panel a[href$="menu.html#menu-combos"]').count(), 1);
        assert.equal(await page.locator('.choice-help-panel a[href$="smart-choice/"]').count(), 1);
        assert.deepEqual(await auditCache(page), { missing: [], mismatched: [] });
        let missingPhotoNegativeControl = false;
        if (language === "tr") {
          const url = `${origin}/${photoFiles[0]}`;
          assert.equal(await page.evaluate(async ({ cacheName, url }) => {
            const cache = await caches.open(cacheName);
            window.__robysOfflineSavedPhoto = await cache.match(url);
            return cache.delete(url);
          }, { cacheName, url }), true);
          const missing = await auditCache(page);
          assert.deepEqual(missing.missing, [photoFiles[0]], "Missing-photo negative control must be detected by independent CacheStorage audit");
          const decodeFailed = await page.evaluate(async url => {
            const image = new Image();
            image.src = url + "?offline-negative-control=1";
            try { await image.decode(); return false; } catch { return true; }
          }, url);
          assert.equal(decodeFailed, true, "A removed cached photo must fail to decode while the fixture blocks worker network fetches");
          await page.evaluate(async ({ cacheName, url }) => {
            const cache = await caches.open(cacheName);
            await cache.put(url, window.__robysOfflineSavedPhoto);
            delete window.__robysOfflineSavedPhoto;
          }, { cacheName, url });
          assert.deepEqual(await auditCache(page), { missing: [], mismatched: [] });
          missingPhotoNegativeControl = true;
        }
        assert.ok(blockedRequests.slice(blockedStart).some(url => url.startsWith("/menu.html")), "The offline navigation must actually reach the connection-closing server fixture");
        assert.deepEqual(errors, [], "No uncaught errors in first offline combo reveal");
        report.cases.push({ id: `first-offline-combo-reveal-${language}`, status: "PASS", photosDecoded: 12,
          cachedByteHashesVerified: expectedAssets.length, helperUsable: true, missingPhotoNegativeControl, blockedRequests: blockedRequests.slice(blockedStart) });
        console.log(`PASS first offline combo reveal + twelve photos + helper (${language})`);
      } catch (error) {
        await page.screenshot({ path: join(output, `offline-${language}-failure.png`) }).catch(() => {});
        report.cases.push({ id: `first-offline-combo-reveal-${language}`, status: "FAIL", error: error.stack, pageErrors: errors,
          diagnostic: await page.evaluate(() => ({ url: location.href, title: document.title, offlineReady: document.documentElement.dataset.offlineReady, lang: document.documentElement.lang, text: document.body.innerText.slice(-2500) })).catch(() => ({})) });
        throw error;
      } finally { await context.close(); persist(); }
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(certificate, { recursive: true, force: true });
  }
}

try {
  const verified = await runStatic();
  if (!process.argv.includes("--static")) await runBrowser(verified);
  const final = readInputs();
  report.assetHashesEnd = Object.fromEntries(Object.entries(final.files).map(([file, bytes]) => [file, digest(bytes)]));
  report.assetsUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  assert.ok(report.assetsUnchanged, "Emitted/source assets changed during verification; rerun against one stable build");
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.error = error.stack;
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  persist();
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, report: join(output, "report.json") }));
}
