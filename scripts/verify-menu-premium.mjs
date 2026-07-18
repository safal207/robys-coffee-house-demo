import { existsSync, readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(`[MENU-PREMIUM-001] ${message}`);
}

const html = readFileSync("menu.html", "utf8");
const stability = readFileSync("menu-stability.css", "utf8");
const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
const pwa = readFileSync("menu-pwa.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

assert(!existsSync("pairing-posters.css"), "Legacy overlay CSS must not remain in the public root");
assert(!existsSync("pairing-posters.js"), "Legacy overlay JavaScript must not remain in the public root");
assert(!html.includes("pairing-posters"), "The menu must not load the legacy poster enhancer");
assert(html.includes('rel="manifest" href="manifest.webmanifest"'), "Menu must expose the PWA manifest declaratively");
assert(html.includes('rel="apple-touch-icon"'), "Menu must expose a stable Apple touch icon without runtime DOM mutation");
assert(html.includes('rel="modulepreload" href="menu-data.js"'), "Menu data must start fetching before module execution");
assert(html.includes('rel="preload" href="src/products/cards/pairing-cool-lime-macaron.webp"'), "The first visible pairing image must be preloaded");
assert(html.indexOf('src="menu-page.js"') < html.indexOf("</head>"), "Primary menu module must start loading from the document head");
assert(stability.includes("scrollbar-gutter:stable"), "Stable scrollbar geometry is required");
assert(stability.includes("object-fit:contain"), "Pairing artwork must not be cropped");
assert(stability.includes("transform:none!important"), "Legacy image zoom transforms must be neutralized");
assert(stability.includes("prefers-reduced-motion:reduce"), "Reduced-motion users need a no-motion path");
assert(stability.includes(".full-menu-item--visual .full-menu-price"), "Duplicate visual pairing price must be hidden but remain semantic");
assert(manifest.icons.every((icon) => !String(icon.purpose).includes("maskable")), "Non-safe-zone artwork must not claim maskable support");
assert(pwa.includes("offline-20260718-premium-1") && serviceWorker.includes("robys-offline-v20-20260718-premium"), "PWA cache revision must deliver the optimized assets");

console.log("✅ MENU-PREMIUM-001 passed: stable layout, calm artwork, early menu fetch, clean icon metadata and fresh PWA cache.");
