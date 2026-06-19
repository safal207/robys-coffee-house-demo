const CACHE_NAME = "robys-napkin-v1";
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
  "./ruby-theme.css",
  "./brand-cup.css",
  "./mobile-polish.css",
  "./hero-mobile-fix.css",
  "./napkin-style.css",
  "./app.js",
  "./hero-video.js",
  "./src/i18n.js",
  "./src/robys-hero-mobile-lite.mp4",
  "./src/robys-hero-poster.jpg",
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
