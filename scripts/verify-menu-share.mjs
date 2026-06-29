import { readFileSync } from "node:fs";

const html = readFileSync("menu.html", "utf8");
const css = readFileSync("menu.css", "utf8");
const runtime = readFileSync("menu-actions.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[SHARE-001] ${message}`);
}

const statusRule = css.match(/\.menu-share-status\s*\{([^}]*)\}/i)?.[1]?.replace(/\s+/g, "").toLowerCase() ?? "";

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

// Accept future cache revisions while preventing rollback before the original share-cache fix.
const cacheVersion = serviceWorker.match(/const CACHE_VERSION = "robys-offline-v(\d+)-(\d{8})-[a-z0-9-]+";/)?.slice(1);
assert(cacheVersion, "Offline cache version marker is missing or malformed");
const [cacheGeneration, cacheDate] = cacheVersion.map(Number);
assert(cacheGeneration >= 4 && cacheDate >= 20260627, "Offline cache version predates the share fix");

console.log(`✅ SHARE-001 passed: centered feedback, Android/Web Share fallbacks, and cache generation ${cacheGeneration} (${cacheDate}) remain valid.`);
