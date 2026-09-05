import { readVerifiedMenuSource } from "./menu-runtime-source.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const html = readFileSync("menu.html", "utf8");
const css = readFileSync("menu-premium.css", "utf8");
const premiumRevision = createHash("sha256").update(css).digest("hex").slice(0, 12);
const runtime = readFileSync("menu-interactions.js", "utf8");
const menuPageRuntime = readVerifiedMenuSource();
const pwaRuntime = readFileSync("pwa.js", "utf8");
const menuPwaRuntime = readFileSync("menu-pwa.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[SHARE-001] ${message}`);
}

const statusRule = css.match(/(?:^|})\s*\.menu-share-status\s*\{([^}]*)\}/i)?.[1]?.replace(/\s+/g, "").toLowerCase() ?? "";

assert(html.includes('id="menu-share-button"'), "Menu share button is missing");
assert(html.includes('id="menu-share-status"') && html.includes('aria-live="polite"'), "Accessible share status is missing");
assert(statusRule.includes("text-align:center"), "Share status messages must be centered");
assert(statusRule.includes("width:100%") && statusRule.includes("justify-self:stretch"), "Share status must span the card width");
assert(!/\.menu-share-status\s*\{[^}]*text-align\s*:\s*left/i.test(css), "A mobile rule overrides centered share status");

assert(runtime.includes("android.intent.action.SEND"), "Android ACTION_SEND fallback is missing");
assert(runtime.includes("android.intent.extra.SUBJECT"), "Android share subject is missing");
assert(runtime.includes("android.intent.extra.TEXT"), "Android share text and URL are missing");
assert(runtime.includes('type=text/plain'), "Android share MIME type changed");
assert(runtime.includes("window.location.assign(androidShareIntent(payload))"), "Android WebView does not launch the system share intent");
assert(runtime.includes('typeof navigator.share === "function"'), "Web Share API path is missing");
assert(runtime.includes("navigator.clipboard?.writeText"), "Copy-link fallback is missing");
assert(runtime.includes('error?.name === "AbortError"'), "User-cancelled share must not show an error");
assert(runtime.includes("export async function shareMenu"), "Share behavior must be callable from the interaction loader");
assert(runtime.includes("export function completeNativeShare"), "Native share completion must preserve localized feedback and analytics");
assert(runtime.includes("!skipNative && typeof navigator.share"), "Fallback share must not retry a rejected native share");
assert(runtime.includes("export function track"), "Menu action tracking must be callable from the interaction loader");
assert(menuPageRuntime.includes('import("./menu-interactions.js?v=20260904-interaction-v3")'), "Menu actions are not loaded on demand");
assert(menuPageRuntime.includes('menuShareButton?.addEventListener("click"'), "First-click share activation is missing");
assert(menuPageRuntime.includes("const nativeShare = navigator.share(payload)"), "Native share must run synchronously in the activation handler");
assert(menuPageRuntime.includes("runLazyShare(true)"), "Rejected native share lacks a non-native fallback");
assert(html.includes('data-share-text-tr=') && html.includes('data-share-text-en=') && html.includes('data-share-text-ru='), "Activation-safe share copy lacks TR/EN/RU coverage");
assert(!html.includes('src="menu-interactions.js'), "Menu interactions must stay off the initial performance path");
const menuRuntimeRevision = createHash("sha256").update(readFileSync("menu-app.js")).digest("hex").slice(0, 12);
assert(html.includes(`src="menu-app.js?v=${menuRuntimeRevision}"`), "Menu must load the exact runtime content revision");
assert(serviceWorker.includes(`"./menu-app.js?v=${menuRuntimeRevision}"`), "Menu runtime must be precached at the exact HTML revision");
assert(html.includes(`href="menu-premium.css?v=${premiumRevision}"`), "Menu must load the cache-new premium stylesheet path");
assert(serviceWorker.includes('url.pathname.endsWith("/menu-app.js")'), "Menu runtime is not exact-revision cached");
// Bind emitted imports to catalogue bytes. Several specifiers may share the same cached ESM URL.
const catalogRevision = createHash("sha256").update(readFileSync("menu-catalog.js")).digest("hex").slice(0, 12);
const catalogUrl = `./menu-catalog.js?v=${catalogRevision}`;
for (const file of ["menu-app.js", "order-store.js"]) {
  const emitted = readFileSync(file, "utf8");
  const imports = [...new Set([...emitted.matchAll(/\bfrom\s*["'](\.\/menu-catalog\.js[^"']*)["']/g)].map(match => match[1]))];
  assert(imports.length === 1 && imports[0] === catalogUrl, `${file} must import one content-bound catalogue URL`);
}
assert(serviceWorker.includes(JSON.stringify(catalogUrl)), "Menu catalog is not precached at its runtime content revision");
assert(serviceWorker.includes('url.pathname.endsWith("/menu-catalog.js")'), "Menu catalog is not exact-revision cached");
assert(!serviceWorker.includes('"./menu-data.js"'), "Legacy unversioned menu catalog must not remain in the cache manifest");
assert(serviceWorker.includes(`"./menu-premium.css?v=${premiumRevision}"`), "Premium menu stylesheet is not precached at its HTML revision");
assert(serviceWorker.includes('url.pathname.endsWith("/menu-premium.css")'), "Premium menu stylesheet is not exact-revision cached");
assert(!serviceWorker.includes('"./menu.css"'), "Legacy menu stylesheet must not remain in the cache manifest");
assert(serviceWorker.includes('url.pathname.endsWith("/menu-interactions.js")'), "Menu interactions are not exact-revision cached");

// Accept future cache revisions while preventing rollback before the original share-cache fix.
const cacheVersion = serviceWorker.match(/const CACHE_VERSION = "robys-offline-v(\d+)-(\d{8})-[a-z0-9-]+";/)?.slice(1);
assert(cacheVersion, "Offline cache version marker is missing or malformed");
const [cacheGeneration, cacheDate] = cacheVersion.map(Number);
assert(cacheGeneration >= 4 && cacheDate >= 20260627, "Offline cache version predates the share fix");

// Public entry pages must request the same PWA revision that registers the service worker.
const pwaRevision = pwaRuntime.match(/const SERVICE_WORKER_URL = "sw\.js\?v=([^"]+)";/)?.[1];
const menuPwaRevision = menuPwaRuntime.match(/const SERVICE_WORKER_URL = "sw\.js\?v=([^"]+)";/)?.[1];
assert(pwaRevision, "Service-worker registration revision is missing");
assert(menuPwaRevision === pwaRevision, "Landing and menu runtimes register different service-worker revisions");
assert(indexHtml.includes(`src="pwa.js?v=${pwaRevision}"`), "index.html does not load the current PWA registration revision");
assert(html.includes(`src="menu-pwa.js?v=${pwaRevision}"`), "menu.html does not load the current menu PWA registration revision");
assert(!menuPageRuntime.includes('import("./menu-pwa.js'), "Menu PWA registration must have one deterministic bootstrap path");

console.log(`✅ SHARE-001 passed: centered feedback, Android/Web Share fallbacks, cache generation ${cacheGeneration} (${cacheDate}), and PWA revision ${pwaRevision} remain valid.`);
