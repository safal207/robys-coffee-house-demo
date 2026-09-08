const ANDROID_HANDOFF_HARD_STOP_MS = 5_000;
const ANDROID_HANDOFF_RELEASE_MS = 160;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
  return element;
}

function emitAndroidHandoffState(state) {
  document.documentElement.dataset.robysAndroidHandoff = state;
  window.dispatchEvent(new CustomEvent("robys:android-handoff", {
    detail: { state }
  }));
}

async function waitForBody() {
  if (document.body) return;
  await Promise.race([
    new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true })),
    delay(1_500)
  ]);
  if (!document.body) throw new Error("Android handoff body unavailable");
}

function createAndroidHandoffSurface() {
  const overlay = applyStyles(document.createElement("div"), {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    overflow: "hidden",
    background: "#241c1b",
    opacity: "1",
    isolation: "isolate",
    pointerEvents: "none"
  });
  overlay.className = "robys-android-handoff";
  overlay.setAttribute("aria-hidden", "true");

  const ambient = applyStyles(document.createElement("div"), {
    position: "absolute",
    inset: "-20%",
    background: [
      "radial-gradient(circle at 50% 44%, rgba(255,242,218,.24) 0%, rgba(211,132,67,.13) 27%, rgba(36,28,27,0) 58%)",
      "linear-gradient(145deg, #2c211f 0%, #241c1b 52%, #1d1514 100%)"
    ].join(","),
    pointerEvents: "none"
  });
  ambient.className = "robys-android-handoff-ambient";

  const stage = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "45%",
    width: "min(72vw, 296px)",
    transform: "translate(-50%, -38%)",
    display: "grid",
    justifyItems: "center",
    gap: "12px",
    background: "transparent",
    isolation: "isolate",
    pointerEvents: "none"
  });
  stage.className = "robys-android-handoff-stage";

  const focus = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "50%",
    top: "55%",
    width: "132%",
    height: "176%",
    borderRadius: "50%",
    background: "radial-gradient(ellipse at center, rgba(255,242,218,.94) 0%, rgba(255,224,181,.72) 28%, rgba(211,132,67,.34) 52%, rgba(36,28,27,0) 78%)",
    filter: "blur(18px)",
    transform: "translate(-50%, -50%)",
    opacity: ".88",
    zIndex: "0",
    pointerEvents: "none"
  });
  focus.className = "robys-android-handoff-focus";

  const mark = document.createElement("img");
  mark.src = "src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4";
  mark.alt = "";
  mark.width = 46;
  mark.height = 53;
  mark.decoding = "async";
  mark.setAttribute("aria-hidden", "true");
  applyStyles(mark, {
    position: "relative",
    zIndex: "1",
    width: "46px",
    height: "53px",
    objectFit: "contain",
    opacity: "1",
    filter: "drop-shadow(0 8px 22px rgba(226,27,35,.18))"
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
    zIndex: "1",
    display: "block",
    width: "min(60vw, 230px)",
    height: "auto",
    objectFit: "contain",
    opacity: "1",
    filter: "drop-shadow(0 1px 0 rgba(255,247,235,.10)) drop-shadow(0 8px 20px rgba(0,0,0,.16))"
  });

  stage.append(focus, mark, wordmark);
  overlay.append(ambient, stage);
  return { overlay, stage, focus, mark, wordmark };
}

async function waitForAssets(mark, wordmark) {
  const decodes = [mark, wordmark].map((image) => {
    if (typeof image.decode !== "function") return Promise.resolve();
    return image.decode().catch(() => undefined);
  });
  await Promise.race([Promise.allSettled(decodes), delay(900)]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function nativeOwnsHandoffSurface() {
  const params = new URLSearchParams(window.location.search);
  const generation = params.get("handoff-gen") ?? "";
  // This is a rendering-route hint supplied by the native launch URL, not an
  // authentication boundary. Generationless browser entry keeps its own cover.
  return params.get("entry") === "android-handoff" &&
    /^[1-9]\d*$/.test(generation) && Number(generation) <= 2_147_483_647;
}

async function waitForProductFrame() {
  if (!window.__robysAndroidHandoffDomReady) {
    throw new Error("Android product DOM readiness unavailable");
  }
  await window.__robysAndroidHandoffDomReady;

  const hero = document.querySelector(".hero-video");
  const content = document.querySelector(".hero-content");
  const brand = document.querySelector(".site-header .brand-copy");
  if (!hero?.poster || !content || !brand || !document.querySelector('link[data-hero-balance="true"]')) {
    throw new Error("Android product frame dependencies unavailable");
  }
  const styles = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .filter((link) => !link.disabled && (!link.media || window.matchMedia(link.media).matches));
  await Promise.all(styles.map((link) => {
    if (link.sheet) return Promise.resolve();
    return new Promise((resolve, reject) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error("Android product stylesheet unavailable")), { once: true });
    });
  }));

  const background = getComputedStyle(brand).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
  if (!background) throw new Error("Android product brand unavailable");
  await Promise.all([hero.poster, background].map(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
  }));
  await document.fonts.ready;
  // Preserve the existing entrance timings while keeping transparent titles
  // and actions beneath the native splash until their entrance is complete.
  const entrances = content.getAnimations({ subtree: true })
    .filter((animation) => animation.animationName === "heroContentIn");
  await Promise.all(entrances.map((animation) => animation.finished.catch(() => undefined)));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (const child of content.children) {
    const style = getComputedStyle(child);
    if (style.display !== "none" && Number(style.opacity) < 1) {
      throw new Error("Android product entrance is not visible");
    }
  }
}

async function runNativeProductHandoff() {
  if (window.__robysAndroidHandoffAborted) return;
  let released = false;
  // The native splash covers all preparation. Its visual-state callback must
  // certify the product itself, so release has no second surface to animate.
  document.documentElement.style.backgroundColor = "";
  window.__robysAndroidHandoffRelease = () => {
    if (released) return;
    released = true;
    emitAndroidHandoffState("releasing");
    emitAndroidHandoffState("done");
    delete window.__robysAndroidHandoffRelease;
  };
  emitAndroidHandoffState("loading");
  try {
    await waitForProductFrame();
  } catch (error) {
    if (!released && !window.__robysAndroidHandoffAborted) throw error;
    return;
  }
  if (released || window.__robysAndroidHandoffAborted) return;
  emitAndroidHandoffState("ready");
}

async function runAndroidHandoff() {
  if (nativeOwnsHandoffSurface()) return runNativeProductHandoff();
  await waitForBody();
  if (window.__robysAndroidHandoffAborted) return;

  const { overlay, mark, wordmark } = createAndroidHandoffSurface();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let releasing = false;
  let hardStopId;

  document.body.append(overlay);
  emitAndroidHandoffState("loading");

  const release = async (immediate = false) => {
    if (releasing) return;
    releasing = true;
    window.clearTimeout(hardStopId);
    emitAndroidHandoffState("releasing");

    if (!immediate && !reduceMotion && typeof overlay.animate === "function") {
      const animation = overlay.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: ANDROID_HANDOFF_RELEASE_MS, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" }
      );
      await animation.finished.catch(() => undefined);
    }

    overlay.remove();
    document.documentElement.style.backgroundColor = "";
    emitAndroidHandoffState("done");
    delete window.__robysAndroidHandoffRelease;
  };

  window.__robysAndroidHandoffRelease = () => release(false);
  hardStopId = window.setTimeout(() => release(true), ANDROID_HANDOFF_HARD_STOP_MS);

  await waitForAssets(mark, wordmark);
  if (releasing || window.__robysAndroidHandoffAborted) return;
  emitAndroidHandoffState("ready");
}

runAndroidHandoff().catch(() => {
  document.querySelector(".robys-android-handoff")?.remove();
  document.documentElement.style.backgroundColor = "";
  emitAndroidHandoffState("done");
  delete window.__robysAndroidHandoffRelease;
});
