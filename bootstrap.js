document.documentElement.classList.add("js");

const ANDROID_LOGO_OBSERVER_TIMEOUT_MS = 10_000;
const ANDROID_LOGO_MAX_ATTEMPTS = 100;
const MORNING_ENTRY_SESSION_KEY = "robys-morning-entry-v2";
const MORNING_ENTRY_PREPAINT_TIMEOUT_MS = 2_600;
const MORNING_ENTRY_HARD_STOP_MS = 2_300;

function installAppleTouchIcon() {
  if (document.head.querySelector('link[rel="apple-touch-icon"]')) return;

  const link = document.createElement("link");
  link.rel = "apple-touch-icon";
  link.href = "apple-touch-icon.png?v=ios-install-20260707-1";
  document.head.append(link);
}

function installAndroidButtonLogo() {
  const placeholder = document.querySelector("#android-app .android-download-button .android-download-icon");
  if (!placeholder) return false;

  const logo = document.createElement("img");
  logo.className = "android-download-logo";
  logo.src = "src/android-mark.svg?v=20260627-2";
  logo.alt = "";
  logo.width = 20;
  logo.height = 22;
  logo.decoding = "async";
  logo.setAttribute("aria-hidden", "true");
  placeholder.replaceWith(logo);
  return true;
}

function readSessionFlag(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(key) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // Entry replay state is optional.
  }
}

function morningEntryMode() {
  const mode = new URLSearchParams(window.location.search).get("entry");
  if (mode === "off") return { enabled: false, forced: false };
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return { enabled: false, forced: false };
  }
  if (mode === "morning") return { enabled: true, forced: true };

  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  if (navigation?.type === "back_forward") return { enabled: false, forced: false };

  const hour = new Date().getHours();
  return { enabled: hour >= 5 && hour < 12, forced: false };
}

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
  return element;
}

function animateSafe(element, keyframes, options) {
  if (typeof element.animate !== "function") return Promise.resolve();
  const animation = element.animate(keyframes, options);
  return animation.finished.catch(() => undefined);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function meaningfulFrame() {
  const fontsReady = document.fonts?.ready
    ? Promise.race([document.fonts.ready, delay(420)])
    : Promise.resolve();

  return fontsReady.then(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

function emitEntryState(state, variant) {
  document.documentElement.dataset.robysEntryState = state;
  window.dispatchEvent(new CustomEvent("robys:entry-state", {
    detail: { scene: "morning", state, variant }
  }));
}

function createSplineLayer(styles, className) {
  const layer = applyStyles(document.createElement("div"), {
    position: "absolute",
    willChange: "transform, opacity",
    pointerEvents: "none",
    ...styles
  });
  layer.className = className;
  return layer;
}

function createMorningEntry() {
  const overlay = applyStyles(document.createElement("div"), {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    overflow: "hidden",
    background: "#170a08",
    opacity: "1",
    touchAction: "manipulation",
    isolation: "isolate"
  });
  overlay.className = "robys-morning-entry";
  overlay.setAttribute("aria-hidden", "true");

  const ambient = createSplineLayer({
    inset: "-18%",
    background: [
      "radial-gradient(circle at 83% 27%, rgba(255,211,148,.48), rgba(212,132,57,.18) 24%, rgba(67,24,15,0) 55%)",
      "radial-gradient(circle at 23% 82%, rgba(226,27,35,.34), rgba(110,15,20,.18) 34%, rgba(23,10,8,0) 66%)",
      "linear-gradient(150deg, #2b120d 0%, #170a08 52%, #32150e 100%)"
    ].join(","),
    opacity: "0",
    transform: "scale(1.035)"
  }, "robys-entry-ambient");

  const redSurface = createSplineLayer({
    left: "-46vw",
    bottom: "-43vh",
    width: "132vw",
    height: "112vh",
    borderRadius: "50%",
    background: [
      "radial-gradient(circle at 70% 25%, rgba(255,104,53,.58), rgba(226,27,35,.72) 22%, rgba(125,13,20,.94) 58%, rgba(45,7,9,.98) 100%)",
      "linear-gradient(120deg, #2a0809 0%, #8d1017 46%, #e21b23 70%, #40100d 100%)"
    ].join(","),
    boxShadow: [
      "inset -36px 34px 90px rgba(255,125,67,.16)",
      "inset 32px -46px 120px rgba(17,7,6,.55)",
      "0 -2px 0 rgba(255,129,62,.72)",
      "0 -22px 58px rgba(226,27,35,.16)"
    ].join(","),
    opacity: "0",
    transform: "rotate(-11deg) scale(1.08)"
  }, "robys-entry-red-surface");

  const brownRibbon = createSplineLayer({
    left: "-30vw",
    top: "-20vh",
    width: "158vw",
    height: "94vh",
    borderRadius: "50%",
    background: "linear-gradient(154deg, rgba(30,10,7,.99) 10%, rgba(64,25,15,.98) 48%, rgba(94,44,24,.96) 76%, rgba(35,12,9,.99) 100%)",
    boxShadow: [
      "inset 0 3px 0 rgba(255,205,127,.88)",
      "inset 0 18px 36px rgba(232,147,69,.12)",
      "0 18px 72px rgba(0,0,0,.38)"
    ].join(","),
    opacity: "0",
    transform: "rotate(8deg) translate3d(5vw,-2vh,0) scale(1.04)"
  }, "robys-entry-brown-ribbon");

  const goldArc = createSplineLayer({
    right: "-39vw",
    top: "-32vh",
    width: "118vw",
    height: "112vh",
    borderRadius: "50%",
    border: "2px solid rgba(255,214,146,.92)",
    background: "radial-gradient(circle at 35% 70%, rgba(255,224,170,.18), rgba(210,123,50,.08) 36%, rgba(0,0,0,0) 68%)",
    boxShadow: [
      "0 0 15px rgba(255,209,138,.54)",
      "0 0 58px rgba(221,139,60,.34)",
      "inset 0 0 52px rgba(255,211,144,.12)"
    ].join(","),
    opacity: "0",
    transform: "rotate(19deg) translate3d(4vw,-3vh,0) scale(1.08)"
  }, "robys-entry-gold-arc");

  const lightVeil = createSplineLayer({
    right: "-28%",
    top: "-18%",
    width: "72%",
    height: "142%",
    background: "linear-gradient(102deg, rgba(255,217,157,0) 4%, rgba(255,211,145,.14) 40%, rgba(255,232,190,.42) 66%, rgba(255,245,221,.68) 81%, rgba(255,217,157,0) 100%)",
    filter: "blur(34px)",
    opacity: "0",
    transform: "translate3d(11%,0,0) rotate(7deg)"
  }, "robys-entry-light-veil");

  const vignette = createSplineLayer({
    inset: "0",
    background: "radial-gradient(circle at 54% 45%, rgba(0,0,0,0) 28%, rgba(7,2,2,.14) 65%, rgba(5,2,2,.52) 100%)",
    opacity: ".85"
  }, "robys-entry-vignette");

  const logoStage = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "44%",
    width: "min(66vw, 272px)",
    transform: "translate(-50%, -42%) scale(.92)",
    opacity: "0",
    display: "grid",
    justifyItems: "center",
    gap: "14px",
    willChange: "transform, opacity",
    pointerEvents: "none"
  });
  logoStage.className = "robys-entry-logo-stage";

  const logoHalo = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "150%",
    height: "240%",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,226,180,.78) 0%, rgba(225,153,81,.36) 30%, rgba(119,54,27,.16) 52%, rgba(23,10,8,0) 74%)",
    filter: "blur(18px)",
    transform: "translate(-50%, -50%) scale(.72)",
    opacity: "0",
    zIndex: "-1"
  });

  const mark = document.createElement("img");
  mark.src = "src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4";
  mark.alt = "";
  mark.width = 42;
  mark.height = 48;
  mark.decoding = "async";
  mark.setAttribute("aria-hidden", "true");
  applyStyles(mark, {
    width: "42px",
    height: "48px",
    objectFit: "contain",
    opacity: "0",
    transform: "translateY(10px) scale(.9)",
    filter: "drop-shadow(0 8px 22px rgba(226,27,35,.18))"
  });

  const wordmark = document.createElement("img");
  wordmark.src = "src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4";
  wordmark.alt = "";
  wordmark.width = 220;
  wordmark.height = 70;
  wordmark.decoding = "async";
  wordmark.setAttribute("aria-hidden", "true");
  applyStyles(wordmark, {
    display: "block",
    width: "min(56vw, 220px)",
    height: "auto",
    objectFit: "contain",
    opacity: "0",
    transform: "translateY(12px) scale(.96)",
    filter: "drop-shadow(0 8px 28px rgba(255,224,180,.18))"
  });

  logoStage.append(logoHalo, mark, wordmark);
  overlay.append(ambient, redSurface, brownRibbon, goldArc, lightVeil, vignette, logoStage);

  return {
    overlay,
    ambient,
    redSurface,
    brownRibbon,
    goldArc,
    lightVeil,
    logoStage,
    logoHalo,
    mark,
    wordmark
  };
}

function runMorningEntry({ forced }) {
  if (!document.body || window.__robysMorningEntryAborted) return;

  const variant = forced || !readSessionFlag(MORNING_ENTRY_SESSION_KEY) ? "cold" : "warm";
  const scene = createMorningEntry();
  const {
    overlay,
    ambient,
    redSurface,
    brownRibbon,
    goldArc,
    lightVeil,
    logoStage,
    logoHalo,
    mark,
    wordmark
  } = scene;

  document.body.append(overlay);
  document.documentElement.style.visibility = "";
  document.documentElement.dataset.robysEntryScene = "morning";
  emitEntryState("brand-frame", variant);

  const cold = variant === "cold";
  const minHoldMs = cold ? 1_420 : 560;
  const exitMs = cold ? 360 : 190;
  let exiting = false;
  let canSkip = false;

  requestAnimationFrame(() => {
    animateSafe(ambient, [
      { opacity: 0, transform: "scale(1.035)" },
      { opacity: 1, transform: "scale(1)" }
    ], {
      duration: cold ? 780 : 280,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards"
    });

    animateSafe(redSurface, [
      { opacity: 0, transform: "rotate(-11deg) translate3d(-3vw,5vh,0) scale(1.08)" },
      { opacity: 1, offset: .44, transform: "rotate(-9deg) translate3d(0,1vh,0) scale(1.045)" },
      { opacity: 1, transform: "rotate(-7deg) translate3d(2vw,-1vh,0) scale(1.015)" }
    ], {
      duration: cold ? 1_360 : 520,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "forwards"
    });

    animateSafe(brownRibbon, [
      { opacity: 0, transform: "rotate(8deg) translate3d(7vw,-4vh,0) scale(1.06)" },
      { opacity: .98, transform: "rotate(5deg) translate3d(1vw,1vh,0) scale(1.01)" }
    ], {
      duration: cold ? 1_180 : 460,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards"
    });

    animateSafe(goldArc, [
      { opacity: 0, transform: "rotate(19deg) translate3d(8vw,-4vh,0) scale(1.08)" },
      { opacity: .92, offset: .58, transform: "rotate(16deg) translate3d(2vw,0,0) scale(1.02)" },
      { opacity: .68, transform: "rotate(14deg) translate3d(-1vw,2vh,0) scale(1)" }
    ], {
      duration: cold ? 1_260 : 480,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "forwards"
    });

    animateSafe(lightVeil, [
      { opacity: 0, transform: "translate3d(14%,0,0) rotate(7deg)" },
      { opacity: .82, offset: .56, transform: "translate3d(2%,0,0) rotate(5deg)" },
      { opacity: .48, transform: "translate3d(-5%,0,0) rotate(3deg)" }
    ], {
      duration: cold ? 1_180 : 420,
      delay: cold ? 120 : 40,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "forwards"
    });

    animateSafe(logoStage, [
      { opacity: 0, transform: "translate(-50%, -38%) scale(.92)" },
      { opacity: 1, transform: "translate(-50%, -42%) scale(1)" }
    ], {
      duration: cold ? 520 : 230,
      delay: cold ? 760 : 210,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards"
    });

    animateSafe(logoHalo, [
      { opacity: 0, transform: "translate(-50%, -50%) scale(.72)" },
      { opacity: .72, transform: "translate(-50%, -50%) scale(1)" }
    ], {
      duration: cold ? 620 : 260,
      delay: cold ? 700 : 180,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards"
    });

    animateSafe(mark, [
      { opacity: 0, transform: "translateY(10px) scale(.9)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ], {
      duration: cold ? 420 : 190,
      delay: cold ? 760 : 210,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards"
    });

    animateSafe(wordmark, [
      { opacity: 0, transform: "translateY(12px) scale(.96)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ], {
      duration: cold ? 500 : 210,
      delay: cold ? 880 : 260,
      easing: "cubic-bezier(.16,1,.3,1)",
      fill: "forwards"
    });
  });

  const finish = () => {
    if (exiting) return;
    exiting = true;
    emitEntryState("handoff", variant);
    writeSessionFlag(MORNING_ENTRY_SESSION_KEY);

    animateSafe(overlay, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.016)" }
    ], {
      duration: exitMs,
      easing: "cubic-bezier(.2,.7,.2,1)",
      fill: "forwards"
    }).finally(() => {
      overlay.remove();
      document.documentElement.style.visibility = "";
      document.documentElement.style.backgroundColor = "";
      document.documentElement.dataset.robysEntryState = "done";
    });
  };

  window.setTimeout(() => {
    canSkip = true;
  }, cold ? 360 : 180);

  overlay.addEventListener("pointerdown", () => {
    if (canSkip) finish();
  }, { passive: true });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") finish();
  }, { once: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finish();
  }, { once: true });

  window.setTimeout(finish, MORNING_ENTRY_HARD_STOP_MS);
  Promise.all([delay(minHoldMs), meaningfulFrame()]).then(finish);
}

installAppleTouchIcon();

const entryMode = morningEntryMode();
if (entryMode.enabled) {
  window.__robysMorningEntryAborted = false;
  document.documentElement.style.visibility = "hidden";
  document.documentElement.style.backgroundColor = "#170a08";

  window.setTimeout(() => {
    const overlay = document.querySelector(".robys-morning-entry");
    if (!overlay) window.__robysMorningEntryAborted = true;
    document.documentElement.style.visibility = "";
    document.documentElement.style.backgroundColor = "";
    overlay?.remove();
  }, MORNING_ENTRY_PREPAINT_TIMEOUT_MS);

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => runMorningEntry(entryMode), { once: true })
    : runMorningEntry(entryMode);
}

if (!installAndroidButtonLogo()) {
  let attempts = 0;
  let timeoutId;
  const observer = new MutationObserver(() => {
    attempts += 1;
    if (installAndroidButtonLogo() || attempts >= ANDROID_LOGO_MAX_ATTEMPTS) {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  timeoutId = window.setTimeout(() => observer.disconnect(), ANDROID_LOGO_OBSERVER_TIMEOUT_MS);
}
