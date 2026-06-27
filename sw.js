const CACHE_NAME = "robys-offline-20260627-1";
const OFFLINE_ASSETS = [
  "./menu.html",
  "./404.html",
  "./offline.css",
  "./bootstrap.js",
  "./styles.css",
  "./menu.css",
  "./menu-stability.css",
  "./menu-security.css",
  "./menu-bootstrap.js",
  "./menu-ready.js",
  "./menu-page.js",
  "./menu-data.js",
  "./menu-search-clear.js",
  "./menu-actions.js",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      if (url.pathname.endsWith("/menu.html")) return cache.match("./menu.html");
      return cache.match("./404.html");
    }));
    return;
  }

  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)));
});
