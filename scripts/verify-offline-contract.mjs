import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(`[OFFLINE-001] ${message}`);
}

const sw = readFileSync("sw.js", "utf8");
const pwa = readFileSync("pwa.js", "utf8");
const offline = readFileSync("404.html", "utf8");
const index = readFileSync("index.html", "utf8");
const menu = readFileSync("menu.html", "utf8");

for (const asset of [
  "./menu.html",
  "./menu-bootstrap.js",
  "./menu-page.js",
  "./menu-data.js",
  "./menu-search-clear.js",
  "./404.html",
  "./downloads/robys-coffee-house-v1.1.apk"
]) {
  assert(sw.includes(asset), `Service worker does not precache ${asset}`);
}
assert(sw.includes('request.mode === "navigate"'), "Navigation fallback is missing");
assert(sw.includes('new URL("404.html"'), "Offline 404 fallback is missing");
assert(pwa.includes("navigator.serviceWorker.register"), "Service worker registration is missing");
assert(index.includes('worker-src \'self\''), "Landing CSP must allow the service worker");
assert(menu.includes('worker-src \'self\''), "Menu CSP must allow the service worker");
assert(index.includes('src="pwa.js?'), "Landing page does not load pwa.js");
assert(menu.includes('src="pwa.js?'), "Menu page does not load pwa.js");
assert(index.includes('src="android-download.js?'), "Landing page does not load direct Android upgrade");
assert(offline.includes("404 · OFFLINE") && offline.includes('href="menu.html"'), "Offline 404 page must expose the cached menu");
console.log("✅ OFFLINE-001 passed: offline 404 fallback and interactive cached menu are wired.");
