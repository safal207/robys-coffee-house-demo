"use strict";

// Pin approved Roby's routes at DOM ready, without a location request.
// The map/GPS controller is downloaded only as the visit section approaches.
(() => {
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("a[data-route-link]").forEach(link => {
      const route = new URL(link.href);
      if (route.hostname !== "www.google.com" ||
          route.pathname !== "/maps/dir/" ||
          route.searchParams.get("destination") !== "Roby's Coffee House Gazipasa") return;
      route.searchParams.set("destination_place_id", "ChIJpdkfSnH13BQRAEJUSGpYxNg");
      link.href = route.href;
    });
    const visit = document.querySelector("#visit");
    if (!visit) return;
    const load = () => import("./map-route-controller.js?v=7dd8867e875e");
    if (!window.IntersectionObserver) {
      load();
      return;
    }
    const observer = new IntersectionObserver((entries, observer) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: "250px" });
    observer.observe(visit);
  }, { once: true });
})();
