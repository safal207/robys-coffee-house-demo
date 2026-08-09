const ENTRY_SESSION_KEYS = ["robys-contextual-entry-v1", "robys-morning-entry-v2"];
const ENTRY_HARD_STOP_MS = 2_300;
const MOTION_POSE_COUNT = 20;

const SCENE_THEMES = {
  day: {
    background: "#2d0d0c",
    ambient: [
      "radial-gradient(circle at 82% 20%, rgba(255,239,211,.72), rgba(238,174,97,.26) 24%, rgba(86,29,15,0) 57%)",
      "radial-gradient(circle at 22% 82%, rgba(238,49,56,.44), rgba(145,19,26,.22) 35%, rgba(45,13,12,0) 68%)",
      "linear-gradient(150deg, #4a1a12 0%, #2d0d0c 48%, #5d2114 100%)"
    ].join(","),
    redSurface: [
      "radial-gradient(circle at 70% 24%, rgba(255,139,76,.72), rgba(238,49,56,.82) 23%, rgba(154,18,27,.95) 58%, rgba(63,10,11,.99) 100%)",
      "linear-gradient(120deg, #4b0b0d 0%, #a8141d 44%, #ee3138 72%, #5f170f 100%)"
    ].join(","),
    redShadow: [
      "inset -32px 30px 82px rgba(255,166,100,.2)",
      "inset 30px -42px 112px rgba(30,8,7,.48)",
      "0 -2px 0 rgba(255,169,92,.8)",
      "0 -20px 52px rgba(238,49,56,.18)"
    ].join(","),
    brownRibbon: "linear-gradient(154deg, rgba(54,17,11,.99) 10%, rgba(91,39,22,.98) 48%, rgba(127,62,31,.96) 76%, rgba(49,15,10,.99) 100%)",
    brownShadow: [
      "inset 0 3px 0 rgba(255,222,166,.88)",
      "inset 0 18px 34px rgba(236,163,91,.14)",
      "0 18px 62px rgba(18,5,4,.28)"
    ].join(","),
    goldBorder: "2px solid rgba(255,230,187,.96)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(255,241,215,.24), rgba(226,155,76,.1) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 16px rgba(255,231,190,.62)",
      "0 0 52px rgba(230,157,82,.36)",
      "inset 0 0 48px rgba(255,228,181,.14)"
    ].join(","),
    lightVeil: "linear-gradient(102deg, rgba(255,233,198,0) 4%, rgba(255,224,181,.2) 39%, rgba(255,239,214,.52) 66%, rgba(255,250,238,.78) 82%, rgba(255,233,198,0) 100%)",
    vignette: "radial-gradient(circle at 54% 45%, rgba(0,0,0,0) 34%, rgba(20,6,5,.08) 68%, rgba(15,4,4,.38) 100%)",
    halo: "radial-gradient(ellipse at center, rgba(255,237,204,.58) 0%, rgba(235,170,101,.34) 34%, rgba(134,61,28,.12) 58%, rgba(45,13,12,0) 76%)",
    focus: "radial-gradient(ellipse at center, rgba(255,250,238,.96) 0%, rgba(255,235,203,.82) 30%, rgba(230,164,95,.4) 52%, rgba(105,40,21,.08) 72%, rgba(45,13,12,0) 84%)",
    markFilter: "drop-shadow(0 8px 22px rgba(238,49,56,.22))",
    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,252,245,.18)) drop-shadow(0 8px 18px rgba(32,8,7,.16))",
    depthHaze: "radial-gradient(ellipse at 74% 34%, rgba(255,220,167,.18) 0%, rgba(167,72,34,.09) 34%, rgba(45,13,12,0) 66%), linear-gradient(145deg, rgba(74,26,18,.62), rgba(45,13,12,.1) 54%, rgba(82,29,18,.48))",
    depthHazeBlur: "none",
    foregroundVolume: "radial-gradient(ellipse at 68% 26%, rgba(240,69,61,.42) 0%, rgba(143,16,28,.72) 35%, rgba(58,9,12,.94) 72%, rgba(32,7,8,.98) 100%)",
    foregroundBlur: "blur(12px)",
    foregroundPeak: .42,
    specularEdge: "linear-gradient(98deg, rgba(255,231,194,0) 4%, rgba(255,226,181,.14) 31%, rgba(255,244,221,.9) 51%, rgba(246,174,94,.52) 64%, rgba(255,231,194,0) 94%)",
    specularShadow: "0 0 12px rgba(255,235,205,.36), 0 0 34px rgba(238,163,83,.22)",
    specularPeak: .8,
    haloBlur: "blur(22px)",
    focusBlur: "blur(13px)",
    coldDuration: 1_180,
    warmDuration: 460,
    coldExit: 280,
    warmExit: 150,
    coldSkipDelay: 300,
    warmSkipDelay: 150
  },
  night: {
    background: "#0d0505",
    ambient: [
      "radial-gradient(circle at 80% 27%, rgba(255,202,126,.38), rgba(190,108,49,.16) 23%, rgba(38,12,9,0) 54%)",
      "radial-gradient(circle at 21% 83%, rgba(139,15,26,.34), rgba(74,8,15,.22) 34%, rgba(13,5,5,0) 68%)",
      "linear-gradient(150deg, #1b0907 0%, #0d0505 54%, #29100a 100%)"
    ].join(","),
    redSurface: [
      "radial-gradient(circle at 70% 25%, rgba(205,61,51,.42), rgba(133,13,24,.78) 24%, rgba(79,8,17,.96) 60%, rgba(25,4,6,.99) 100%)",
      "linear-gradient(120deg, #210507 0%, #650b15 46%, #98111d 70%, #32100b 100%)"
    ].join(","),
    redShadow: [
      "inset -38px 34px 96px rgba(196,74,49,.12)",
      "inset 34px -48px 124px rgba(7,3,3,.66)",
      "0 -2px 0 rgba(215,119,65,.52)",
      "0 -24px 64px rgba(118,10,20,.2)"
    ].join(","),
    brownRibbon: "linear-gradient(154deg, rgba(17,6,5,.995) 10%, rgba(38,15,10,.99) 48%, rgba(67,31,17,.97) 76%, rgba(20,7,6,.995) 100%)",
    brownShadow: [
      "inset 0 2px 0 rgba(236,177,105,.58)",
      "inset 0 18px 38px rgba(181,99,46,.08)",
      "0 20px 78px rgba(0,0,0,.5)"
    ].join(","),
    goldBorder: "2px solid rgba(247,191,113,.72)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(250,201,127,.14), rgba(177,95,42,.06) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 13px rgba(245,185,106,.34)",
      "0 0 54px rgba(157,81,36,.28)",
      "inset 0 0 54px rgba(235,169,92,.08)"
    ].join(","),
    lightVeil: "linear-gradient(102deg, rgba(242,190,119,0) 4%, rgba(231,171,100,.08) 40%, rgba(244,195,126,.24) 66%, rgba(250,214,158,.38) 81%, rgba(242,190,119,0) 100%)",
    vignette: "radial-gradient(circle at 54% 45%, rgba(0,0,0,0) 24%, rgba(4,1,2,.2) 64%, rgba(2,1,1,.7) 100%)",
    halo: "radial-gradient(ellipse at center, rgba(246,192,119,.36) 0%, rgba(179,103,51,.24) 34%, rgba(84,32,18,.12) 58%, rgba(13,5,5,0) 76%)",
    focus: "radial-gradient(ellipse at center, rgba(255,226,179,.88) 0%, rgba(242,191,126,.66) 28%, rgba(165,88,44,.34) 50%, rgba(55,19,12,.08) 72%, rgba(13,5,5,0) 84%)",
    markFilter: "drop-shadow(0 8px 24px rgba(133,13,24,.28))",
    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,232,197,.08)) drop-shadow(0 10px 24px rgba(0,0,0,.32))",
    depthHaze: "radial-gradient(ellipse at 76% 36%, rgba(232,169,96,.12) 0%, rgba(113,48,25,.08) 36%, rgba(13,5,5,0) 68%), linear-gradient(145deg, rgba(31,10,8,.72), rgba(13,5,5,.18) 54%, rgba(42,15,10,.58))",
    depthHazeBlur: "none",
    foregroundVolume: "radial-gradient(ellipse at 66% 24%, rgba(151,27,36,.3) 0%, rgba(92,8,19,.72) 36%, rgba(28,4,7,.96) 72%, rgba(10,3,4,.995) 100%)",
    foregroundBlur: "blur(14px)",
    foregroundPeak: .5,
    specularEdge: "linear-gradient(98deg, rgba(248,199,132,0) 4%, rgba(238,181,111,.08) 31%, rgba(255,218,162,.66) 51%, rgba(197,105,51,.36) 64%, rgba(248,199,132,0) 94%)",
    specularShadow: "0 0 10px rgba(244,193,124,.22), 0 0 38px rgba(157,81,36,.2)",
    specularPeak: .62,
    haloBlur: "blur(24px)",
    focusBlur: "blur(15px)",
    coldDuration: 1_480,
    warmDuration: 600,
    coldExit: 340,
    warmExit: 180,
    coldSkipDelay: 360,
    warmSkipDelay: 180
  }
};

function readSessionFlag(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function hasSeenEntry() {
  return ENTRY_SESSION_KEYS.some(readSessionFlag);
}

function writeSeenEntry() {
  for (const key of ENTRY_SESSION_KEYS) {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // Cross-scene replay state is optional.
    }
  }
}

function resolveSceneMode() {
  const mode = new URLSearchParams(window.location.search).get("entry");
  if (mode === "off" || mode === "morning" || mode === "android-handoff") {
    return { enabled: false, forced: false, scene: null };
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return { enabled: false, forced: false, scene: null };
  }
  if (mode === "day" || mode === "night") {
    return { enabled: true, forced: true, scene: mode };
  }

  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  if (navigation?.type === "back_forward") {
    return { enabled: false, forced: false, scene: null };
  }

  const hour = new Date().getHours();
  if (hour >= 12 && hour < 18) return { enabled: true, forced: false, scene: "day" };
  if (hour >= 18 || hour < 5) return { enabled: true, forced: false, scene: "night" };
  return { enabled: false, forced: false, scene: null };
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

function emitEntryState(scene, state, variant) {
  document.documentElement.dataset.robysEntryState = state;
  window.dispatchEvent(new CustomEvent("robys:entry-state", {
    detail: { scene, state, variant }
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

function createContextualEntry(sceneName) {
  const theme = SCENE_THEMES[sceneName];
  const overlay = applyStyles(document.createElement("div"), {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    overflow: "hidden",
    background: theme.background,
    opacity: "1",
    touchAction: "manipulation",
    isolation: "isolate"
  });
  overlay.className = `robys-contextual-entry robys-${sceneName}-entry`;
  overlay.setAttribute("aria-hidden", "true");

  const depthHaze = createSplineLayer({
    inset: "-10%",
    background: theme.depthHaze,
    filter: theme.depthHazeBlur,
    opacity: ".64",
    transform: "scale(1.025)",
    zIndex: "0"
  }, "robys-entry-depth-haze");

  const ambient = createSplineLayer({
    inset: "-18%",
    background: theme.ambient,
    opacity: "0",
    transform: "scale(1.035)",
    zIndex: "1"
  }, "robys-entry-ambient");

  const redSurface = createSplineLayer({
    left: "-46vw",
    bottom: "-43vh",
    width: "132vw",
    height: "112vh",
    borderRadius: "50%",
    background: theme.redSurface,
    boxShadow: theme.redShadow,
    opacity: "0",
    transform: "rotate(-11deg) scale(1.08)",
    zIndex: "3"
  }, "robys-entry-red-surface");

  const specularEdge = createSplineLayer({
    left: "-18vw",
    bottom: "7vh",
    width: "94vw",
    height: "22vh",
    borderRadius: "50%",
    background: theme.specularEdge,
    boxShadow: theme.specularShadow,
    opacity: "0",
    transform: "rotate(-8deg) translate3d(5vw,4vh,0) scale(1.04)",
    transformOrigin: "50% 50%",
    zIndex: "4"
  }, "robys-entry-specular-edge");

  const brownRibbon = createSplineLayer({
    left: "-30vw",
    top: "-20vh",
    width: "158vw",
    height: "94vh",
    borderRadius: "50%",
    background: theme.brownRibbon,
    boxShadow: theme.brownShadow,
    opacity: "0",
    transform: "rotate(8deg) translate3d(5vw,-2vh,0) scale(1.04)",
    zIndex: "2"
  }, "robys-entry-brown-ribbon");

  const goldArc = createSplineLayer({
    right: "-39vw",
    top: "-32vh",
    width: "118vw",
    height: "112vh",
    borderRadius: "50%",
    border: theme.goldBorder,
    background: theme.goldBackground,
    boxShadow: theme.goldShadow,
    opacity: "0",
    transform: "rotate(19deg) translate3d(4vw,-3vh,0) scale(1.08)",
    zIndex: "5"
  }, "robys-entry-gold-arc");

  const lightVeil = createSplineLayer({
    right: "-28%",
    top: "-18%",
    width: "72%",
    height: "142%",
    background: theme.lightVeil,
    opacity: "0",
    transform: "translate3d(11%,0,0) rotate(7deg)",
    zIndex: "6"
  }, "robys-entry-light-veil");

  const foregroundOccluder = createSplineLayer({
    left: "-22vw",
    bottom: "-10vh",
    width: "66vw",
    height: "54vh",
    borderRadius: "52% 48% 46% 54%",
    background: theme.foregroundVolume,
    filter: theme.foregroundBlur,
    opacity: "0",
    transform: "rotate(-18deg) translate3d(-4vw,4vh,0) scale(1.08)",
    transformOrigin: "50% 50%",
    zIndex: "7"
  }, "robys-entry-foreground-occluder");

  const vignette = createSplineLayer({
    inset: "0",
    background: theme.vignette,
    opacity: ".85",
    zIndex: "8"
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
    pointerEvents: "none",
    zIndex: "10"
  });
  logoStage.className = "robys-entry-logo-stage";

  const logoHalo = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "52%",
    width: "164%",
    height: "254%",
    borderRadius: "50%",
    background: theme.halo,
    filter: theme.haloBlur,
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
    background: theme.focus,
    filter: theme.focusBlur,
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
    filter: theme.markFilter
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
    filter: theme.wordmarkFilter
  });

  logoStage.append(logoHalo, logoFocus, mark, wordmark);
  overlay.append(depthHaze, ambient, brownRibbon, redSurface, specularEdge, goldArc, lightVeil, foregroundOccluder, vignette, logoStage);

  return {
    overlay,
    depthHaze,
    ambient,
    redSurface,
    brownRibbon,
    specularEdge,
    goldArc,
    lightVeil,
    foregroundOccluder,
    logoStage,
    logoHalo,
    logoFocus,
    mark,
    wordmark
  };
}

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

function runContextualEntry({ scene: sceneName }) {
  if (!document.body || window.__robysContextualEntryAborted) return;

  const theme = SCENE_THEMES[sceneName];
  const variant = hasSeenEntry() ? "warm" : "cold";
  const scene = createContextualEntry(sceneName);
  const {
    overlay,
    depthHaze,
    ambient,
    redSurface,
    brownRibbon,
    specularEdge,
    goldArc,
    lightVeil,
    foregroundOccluder,
    logoStage,
    logoHalo,
    logoFocus,
    mark,
    wordmark
  } = scene;

  document.body.append(overlay);
  document.documentElement.style.visibility = "";
  document.documentElement.dataset.robysEntryScene = sceneName;
  document.documentElement.dataset.robysEntryPoseCount = String(MOTION_POSE_COUNT);
  document.documentElement.dataset.robysEntryBrandReveal = "integrated-v1";
  document.documentElement.dataset.robysEntryFamily = "contextual-v1";
  document.documentElement.dataset.robysEntryTempo = sceneName;
  document.documentElement.dataset.robysEntryDepth = "premium-v1";
  document.documentElement.dataset.robysEntryDepthPlanes = "3";
  emitEntryState(sceneName, "brand-frame", variant);

  const cold = variant === "cold";
  const duration = cold ? theme.coldDuration : theme.warmDuration;
  const exitMs = cold ? theme.coldExit : theme.warmExit;
  const skipDelay = cold ? theme.coldSkipDelay : theme.warmSkipDelay;
  let exiting = false;
  let canSkip = false;
  const lifecycle = new AbortController();

  requestAnimationFrame(() => {
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

    animateSafe(specularEdge, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: peak(t, .1, .56, 1, theme.specularPeak, .28),
        transform: `rotate(${mix(-8, -4.8, p).toFixed(3)}deg) translate3d(${mix(5, -1.2, p).toFixed(3)}vw,${mix(4, .4, p).toFixed(3)}vh,0) scale(${mix(1.04, 1.005, p).toFixed(4)})`
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

    animateSafe(foregroundOccluder, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .72, 1);
      return {
        opacity: phase(t, .04, .34) * mix(theme.foregroundPeak, theme.foregroundPeak * .74, settle),
        transform: `rotate(${mix(-18, -13.5, p).toFixed(3)}deg) translate3d(${mix(-4, 1.8, p).toFixed(3)}vw,${mix(4, .6, p).toFixed(3)}vh,0) scale(${mix(1.08, 1.02, p).toFixed(4)})`
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
      const scale = settle > 0 ? mix(1.035, 1, settle) : mix(.82, 1.035, rise);
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
    lifecycle.abort();
    emitEntryState(sceneName, "handoff", variant);
    writeSeenEntry();

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
  }, skipDelay);

  overlay.addEventListener("pointerdown", () => {
    if (canSkip) finish();
  }, { passive: true });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") finish();
  }, { signal: lifecycle.signal });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finish();
  }, { signal: lifecycle.signal });

  window.setTimeout(finish, ENTRY_HARD_STOP_MS);
  Promise.all([delay(duration), meaningfulFrame()]).then(finish);
}

const entryMode = resolveSceneMode();
if (entryMode.enabled && !window.__robysContextualEntryAborted) {
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => runContextualEntry(entryMode), { once: true })
    : runContextualEntry(entryMode);
}
