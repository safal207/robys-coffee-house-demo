"use strict";

const PAIRING_PREVIEW_PATH = "/src/products/sets-v1/iced-san-sebastian-pairing-preview.mp4";

// Activate this repair immediately so returning visitors do not keep serving
// previous gallery media or retired installer assets from runtime caches.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map(async (name) => {
            const cache = await caches.open(name);
            const requests = await cache.keys();
            await Promise.all(
              requests
                .filter((request) => {
                  const path = new URL(request.url).pathname;
                  return path.endsWith("/featured-gallery.js") ||
                    path.endsWith("/android-app.css") ||
                    path.endsWith("/mobile-install.js") ||
                    path.endsWith("/mobile-install.css") ||
                    path.endsWith("/mobile-install-copy.json") ||
                    path.endsWith("/android-handoff.js") ||
                    path.endsWith("/manifest.webmanifest") ||
                    path.endsWith("/icon-maskable.svg") ||
                    path.endsWith("/apple-touch-icon.png") ||
                    /\/downloads\/android-v1\.2\/part-\d+\.b64$/.test(path) ||
                    /\/downloads\/robys-coffee-house(?:-v[\d.]+)?\.apk$/.test(path) ||
                    path.endsWith(PAIRING_PREVIEW_PATH);
                })
                .map((request) => cache.delete(request))
            );
          })
        )
      ),
      self.clients.claim()
    ])
  );
});

// HTML5 video players use byte-range requests on mobile browsers. Let the browser fetch this
// media directly instead of routing those requests through the legacy cache-first layer.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.endsWith(PAIRING_PREVIEW_PATH)) return;

  event.stopImmediatePropagation();
  event.respondWith(fetch(event.request, { cache: "no-store" }));
});

importScripts("./sw-core-v64.js");
