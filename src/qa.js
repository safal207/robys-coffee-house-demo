const q = selector => document.querySelector(selector);
const HERO_VIDEO = "src/robys-ambience-clean.mp4?v=20260711-1";
const HERO_BALANCE_STYLES = "hero-balance.css?v=20260622-1";
const enhancementEvents = ["pointerover", "pointerdown", "keydown", "focusin"];

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
    if (!document.hidden && !video.ended) window.setTimeout(retryPlayback, 180);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) retryPlayback();
  });
  window.addEventListener("pointerdown", retryPlayback, { once: true, passive: true });

  video.load();
  retryPlayback();
}

function scheduleHeroPlayback() {
  enableHeroVideo();
}

function applyImmediateA11yFixes() {
  document.documentElement.style.setProperty("--ruby", "#b24753");

  document.querySelectorAll(".brand").forEach(link => link.removeAttribute("aria-label"));
  q(".map-live-link")?.removeAttribute("aria-label");

  q(".back-top")?.setAttribute("aria-label", "↑ Back to top");
}

let enhancementsPromise;
function loadQaEnhancements() {
  if (enhancementsPromise) return;
  enhancementsPromise = import("./qa-enhancements.js?v=d960d8ca4a45").then(({ initQaEnhancements }) => {
    initQaEnhancements();
    for (const type of enhancementEvents)
      window.removeEventListener(type, loadQaEnhancements);
  }).catch(() => { enhancementsPromise = null; });
}

function initQa() {
  ensureHeroBalanceStyles();
  scheduleHeroPlayback();
  applyImmediateA11yFixes();
  for (const type of enhancementEvents)
    window.addEventListener(type, loadQaEnhancements, { passive: type.startsWith("pointer") });
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", initQa, { once: true })
  : initQa();
