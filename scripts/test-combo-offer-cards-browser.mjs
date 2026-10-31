import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

// Focused offer-card regression. Serve emitted production bytes over HTTPS with
// the original HTML CSP; do not compile or call the app's mutation helpers.
const repo = resolve(new URL("..", import.meta.url).pathname);
process.chdir(repo);
const emitted = ["menu-app", "menu-combos-ui", "choice-help-entry", "choice-help"];
for (const name of emitted) {
  assert.equal(readFileSync(`${name}.js`, "utf8"), compileMenuRuntime(readFileSync(`src/${name}.js`, "utf8")),
    `Build ${name}.js from the current source before running browser verification`);
}
const output = resolve(process.env.ROBYS_OFFER_QA_DIR ?? ".artifacts/combo-offer-cards");
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
const assets = ["menu.html", "menu-runtime.css", "menu-combos.css", "choice-help.css", "src/menu-combos.js",
  "src/products/occasion-sets-v1/family-motion-v1.mp4", "src/products/occasion-sets-v1/family-motion-v1.webm",
  ...emitted.flatMap(name => [`${name}.js`, `src/${name}.js`])];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = { startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  mode: "Unchanged emitted runtime over local HTTPS, production CSP, blocked external requests, read-only canonical basket verification",
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
  // Replacing the video creates a fresh image. Firefox may reject decode()
  // before that image request has completed; a missing image must still fail.
  await page.waitForFunction(() => {
    const image = document.querySelector('.menu-combos-dialog[open] .menu-combos-preview-hero > img');
    return image?.complete && image.naturalWidth > 0;
  });
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
  for (const name of (process.env.ROBYS_OFFER_BROWSERS ?? "chromium").split(",")) {
    assert.ok(["chromium", "firefox", "webkit"].includes(name));
    const browser = await ({ chromium, firefox, webkit })[name].launch({ headless: true });
    report.browsers[name] = browser.version();
    try {
      for (const [width, height, language] of [[320, 700, "ru"], [390, 844, "tr"], [1440, 1000, "en"]]) {
        await run(browser, `${name}-offer-layout-${width}-${language}`, async context => {
          const page = await context.newPage(); await openMenu(page, "menu-combos");
          const card = page.locator('[data-combo-recipe="family"]');
          await card.waitFor();
          assert.equal(await page.locator("html").getAttribute("lang"), language);
          assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
          assert.equal(money(await card.locator(".menu-combos-price strong").textContent()), 750);
          assert.equal(money(await page.locator('[data-combo-recipe="sweet"] .menu-combos-price strong').textContent()), 280);
          await choose(page, "family").click(); await preview(page).waitFor();
          assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 750);
          const photo = await preview(page).locator(".menu-combos-preview-hero > img").evaluate(async image => {
            await image.decode(); return { path: new URL(image.currentSrc).pathname, width: image.naturalWidth, height: image.naturalHeight };
          });
          assert.equal(photo.path, "/src/products/occasion-sets-v1/family.webp");
          assert.ok(photo.width > 0 && photo.height > 0, "The preview contains a decoded local selection photo");
          assert.ok((await preview(page).locator(".menu-combos-preview-audience").textContent()).trim().length > 10,
            "The offer names its audience and serving count");
          assert.equal(await card.locator(".menu-combos-contents > li").count(), 4, "The card exposes all four selected product lines");
          assert.deepEqual(await preview(page).locator("[data-combo-quantity]").evaluateAll(nodes => nodes.map(node => ({
            id: node.dataset.comboQuantity, quantity: Number(node.value) })).sort((a, b) => a.id.localeCompare(b.id, "en"))), familyLines);
          assert.equal(await preview(page).locator("video, [data-combo-video], .menu-combos-video").count(), 0,
            "The family offer remains a photo until an explicit video action");
          assert.equal(await mediaToggle(page).count(), 1, "The family offer exposes its reviewed local video action");
          assert.equal(await mediaToggle(page).getAttribute("data-combo-media"), "photo");
          const layout = await geometry(page, ".menu-combos-dialog[open]");
          assert.deepEqual(layout, { pageOverflow: false, contained: true, dialogFits: true, clippedControls: [] });
          await screenshot(browser, preview(page), `family-dialog-${width}-${language}.png`);
          await preview(page).locator(".menu-combos-close").focus(); await page.keyboard.press("Shift+Tab");
          assert.equal(await preview(page).locator(".menu-combos-add").evaluate(button => document.activeElement === button), true);
          await page.keyboard.press("Tab");
          assert.equal(await preview(page).locator(".menu-combos-close").evaluate(button => document.activeElement === button), true);
          await page.keyboard.press("Escape");
          assert.equal(await choose(page, "family").evaluate(button => document.activeElement === button), true);
          await screenshot(browser, card, `family-card-${width}-${language}.png`);
          return { viewport: { width, height }, language, familyTotal: 750, sweetTotal: 280, photo, layout, escapeRestoresFocus: true };
        }, { width, height, language });
      }

      await run(browser, `${name}-family-video-explicit-playback-and-close`, async context => {
        const requests = [];
        context.on("request", request => { if (/\.(?:mp4|webm)$/.test(new URL(request.url()).pathname)) requests.push(request.url()); });
        const page = await context.newPage(); await openMenu(page, "menu-combo-family"); await preview(page).waitFor();
        await page.waitForLoadState("networkidle");
        assert.deepEqual(requests, [], "Opening the family photo does not preload video bytes");
        await assertFamilyPhoto(page);
        await preview(page).locator('[data-combo-increase="desserts:cookie"]').click();
        const editor = await editorSnapshot(page), order = await orderSnapshot(page);
        assert.equal(editor.total, 850, "The video is tested against an edited selection");
        const first = await startVideo(page);
        assert.ok(requests.length > 0, "The explicit video action requests the local clip");
        assert.ok(requests.every(url => mediaPaths.includes(new URL(url).pathname)), "The offer requests only its corresponding family clip");
        assert.deepEqual(await editorSnapshot(page), editor, "Playback preserves edited quantities and total");
        assert.deepEqual(await orderSnapshot(page), order, "Playback does not mutate either order store");
        await video(page).focus();
        for (let step = 0; step < 4; step += 1) {
          await page.keyboard.press("Tab");
          assert.equal(await preview(page).evaluate(dialog => dialog.contains(document.activeElement)), true,
            "Keyboard traversal from native video controls keeps focus in the offer dialog");
        }
        await screenshot(browser, preview(page), `${name}-family-video-playback-390-ru.png`);
        await mediaToggle(page).click(); await assertFamilyPhoto(page); await assertReleased(first, "Returning to the photo");
        const second = await startVideo(page);
        await page.keyboard.press("Escape");
        assert.equal(await preview(page).count(), 0); await assertReleased(second, "Closing the offer");
        assert.equal(await choose(page, "family").evaluate(button => document.activeElement === button), true);
        const countAtClose = requests.length;
        await choose(page, "family").click(); await preview(page).waitFor(); await assertFamilyPhoto(page);
        await page.waitForLoadState("networkidle");
        assert.equal(requests.length, countAtClose, "Reopening starts with a photo and makes no media request");
        assert.deepEqual(await orderSnapshot(page), order);
        return { zeroMediaRequestsBeforeIntent: true, playback: first.facts, secondPlayback: second.facts,
          photoAndCloseReleaseSource: true, nativeControlKeyboardFocusContained: true, editorPreserved: editor, orderUnchanged: true, escapeRestoresFocus: true };
      });

      await run(browser, `${name}-family-video-language-and-hidden-cleanup`, async context => {
        const page = await context.newPage(); await openMenu(page, "menu-combo-sweet"); await preview(page).waitFor();
        await preview(page).locator(".menu-combos-add").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        await assertOrder(page, sweetLines); await page.keyboard.press("Escape");
        await choose(page, "family").click(); await preview(page).waitFor();
        await preview(page).locator('[data-combo-increase="desserts:cookie"]').click();
        const editor = await editorSnapshot(page), order = await orderSnapshot(page);
        const languageVideo = await startVideo(page);
        // Native modal dialogs block pointer access to page-level language buttons.
        // Invoke that existing control's click handler to exercise translation while open.
        await page.locator('.lang-button[data-lang="en"]').evaluate(button => button.click());
        assert.equal(await page.locator("html").getAttribute("lang"), "en");
        await assertFamilyPhoto(page); await assertReleased(languageVideo, "Changing the language");
        assert.deepEqual(await editorSnapshot(page), editor);
        const hiddenVideo = await startVideo(page);
        // Deterministic browser visibility boundary; does not pretend to be a physical-device background test.
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await assertFamilyPhoto(page); await assertReleased(hiddenVideo, "Hiding the page");
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await assertFamilyPhoto(page);
        assert.deepEqual(await editorSnapshot(page), editor, "Language and visibility changes preserve the edited recipe");
        assert.deepEqual(await orderSnapshot(page), order, "Media lifecycle leaves the existing canonical order unchanged");
        return { languageHandler: "Existing DOM language button click", visibleAgainNoAutoplay: true,
          visibilityBoundary: "Simulated document.hidden change with real emitted handler", editedTotal: editor.total,
          canonicalOrderUnchanged: true, languageAndHiddenReleaseSource: true };
      });

      await run(browser, `${name}-family-video-error-falls-back-and-retries`, async context => {
        const pattern = "**/family-motion-v1.*";
        const page = await context.newPage(); await openMenu(page, "menu-combo-family"); await preview(page).waitFor();
        const editor = await editorSnapshot(page), order = await orderSnapshot(page);
        for (const kind of ["network", "unsupported-bytes"]) {
          await context.route(pattern, kind === "network" ? route => route.abort("failed")
            : route => route.fulfill({ status: 200, contentType: route.request().url().includes(".webm") ? "video/webm" : "video/mp4", body: "This is deliberately not a supported video stream." }));
          await mediaToggle(page).click();
          const status = preview(page).locator('[data-combo-media-status][role="status"]');
          await status.waitFor({ state: "visible" });
          assert.ok((await status.textContent()).trim().length > 10, `${kind} failure gives a useful localized fallback notice`);
          await assertFamilyPhoto(page);
          assert.deepEqual(await editorSnapshot(page), editor); assert.deepEqual(await orderSnapshot(page), order);
          await context.unroute(pattern);
        }
        const layout = await geometry(page, ".menu-combos-dialog[open]");
        assert.deepEqual(layout, { pageOverflow: false, contained: true, dialogFits: true, clippedControls: [] });
        await screenshot(browser, preview(page), `${name}-family-video-error-390-ru.png`);
        const retry = await startVideo(page);
        await mediaToggle(page).click(); await assertReleased(retry, "Returning from a successful retry");
        await preview(page).locator(".menu-combos-add").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        await assertOrder(page, familyLines);
        assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), 750);
        return { failedLoadReturnsPhoto: true, failureKinds: ["network", "unsupported-bytes"], failureNotice: true, retryPlayback: retry.facts, orderStillEditableAndAddable: true, layout };
      });

      await run(browser, `${name}-other-recipes-have-no-family-video`, async context => {
        const requests = [];
        context.on("request", request => { if (/\.(?:mp4|webm)$/.test(new URL(request.url()).pathname)) requests.push(request.url()); });
        const page = await context.newPage(); await openMenu(page, "menu-combo-sweet"); await preview(page).waitFor();
        assert.equal(await mediaToggle(page).count(), 0, "A different recipe never offers the family clip");
        assert.equal(await preview(page).locator("video,[data-combo-video]").count(), 0);
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 280);
        await page.waitForLoadState("networkidle"); assert.deepEqual(requests, []);
        return { recipe: "sweet", originalTotal: 280, noVideoControlOrRequest: true };
      });

      await run(browser, `${name}-deep-link-and-edit-persist`, async context => {
        const page = await context.newPage(); await openMenu(page);
        assert.equal(await preview(page).count(), 0, "A normal menu visit does not open a selection dialog");
        await openMenu(page, "menu-combo-family"); await preview(page).waitFor();
        assert.match(await preview(page).locator("h2").textContent(), /2\s*\+\s*2/);
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 750);
        await page.keyboard.press("Escape");
        assert.equal(await choose(page, "family").evaluate(button => document.activeElement === button), true);
        await openMenu(page, "menu-combo-sweet"); await preview(page).waitFor();
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 280);
        assert.deepEqual(await preview(page).locator("[data-combo-quantity]").evaluateAll(nodes => nodes.map(node => ({
          id: node.dataset.comboQuantity, quantity: Number(node.value) })).sort((a, b) => a.id.localeCompare(b.id, "en"))), sweetLines);
        await preview(page).locator('[data-combo-increase="desserts:cookie"]').click();
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 380,
          "One extra cookie at the current 100 lira catalog price changes the selection total");
        await preview(page).locator('[data-combo-product="hot-coffee:caffe-latte"] .menu-combos-remove').click();
        assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), 200);
        const expected = [{ id: "desserts:cookie", quantity: 2 }];
        await preview(page).locator(".menu-combos-add").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        const revision = await assertOrder(page, expected);
        assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), 200);
        await page.keyboard.press("Escape");
        assert.equal(await choose(page, "sweet").evaluate(button => document.activeElement === button), true);
        await openMenu(page); await page.locator("#menu-cart-trigger").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        await assertOrder(page, expected);
        assert.equal(money(await page.locator("#menu-cart-dialog-total").textContent()), 200);
        return { originalTotals: { family: 750, sweet: 280 }, editedTotal: 200, expectedLines: expected,
          canonicalRevision: revision, reloadPersists: true, normalVisitNoDialog: true };
      });

      await run(browser, `${name}-delayed-deep-link-keeps-newer-cart`, async context => {
        let release, entered;
        const gate = new Promise(resolve => { release = resolve; });
        const loading = new Promise(resolve => { entered = resolve; });
        await context.route("**/menu-combos-ui.js*", async route => { entered(); await gate; await route.continue(); });
        try {
          const page = await context.newPage(); await openMenu(page, "menu-combo-family"); await loading;
          await page.locator("#menu-cart-trigger").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
          release(); await page.waitForLoadState("networkidle");
          assert.equal(await preview(page).count(), 0, "A late recipe import cannot open a preview over a newer cart");
          assert.equal(await page.locator("#menu-cart-dialog[open]").count(), 1);
          assert.equal(await page.locator("#menu-cart-dialog").evaluate(dialog => dialog.contains(document.activeElement)), true);
          return { delayedModule: "menu-combos-ui.js", newerCartPreserved: true, noFocusSteal: true };
        } finally { release(); }
      });

      for (const [hash, recipe] of [["menu-family", "family"], ["desserts", "sweet"]]) {
        await run(browser, `${name}-contextual-${recipe}-once`, async context => {
          const page = await context.newPage(); await clock(page); await openMenu(page, hash);
          await page.locator(".choice-help-entry").waitFor();
          await page.locator("#menu-share-button").evaluate(button => button.focus({ preventScroll: true }));
          await advance(page, 44_000);
          assert.equal(await panel(page).count(), 0, "The visitor sees no automatic offer before 45 seconds");
          await advance(page, 2_000);
          const target = await helperChoice(page, recipe);
          assert.equal(await page.locator("#menu-share-button").evaluate(button => document.activeElement === button), true,
            "The automatic offer never moves keyboard focus");
          const layout = await geometry(page, ".choice-help-panel:not([hidden])");
          assert.deepEqual(layout, { pageOverflow: false, contained: true, dialogFits: true, clippedControls: [] });
          await screenshot(browser, panel(page), `${recipe}-suggestion-390-ru.png`);
          await panel(page).locator(".choice-help-actions a:visible").click(); await preview(page).waitFor();
          assert.equal(money(await preview(page).locator(".menu-combos-total").textContent()), recipe === "family" ? 750 : 280);
          await page.keyboard.press("Escape");
          assert.equal(await choose(page, recipe).evaluate(button => document.activeElement === button), true);
          await advance(page, 60_000); assert.equal(await panel(page).count(), 0);
          await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
          await advance(page, 60_000); assert.equal(await panel(page).count(), 0, "One automatic offer per session across page navigation");
          return { hash, target, before45s: "hidden", offeredAt: 46_000, noFocusSteal: true, onceAcrossPages: true, layout };
        });
      }

      await run(browser, `${name}-dismiss-keeps-manual-help`, async context => {
        const page = await context.newPage(); await clock(page); await openMenu(page);
        await advance(page, 46_000); await panel(page).waitFor();
        await panel(page).locator(".choice-help-close").click(); await advance(page, 60_000);
        assert.equal(await panel(page).count(), 0);
        await page.reload({ waitUntil: "domcontentloaded" }); await page.locator(".choice-help-entry").waitFor();
        await advance(page, 60_000); assert.equal(await panel(page).count(), 0);
        await page.locator(".choice-help-entry").click(); await panel(page).waitFor();
        await panel(page).locator(".choice-help-close").focus(); await page.keyboard.press("Escape");
        assert.equal(await panel(page).count(), 0);
        assert.equal(await page.locator(".choice-help-entry").evaluate(button => document.activeElement === button), true);
        return { dismissedAcrossReload: true, explicitHelpAvailable: true, escapeFocusRestored: true };
      });

      for (const { manual, activity, visible } of [
        { manual: true, activity: "scroll", visible: true },
        { manual: false, activity: "scroll", visible: false },
        { manual: true, activity: "pointerdown", visible: false }
      ]) await run(browser, `${name}-pending-${manual ? "manual" : "automatic"}-suggestion-${activity}`, async context => {
        const page = await context.newPage(); await clock(page); await openMenu(page);
        await page.locator("#menu-share-button").evaluate(button => button.focus({ preventScroll: true }));
        const before = await page.evaluate(async () => {
          const snapshot = async () => {
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
          };
          window.__qaOfferCartSnapshot = snapshot;
          return snapshot();
        });
        const panelId = await page.evaluate(async manual => {
          const { initChoiceHelp } = await import("/choice-help.js");
          const host = document.createElement("div");
          host.id = "qa-offer-lifecycle-host";
          document.body.append(host); // Preserve the real host and entry driver.
          let entered, release;
          const pending = new Promise(resolve => { release = resolve; });
          const started = new Promise(resolve => { entered = resolve; });
          const helper = initChoiceHelp(host, { initialElapsed: 45_000, initialIdle: 8_000,
            readDraft: async () => ({ lines: [] }), readSuggestion: async () => { entered(); return pending; } });
          const completion = manual ? helper.show() : helper.offerAutomatic();
          await started;
          window.__qaOfferLifecycle = { release, completion, helper };
          return host.querySelector(".choice-help-entry").getAttribute("aria-controls");
        }, manual);
        await page.evaluate(async activity => {
          // Settling scroll is advisory; a new pointer action is fresh intent.
          document.dispatchEvent(activity === "pointerdown" ? new PointerEvent("pointerdown", { bubbles: true }) : new Event(activity));
          window.__qaOfferLifecycle.release({ total: 280, recipe: { id: "sweet", guests: 1,
            name: { tr: "Tatlı bir mola", en: "A sweet break", ru: "Сладкая пауза" },
            eyebrow: { tr: "Kahve ve kurabiye", en: "Coffee and a cookie", ru: "Кофе и печенье" },
            image: "src/products/occasion-sets-v1/sweet.webp" } });
          await window.__qaOfferLifecycle.completion;
        }, activity);
        assert.equal(await page.locator(`#${panelId}`).isVisible(), visible,
          visible ? "An explicitly requested suggestion survives a settling scroll during lazy data loading"
            : "Renewed activity cancels a pending automatic suggestion or a fresh pointer action cancels a pending manual request");
        assert.equal(await page.locator("#menu-share-button").evaluate(button => document.activeElement === button), true,
          "Resolving a pending suggestion does not move keyboard focus");
        assert.deepEqual(await page.evaluate(() => window.__qaOfferCartSnapshot()), before, "Suggestion resolution does not mutate the order");
        await page.evaluate(() => window.__qaOfferLifecycle.helper.destroy());
        return { manual, emittedModule: "choice-help.js", fixture: "Gated readSuggestion on a separate synthetic host", activityDuringPending: activity,
          visibleAfterResolution: visible, noFocusSteal: true, orderUnchanged: true };
      });

      await run(browser, `${name}-editing-overlay-cart-suppression`, async context => {
        const page = await context.newPage(); await clock(page); await openMenu(page);
        await page.locator("#menu-search").focus(); await advance(page, 50_000);
        assert.equal(await panel(page).count(), 0, "Editing suppresses the automatic offer");
        await page.locator("#menu-combos-trigger").click(); await choose(page, "family").click(); await preview(page).waitFor();
        await advance(page, 50_000); assert.equal(await panel(page).count(), 0, "A selection overlay suppresses the offer");
        await preview(page).locator(".menu-combos-add").click(); await page.locator("#menu-cart-dialog[open]").waitFor();
        await assertOrder(page, familyLines);
        await advance(page, 50_000); assert.equal(await panel(page).count(), 0, "The cart suppresses the offer");
        await page.keyboard.press("Escape"); await advance(page, 50_000);
        assert.equal(await panel(page).count(), 0, "An existing order also suppresses automatic suggestions after the cart closes");
        return { editing: true, selectionOverlay: true, cartOverlay: true, nonemptyCanonicalOrder: true };
      });

      await run(browser, `${name}-hidden-visible-time`, async context => {
        const page = await context.newPage(); await clock(page); await openMenu(page);
        await page.waitForLoadState("networkidle");
        // A deterministic visibility fixture exercises the browser's read-only
        // state boundary without waiting in wall-clock time or changing app code.
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        // A background fixture need not become network-idle while its clock is
        // paused; account for hidden time without a network-quiescence wait.
        await page.clock.runFor(60_000); assert.equal(await panel(page).count(), 0);
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await advance(page, 44_000); assert.equal(await panel(page).count(), 0, "Hidden time is not offer eligibility time");
        await advance(page, 2_000); await panel(page).waitFor();
        return { hiddenDurationMs: 60_000, visibleBeforeOfferMs: 46_000, visibility: "simulated document.hidden boundary, real emitted handlers" };
      });
    } finally { await browser.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(certificate, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); report.assetHashesEnd = hashes();
  report.assetsUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.passed = report.cases.filter(test => test.status === "PASS").length;
  report.failed = report.cases.length - report.passed;
  persist();
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, assetsUnchanged: report.assetsUnchanged, report: join(output, "report.json") }));
if (!report.cases.length || report.failed || !report.assetsUnchanged) process.exitCode = 1;
