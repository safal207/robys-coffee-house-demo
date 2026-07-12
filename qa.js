const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const FALLBACK_IMAGE = "src/robys-hero-poster.jpg";
const HERO_VIDEO = "src/robys-ambience-clean.mp4?v=20260711-1";
const HERO_BALANCE_STYLES = "hero-balance.css?v=20260622-1";

function ensureHeroBalanceStyles() {
  if (document.querySelector('link[data-hero-balance="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = HERO_BALANCE_STYLES;
  link.dataset.heroBalance = "true";
  document.head.append(link);
}

function requestHeroPlayback(video) {
  if (!video || document.hidden) return;

  const playback = video.play();
  if (!playback || typeof playback.then !== "function") return;

  playback
    .then(() => {
      video.classList.add("is-playing");
      video.dataset.playbackState = "playing";
    })
    .catch(() => {
      video.classList.remove("is-playing");
      video.dataset.playbackState = "blocked";
    });
}

function enableHeroVideo() {
  const video = q(".hero-video");
  const source = video ? q("source", video) : null;
  if (!video || !source) return;

  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  source.removeAttribute("media");
  source.src = HERO_VIDEO;

  const retryPlayback = () => requestHeroPlayback(video);

  video.addEventListener("loadeddata", retryPlayback, { once: true });
  video.addEventListener("canplay", retryPlayback);
  video.addEventListener("pause", () => {
    if (!document.hidden && !video.ended) window.setTimeout(retryPlayback, 180);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) retryPlayback();
  });
  window.addEventListener("pointerdown", retryPlayback, { once: true, passive: true });

  video.load();
  retryPlayback();
}

function applyImmediateA11yFixes() {
  document.documentElement.style.setProperty("--ruby", "#b24753");

  qa(".brand").forEach((link) => link.removeAttribute("aria-label"));
  q(".map-live-link")?.removeAttribute("aria-label");

  const backTop = q(".back-top");
  if (backTop) backTop.setAttribute("aria-label", "↑ Back to top");
}

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

function setupLightboxAccessibility() {
  let lightbox;
  const background = [".site-header", "main", ".site-footer", ".mobile-cta"];

  const setInert = (value) => {
    background.forEach((selector) => {
      const node = q(selector);
      if (!node) return;
      if (value) node.setAttribute("inert", "");
      else node.removeAttribute("inert");
    });
  };

  const attach = (node) => {
    if (!node || node.dataset.qaA11y === "true") return;
    node.dataset.qaA11y = "true";
    lightbox = node;

    new MutationObserver(() => {
      setInert(node.classList.contains("is-open"));
    }).observe(node, { attributes: true, attributeFilter: ["class"] });
  };

  attach(q(".lightbox"));
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches(".lightbox")) attach(node);
        else attach(q(".lightbox", node));
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !lightbox?.classList.contains("is-open")) return;
    const focusable = qa('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])', lightbox);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

let enhanced = false;
function initQaEnhancements() {
  if (enhanced) return;
  enhanced = true;
  setupExternalLinks();
  setupImageFallbacks();
  setupLightboxAccessibility();
}

function initQa() {
  ensureHeroBalanceStyles();
  enableHeroVideo();
  applyImmediateA11yFixes();
  window.addEventListener("pointerdown", initQaEnhancements, { once: true, passive: true });
  window.addEventListener("keydown", initQaEnhancements, { once: true });
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", initQa, { once: true })
  : initQa();
