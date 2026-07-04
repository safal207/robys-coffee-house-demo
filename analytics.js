const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const eventBuffer = [];
let visitAttributionPromise = null;

function placementFor(node) {
  if (node.closest(".mobile-cta")) return "mobile_dock";
  if (node.closest(".hero")) return "hero";
  if (node.closest("#visit")) return "visit";
  if (node.closest(".gallery-section")) return "gallery";
  return node.closest("section[id]")?.id || "page";
}

function track(action, details = {}) {
  const payload = {
    event: "robys_action",
    action,
    language: document.documentElement.lang || "tr",
    path: location.pathname,
    ...details
  };

  eventBuffer.push(payload);
  if (eventBuffer.length > 100) eventBuffer.shift();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  document.dispatchEvent(new CustomEvent("robys:analytics", { detail: payload }));
}

function loadVisitAttribution() {
  if (window.robysVisitAttribution) {
    return Promise.resolve(window.robysVisitAttribution);
  }
  if (visitAttributionPromise) return visitAttributionPromise;

  visitAttributionPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "visit-attribution.js?v=20260704-1";
    script.async = true;
    script.addEventListener("load", () => {
      if (window.robysVisitAttribution) resolve(window.robysVisitAttribution);
      else reject(new Error("Visit attribution API unavailable"));
    }, { once: true });
    script.addEventListener("error", () => {
      visitAttributionPromise = null;
      reject(new Error("Visit attribution runtime failed to load"));
    }, { once: true });
    document.head.append(script);
  });

  return visitAttributionPromise;
}

window.robysAnalytics = {
  track,
  events: () => [...eventBuffer],
  clear: () => { eventBuffer.length = 0; }
};
window.robysLoadVisitAttribution = loadVisitAttribution;

function setupClicks() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link) {
      const href = link.href || "";
      if (href.includes("google.com/maps")) {
        const placement = placementFor(link);
        track("route_click", { placement });
        void loadVisitAttribution()
          .then((api) => {
            const result = api.recordVisitIntent(placement);
            track("visit_intent_created", {
              placement,
              campaign_token: result.intent.campaignToken,
              measurement_plan_ref: api.contract.measurementPlanRef,
              persisted: result.persisted
            });
          })
          .catch(() => {
            track("visit_intent_unavailable", { placement });
          });
      }
      if (href.includes("instagram.com")) track("instagram_click", { placement: placementFor(link) });
    }

    const languageButton = event.target.closest(".lang-button");
    if (languageButton) {
      track("language_select", {
        placement: "header",
        selected_language: languageButton.dataset.lang || "unknown"
      });
    }

    const galleryCard = event.target.closest(".gallery-card");
    if (galleryCard) {
      track("gallery_open", {
        placement: "gallery",
        image_index: Math.max(0, qa(".gallery-card").indexOf(galleryCard))
      });
    }
  });
}

function setupSectionViews() {
  if (!("IntersectionObserver" in window)) return;
  const seen = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.35 || seen.has(entry.target.id)) return;
      seen.add(entry.target.id);
      track("section_view", { placement: entry.target.id });
      observer.unobserve(entry.target);
    });
  }, { threshold: [0.35] });
  qa("#about,#menu,#gallery,#visit").forEach((section) => observer.observe(section));
}

let initialized = false;
function initAnalytics() {
  if (initialized) return;
  initialized = true;
  setupClicks();
  setupSectionViews();
}

window.addEventListener("pointerdown", initAnalytics, { once: true, passive: true });
window.addEventListener("keydown", initAnalytics, { once: true });
window.addEventListener("scroll", initAnalytics, { once: true, passive: true });
