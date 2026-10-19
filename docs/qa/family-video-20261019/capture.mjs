import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime } from "../scripts/menu-runtime-source.mjs";

// Focused offer-card regression. Serve emitted production bytes over HTTPS with
// the original HTML CSP; do not compile or call the app's mutation helpers.
const repo = "/workspace/scratch/8a1b493cfb37/robys-combo-offers";
process.chdir(repo);
const emitted = ["menu-app", "menu-combos-ui", "choice-help-entry", "choice-help"];
for (const name of emitted) {
  assert.equal(readFileSync(`${name}.js`, "utf8"), compileMenuRuntime(readFileSync(`src/${name}.js`, "utf8")),
    `Build ${name}.js from the current source before running browser verification`);
}
const output = resolve(process.env.ROBYS_OFFER_QA_DIR ?? ".artifacts/family-video-visual-6a4");
const timeout = Number(process.env.ROBYS_QA_TIMEOUT_MS ?? 10000);
assert.ok(Number.isFinite(timeout) && timeout > 0, "ROBYS_QA_TIMEOUT_MS must be a positive timeout in milliseconds");
mkdirSync(output, { recursive: true });
const certificate = mkdtempSync(join(tmpdir(), "robys-offer-qa-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
  "-keyout", join(certificate, "key.pem"), "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    let file = resolve(repo, "." + decodeURIComponent(new URL(request.url, "https://127.0.0.1").pathname));
    if (file !== repo && !file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    const headers = { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" };
    if ([".mp4", ".webm"].includes(extname(file))) {
      const size = statSync(file).size;
      headers["accept-ranges"] = "bytes";
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = match?.[1] ? Number(match[1]) : 0;
        let end = match?.[2] ? Number(match[2]) : size - 1;
        if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
        if (!match || !match[1] && !match[2] || start >= size || start > end) {
          response.writeHead(416, { ...headers, "content-range": `bytes */${size}` }).end(); return;
        }
        end = Math.min(end, size - 1);
        response.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
        createReadStream(file, { start, end }).pipe(response); return;
      }
      headers["content-length"] = size;
    }
    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
const assets = ["scripts/test-combo-offer-cards-browser.mjs", "sw.js", "menu.html", "menu-runtime.css", "menu-combos.css", "choice-help.css", "src/menu-combos.js",
  "src/products/occasion-sets-v1/family-motion-v1.mp4", "src/products/occasion-sets-v1/family-motion-v1.webm",
  ...emitted.flatMap(name => [`${name}.js`, `src/${name}.js`])];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = { startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  trackedStateStart: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }),
  treeStart: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
  mode: "Actual Chromium playback visual capture: unchanged emitted runtime over local HTTPS, production CSP, blocked external requests",
  viewportNote: "Desktop browser engines at touch-sized viewports; screenshots are not physical-device evidence",
  screenshotEvidence: { policy: "Capture screenshots in exercised Chromium/Firefox cases",
    webkit: { status: "NOT_CAPTURED", reason: "Playwright 1.55.1 unconditionally injects an inline body{} stylesheet for screenshot animation synchronization; functional, geometry and strict CSP assertions remain enabled" } },
  assetHashesStart: hashes(), browsers: {}, cases: [] };
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const money = text => Number(text.replace(/[^\d]/g, ""));
const sort = lines => [...lines].sort((a, b) => a.id.localeCompare(b.id, "en"));
const familyLines = sort([{ id: "hot-coffee:cappuccino", quantity: 2 }, { id: "food:sesame-simit", quantity: 2 },
  { id: "brew-hot:milk", quantity: 2 }, { id: "desserts:cookie", quantity: 2 }]);
const sweetLines = sort([{ id: "hot-coffee:caffe-latte", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }]);
const preview = page => page.locator(".menu-combos-dialog[open]");
const panel = page => page.locator(".choice-help-panel:not([hidden])");
const choose = (page, id) => page.locator(`[data-combo-recipe="${id}"] .menu-combos-choose`);
const mediaPaths = ["/src/products/occasion-sets-v1/family-motion-v1.mp4", "/src/products/occasion-sets-v1/family-motion-v1.webm"];
const mediaToggle = page => preview(page).locator("[data-combo-media-toggle]");
const video = page => preview(page).locator("video[data-combo-video]");
async function screenshot(browser, target, filename) {
  // WebKit's screenshot preparation itself inserts a forbidden inline style.
  // Avoid that tool action while retaining the same strict application checks.
  if (browser.browserType().name() === "webkit") return;
  await target.screenshot({ path: join(output, filename), caret: "initial" });
}

async function run(browser, id, callback, { width = 390, height = 844, language = "ru" } = {}) {
  if (process.env.ROBYS_OFFER_FILTER && !id.includes(process.env.ROBYS_OFFER_FILTER)) return;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800,
    ignoreHTTPSErrors: true, serviceWorkers: "block", reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  await context.addInitScript(({ language, origin }) => {
    if (location.origin === origin) localStorage.setItem("robys-language", language);
    window.__offerCspViolations = [];
    window.__offerMediaErrors = [];
    document.addEventListener("error", event => {
      const media = event.target;
      if (media.tagName === "VIDEO") window.__offerMediaErrors.push({ src: media.currentSrc || media.src,
        code: media.error?.code, message: media.error?.message, readyState: media.readyState, networkState: media.networkState });
    }, true);
    document.addEventListener("securitypolicyviolation", event => window.__offerCspViolations.push({
      directive: event.effectiveDirective, blockedURI: event.blockedURI }));
  }, { language, origin });
  const errors = [];
  context.on("page", page => {
    page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
    page.on("pageerror", error => errors.push(error.message));
  });
  try {
    const facts = await callback(context);
    assert.deepEqual(errors, [], "No uncaught application exceptions");
    for (const page of context.pages()) assert.deepEqual(await page.evaluate(() => window.__offerCspViolations), [], "Production CSP permits all offer-card behavior");
    report.cases.push({ id, status: "PASS", facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    const diagnostics = [];
    for (const [index, page] of context.pages().entries()) {
      await screenshot(browser, page, `${id}-failure-${index}.png`).catch(() => {});
      diagnostics.push(await page.evaluate(() => ({ url: location.href, active: document.activeElement?.outerHTML.slice(0, 250),
        openDialogs: [...document.querySelectorAll("dialog[open]")].map(node => node.className || node.id),
        text: document.body.innerText.slice(-2500), cspViolations: window.__offerCspViolations, mediaErrors: window.__offerMediaErrors })).catch(() => ({})));
    }
    report.cases.push({ id, status: "FAIL", error: error.stack, errors, diagnostics });
    console.error(`FAIL ${id}: ${error.stack}`);
  } finally { await context.close(); persist(); }
}

async function openMenu(page, hash = "") {
  await page.goto(`${origin}/menu.html?entry=off${hash ? `#${hash}` : ""}`, { waitUntil: "domcontentloaded" });
  await page.locator('#menu-root[data-ready="true"]').waitFor();
}
async function clock(page) {
  await page.clock.install({ time: new Date("2026-10-19T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-19T12:01:00Z"));
}
async function advance(page, ms) {
  await page.clock.runFor(ms);
  await page.waitForLoadState("networkidle");
}
async function canonical(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open("robys-order-transactions.v1", 1);
    opening.onupgradeneeded = () => { opening.transaction.abort(); reject(new Error("Order was not created by the UI")); };
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
async function assertOrder(page, expected) {
  await page.waitForFunction(lines => {
    try { return JSON.stringify(JSON.parse(localStorage.getItem("robys-menu-order.v2")).lines) === JSON.stringify(lines); } catch { return false; }
  }, sort(expected));
  const record = await canonical(page);
  assert.deepEqual(record.draft.lines, sort(expected));
  assert.ok(record.revision > 0);
  return record.revision;
}
async function orderSnapshot(page) {
  return page.evaluate(async () => {
    const projection = Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith("robys-menu-order")).sort()
      .map(key => [key, localStorage.getItem(key)]));
    if (!(await indexedDB.databases()).some(database => database.name === "robys-order-transactions.v1")) return { projection, canonical: null };
    const canonical = await new Promise((resolve, reject) => {
      const opening = indexedDB.open("robys-order-transactions.v1");
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        const transaction = database.transaction("shared-order", "readonly");
        const request = transaction.objectStore("shared-order").get("robys-menu-order.v1");
        let record;
        request.onsuccess = () => { record = request.result ?? null; };
        transaction.oncomplete = () => { database.close(); resolve(record); };
        transaction.onabort = () => { database.close(); reject(transaction.error); };
      };
    });
    return { projection, canonical };
  });
}
async function editorSnapshot(page) {
  return { total: money(await preview(page).locator(".menu-combos-total").textContent()),
    lines: sort(await preview(page).locator("[data-combo-quantity]").evaluateAll(nodes => nodes.map(node => ({
      id: node.dataset.comboQuantity, quantity: Number(node.value) })))) };
}
async function startVideo(page) {
  assert.equal(await mediaToggle(page).getAttribute("data-combo-media"), "photo");
  await mediaToggle(page).click();
  await page.waitForFunction(() => document.querySelector(".menu-combos-dialog[open] video[data-combo-video]")
    || document.querySelector(".menu-combos-dialog[open] [data-combo-media-status]:not([hidden])"));
  assert.equal(await video(page).count(), 1, `The local clip is playable: ${JSON.stringify(await page.evaluate(() => window.__offerMediaErrors))}`);
  await video(page).evaluate((media, deadlineMs) => new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Video did not decode and advance: readyState=${media.readyState}, error=${media.error?.code}`)), deadlineMs);
    const check = () => {
      if (media.currentTime > 0.05 && media.readyState >= 2 && !media.paused && media.videoWidth > 0) {
        clearTimeout(deadline); media.removeEventListener("timeupdate", check); resolve();
      }
    };
    const failure = () => {
      if (!media.isConnected || media.error) {
        clearTimeout(deadline); reject(new Error(`Video failed during playback: ${JSON.stringify(window.__offerMediaErrors)}`));
      }
    };
    media.addEventListener("error", failure); media.addEventListener("emptied", failure);
    media.addEventListener("timeupdate", check); check();
  }), timeout);
  const facts = await video(page).evaluate(media => ({ path: new URL(media.currentSrc).pathname, currentTime: media.currentTime,
    readyState: media.readyState, width: media.videoWidth, height: media.videoHeight, muted: media.muted,
    controls: media.controls, playsInline: media.playsInline, autoplayAttribute: media.hasAttribute("autoplay"), preload: media.preload,
    sources: [...media.querySelectorAll("source")].map(source => ({ path: new URL(source.src).pathname, type: source.type })) }));
  assert.ok(mediaPaths.includes(facts.path), "Playback uses a reviewed corresponding local family clip");
  assert.equal(facts.muted, true); assert.equal(facts.controls, true); assert.equal(facts.playsInline, true);
  assert.equal(facts.autoplayAttribute, false); assert.equal(facts.preload, "none");
  assert.deepEqual(facts.sources, mediaPaths.map((path, index) => ({ path, type: index ? "video/webm" : "video/mp4" })),
    "Both format choices are reviewed versions of the same family clip");
  assert.equal(await mediaToggle(page).getAttribute("data-combo-media"), "video");
  return { handle: await video(page).elementHandle(), sources: await video(page).locator("source").elementHandles(), facts };
}
async function assertReleased({ handle, sources }, reason) {
  const state = await handle.evaluate(media => ({ paused: media.paused, src: media.getAttribute("src"), sourceCount: media.querySelectorAll("source[src]").length }));
  assert.deepEqual(state, { paused: true, src: null, sourceCount: 0 }, `${reason} pauses playback and releases its media resource`);
  for (const source of sources) {
    assert.deepEqual(await source.evaluate(node => ({ connected: node.isConnected, src: node.getAttribute("src") })),
      { connected: false, src: null }, `${reason} detaches and clears each media source`);
    await source.dispose();
  }
  await handle.dispose();
}
async function assertFamilyPhoto(page) {
  assert.equal(await video(page).count(), 0);
  assert.equal(await mediaToggle(page).getAttribute("data-combo-media"), "photo");
  assert.equal(await preview(page).locator(".menu-combos-preview-hero > img").evaluate(async image => { await image.decode(); return new URL(image.currentSrc).pathname; }),
    "/src/products/occasion-sets-v1/family.webp");
}
async function geometry(page, selector) {
  return page.locator(selector).evaluate(root => {
    const rect = root.getBoundingClientRect();
    return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      contained: rect.left >= -1 && rect.right <= innerWidth + 1,
      dialogFits: root.tagName !== "DIALOG" || rect.top >= -1 && rect.bottom <= innerHeight + 1,
      clippedControls: [...root.querySelectorAll("button,input,select,a")].filter(node => node.getClientRects().length)
        .filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent?.trim().slice(0, 80)) };
  });
}
async function helperChoice(page, expectedId) {
  await panel(page).waitFor();
  const links = panel(page).locator(".choice-help-actions a:visible");
  assert.equal(await links.count(), 1, "The compact suggestion offers one concrete selection");
  const href = new URL(await links.first().getAttribute("href"), page.url());
  assert.equal(href.pathname, "/menu.html");
  assert.equal(href.hash, `#menu-combo-${expectedId}`);
  assert.equal(await panel(page).getAttribute("data-combo-recipe"), expectedId);
  assert.equal(money(await panel(page).locator(".choice-help-price").textContent()), expectedId === "family" ? 750 : 280);
  assert.ok((await panel(page).locator(".choice-help-audience").textContent()).trim());
  const photo = await panel(page).locator(".choice-help-photo img").evaluate(async image => {
    await image.decode(); return { path: new URL(image.currentSrc).pathname, width: image.naturalWidth };
  });
  assert.equal(photo.path, `/src/products/occasion-sets-v1/${expectedId}.webp`);
  assert.ok(photo.width > 0);
  assert.equal(await preview(page).count(), 0, "The compact suggestion does not automatically open a selection dialog");
  assert.equal(await panel(page).getAttribute("aria-modal"), null);
  return href.pathname + href.hash;
}

try {
  assert.equal(report.head, "6a4dcecbdf3e30759cea794985b41f93d88a2497");
  assert.equal(report.trackedStateStart, "", "Capture starts on the clean reviewed feature head");
  assert.equal(report.treeStart, "28fd4066c95fdf92f2678b7e52bb36e2a9c7fe6c");
  const browser = await chromium.launch({ headless: true });
  report.browsers.chromium = browser.version();
  try {
    for (const [width, height] of [[320, 780], [390, 844], [1440, 1000]]) {
      await run(browser, `chromium-actual-video-${width}x${height}-ru`, async context => {
        const page = await context.newPage();
        await openMenu(page, "menu-combo-family"); await preview(page).waitFor(); await assertFamilyPhoto(page);
        await preview(page).evaluate(dialog => { dialog.scrollTop = 0; });
        const active = await startVideo(page);
        await video(page).focus();
        await preview(page).evaluate(dialog => { dialog.scrollTop = 0; });
        const playerBounds = await video(page).boundingBox();
        await page.mouse.move(playerBounds.x + playerBounds.width / 2, playerBounds.y + playerBounds.height - 16);
        // Native control visibility animates after focus/hover; capture that actual UI state.
        await page.waitForTimeout(250);
        const beforeCapture = await video(page).evaluate(media => ({ currentTime: media.currentTime, paused: media.paused,
          ended: media.ended, readyState: media.readyState, width: media.videoWidth, height: media.videoHeight, path: new URL(media.currentSrc).pathname }));
        const filename = `chromium-family-video-${width}x${height}-ru.png`;
        await screenshot(browser, page, filename);
        const afterCapture = await video(page).evaluate(media => ({ currentTime: media.currentTime, paused: media.paused, ended: media.ended }));
        const layout = await geometry(page, ".menu-combos-dialog[open]");
        assert.deepEqual(layout, { pageOverflow: false, contained: true, dialogFits: true, clippedControls: [] });
        const visual = await preview(page).evaluate(dialog => {
          const bounds = node => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              fullyInViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 };
          };
          const media = dialog.querySelector("video");
          return { viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, dialogScrollTop: dialog.scrollTop,
            dialog: bounds(dialog), header: bounds(dialog.querySelector(".menu-combos-preview-top")),
            title: { text: dialog.querySelector("h2").textContent, ...bounds(dialog.querySelector("h2")) },
            video: { ...bounds(media), objectFit: getComputedStyle(media).objectFit, controls: media.controls },
            returnToPhoto: { text: dialog.querySelector("[data-combo-media-toggle]").textContent,
              ...bounds(dialog.querySelector("[data-combo-media-toggle]")) } };
        });
        assert.equal(visual.dialogScrollTop, 0);
        for (const key of ["header", "title", "video", "returnToPhoto"]) assert.equal(visual[key].fullyInViewport, true, `${key} is visible without dialog scrolling`);
        assert.equal(visual.video.objectFit, "contain", "The complete source frame is contained rather than cropped");
        assert.equal(visual.returnToPhoto.text, "Вернуться к фото");
        const bytes = readFileSync(join(output, filename));
        const screenshotFact = { filename, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
          width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
        assert.equal(screenshotFact.width, width); assert.equal(screenshotFact.height, height);
        await mediaToggle(page).click(); await assertFamilyPhoto(page); await assertReleased(active, "Returning from the captured playback");
        return { language: "ru", screenshot: screenshotFact, playback: active.facts, beforeCapture, afterCapture, layout, visual,
          sourceEmittedParityVerified: true, productionCspViolations: [], captureKind: "Actual native video playback; desktop Chromium at a named viewport, not physical-device evidence" };
      }, { width, height, language: "ru" });
    }
  } finally { await browser.close(); }
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); report.assetHashesEnd = hashes();
  report.headEnd = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  report.trackedStateEnd = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  report.treeEnd = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  report.assetsUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.headAndTrackedStateUnchanged = report.head === report.headEnd && report.treeStart === report.treeEnd && report.trackedStateStart === "" && report.trackedStateEnd === "";
  report.passed = report.cases.filter(test => test.status === "PASS").length;
  report.failed = report.cases.length - report.passed;
  persist();
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, assetsUnchanged: report.assetsUnchanged,
  headAndTrackedStateUnchanged: report.headAndTrackedStateUnchanged, report: join(output, "report.json") }));
if (report.passed !== 3 || report.failed || !report.assetsUnchanged || !report.headAndTrackedStateUnchanged) process.exitCode = 1;
