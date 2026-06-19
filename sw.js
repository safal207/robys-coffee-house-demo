const CACHE_NAME = "robys-world-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./refresh.html",
  "./styles.css",
  "./premium.css",
  "./responsive.css",
  "./gallery.css",
  "./reviews.css",
  "./map.css",
  "./optimizations.css",
  "./world-class.css",
  "./app.js",
  "./src/i18n.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const direct = await caches.match(request);
        if (direct) return direct;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
