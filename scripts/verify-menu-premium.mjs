import { existsSync, readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(`[MENU-PREMIUM-001] ${message}`);
}

const html = readFileSync("menu.html", "utf8");
const stability = readFileSync("menu-premium-stability.css", "utf8");
const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
const menuPwa = readFileSync("menu-pwa.js", "utf8");
const landingPwa = readFileSync("pwa.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const serviceWorkerUrl = (source) => source.match(/const SERVICE_WORKER_URL = "([^"]+)";/)?.[1];

assert(!existsSync("pairing-posters.css"), "Legacy overlay CSS must not remain in the public root");
assert(!existsSync("pairing-posters.js"), "Legacy overlay JavaScript must not remain in the public root");
assert(!existsSync("menu-stability.css"), "The cache-ambiguous legacy stability path must not remain public");
assert(!html.includes("pairing-posters"), "The menu must not load the legacy poster enhancer");
assert(html.includes('rel="manifest" href="manifest.webmanifest"'), "Menu must expose the PWA manifest declaratively");
assert(html.includes('rel="apple-touch-icon"'), "Menu must expose a stable Apple touch icon without runtime DOM mutation");
assert(html.indexOf('rel="apple-touch-icon"') < html.indexOf('src="bootstrap.js'), "Touch icon must be parsed before bootstrap to avoid duplicate injection");
assert(html.includes('rel="modulepreload" href="menu-data.js"'), "Menu data must start fetching before module execution");
assert(html.includes('rel="preload" href="src/products/cards/pairing-cool-lime-macaron.webp"'), "The first visible pairing image must be preloaded");
assert(html.includes('href="menu-premium-stability.css"'), "Menu must use the path-level premium CSS cache break");
assert(html.indexOf('src="menu-page.js"') < html.indexOf("</head>"), "Primary menu module must start loading from the document head");
assert(stability.includes("scrollbar-gutter:stable"), "Stable scrollbar geometry is required");
assert(stability.includes(".full-menu-panel--featured .full-menu-list{grid-template-columns:1fr"), "Featured pairings must use one large poster per row");
assert(stability.includes("max-width:980px"), "Showcase posters need a premium large-format width");
assert(stability.includes("aspect-ratio:1/1"), "Finished square artwork must retain its full geometry");
assert(stability.includes("object-fit:contain"), "Pairing artwork must not be cropped");
assert(stability.includes("transform:none!important"), "Legacy image zoom transforms must be neutralized");
assert(stability.includes(".full-menu-item--visual .full-menu-item-details{position:absolute!important"), "Duplicate card copy and price must be visually hidden beside finished artwork");
assert(stability.includes("clip-path:inset(50%)"), "Showcase metadata must remain available to assistive technology without visual duplication");
assert(stability.includes("@media(hover:none),(pointer:coarse)"), "Touch devices need a no-motion showcase path");
assert(stability.includes("prefers-reduced-motion:reduce"), "Reduced-motion users need a no-motion path");
assert(manifest.icons.every((icon) => !String(icon.purpose).includes("maskable")), "Non-safe-zone artwork must not claim maskable support");
assert(serviceWorkerUrl(menuPwa) === serviceWorkerUrl(landingPwa), "Landing and menu must register the same service-worker URL");
assert(serviceWorker.includes('"./menu-premium-stability.css"'), "Fresh premium CSS path must be available offline");
assert(!serviceWorker.includes('"./menu-stability.css"'), "Service worker must not cache the stale legacy CSS path");
assert(serviceWorker.includes("robys-offline-v20-20260718-premium"), "PWA cache revision must deliver the optimized assets");

console.log("✅ MENU-PREMIUM-001 passed: large poster showcase, no visible duplicate pricing, stable geometry, calm motion, path-level cache safety and synchronized PWA registration.");
