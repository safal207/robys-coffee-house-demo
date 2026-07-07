const CACHE_VERSION = "robys-offline-v16-20260707-ios-install-10750cdfa32c-58d387ca0c01-96b566c9731e";
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
  "./bootstrap.js",
  "./app.js",
  "./conversion.js",
  "./menu-bootstrap.js",
  "./menu-ready.js",
  "./menu-page.js",
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
  "./src/pairings-data/final/cool-lime-macaron-hq.webp",
  "./src/pairings-data/approved/iced-san-sebastian-hq.png",
  "./src/pairings-data/final/cool-lime-macaron.webp.b64.txt",
  "./src/pairings-data/final/iced-san-sebastian.webp.b64.txt",
  "./icon.svg",
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
    url.pathname.endsWith("/wordmark-responsive.css");
  if (requiresExactRevision) {
    return cache.match(request);
  }
  return cache.match(request, { ignoreSearch: true });
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
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await cachedResponse(request);
    if (cached) return cached;

    try {
      const network = await fetch(request);
      if (network.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, network.clone()).catch(() => {});
      }
      return network;
    } catch {
      return Response.error();
    }
  })());
});
