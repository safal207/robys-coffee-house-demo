const CACHE_VERSION = "robys-offline-v2-20260627";
const APK_PARTS = Array.from({ length: 6 }, (_, index) => `./downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`);
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./menu.html",
  "./404.html",
  "./offline.css",
  "./pwa.js",
  "./android-download.js",
  "./android-app.css",
  "./styles.css",
  "./mobile.css",
  "./conversion.css",
  "./final-qa.css",
  "./menu.css",
  "./menu-stability.css",
  "./menu-security.css",
  "./bootstrap.js",
  "./app.js",
  "./conversion.js",
  "./menu-bootstrap.js",
  "./menu-ready.js",
  "./menu-page.js",
  "./menu-data.js",
  "./menu-search-clear.js",
  "./icon.svg",
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
  return cache.match(request, { ignoreSearch: true });
}

async function navigationResponse(request) {
  const url = new URL(request.url);
  const isMenu = url.pathname.endsWith("/menu.html");
  const isHome = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");

  try {
    const network = await fetch(request);
    if (network.ok && (isMenu || isHome)) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, network.clone()).catch(() => {});
    }
    return network;
  } catch {
    if (isMenu) return (await cachedResponse(new Request(new URL("menu.html", self.registration.scope)))) || Response.error();
    if (isHome) return (await cachedResponse(new Request(new URL("index.html", self.registration.scope)))) || Response.error();
    return (await cachedResponse(new Request(new URL("404.html", self.registration.scope)))) || Response.error();
  }
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
