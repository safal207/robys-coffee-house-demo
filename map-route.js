"use strict";

// Pin every ordinary route link immediately, including the mobile dock.
// Defer the permission and third-party map controller until the visit area
// approaches the viewport. No location lookup or map request runs here.
(() => {
  for (const link of document.querySelectorAll("a[data-route-link]")) {
    const url = new URL(link.href);
    if (url.protocol !== "https:" || url.hostname !== "www.google.com" ||
        url.pathname !== "/maps/dir/" ||
        url.searchParams.get("destination") !== "Roby's Coffee House Gazipasa") continue;
    url.searchParams.set("destination_place_id", "ChIJpdkfSnH13BQRAEJUSGpYxNg");
    link.href = url.href;
  }
  const visit = document.querySelector("#visit");
  if (!visit) return; // Menu surfaces need pinned anchor links only.
  const load = () => import("./map-route-controller.js?v=7dd8867e875e");
  if (!("IntersectionObserver" in window)) {
    load();
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  }, { rootMargin: "250px 0px" });
  observer.observe(visit);
})();
