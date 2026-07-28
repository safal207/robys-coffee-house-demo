const CACHE_VERSION = "robys-offline-v30-20260727-platform-install-cta-10750cdfa32c-58d387ca0c01-96b566c9731e";
const APK_PARTS = Array.from({ length: 6 }, (_, index) => `./downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`);
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
  "./conversion.css",
  "./final-qa.css",
  "./social-offer.css",
  "./menu.css",
  "./menu-stability.css",
  "./menu-security.css",
  "./discover.css",
  "./discover-rotation.css?v=96b566c9731e",
  "./wordmark-responsive.css?v=20260704-1",
  "./brand-photo-logo.css?v=20260726-approved-v4",
  "./src/brand/robys-primary-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-header-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4",
  "./src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4",
  "./bootstrap.js",
  "./app.js",
  "./conversion.js",
  "./menu-ready.js",
  "./menu-page.js",
  "./menu-pwa.js",
  "./menu-data.js",
  "./menu-search-clear.js",
  "./menu-actions.js",
  "./discover.js",
  "./discover-v2.js?v=10750cdfa32c",
  "./discover-copy.js",
  "./discover-journeys.js",
  "./discover-journeys-v2.js",
  "./discover-rotation.js",
  "./discover-rotation-v2.js",
  "./discover-rotation-v3.js?v=58d387ca0c01",
  "./src/brand/robys-organic-ring.svg?v=20260720-1",
  "./src/pairings-data/final/cool-lime-macaron-hq.webp",
  "./src/pairings-data/approved/iced-san-sebastian-hq.png",
  "./src/products/cards/pairing-cool-lime-macaron.webp",
  "./src/products/cards/pairing-iced-san-sebastian.webp",
  "./src/pairings-data/final/cool-lime-macaron.webp.b64.txt",
  "./src/pairings-data/final/iced-san-sebastian.webp.b64.txt",
  "./icon.svg",
  "./icon-maskable.svg",
  "./apple-touch-icon.png",
  "./src/android-mark.svg",
  "./src/robys-hero-poster.jpg",
  ...APK_PARTS
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
    url.pathname.endsWith("/discover-v2.js") ||
    url.pathname.endsWith("/discover-rotation-v3.js") ||
    url.pathname.endsWith("/discover-rotation.css") ||
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
