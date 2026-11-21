const doc = document; // Shared DOM reference keeps first-paint JS compact.
const q = selector => doc.querySelector(selector);
const HERO_VIDEO = "src/robys-ambience-clean.mp4?v=20260711-1";
const HERO_BALANCE_STYLES = "hero-balance.css?v=20260622-1";
const events = ["pointerover", "pointerdown", "keydown", "focusin"];

function ensureHeroBalanceStyles() {
  if (q('link[data-hero-balance="true"]')) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = HERO_BALANCE_STYLES;
  link.dataset.heroBalance = "true";
  doc.head.append(link);
}

// Below-the-fold sections must not hold up the header and initial hero paint.
// Print-media stylesheets still fetch normally and become active once loaded.
function activateDeferredHomeStyles() {
  for (const link of doc.querySelectorAll('link[data-deferred-style="home-below-fold"]')) {
    const activate = () => { link.media = "all"; };
    if (link.sheet) activate();
    else link.addEventListener("load", activate, { once: true });
  }
}

function requestHeroPlayback(video) {
  if (!video || doc.hidden) return;

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
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const video = q(".hero-video");
  const source = video?.querySelector("source");
  if (!source) return;

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
    if (!doc.hidden && !video.ended) window.setTimeout(retryPlayback, 180);
  });
  doc.addEventListener("visibilitychange", () => {
    if (!doc.hidden) retryPlayback();
  });
  window.addEventListener("pointerdown", retryPlayback, { once: true, passive: true });

  video.load();
  retryPlayback();
}

function scheduleHeroPlayback() {
  enableHeroVideo();
}

function applyImmediateA11yFixes() {
  doc.documentElement.style.setProperty("--ruby", "#b24753");

  doc.querySelectorAll(".brand").forEach(link => link.removeAttribute("aria-label"));
  q(".map-live-link")?.removeAttribute("aria-label");

  q(".back-top")?.setAttribute("aria-label", "↑ Back to top");
}

let enhancementsPromise;
function loadQaEnhancements() {
  if (enhancementsPromise) return;
  enhancementsPromise = import("./qa-enhancements.js?v=d960d8ca4a45").then(({ initQaEnhancements }) => {
    initQaEnhancements();
    for (const type of events)
      window.removeEventListener(type, loadQaEnhancements);
  }).catch(() => { enhancementsPromise = null; });
}

function initQa() {
  activateDeferredHomeStyles();
  ensureHeroBalanceStyles();
  scheduleHeroPlayback();
  applyImmediateA11yFixes();
  for (const type of events)
    window.addEventListener(type, loadQaEnhancements, { passive: type[0] === "p" });
}

doc.readyState === "loading"
  ? doc.addEventListener("DOMContentLoaded", initQa, { once: true })
  : initQa();
