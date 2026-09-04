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
    brownRibbon: "linear-gradient(154deg, rgba(54,17,11,.5) 10%, rgba(91,39,22,.42) 48%, rgba(127,62,31,.32) 76%, rgba(49,15,10,.52) 100%)",
    brownShadow: [
      "inset 0 2px 0 rgba(255,222,166,.34)",
      "inset 0 16px 32px rgba(236,163,91,.07)",
      "0 20px 72px rgba(18,5,4,.18)"
    ].join(","),
    goldBorder: "1px solid rgba(255,230,187,.3)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(255,241,215,.12), rgba(226,155,76,.04) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 10px rgba(255,231,190,.3)",
      "0 0 34px rgba(230,157,82,.16)",
      "inset 0 0 38px rgba(255,228,181,.06)"
    ].join(","),
    lightVeil: "linear-gradient(102deg, rgba(255,233,198,0) 4%, rgba(255,224,181,.2) 39%, rgba(255,239,214,.52) 66%, rgba(255,250,238,.78) 82%, rgba(255,233,198,0) 100%)",
    vignette: "radial-gradient(circle at 54% 45%, rgba(0,0,0,0) 34%, rgba(20,6,5,.08) 68%, rgba(15,4,4,.38) 100%)",
    halo: "radial-gradient(ellipse at center, rgba(255,237,204,.58) 0%, rgba(235,170,101,.34) 34%, rgba(134,61,28,.12) 58%, rgba(45,13,12,0) 76%)",
    focus: "radial-gradient(ellipse at center, rgba(255,250,238,.96) 0%, rgba(255,235,203,.82) 30%, rgba(230,164,95,.4) 52%, rgba(105,40,21,.08) 72%, rgba(45,13,12,0) 84%)",
    markFilter: "drop-shadow(0 8px 22px rgba(238,49,56,.22))",
    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,252,245,.18)) drop-shadow(0 8px 18px rgba(32,8,7,.16))",
    depthHaze: "radial-gradient(ellipse at 78% 28%, rgba(255,225,181,.15) 0%, rgba(171,78,39,.07) 30%, rgba(45,13,12,0) 64%), radial-gradient(ellipse at 24% 76%, rgba(119,28,24,.18) 0%, rgba(45,13,12,0) 58%), linear-gradient(145deg, rgba(69,24,17,.54), rgba(45,13,12,.08) 52%, rgba(77,29,18,.42))",
    depthHazeBlur: "none",
    foregroundVolume: "radial-gradient(ellipse at 58% 18%, rgba(255,108,78,.24) 0%, rgba(177,29,40,.45) 31%, rgba(83,10,18,.72) 62%, rgba(31,6,8,.9) 100%)",
    foregroundBlur: "blur(12px)",
    foregroundPeak: .34,
    specularEdge: "linear-gradient(96deg, rgba(255,231,194,0) 8%, rgba(255,226,181,.08) 34%, rgba(255,246,225,.92) 49%, rgba(246,174,94,.32) 58%, rgba(255,231,194,0) 82%)",
    specularShadow: "0 0 10px rgba(255,238,211,.34), 0 0 28px rgba(238,163,83,.16)",
    specularPeak: .78,
    ribbonPeak: .14,
    goldArcPeak: .22,
    goldArcEnd: .04,
    haloBlur: "blur(22px)",
    focusBlur: "blur(13px)",
    coldDuration: 1_100,
    warmDuration: 460,
    coldFocalHold: 160,
    warmFocalHold: 80,
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
    brownRibbon: "linear-gradient(154deg, rgba(17,6,5,.52) 10%, rgba(38,15,10,.4) 48%, rgba(67,31,17,.3) 76%, rgba(20,7,6,.54) 100%)",
    brownShadow: [
      "inset 0 2px 0 rgba(236,177,105,.22)",
      "inset 0 18px 38px rgba(181,99,46,.04)",
      "0 22px 82px rgba(0,0,0,.34)"
    ].join(","),
    goldBorder: "1px solid rgba(247,191,113,.2)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(250,201,127,.07), rgba(177,95,42,.025) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 8px rgba(245,185,106,.18)",
      "0 0 32px rgba(157,81,36,.14)",
      "inset 0 0 44px rgba(235,169,92,.035)"
    ].join(","),
    lightVeil: "linear-gradient(102deg, rgba(242,190,119,0) 4%, rgba(231,171,100,.08) 40%, rgba(244,195,126,.24) 66%, rgba(250,214,158,.38) 81%, rgba(242,190,119,0) 100%)",
    vignette: "radial-gradient(circle at 54% 45%, rgba(0,0,0,0) 24%, rgba(4,1,2,.2) 64%, rgba(2,1,1,.7) 100%)",
    halo: "radial-gradient(ellipse at center, rgba(246,192,119,.36) 0%, rgba(179,103,51,.24) 34%, rgba(84,32,18,.12) 58%, rgba(13,5,5,0) 76%)",
    focus: "radial-gradient(ellipse at center, rgba(255,231,190,.95) 0%, rgba(246,197,132,.73) 28%, rgba(172,92,46,.38) 50%, rgba(55,19,12,.08) 72%, rgba(13,5,5,0) 84%)",
    markFilter: "drop-shadow(0 8px 24px rgba(133,13,24,.28))",
    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,232,197,.08)) drop-shadow(0 10px 24px rgba(0,0,0,.32))",
    depthHaze: "radial-gradient(ellipse at 78% 32%, rgba(222,151,84,.1) 0%, rgba(98,39,23,.06) 32%, rgba(13,5,5,0) 66%), radial-gradient(ellipse at 22% 78%, rgba(92,10,20,.16) 0%, rgba(13,5,5,0) 58%), linear-gradient(145deg, rgba(27,9,7,.68), rgba(13,5,5,.14) 54%, rgba(36,13,9,.52))",
    depthHazeBlur: "none",
    foregroundVolume: "radial-gradient(ellipse at 56% 18%, rgba(174,38,44,.18) 0%, rgba(100,10,22,.42) 34%, rgba(37,4,9,.76) 66%, rgba(8,2,3,.94) 100%)",
    foregroundBlur: "blur(16px)",
    foregroundPeak: .36,
    specularEdge: "linear-gradient(96deg, rgba(248,199,132,0) 8%, rgba(238,181,111,.05) 34%, rgba(255,221,170,.64) 49%, rgba(197,105,51,.22) 58%, rgba(248,199,132,0) 82%)",
    specularShadow: "0 0 8px rgba(244,193,124,.18), 0 0 30px rgba(157,81,36,.14)",
    specularPeak: .62,
    ribbonPeak: .12,
    goldArcPeak: .18,
    goldArcEnd: .03,
    haloBlur: "blur(24px)",
    focusBlur: "blur(15px)",
    coldDuration: 1_480,
    warmDuration: 600,
    coldFocalHold: 220,
    warmFocalHold: 100,
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

  const sceneStage = applyStyles(document.createElement("div"), {
    position: "absolute",
    inset: "0",
    perspective: "980px",
    perspectiveOrigin: "52% 44%",
    transformStyle: "preserve-3d",
    pointerEvents: "none",
    zIndex: "0"
  });
  sceneStage.className = "robys-entry-scene-stage";

  const depthHaze = createSplineLayer({
    inset: "-10%",
    background: theme.depthHaze,
    filter: theme.depthHazeBlur,
    opacity: ".58",
    transform: "translateZ(-90px) scale(1.12)",
    transformOrigin: "52% 44%",
    zIndex: "0"
  }, "robys-entry-depth-haze");

  const ambient = createSplineLayer({
    inset: "-18%",
    background: theme.ambient,
    opacity: ".9",
    transform: "scale(.998)",
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
    left: "-28vw",
    bottom: "12vh",
    width: "112vw",
    height: "14vh",
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
    opacity: String(theme.ribbonPeak * .82),
    transform: "translateZ(-38px) rotate(4.7deg) translate3d(.6vw,1.4vh,0) scale(1.004)",
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
    opacity: String(theme.goldArcEnd),
    transform: "translateZ(8px) rotate(13.5deg) translate3d(-1.5vw,2.4vh,0) scale(.995)",
    zIndex: "5"
  }, "robys-entry-gold-arc");

  const lightVeil = createSplineLayer({
    right: "-58%",
    top: "-30%",
    width: "124%",
    height: "160%",
    borderRadius: "50%",
    background: theme.lightVeil,
    opacity: ".32",
    transform: "translate3d(-4%,0,0) translateZ(18px) rotate(2deg)",
    zIndex: "6"
  }, "robys-entry-light-veil");

  const foregroundOccluder = createSplineLayer({
    left: "-30vw",
    bottom: "-18vh",
    width: "74vw",
    height: "60vh",
    borderRadius: "50%",
    background: theme.foregroundVolume,
    filter: theme.foregroundBlur,
    opacity: "0",
    transform: "rotate(-14deg) translate3d(-3vw,3vh,0) scale(1.04)",
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
    transform: "translate(-50%, -38%) scale(.86)",
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
    transform: "translate(-50%, -50%) scale(1.04)",
    opacity: ".61",
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
    transform: "translate(-50%, -50%) scale(1)",
    opacity: ".85",
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
  sceneStage.append(depthHaze, ambient, brownRibbon, redSurface, specularEdge, goldArc, lightVeil);
  overlay.append(sceneStage, foregroundOccluder, vignette, logoStage);

  return {
    overlay,
    sceneStage,
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
  document.documentElement.dataset.robysEntryDepth = "premium-v2";
  document.documentElement.dataset.robysEntryOptics = "perspective-dof-v2";
  document.documentElement.dataset.robysEntryDepthPlanes = "3";
  emitEntryState(sceneName, "brand-frame", variant);

  const cold = variant === "cold";
  const duration = cold ? theme.coldDuration : theme.warmDuration;
  const focalHold = cold ? theme.coldFocalHold : theme.warmFocalHold;
  const handoffDelay = duration + focalHold;
  const exitMs = cold ? theme.coldExit : theme.warmExit;
  const skipDelay = cold ? theme.coldSkipDelay : theme.warmSkipDelay;
  let exiting = false;
  let canSkip = false;
  const lifecycle = new AbortController();

  // Register compositor work before the first paint so the reveal never spends
  // its opening frame constructing animations on a busy or low-power device.
    animateSafe(depthHaze, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .72, 1);
      return {
        opacity: mix(.58, .52, settle),
        transform: `translateZ(-90px) translate3d(${mix(-.5, .35, p).toFixed(3)}vw,${mix(-.35, .2, p).toFixed(3)}vh,0) scale(${mix(1.12, 1.105, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(redSurface, poseSeries((t) => {
      const p = smoothPose(t);
      const lift = Math.sin(Math.PI * t) * .28;
      const settle = phase(t, .7, 1);
      return {
        opacity: phase(t, 0, .2) * mix(1, .82, settle),
        transform: `translateZ(0px) rotate(${mix(-11, -6.5, p).toFixed(3)}deg) translate3d(${mix(-3, 2.4, p).toFixed(3)}vw,${(mix(5, -1.5, p) - lift).toFixed(3)}vh,0) scale(${mix(1.08, .998, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(specularEdge, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: peak(t, .1, .56, 1, theme.specularPeak, .28),
        transform: `translateZ(16px) rotate(${mix(-8, -4.8, p).toFixed(3)}deg) translate3d(${mix(5, -1.2, p).toFixed(3)}vw,${mix(4, .4, p).toFixed(3)}vh,0) scale(${mix(1.04, 1.005, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(foregroundOccluder, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .72, 1);
      return {
        opacity: phase(t, .04, .34) * mix(theme.foregroundPeak, theme.foregroundPeak * .74, settle),
        transform: `rotate(${mix(-14, -11, p).toFixed(3)}deg) translate3d(${mix(-3, .8, p).toFixed(3)}vw,${mix(3, .8, p).toFixed(3)}vh,0) scale(${mix(1.04, 1.01, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(logoStage, poseSeries((t) => {
      const p = phase(t, .36, .64);
      return {
        opacity: p,
        transform: `translate(-50%, ${mix(-34, -42, p).toFixed(3)}%) scale(${mix(.86, .94, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(mark, poseSeries((t) => {
      const rise = phase(t, .38, .54);
      const settle = phase(t, .54, .66);
      const scale = settle > 0 ? mix(1.035, 1, settle) : mix(.82, 1.035, rise);
      return {
        opacity: rise,
        transform: `translateY(${mix(14, 0, rise).toFixed(3)}px) scale(${scale.toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(wordmark, poseSeries((t) => {
      const rise = phase(t, .46, .66);
      return {
        opacity: rise,
        transform: `translateY(${mix(14, 0, rise).toFixed(3)}px) scale(${mix(.95, 1, rise).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });
  const finish = () => {
    if (exiting) return;
    exiting = true;
    lifecycle.abort();
    emitEntryState(sceneName, "handoff", variant);
    writeSeenEntry();
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
  Promise.all([delay(handoffDelay), meaningfulFrame()]).then(finish);
}

const entryMode = resolveSceneMode();
if (entryMode.enabled && !window.__robysContextualEntryAborted) {
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => runContextualEntry(entryMode), { once: true })
    : runContextualEntry(entryMode);
}
