const CACHE_VERSION = "robys-offline-v39-20260809-premium-optics-v23-78efd00b201f-fac98685082e-08a6bd177dd9-1187a820476c-6f094d839b47-25fd84b39b59-a0686de99563-d27720e5102f-76a94cbbe8a3-02776b67594c-519d029e4825-3719610b1f4e-07d31353dd2a-83cb209e0175";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./menu.html",
  "./discover.html",
  "./404.html",
  "./manifest.webmanifest",
  "./mobile-install-copy.json",
  "./mobile-install.js",
  "./offline.css",
  "./pwa.js",
  "./android-download.js",
  "./android-app.css",
  "./mobile-install.css",
  "./styles.css",
  "./mobile.css",
  "./home-menu-entry.css?v=a0686de99563",
  "./conversion.css",
  "./final-qa.css",
  "./social-offer.css?v=d27720e5102f",
  "./menu-runtime.css?v=6f094d839b47",
  "./menu-stability.css",
  "./menu-security.css",
  "./discover.css",
  "./discover-rotation.css?v=08a6bd177dd9",
  "./wordmark-responsive.css?v=20260704-1",
  "./brand-photo-logo.css?v=20260726-approved-v4",
  "./src/brand/robys-primary-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-header-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4",
  "./bootstrap.js",
  "./android-handoff.js",
  "./morning-entry.js",
  "./day-night-entry.js?v=20260809-premium-optics-v23",
  "./app.js",
  "./home-menu-entry.js?v=25fd84b39b59",
  "./conversion.js",
  "./menu-ready.js",
  "./menu-runtime.js?v=1187a820476c",
  "./menu-pwa.js",
  "./menu-actions.js",
  "./discover-runtime.js?v=78efd00b201f",
  "./discover-rotation.js",
  "./discover-rotation-v2.js",
  "./discover-rotation-v3.js?v=fac98685082e",
  "./src/brand/robys-organic-ring.svg?v=20260720-1",
  "./src/pairings-data/approved/iced-san-sebastian-hq.png",
  "./src/products/cards/pairing-iced-san-sebastian.webp",
  "./src/pairings-data/final/iced-san-sebastian.webp.b64.txt",
  "./icon.svg",
  "./icon-maskable.svg",
  "./apple-touch-icon.png",
  "./src/android-mark.svg",
  "./src/robys-hero-poster.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_VERSION);
  const url = new URL(request.url);
  const requiresExactRevision =
    url.pathname.endsWith("/day-night-entry.js") ||
    url.pathname.endsWith("/discover-runtime.js") ||
    url.pathname.endsWith("/discover-rotation-v3.js") ||
    url.pathname.endsWith("/discover-rotation.css") ||
    url.pathname.endsWith("/menu-runtime.js") ||
    url.pathname.endsWith("/menu-runtime.css") ||
    url.pathname.endsWith("/home-menu-entry.js") ||
    url.pathname.endsWith("/home-menu-entry.css") ||
    url.pathname.endsWith("/social-offer.css") ||
    url.pathname.endsWith("/smart-choice/app-runtime.js") ||
    url.pathname.endsWith("/smart-choice/cart-runtime.js") ||
    url.pathname.endsWith("/smart-choice/experiments-runtime.js") ||
    url.pathname.endsWith("/smart-choice/analytics-runtime.js") ||
    url.pathname.endsWith("/smart-choice/decision-trace-runtime.js") ||
    url.pathname.endsWith("/smart-choice/simulator-runtime.js") ||
    url.pathname.endsWith("/qa.js") ||
    url.pathname.endsWith("/src/robys-ambience-clean.mp4") ||
    url.pathname.endsWith("/wordmark-responsive.css") ||
    url.pathname.endsWith("/brand-photo-logo.css") ||
    url.pathname.endsWith("/src/brand/robys-primary-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-header-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-compact-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-mark-master-v1.svg") ||
    url.pathname.endsWith("/src/brand/robys-organic-ring.svg");
  if (requiresExactRevision) {
    return cache.match(request);
  }
  return cache.match(request, { ignoreSearch: true });
}

async function runtimeAssetResponse(request) {
  const cached = await cachedResponse(request);
  if (cached) return cached;

  const network = await fetch(request);
  if (network.ok) {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, network.clone()).catch(() => {});
  }
  return network;
}

async function cachedPage(name) {
  return (await cachedResponse(new Request(new URL(name, self.registration.scope)))) || Response.error();
}

async function navigationResponse(request) {
  const url = new URL(request.url);
  const isMenu = url.pathname.endsWith("/menu.html");
  const isDiscover = url.pathname.endsWith("/discover.html");
  const isHome = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");

  try {
    const network = await fetch(request);
    if (network.ok) {
      if (isMenu || isDiscover || isHome) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, network.clone()).catch(() => {});
      }
      return network;
    }
  } catch {
    // Fall through to a deterministic cached page.
  }

  if (isMenu) return cachedPage("menu.html");
  if (isDiscover) return cachedPage("discover.html");
  if (isHome) return cachedPage("index.html");
  return cachedPage("404.html");
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(navigationResponse(event.request));
    return;
  }

  event.respondWith(runtimeAssetResponse(event.request));
});
