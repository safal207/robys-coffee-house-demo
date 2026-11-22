// Extra safety enhancements activate at the same first user gesture.
const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const FALLBACK_IMAGE = "src/robys-hero-poster.jpg";
function setupExternalLinks() {
  qa('a[target="_blank"]').forEach((link) => {
    const rel = new Set((link.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
    rel.add("noopener");
    rel.add("noreferrer");
    link.setAttribute("rel", Array.from(rel).join(" "));
  });
}

function registerImage(image) {
  if (image.dataset.qaReady === "true") return;
  image.dataset.qaReady = "true";

  image.addEventListener("error", () => {
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.classList.add("is-fallback");
    image.closest(".gallery-card")?.classList.add("image-fallback");
    image.src = FALLBACK_IMAGE;
    window.robysAnalytics?.track?.("image_fallback", {
      placement: image.closest(".gallery-section") ? "gallery" : "page"
    });
  });
}

function setupImageFallbacks() {
  qa("img").forEach(registerImage);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches("img")) registerImage(node);
        qa("img", node).forEach(registerImage);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
}

setupExternalLinks();
setupImageFallbacks();
