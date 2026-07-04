const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const eventBuffer = [];

const pairingCtaCopy = {
  tr: "Bugünün Eşleşmesini Gör",
  en: "See Today's Pairing",
  ru: "Смотреть сочетание дня"
};

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

window.robysAnalytics = {
  track,
  events: () => [...eventBuffer],
  clear: () => { eventBuffer.length = 0; }
};

function updateHeroPairingCta() {
  const cta = q(".hero-actions .button-primary");
  if (!cta) return;

  cta.href = "menu.html#pairing-offers";
  cta.removeAttribute("target");
  cta.removeAttribute("rel");
  cta.removeAttribute("data-i18n");
  cta.dataset.localized = "";
  cta.dataset.tr = pairingCtaCopy.tr;
  cta.dataset.en = pairingCtaCopy.en;
  cta.dataset.ru = pairingCtaCopy.ru;
  cta.dataset.analyticsAction = "pairing_click";

  const language = document.documentElement.lang || "tr";
  cta.textContent = pairingCtaCopy[language] || pairingCtaCopy.tr;
}

updateHeroPairingCta();
new MutationObserver(updateHeroPairingCta).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"]
});

function setupClicks() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link) {
      const href = link.href || "";
      const analyticsAction = link.dataset.analyticsAction;
      if (analyticsAction) track(analyticsAction, { placement: placementFor(link) });
      if (href.includes("google.com/maps")) track("route_click", { placement: placementFor(link) });
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
