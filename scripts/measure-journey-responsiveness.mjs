import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:https";
import { createServer as createProxyServer } from "node:http";
import { connect } from "node:net";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

export const expectedJourneyIDs = Object.freeze(["menu-switch-feed", "menu-switch-list", "menu-search", "menu-clear", "menu-category", "menu-language", "product-open", "cart-add", "cart-open", "cart-close"]);
export const defaultProfiles = Object.freeze([390, 1280].flatMap(width => ["tr", "en", "ru"].flatMap(language => ["normal", "reduced"].map(motion => ({
  id: `${width === 390 ? "mobile390" : "desktop1280"}-${language}-${motion}`, width, height: 844, language, motion
})))));
const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const policyPath = fileURLToPath(new URL("../qa/journey-latency-budgets.json", import.meta.url));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");
export function sampleKey(sample) { return `${sample.journeyId}|${sample.metricId}|${sample.profile}|${sample.attempt}`; }
export function makeSample({ journeyId, profile, attempt, value = null, correctness = false, error, ...details }) {
  const validTiming = Number.isFinite(value) && value > 0;
  const budget = policy.journeys[journeyId];
  const budgetStatus = !validTiming ? "UNAVAILABLE" : value <= budget.maxMs ? "PASS" : "FAIL";
  return { journeyId, metricId: "ready_ms", profile, attempt, value: validTiming ? value : null,
    correctnessStatus: correctness ? "PASS" : "FAIL", timingStatus: validTiming ? "VALID" : "INVALID",
    budget: { ...budget }, budgetStatus,
    status: correctness && validTiming && (!budget.enforced || budgetStatus === "PASS") ? "PASS" : "FAIL",
    ...(error ? { error: String(error) } : {}), ...details };
}
export function validateJourneyReport(report) {
  const errors = [], expected = report.expectedSamples ?? [], samples = report.samples ?? [];
  const keys = new Set();
  if (!expected.length) errors.push("Expected sample matrix is empty");
  for (const sample of samples) {
    const key = sampleKey(sample);
    if (keys.has(key)) errors.push(`Duplicate sample: ${key}`);
    keys.add(key);
    if (!expected.some(item => sampleKey(item) === key)) errors.push(`Unexpected sample: ${key}`);
    if (!["PASS", "FAIL"].includes(sample.status)) errors.push(`Invalid status: ${key}`);
    const budget = policy.journeys[sample.journeyId];
    if (!budget) errors.push(`Unknown journey: ${key}`);
    if (budget && sample.status === "PASS" && budget.enforced && sample.value > budget.maxMs) errors.push(`Enforced timing budget exceeded: ${key}`);
    if (budget && (sample.budget?.maxMs !== budget.maxMs || sample.budget?.enforced !== budget.enforced)) errors.push(`Reported timing policy mismatch: ${key}`);
    if (sample.status === "PASS" && (!(Number.isFinite(sample.value) && sample.value > 0) || sample.correctnessStatus !== "PASS" || sample.timingStatus !== "VALID")) errors.push(`Invalid passing evidence: ${key}`);
  }
  for (const sample of expected) if (!keys.has(sampleKey(sample))) errors.push(`Missing sample: ${sampleKey(sample)}`);
  if (report.complete !== true) errors.push("Collection is incomplete");
  return { valid: errors.length === 0, errors, status: errors.length === 0 && samples.every(sample => sample.status === "PASS") ? "PASS" : "FAIL" };
}
function runtimeIdentity() {
  const manifestBytes = readFileSync(join(repo, "integrity-manifest.json"));
  const files = JSON.parse(manifestBytes).files;
  const hash = createHash("sha256").update(manifestBytes), seen = new Set();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const path = resolve(repo, file.path);
    if (!path.startsWith(repo + sep) || seen.has(file.path)) throw Error("Invalid runtime evidence path");
    seen.add(file.path); const bytes = readFileSync(path);
    hash.update(JSON.stringify({ path: file.path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
  }
  return { runtimeSha256: hash.digest("hex"), runtimeFiles: seen.size };
}
function sourceIdentity(revision) {
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const actualRevision = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(revision) || revision !== actualRevision) throw Error("ROBYS_SOURCE_REVISION must be the actual 40-character checkout HEAD");
  return { revision, tree: git("rev-parse", "HEAD^{tree}"), dirty: Boolean(git("status", "--porcelain")), actualRevision, ...runtimeIdentity() };
}
export async function createJourneyProxy(origin) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.hostname !== "127.0.0.1" || url.origin !== origin) throw Error("Proxy requires the canonical local HTTPS origin");
  const sockets = new Set(), blocked = [];
  let allowedTunnels = 0;
  const track = socket => { sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket)); return socket; };
  const proxy = createProxyServer((request, response) => { blocked.push(request.url); response.writeHead(403).end(); });
  proxy.on("connection", track);
  proxy.on("connect", (request, client, head) => {
    if (request.url !== url.host) { blocked.push(request.url); client.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n"); return; }
    allowedTunnels++;
    // Never resolve or connect to a request-supplied host, including for a deny probe.
    const upstream = track(connect({ host: "127.0.0.1", port: Number(url.port || 443) }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream); upstream.pipe(client);
    }));
    upstream.once("error", () => client.destroy()); client.once("error", () => upstream.destroy());
    upstream.once("close", () => client.destroy()); client.once("close", () => upstream.destroy());
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  return { server: `http://127.0.0.1:${proxy.address().port}`, blocked, get allowedTunnels() { return allowedTunnels; },
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => proxy.close(resolve)); } };
}
export function validCacheProof(proof, origin) {
  try {
    const url = new URL(proof.url), external = new URL(proof.external.url), entries = proof.entries;
    return proof.origin === origin && url.origin === origin && !url.username && !url.password && url.pathname === "/menu-feed.css" && Boolean(url.searchParams.get("journey-cache-proof"))
      && Number.isFinite(proof.start) && Number.isFinite(proof.end) && proof.end > proof.start && Number.isInteger(proof.proxyLocalConnections) && proof.proxyLocalConnections > 0
      && Array.isArray(entries) && entries.length === 3 && entries[0].initiatorType === "fetch" && Number.isFinite(entries[0].transferSize) && entries[0].transferSize > 0
      && entries[1].initiatorType === "fetch" && entries[2].initiatorType === "link"
      && entries.every(entry => Number.isFinite(entry.decodedBodySize) && entry.decodedBodySize > 0 && entry.decodedBodySize === entries[0].decodedBodySize)
      && entries.slice(1).every(entry => entry.transferSize === 0)
      && external.protocol === "https:" && /^journey-deny-[a-f0-9-]+\.invalid$/.test(external.hostname)
      && !external.username && !external.password && !external.port && external.pathname === "/blocked"
      && proof.external.rejected === true && proof.external.proxyDenied === true;
  } catch { return false; }
}
async function throttledPage(context) {
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  return page;
}
async function recordCacheProof(context, origin, proxy, profile, attempt) {
  const page = await throttledPage(context), start = Date.now(), tunnels = proxy.allowedTunnels, blocked = proxy.blocked.length;
  const external = `https://journey-deny-${randomUUID()}.invalid/blocked`;
  try {
    await page.goto(`${origin}/__journey-cache-proof.html`);
    const observed = await page.evaluate(async ({ external, nonce }) => {
      const url = new URL(`menu-feed.css?journey-cache-proof=${nonce}`, location.href).href;
      await (await fetch(url)).arrayBuffer(); await (await fetch(url)).arrayBuffer();
      await new Promise((resolve, reject) => { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = url; link.onload = resolve; link.onerror = reject; document.head.append(link); });
      let rejected = false; try { await fetch(external); } catch { rejected = true; }
      return { url, entries: performance.getEntriesByName(url).map(entry => ({ initiatorType: entry.initiatorType, transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize })), rejected };
    }, { external, nonce: randomUUID() });
    return { profile, attempt, origin, start, end: Date.now(), url: observed.url, entries: observed.entries, proxyLocalConnections: proxy.allowedTunnels - tunnels,
      external: { url: external, rejected: observed.rejected, proxyDenied: proxy.blocked.slice(blocked).includes(`${new URL(external).hostname}:443`) } };
  } finally { await page.close(); }
}
export function browserProbe() {
  const key = "__robysJourneyTiming";
  const capture = event => {
    if (!event.isTrusted) return;
    let entry; try { entry = JSON.parse(sessionStorage.getItem(key)); } catch { return; }
    if (!entry || entry.startEpochMs || event.type !== entry.event || !event.target.closest?.(entry.selector)) return;
    entry.startEpochMs = performance.timeOrigin + performance.now(); sessionStorage.setItem(key, JSON.stringify(entry));
  };
  document.addEventListener("click", capture, { capture: true });
  document.addEventListener("input", capture, { capture: true });
  window.__robysJourneyReady = ({ kind, language, count, total }) => {
    if (!document.documentElement) return false;
    const visible = node => {
      if (!node || !node.getClientRects().length) return false;
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < .98) return false;
      }
      const box = node.getBoundingClientRect(), left = Math.max(0, box.left), top = Math.max(0, box.top);
      const right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
      if (!(right > left && bottom > top)) return false;
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      return hit === node || node.contains(hit);
    };
    const settled = node => visible(node) && !node.getAnimations({ subtree: true }).some(animation => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity);
    const listReady = () => document.documentElement.dataset.menuViewReady === "true" && document.querySelector('#menu-root[data-ready="true"]') && visible(document.querySelector(".menu-view-switch"));
    const cart = document.querySelector("#menu-cart-dialog"), product = document.querySelector("#menu-product-dialog");
    if (kind === "list") return /\/menu\.html$/.test(location.pathname) && listReady();
    if (kind === "feed") { const image = document.querySelector(".feed-photo>img"); return /\/menu-feed\.html$/.test(location.pathname) && document.documentElement.dataset.menuViewReady === "true" && visible(document.querySelector('#feed[data-ready="true"]')) && image?.complete && image.naturalWidth > 0 && visible(image) && document.documentElement.lang === language; }
    const rows = [...document.querySelectorAll("#menu-root [data-product-id]")];
    if (kind === "search") return document.querySelector("#menu-search")?.value === "Espresso" && rows.length > 0 && rows.length < count && rows.some(row => row.dataset.productId === "hot-coffee:espresso") && rows.some(row => visible(row.querySelector(".full-menu-item-copy")));
    if (kind === "clear") return document.querySelector("#menu-search")?.value === "" && rows.length === count && document.querySelector(".menu-search-clear")?.hidden === true && visible(document.querySelector("#menu-search"));
    if (kind === "category") return document.querySelector('#menu-category-nav [data-category="hot-coffee"]')?.getAttribute("aria-pressed") === "true" && rows.length > 0 && rows.every(row => row.dataset.productId.startsWith("hot-coffee:")) && rows.some(row => visible(row.querySelector(".full-menu-item-copy")));
    if (kind === "language") return document.documentElement.lang === language && document.querySelector(`[data-lang="${language}"]`)?.getAttribute("aria-pressed") === "true" && document.querySelector('[data-product-id="hot-coffee:espresso"] .full-menu-item-copy strong')?.textContent === count && visible(document.querySelector('[data-product-id="hot-coffee:espresso"] .full-menu-item-copy strong'));
    if (kind === "product") { const image = document.querySelector("#menu-product-image"), add = document.querySelector("#menu-add-to-cart"); return product?.open && settled(product.querySelector(".menu-dialog-shell")) && image?.complete && image.naturalWidth > 0 && visible(image) && add && !add.disabled && visible(add) && visible(document.querySelector("#menu-product-title")) && document.querySelector("#menu-product-title")?.textContent === count; }
    if (kind === "add" || kind === "cart") return cart?.open && !product?.open && settled(cart.querySelector(".menu-dialog-shell")) && document.querySelector("#menu-cart-count")?.textContent === "1" && document.querySelectorAll("#menu-cart-lines .menu-cart-line").length === 1 && visible(document.querySelector("#menu-cart-lines .menu-cart-line")) && visible(document.querySelector("#menu-cart-dialog-total")) && Number(document.querySelector("#menu-cart-dialog-total")?.textContent.replace(/[^\d]/g, "")) === Math.round(total);
    if (kind === "cart-closed") return !cart?.open && listReady() && document.querySelector("#menu-cart-count")?.textContent === "1" && document.activeElement === document.querySelector("#menu-cart-trigger");
    return false;
  };
}
export async function measureJourney(page, { journeyId, profile, attempt, selector, event = "click", outcome, action }) {
  const id = randomUUID();
  try {
    await page.evaluate(entry => sessionStorage.setItem("__robysJourneyTiming", JSON.stringify(entry)), { id, event, selector });
    await action();
    await page.waitForFunction(outcome => window.__robysJourneyReady(outcome), outcome);
    // Two presented frames after semantic readiness; no artificial think time.
    const evidence = await page.evaluate(async ({ outcome, id }) => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const entry = JSON.parse(sessionStorage.getItem("__robysJourneyTiming"));
      return { correct: window.__robysJourneyReady(outcome), id: entry?.id, start: entry?.startEpochMs ?? null,
        end: performance.timeOrigin + performance.now(), url: location.href };
    }, { outcome, id });
    const value = evidence.start === null ? null : evidence.end - evidence.start;
    return makeSample({ journeyId, profile, attempt, value, correctness: evidence.correct && evidence.id === id,
      ...(!evidence.start ? { error: "No matching trusted activation was captured" } : {}), evidence });
  } catch (error) { return makeSample({ journeyId, profile, attempt, error: error.message }); }
}
export async function runJourneyProbe({ output = resolve(process.env.ROBYS_JOURNEY_OUTPUT ?? ".artifacts/journey-responsiveness"),
  attempts = Number(process.env.ROBYS_JOURNEY_ATTEMPTS ?? 1), profiles = defaultProfiles } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw Error("ROBYS_JOURNEY_ATTEMPTS must be an integer from 1 to 10");
  const revision = process.env.ROBYS_SOURCE_REVISION ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const source = sourceIdentity(revision), expectedSamples = profiles.flatMap(profile => Array.from({ length: attempts }, (_, i) => expectedJourneyIDs.map(journeyId => ({ journeyId, metricId: "ready_ms", profile: profile.id, attempt: i + 1 }))).flat());
  const harness = { sha256: sha256(fileURLToPath(import.meta.url)), policySha256: sha256(policyPath) };
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), finishedAt: null, source, harness, environment: { browser: "chromium", platform: process.platform, nodeVersion: process.version, profiles, serviceWorkers: "blocked", network: "local HTTPS; fresh context per profile/attempt; observed HTTP cache reused within ten ordered journeys", networkGuard: "loopback-only CONNECT proxy", cache: "per-context fetch-to-stylesheet reuse and external denial observed", journeyOrder: expectedJourneyIDs, cpuRate: 4,
    latencyMs: 150, downloadMbps: 1.6, metric: "trusted activation to semantic visible readiness plus two animation frames; feed switch includes first visible photograph loaded successfully; includes finite dialog animation settlement; no artificial dwell; not field INP" },
    expectedJourneyIDs, expectedSamples, cacheProofs: [], samples: [], complete: false, status: "FAIL" };
  mkdirSync(output, { recursive: true }); const save = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n"); save();
  const cert = mkdtempSync(join(tmpdir(), "robys-journey-")); let server, browser, proxy;
  try {
    execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(cert, "key"), "-out", join(cert, "cert"), "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"], { stdio: "ignore" });
    const publicKey = execFileSync("openssl", ["x509", "-in", join(cert, "cert"), "-pubkey", "-noout"]);
    const der = execFileSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: publicKey });
    const pin = createHash("sha256").update(der).digest("base64");
    const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
    server = createServer({ key: readFileSync(join(cert, "key")), cert: readFileSync(join(cert, "cert")) }, (request, response) => {
      try {
        if (new URL(request.url, "https://localhost").pathname === "/__journey-cache-proof.html") return response.writeHead(200, { "content-type": "text/html", "content-security-policy": "default-src 'none'; style-src 'self'; connect-src 'self' https://*.invalid" }).end("<!doctype html><title>HTTP cache and network guard proof</title>");
        let path = resolve(repo, "." + decodeURIComponent(new URL(request.url, "https://localhost").pathname));
        if (!path.startsWith(repo + sep) || !existsSync(path)) return response.writeHead(404).end();
        if (statSync(path).isDirectory()) path = join(path, "index.html");
        if (!existsSync(path)) return response.writeHead(404).end();
        response.writeHead(200, { "content-type": mime[extname(path)] ?? "application/octet-stream", "cache-control": "public, max-age=600" }); createReadStream(path).pipe(response);
      } catch { response.writeHead(400).end(); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `https://127.0.0.1:${server.address().port}`;
    report.environment.origin = origin;
    proxy = await createJourneyProxy(origin);
    browser = await chromium.launch({ headless: true, proxy: { server: proxy.server, bypass: "<-loopback>" }, args: [`--ignore-certificate-errors-spki-list=${pin}`] }); report.environment.browserVersion = browser.version();
    const { menuCategories } = await import(pathToFileURL(join(repo, "menu-catalog.js")));
    const espresso = menuCategories.find(category => category.id === "hot-coffee").items.find(item => item.name.en === "Espresso");
    for (const profile of profiles) for (let attempt = 1; attempt <= attempts; attempt++) {
      const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1, reducedMotion: profile.motion === "reduced" ? "reduce" : "no-preference", serviceWorkers: "block" });
      // Routing turns off Chromium's HTTP cache. The deny proxy preserves both
      // the same-origin boundary and the cache behavior this measurement declares.
      const proof = await recordCacheProof(context, origin, proxy, profile.id, attempt); report.cacheProofs.push(proof); save();
      if (!validCacheProof(proof, origin)) throw Error(`HTTP cache/network guard proof failed: ${profile.id}|${attempt}`);
      const errors = [], externalRequests = [];
      context.on("request", request => { if (new URL(request.url()).origin !== origin) externalRequests.push(request.url()); });
      await context.addInitScript(browserProbe); const page = await throttledPage(context);
      page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      const firstSample = report.samples.length;
      const run = async (journeyId, selector, outcome, action, event) => {
        const sample = await measureJourney(page, { journeyId, profile: profile.id, attempt, selector, outcome, action: action ?? (() => page.locator(selector).click()), event });
        report.samples.push(sample); save(); console.log(JSON.stringify({ journeyId, profile: profile.id, attempt, status: sample.status, value: sample.value, error: sample.error }));
        if (sample.correctnessStatus !== "PASS") throw Error(`${journeyId} failed: ${sample.error ?? "semantic outcome"}`);
      };
      try {
        await page.goto(`${origin}/menu.html?view=list&lang=${profile.language}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__robysJourneyReady({ kind: "list" }));
        const count = await page.locator("#menu-root [data-product-id]").count();
        await run("menu-switch-feed", '.menu-view-switch [data-menu-view="feed"]', { kind: "feed", language: profile.language });
        await run("menu-switch-list", '.feed-view-switch [data-menu-view="list"]', { kind: "list" });
        await run("menu-search", "#menu-search", { kind: "search", count }, () => page.locator("#menu-search").fill("Espresso"), "input");
        await run("menu-clear", ".menu-search-clear", { kind: "clear", count });
        await run("menu-category", '#menu-category-nav [data-category="hot-coffee"]', { kind: "category" });
        const nextLanguage = { tr: "en", en: "ru", ru: "tr" }[profile.language];
        await run("menu-language", `[data-lang="${nextLanguage}"]`, { kind: "language", language: nextLanguage, count: espresso.name[nextLanguage] });
        await run("product-open", '[data-product-id="hot-coffee:espresso"] .full-menu-item-media', { kind: "product", count: espresso.name[nextLanguage] });
        await run("cart-add", "#menu-add-to-cart", { kind: "add", total: espresso.price });
        // Setup for an independent cart-open activation; not a measured sample.
        await page.locator('[data-menu-dialog-close="cart"]').first().click();
        await page.waitForFunction(() => !document.querySelector("#menu-cart-dialog").open);
        await run("cart-open", "#menu-cart-trigger", { kind: "cart", total: espresso.price });
        await run("cart-close", '#menu-cart-dialog [data-menu-dialog-close="cart"]', { kind: "cart-closed" }, () => page.locator('#menu-cart-dialog [data-menu-dialog-close="cart"]').first().click());
      } catch (error) {
        for (const journeyId of expectedJourneyIDs) if (!report.samples.some(sample => sample.profile === profile.id && sample.attempt === attempt && sample.journeyId === journeyId)) report.samples.push(makeSample({ journeyId, profile: profile.id, attempt, error: `Not executed after setup/dependency failure: ${error.message}` }));
      } finally {
        if (errors.length || externalRequests.length) for (const sample of report.samples.slice(firstSample)) { sample.status = "FAIL"; sample.correctnessStatus = "FAIL"; sample.error = `${sample.error ?? ""} Application errors: ${JSON.stringify(errors)}; external requests blocked: ${JSON.stringify(externalRequests)}`.trim(); }
        await context.close(); save();
      }
    }
    const final = sourceIdentity(revision); report.source.finalRevision = final.revision; report.source.finalTree = final.tree; report.source.finalDirty = final.dirty;
    report.source.dirty = source.dirty || final.dirty; report.source.finalRuntimeSha256 = final.runtimeSha256;
    if (source.revision !== final.revision || source.tree !== final.tree) throw Error("Checkout revision or tree changed during measurement");
    if (source.runtimeSha256 !== final.runtimeSha256) throw Error("Load-bearing runtime bytes changed during measurement");
    if (harness.sha256 !== sha256(fileURLToPath(import.meta.url)) || harness.policySha256 !== sha256(policyPath)) throw Error("Measurement harness or timing policy changed during collection");
    report.finishedAt = new Date().toISOString(); report.complete = true; report.validation = validateJourneyReport(report); report.status = report.validation.status; save(); return report;
  } catch (error) { report.finishedAt = new Date().toISOString(); report.error = error.message; save(); throw error; }
  finally { await browser?.close(); await proxy?.close(); if (server) await new Promise(resolve => server.close(resolve)); rmSync(cert, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const report = await runJourneyProbe(); console.log(JSON.stringify({ status: report.status, complete: report.complete, samples: report.samples.length })); if (report.status !== "PASS") process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
