const MORNING_ENTRY_SESSION_KEY = "robys-morning-entry-v2";
const MORNING_ENTRY_HARD_STOP_MS = 2_300;

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
    top: "45%",
    width: "min(72vw, 296px)",
    transform: "translate(-50%, -38%) scale(.9)",
    opacity: "0",
    display: "grid",
    justifyItems: "center",
    gap: "12px",
    isolation: "isolate",
    willChange: "transform, opacity",
    pointerEvents: "none"
  });
  logoStage.className = "robys-entry-logo-stage";

  const logoHalo = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "52%",
    width: "164%",
    height: "254%",
    borderRadius: "50%",
    background: "radial-gradient(ellipse at center, rgba(255,217,157,.5) 0%, rgba(226,151,78,.3) 34%, rgba(112,48,24,.12) 58%, rgba(23,10,8,0) 76%)",
    filter: "blur(20px)",
    transform: "translate(-50%, -50%) scale(.68)",
    opacity: "0",
    zIndex: "0"
  });
  logoHalo.className = "robys-entry-logo-halo";

  const logoFocus = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "58%",
    width: "118%",
    height: "132%",
    borderRadius: "50%",
    background: "radial-gradient(ellipse at center, rgba(255,242,218,.92) 0%, rgba(255,224,181,.72) 30%, rgba(211,132,67,.34) 52%, rgba(77,28,16,.08) 72%, rgba(23,10,8,0) 84%)",
    filter: "blur(16px)",
    transform: "translate(-50%, -50%) scale(.66)",
    opacity: "0",
    zIndex: "1"
  });
  logoFocus.className = "robys-entry-logo-focus";

  const mark = document.createElement("img");
  mark.src = "src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4";
  mark.alt = "";
  mark.width = 46;
  mark.height = 53;
  mark.decoding = "async";
  mark.setAttribute("aria-hidden", "true");
  applyStyles(mark, {
    position: "relative",
    zIndex: "2",
    width: "46px",
    height: "53px",
    objectFit: "contain",
    opacity: "0",
    transform: "translateY(14px) scale(.82)",
    filter: "drop-shadow(0 8px 22px rgba(226,27,35,.2))"
  });

  const wordmark = document.createElement("img");
  wordmark.src = "src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4";
  wordmark.alt = "";
  wordmark.width = 230;
  wordmark.height = 72;
  wordmark.decoding = "async";
  wordmark.setAttribute("aria-hidden", "true");
  applyStyles(wordmark, {
    position: "relative",
    zIndex: "2",
    display: "block",
    width: "min(60vw, 230px)",
    height: "auto",
    objectFit: "contain",
    opacity: "0",
    transform: "translateY(14px) scale(.95)",
    filter: "drop-shadow(0 1px 0 rgba(255,247,235,.12)) drop-shadow(0 8px 20px rgba(0,0,0,.18))"
  });

  logoStage.append(logoHalo, logoFocus, mark, wordmark);
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
    logoFocus,
    mark,
    wordmark
  };
}

const MOTION_POSE_COUNT = 20;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mix(from, to, progress) {
  return from + (to - from) * progress;
}

function smoothPose(progress) {
  const t = clamp01(progress);
  return t * t * (3 - 2 * t);
}

function phase(progress, start, end) {
  if (end <= start) return progress >= end ? 1 : 0;
  return smoothPose((progress - start) / (end - start));
}

function poseSeries(factory) {
  return Array.from({ length: MOTION_POSE_COUNT }, (_, index) => {
    const offset = index / (MOTION_POSE_COUNT - 1);
    return { offset, ...factory(offset) };
  });
}

function peak(progress, start, peakAt, end, peakValue, endValue) {
  if (progress <= start) return 0;
  if (progress <= peakAt) return peakValue * phase(progress, start, peakAt);
  return mix(peakValue, endValue, phase(progress, peakAt, end));
}

function runMorningEntry({ forced }) {
  if (!document.body || window.__robysMorningEntryAborted) return;

  const variant = !readSessionFlag(MORNING_ENTRY_SESSION_KEY) ? "cold" : "warm";
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
    logoFocus,
    mark,
    wordmark
  } = scene;

  document.body.append(overlay);
  document.documentElement.style.visibility = "";
  document.documentElement.dataset.robysEntryScene = "morning";
  document.documentElement.dataset.robysEntryPoseCount = String(MOTION_POSE_COUNT);
  document.documentElement.dataset.robysEntryBrandReveal = "integrated-v1";
  emitEntryState("brand-frame", variant);

  const cold = variant === "cold";
  const minHoldMs = cold ? 1_420 : 560;
  const exitMs = cold ? 360 : 190;
  let exiting = false;
  let canSkip = false;

  requestAnimationFrame(() => {
    const duration = cold ? 1_420 : 560;

    animateSafe(ambient, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .7, 1);
      return {
        opacity: phase(t, 0, .34) * mix(1, .9, settle),
        transform: `scale(${mix(1.035, .998, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(redSurface, poseSeries((t) => {
      const p = smoothPose(t);
      const lift = Math.sin(Math.PI * t) * .28;
      const settle = phase(t, .7, 1);
      return {
        opacity: phase(t, 0, .2) * mix(1, .82, settle),
        transform: `rotate(${mix(-11, -6.5, p).toFixed(3)}deg) translate3d(${mix(-3, 2.4, p).toFixed(3)}vw,${(mix(5, -1.5, p) - lift).toFixed(3)}vh,0) scale(${mix(1.08, .998, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(brownRibbon, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .72, 1);
      return {
        opacity: .98 * phase(t, .03, .28) * mix(1, .86, settle),
        transform: `rotate(${mix(8, 4.7, p).toFixed(3)}deg) translate3d(${mix(7, .6, p).toFixed(3)}vw,${mix(-4, 1.4, p).toFixed(3)}vh,0) scale(${mix(1.06, 1.004, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(goldArc, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: peak(t, .05, .54, 1, .94, .42),
        transform: `rotate(${mix(19, 13.5, p).toFixed(3)}deg) translate3d(${mix(8, -1.5, p).toFixed(3)}vw,${mix(-4, 2.4, p).toFixed(3)}vh,0) scale(${mix(1.08, .995, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(lightVeil, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: peak(t, .08, .52, 1, .84, .32),
        transform: `translate3d(${mix(14, -6, p).toFixed(3)}%,0,0) rotate(${mix(7, 2.6, p).toFixed(3)}deg)`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(logoStage, poseSeries((t) => {
      const p = phase(t, .46, .78);
      return {
        opacity: p,
        transform: `translate(-50%, ${mix(-34, -42, p).toFixed(3)}%) scale(${mix(.9, 1, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(logoHalo, poseSeries((t) => {
      const rise = phase(t, .4, .7);
      const settle = phase(t, .78, 1);
      return {
        opacity: mix(0, .78, rise) * mix(1, .78, settle),
        transform: `translate(-50%, -50%) scale(${mix(.68, 1.04, rise).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(logoFocus, poseSeries((t) => {
      const rise = phase(t, .48, .76);
      const settle = phase(t, .86, 1);
      return {
        opacity: mix(0, .94, rise) * mix(1, .9, settle),
        transform: `translate(-50%, -50%) scale(${mix(.66, 1, rise).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(mark, poseSeries((t) => {
      const rise = phase(t, .5, .7);
      const settle = phase(t, .7, .84);
      const scale = settle > 0
        ? mix(1.035, 1, settle)
        : mix(.82, 1.035, rise);
      return {
        opacity: rise,
        transform: `translateY(${mix(14, 0, rise).toFixed(3)}px) scale(${scale.toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(wordmark, poseSeries((t) => {
      const rise = phase(t, .6, .84);
      return {
        opacity: rise,
        transform: `translateY(${mix(14, 0, rise).toFixed(3)}px) scale(${mix(.95, 1, rise).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });
  });

  const finish = () => {
    if (exiting) return;
    exiting = true;
    emitEntryState("handoff", variant);
    writeSessionFlag(MORNING_ENTRY_SESSION_KEY);
    delete document.documentElement.dataset.robysEntryPending;
    document.documentElement.style.visibility = "";

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

const entryMode = morningEntryMode();
if (entryMode.enabled && !window.__robysMorningEntryAborted) {
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => runMorningEntry(entryMode), { once: true })
    : runMorningEntry(entryMode);
}
