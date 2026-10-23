import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import sharp from "sharp";
import { menuCategories } from "../menu-catalog.js";
import { readVerifiedMenuSource } from "./menu-runtime-source.mjs";
import { MENU_STYLE_INPUTS, MENU_STYLESHEET_FILE, readMenuStylesBundleInputs, verifyMenuStylesBundle } from "./menu-styles-bundle.mjs";
import { captureFailure, startStartupDiagnostics } from "./browser-failure-diagnostics.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repo);
const output = resolve(process.env.ROBYS_LAZY_QA_DIR ?? ".artifacts/menu-lazy-images");
mkdirSync(output, { recursive: true });
const assets = [...new Set(["menu.html", "menu-app.js", "src/menu-app.js", "menu-catalog.js", "menu-order-ui.js", "src/menu-order-ui.js",
  MENU_STYLESHEET_FILE, ...MENU_STYLE_INPUTS.flatMap(({ source, delivered }) => [source, delivered]),
  "scripts/menu-styles-bundle.mjs", "scripts/menu-runtime-source.mjs", "scripts/test-menu-lazy-images-browser.mjs",
  "scripts/browser-failure-diagnostics.mjs", "scripts/run-menu-lazy-images-diagnostics.mjs",
  ".github/workflows/order-reliability.yml", "integrity-manifest.json", "package-lock.json"])];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = { startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirtyFilesAtStart: execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().split("\n").filter(Boolean),
  mode: "Actual emitted menu runtime served unchanged over local HTTPS; native browser IO and request events; not a physical-phone or Lighthouse test",
  environment: { bypassCSP: false, serviceWorkers: "blocked", localSelfSignedCertificate: true,
    firefoxContentSandbox: process.env.MOZ_DISABLE_CONTENT_SANDBOX ?? "default",
    playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "default",
    skipHostRequirementValidation: process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS ?? "default", approachGapCssPixels: 100 },
  assetHashesStart: hashes(), sourceParityVerified: false, bundleParityVerified: false, browsers: {}, cases: [] };
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const languages = ["tr", "en", "ru"];
const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const catalog = new Map(menuCategories.flatMap(category => (category.items ?? category.groups.flatMap(group => group.items)).map(item => {
  const id = `${category.id}:${item.id ?? slug(item.name.en)}`;
  return [id, { ...item, category: category.id, path: `/${item.image ?? `src/products/menu-v1/${category.id}--${slug(item.name.en)}.webp`}` }];
})));
const farId = "cold-coffee:white-chocolate-mocha";
const searchId = "desserts:tiramisu";
const firstColdId = "cold-coffee:iced-filter-coffee";
const firstDessertId = "desserts:san-sebastian-cheesecake";
const defaultProductPath = catalog.get("hot-coffee:espresso").path;
const deliveryPaths = id => {
  const original = catalog.get(id).path;
  const compact = original.replace("/products/", "/products/quick-v1/").replace(/\.webp$/, "-512.webp");
  assert(existsSync(resolve(repo, `.${compact}`)), `Verified full-frame delivery copy must exist: ${compact}`);
  return [original, compact];
};
async function originalAssetPixels(path) {
  const { width, height } = await sharp(resolve(repo, `.${path}`)).metadata();
  assert.equal(width, 1024, "The selected original asset must retain its full-resolution pixels");
  assert.equal(height, 1024, "The selected original asset must retain its complete square frame");
  return { width, height };
}
const imageFor = (page, id) => page.locator(`[data-product-id="${id}"] .full-menu-item-media img`);

// The wrapper delegates geometry and scheduling to the real browser observer.
// Only the stale-entry case briefly holds a real delivered entry, then replays
// it after its target detaches, modeling an already queued callback.
function installIoAudit({ language, mode }) {
  localStorage.setItem("robys-language", language);
  const records = [], lookup = new WeakMap();
  const audit = { records, held: null };
  Object.defineProperty(window, "__menuImageIoAudit", { value: audit });
  if (mode === "unavailable") {
    Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: undefined });
    return;
  }
  if (mode === "constructor-failure") {
    window.IntersectionObserver = class { constructor() { throw new Error("Synthetic unavailable IO constructor"); } };
    return;
  }
  const NativeObserver = window.IntersectionObserver;
  window.IntersectionObserver = class extends NativeObserver {
    constructor(callback, options) {
      const state = { callback, options, observed: [], deliveries: 0, disconnects: 0, takes: 0, hold: false, pending: [] };
      super((entries, observer) => {
        state.deliveries += 1;
        if (state.hold) state.pending.push(...entries);
        else callback(entries, observer);
      }, options);
      state.observer = this;
      records.push(state);
      lookup.set(this, state);
    }
    observe(target) { lookup.get(this).observed.push(target); return super.observe(target); }
    disconnect() { lookup.get(this).disconnects += 1; return super.disconnect(); }
    takeRecords() { lookup.get(this).takes += 1; return super.takeRecords(); }
  };
}

let certificate, server, origin, browser, startupDiagnostics;
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

async function settle(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}
async function loadedPhoto(page, id) {
  const expected = catalog.get(id);
  assert(expected, `Catalog fixture must exist: ${id}`);
  await page.waitForFunction(({ id, paths, original }) => {
    const image = document.querySelector(`[data-product-id="${id}"] .full-menu-item-media img`);
    return image?.complete && image.naturalWidth > 0 && paths.includes(new URL(image.currentSrc || image.src, location.href).pathname)
      && new URL(image.getAttribute('src'), location.href).pathname === original;
  }, { id, paths: deliveryPaths(id), original: expected.path });
  return imageFor(page, id).evaluate(node => ({ path: new URL(node.currentSrc).pathname, width: node.naturalWidth, height: node.naturalHeight,
    top: node.getBoundingClientRect().top, viewportHeight: innerHeight }));
}
async function openMenu(page) {
  startupDiagnostics?.mark("goto-start");
  await page.goto(`${origin}/menu.html?entry=off`, { waitUntil: "networkidle" });
  startupDiagnostics?.mark("goto-networkidle");
  await page.locator('#menu-root[data-ready="true"]').waitFor();
  startupDiagnostics?.mark("root-ready");
  await settle(page);
  startupDiagnostics?.mark("two-raf-complete");
}
async function correctPhoto(page, requests, id, language) {
  await imageFor(page, id).scrollIntoViewIfNeeded();
  const photo = await loadedPhoto(page, id);
  assert.equal(await page.locator(`[data-product-id="${id}"] .full-menu-item-copy > strong`).innerText(), catalog.get(id).name[language]);
  assert(requests.some(row => row.path === photo.path), `${id}: browser must request the selected verified catalog photograph`);
  assert.equal(photo.width, photo.height, "Responsive delivery must preserve the complete square frame");
  return photo;
}

// Observation only: retain bounded evidence before existing failure cleanup.
function observeFailureLifecycle(context, browser) {
  const events = [], failedRequests = [], pageIds = new WeakMap();
  let nextPageId = 0;
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
    page.on("requestfailed", request => {
      const failure = { pageId, url: request.url().slice(0, 1000), resourceType: request.resourceType(),
        error: request.failure()?.errorText };
      retain(failedRequests, failure, 20);
      record("request-failed", failure);
    });
  };
  context.pages().forEach(observe);
  context.on("page", observe);
  context.on("close", () => record("context-close"));
  return () => ({ observedAt: new Date().toISOString(), browserConnected: browser.isConnected(),
    pages: context.pages().map(page => ({ pageId: pageIds.get(page), url: page.url().slice(0, 1000), closed: page.isClosed() })),
    events: events.slice(), lastFailedRequests: failedRequests.slice() });
}

async function run(browserName, id, callback, { language = "ru", mode = "native", scale = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
    deviceScaleFactor: scale, ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "reduce" });
  await context.addInitScript(installIoAudit, { language, mode });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  const page = await context.newPage();
  const failureLifecycle = observeFailureLifecycle(context, browser);
  page.setDefaultTimeout(15000);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/src/products/")) requests.push({ path: url.pathname, resourceType: request.resourceType() });
  });
  const startedAt = new Date().toISOString();
  try {
    await openMenu(page);
    if (mode === "unavailable") assert.equal(await page.evaluate(() => typeof IntersectionObserver), "undefined", "Fallback fixture must really remove the observer constructor");
    const facts = await callback(page, requests);
    assert.deepEqual(errors, [], "Image loading and redraw must not throw runtime errors");
    report.cases.push({ browser: browserName, id, language, mode, status: "PASS", startedAt, finishedAt: new Date().toISOString(), facts, requests });
    console.log(`PASS ${browserName}/${id}`);
  } catch (error) {
    const lifecycle = failureLifecycle();
    const screenshot = `${browserName}-${id}-failure.png`;
    const failure = { browser: browserName, id, language, mode, status: "FAIL", startedAt, finishedAt: new Date().toISOString(),
      error: error.stack, uncaughtErrors: errors, requests, screenshot, lifecycle, captureErrors: [], screenshotCapture: "PENDING" };
    if (startupDiagnostics) failure.startupDiagnostics = startupDiagnostics.finish("before-failure-capture");
    report.cases.push(failure);
    await captureFailure(failure, persist, () => page.screenshot({ path: join(output, screenshot) }));
    console.error(`FAIL ${browserName}/${id}: ${error.message}`);
  } finally {
    if (startupDiagnostics) { report.startupDiagnostics = startupDiagnostics.finish("first-case-finished"); startupDiagnostics = null; }
    await context.close(); persist();
  }
}

try {
  // Compile only to compare source parity. The server below always delivers the
  // checked-in emitted runtime, never a test-compiled replacement.
  readVerifiedMenuSource();
  report.sourceParityVerified = true;
  report.menuStylesBundle = verifyMenuStylesBundle(readMenuStylesBundleInputs(repo));
  report.bundleParityVerified = true;
  certificate = mkdtempSync(join(tmpdir(), "robys-menu-images-"));
  execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
    "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
  server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
    try {
      const file = resolve(repo, "." + decodeURIComponent(new URL(request.url, "https://127.0.0.1").pathname));
      if (!file.startsWith(repo + sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(400).end(); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  origin = `https://127.0.0.1:${server.address().port}`;
  const selected = (process.env.ROBYS_LAZY_BROWSERS ?? process.env.ROBYS_LAZY_BROWSER ?? "chromium,firefox,webkit").split(",");
  assert(selected.length && selected.every(name => ["chromium", "firefox", "webkit"].includes(name)), "Choose supported browser engines");
  report.expectedCases = selected.length * 12;
  for (const browserName of selected) {
    if (browserName === "webkit" && process.env.ROBYS_BROWSER_STARTUP_DIAGNOSTICS === "1") startupDiagnostics = startStartupDiagnostics(join(output, "diagnostics/canonical"));
    browser = await ({ chromium, firefox, webkit })[browserName].launch({ headless: true });
    report.browsers[browserName] = { version: browser.version() };
    for (const language of languages) await run(browserName, `withheld-and-approach-${language}`, async (page, requests) => {
      const priorityId = "pairing-offers:cool-lime-macaron-pairing";
      const priority = await loadedPhoto(page, priorityId);
      const initial = await page.evaluate(paths => {
        const photos = [...document.querySelectorAll('#menu-root [data-product-id]')].map(row => {
          const image = row.querySelector('.full-menu-item-media img');
          return image ? { id: row.dataset.productId, expected: paths[row.dataset.productId], src: image.getAttribute('src'), srcset: image.getAttribute('srcset'),
            top: image.getBoundingClientRect().top, bottom: image.getBoundingClientRect().bottom } : null;
        }).filter(Boolean);
        const nearPaths = new Set(photos.filter(row => row.top <= innerHeight + 250 && row.bottom >= -250).map(row => row.expected));
        return { viewportHeight: innerHeight, far: photos.filter(row => row.top > innerHeight + 350 && !nearPaths.has(row.expected)),
          closedPlaceholder: document.querySelector('#menu-product-image').getAttribute('src') };
      }, Object.fromEntries([...catalog].map(([id, item]) => [id, item.path])));
      assert(initial.far.length >= 10, "Initial mobile fixture must include a meaningful far catalog sample");
      for (const item of initial.far) {
        assert(!item.src || new URL(item.src, origin).pathname !== item.expected, `${item.id}: far catalog source must stay deferred`);
        assert(!item.srcset, `${item.id}: far responsive sources must stay deferred`);
        assert(!requests.some(row => deliveryPaths(item.id).includes(row.path)), `${item.id}: no delivery size of a far photograph may be requested initially`);
      }
      assert(initial.closedPlaceholder, "The closed product dialog retains its required branded default source");
      const placeholderPath = new URL(initial.closedPlaceholder, origin).pathname;
      assert.equal(placeholderPath, defaultProductPath, "The unrequested default photo assertion must target the real catalog image");
      assert(!requests.some(row => row.path === placeholderPath), "Closed product dialog must not fetch its default photograph before any product intent");
      const far = imageFor(page, farId);
      // A real 100px gap is outside the viewport and inside either proposed
      // 150px or 250px prefetch margin; native geometry remains untouched.
      await far.evaluate(node => scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight - 100, behavior: "instant" }));
      const approached = await loadedPhoto(page, farId);
      assert(approached.top > approached.viewportHeight + 40 && approached.top <= approached.viewportHeight + 250,
        "The exact far photograph must load when approaching the viewport, before becoming visible");
      assert(requests.some(row => row.path === approached.path), "Approach must produce the previously withheld selected photograph request");
      return { priority, initiallyDeferredPhotos: initial.far, closedPlaceholder: placeholderPath, approached };
    }, { language });

    for (const language of languages) await run(browserName, `redraw-${language}`, async (page, requests) => {
      await page.locator('[data-category="cold-coffee"]').click();
      await page.waitForFunction(() => document.querySelectorAll('#menu-root > .full-menu-panel').length === 1 && document.querySelector('#menu-root > .full-menu-panel').id === 'cold-coffee');
      const filtered = await correctPhoto(page, requests, firstColdId, language);
      const oldPhoto = await imageFor(page, firstColdId).elementHandle();
      await page.locator('#menu-search').fill(catalog.get(searchId).name[language]);
      await page.waitForFunction(id => document.querySelectorAll('#menu-root [data-product-id]').length === 1 && document.querySelector('#menu-root [data-product-id]').dataset.productId === id, searchId);
      assert.equal(await oldPhoto.evaluate(node => node.isConnected), false, "Search redraw must detach the previous photo generation");
      const searched = await correctPhoto(page, requests, searchId, language);
      const nextLanguage = languages[(languages.indexOf(language) + 1) % languages.length];
      await page.locator(`.lang-button[data-lang="${nextLanguage}"]`).click();
      await page.waitForFunction(lang => document.documentElement.lang === lang, nextLanguage);
      const translated = await correctPhoto(page, requests, searchId, nextLanguage);
      await page.locator('#menu-search').fill('');
      await page.locator('[data-category="desserts"]').click();
      const restored = await correctPhoto(page, requests, firstDessertId, nextLanguage);
      return { filtered, searched, translated, restored, nextLanguage };
    }, { language });

    await run(browserName, "detached-queued-entry", async (page, requests) => {
      const far = imageFor(page, farId);
      await far.evaluate(node => {
        const audit = window.__menuImageIoAudit;
        const record = audit.records.find(row => row.observed.includes(node));
        if (!record) throw new Error('Far photo must be registered with the real browser observer');
        record.hold = true;
        audit.held = { record, target: node, beforeSearch: { disconnects: record.disconnects, takes: record.takes } };
        scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight - 100, behavior: 'instant' });
      });
      await page.waitForFunction(() => { const held = window.__menuImageIoAudit.held; return held.record.pending.some(entry => entry.target === held.target && entry.isIntersecting); });
      assert(!requests.some(row => deliveryPaths(farId).includes(row.path)), "Holding the native entry must defer every delivery size of the photograph");
      await page.locator('#menu-search').fill(catalog.get(searchId).name.ru);
      await imageFor(page, searchId).waitFor();
      const replay = await page.evaluate(() => {
        const { record, target, beforeSearch } = window.__menuImageIoAudit.held;
        const entries = record.pending.filter(entry => entry.target === target && entry.isIntersecting);
        const before = { connected: target.isConnected, src: target.getAttribute('src'), queuedEntries: entries.length,
          disconnectsDuringRedraw: record.disconnects - beforeSearch.disconnects,
          takeRecordsDuringRedraw: record.takes - beforeSearch.takes };
        record.callback(entries, record.observer);
        return { ...before, srcAfterReplay: target.getAttribute('src') };
      });
      assert.equal(replay.connected, false, "Replay must target a genuinely detached image");
      assert(replay.queuedEntries > 0 && replay.disconnectsDuringRedraw > 0 && replay.takeRecordsDuringRedraw > 0,
        "Redraw must drain and disconnect the old observer generation before a queued entry is replayed");
      assert.equal(replay.srcAfterReplay, replay.src, "A stale callback must not assign a detached image source");
      await settle(page);
      await page.waitForLoadState('networkidle');
      assert(!requests.some(row => deliveryPaths(farId).includes(row.path)), "Detached queued entries must not fetch either delivery size of stale photographs");
      // Production may reuse the same observer after disconnect. Release only
      // connected new-generation entries so the audit itself cannot starve them.
      const releasedConnectedEntries = await page.evaluate(() => {
        const { record } = window.__menuImageIoAudit.held;
        record.hold = false;
        const connected = record.pending.filter(entry => entry.target.isConnected);
        record.pending = [];
        if (connected.length) record.callback(connected, record.observer);
        return connected.length;
      });
      await correctPhoto(page, requests, searchId, 'ru');
      return { replay, releasedConnectedEntries, stalePath: catalog.get(farId).path };
    });

    for (const mode of ["unavailable", "constructor-failure"]) await run(browserName, `native-fallback-${mode}`, async (page, requests) => {
      const source = await imageFor(page, farId).getAttribute('src');
      assert.equal(new URL(source, origin).pathname, catalog.get(farId).path, "Fallback must expose the actual catalog source to native image loading");
      assert.equal(await imageFor(page, farId).getAttribute('loading'), 'lazy', "Fallback retains the native lazy-loading hint");
      const photo = await correctPhoto(page, requests, farId, 'ru');
      return { source, photo };
    }, { mode });

    await run(browserName, "responsive-copy-original-fallback", async (page, requests) => {
      const [original, compact] = deliveryPaths(farId);
      let aborted = 0;
      await page.route(`**${compact}`, route => { aborted++; return route.abort("failed"); });
      await imageFor(page, farId).scrollIntoViewIfNeeded();
      await page.waitForFunction(({ id, original }) => {
        const image = document.querySelector(`[data-product-id="${id}"] .full-menu-item-media img`);
        return image?.complete && image.naturalWidth > 0 && !image.hasAttribute('srcset')
          && new URL(image.currentSrc, location.href).pathname === original;
      }, { id: farId, original });
      const recovered = await loadedPhoto(page, farId);
      assert.equal(aborted, 1, "The compact request must actually fail once without a retry loop");
      assert(requests.some(row => row.path === compact), "The negative control must exercise the responsive delivery copy");
      assert(requests.some(row => row.path === original), "Failed responsive delivery must request the original catalog photo");
      assert.equal(recovered.path, original);
      assert.equal(recovered.width, recovered.height, "Fallback decoding must preserve the complete square frame");
      const assetPixels = await originalAssetPixels(recovered.path);
      return { aborted, compact, recovered, assetPixels };
    });

    await run(browserName, "high-density-original", async (page, requests) => {
      const id = "pairing-offers:cool-lime-macaron-pairing", [original] = deliveryPaths(id);
      const photo = await loadedPhoto(page, id);
      assert.equal(await page.evaluate(() => devicePixelRatio), 2, "The fixture must use an actual dense browser viewport");
      assert.equal(photo.path, original);
      // Width descriptors make naturalWidth density-adjusted; the requested
      // asset's metadata is the physical-pixel oracle on a dense display.
      assert.equal(photo.width, photo.height, "Dense-display decoding must preserve the complete square frame");
      assert(requests.some(row => row.path === original), "A dense display must request the sharp original");
      const assetPixels = await originalAssetPixels(photo.path);
      return { photo, devicePixelRatio: 2, assetPixels };
    }, { scale: 2 });

    await run(browserName, "first-product-photo", async (page, requests) => {
      const initial = await page.locator('#menu-product-image').getAttribute('src');
      assert(initial, "The selected lazy-dialog design retains a branded default source");
      const initialPath = new URL(initial, origin).pathname;
      assert.equal(initialPath, defaultProductPath, "The request guard must cover the actual default product photo");
      assert(!requests.some(row => row.path === initialPath), "Closed dialog default photo must remain unrequested");
      await page.locator('#menu-search').fill(catalog.get(searchId).name.ru);
      await imageFor(page, searchId).waitFor();
      await page.locator(`[data-product-id="${searchId}"] .full-menu-item-media`).click();
      await page.locator('#menu-product-dialog[open]').waitFor();
      await page.waitForFunction(path => {
        const image = document.querySelector('#menu-product-image');
        return image.complete && image.naturalWidth > 0 && new URL(image.currentSrc || image.src, location.href).pathname === path;
      }, catalog.get(searchId).path);
      assert.equal(await page.locator('#menu-product-title').innerText(), catalog.get(searchId).name.ru);
      assert(!requests.some(row => row.path === initialPath), "Opening a different product must not fetch the discarded default photo");
      return { initialPath, selectedPath: catalog.get(searchId).path, naturalWidth: await page.locator('#menu-product-image').evaluate(image => image.naturalWidth) };
    });
    await browser.close(); browser = null;
  }
} catch (error) {
  report.fatalError = error.stack;
  console.error(error.stack);
} finally {
  startupDiagnostics?.finish("suite-finally");
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  if (certificate) rmSync(certificate, { recursive: true, force: true });
  report.assetHashesEnd = hashes();
  report.boundBytesUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.finishedAt = new Date().toISOString();
  report.passed = report.cases.filter(row => row.status === "PASS").length;
  report.failed = report.cases.filter(row => row.status === "FAIL").length;
  report.complete = !report.fatalError && report.boundBytesUnchanged && report.sourceParityVerified && report.bundleParityVerified && report.cases.length === report.expectedCases && report.failed === 0;
  persist();
}
console.log(`Built menu lazy images: ${report.passed}/${report.expectedCases ?? 0} PASS; bound bytes unchanged=${report.boundBytesUnchanged}`);
if (!report.complete) process.exitCode = 1;
