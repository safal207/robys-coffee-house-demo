"use strict";

// One-time cache repair for the featured gallery interaction shipped on 2026-09-16.
// The legacy worker intentionally ignores query strings for most runtime assets,
// so remove only the old gallery script while preserving the rest of the offline cache.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map(async (name) => {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          await Promise.all(
            requests
              .filter((request) => new URL(request.url).pathname.endsWith("/featured-gallery.js"))
              .map((request) => cache.delete(request))
          );
        })
      )
    )
  );
});

importScripts("./sw-core-v64.js");
