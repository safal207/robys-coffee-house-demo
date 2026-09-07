// One quiet product scene for every time of day. The old spline modules remain
// available as historical evidence, but bootstrap no longer loads them.
const SESSION_KEY = "robys-takeaway-entry-v1";
const HARD_STOP_MS = 2_300;
const COPY = {
  tr: ["Yanına al.", "Güzel bir kahve. Seninle.", "Devam et"],
  en: ["Take it with you.", "Good coffee. Along for the day.", "Continue"],
  ru: ["Возьми с собой.", "Хороший кофе. Рядом с тобой.", "Продолжить"]
};

function stored(storage, key) {
  try { return window[storage].getItem(key); } catch { return null; }
}

function locale() {
  return stored("localStorage", "robys-language") === "ru" ? "ru"
    : stored("localStorage", "robys-language") === "en" ? "en" : "tr";
}

function emit(state, scene, variant) {
  document.documentElement.dataset.robysEntryState = state;
  window.dispatchEvent(new CustomEvent("robys:entry-state", {
    detail: { state, scene, variant, design: "takeaway-v1" }
  }));
}

function animateSafe(element, frames, options) {
  try {
    if (typeof element.animate !== "function") return Promise.resolve();
    return element.animate(frames, options).finished.catch(() => undefined);
  } catch { return Promise.resolve(); }
}

export function createTakeawayScene(language = locale()) {
  const copy = COPY[language] || COPY.tr;
  const overlay = document.createElement("div");
  overlay.className = "robys-takeaway-entry";
  overlay.lang = language;
  const content = document.createElement("div");
  content.className = "robys-takeaway-content";
  const cup = document.createElement("img");
  cup.className = "robys-takeaway-cup";
  cup.src = "src/brand/robys-takeaway-cup-v1.webp";
  cup.width = 640;
  cup.height = 918;
  cup.alt = "";
  cup.decoding = "async";
  cup.fetchPriority = "high";
  const title = document.createElement("p");
  title.className = "robys-takeaway-title";
  title.textContent = copy[0];
  const caption = document.createElement("p");
  caption.className = "robys-takeaway-caption";
  caption.textContent = copy[1];
  content.append(cup, title, caption);
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "robys-takeaway-skip";
  skip.textContent = copy[2];
  overlay.append(content, skip);
  return { overlay, content, cup };
}

export function runTakeawayEntry(scene = "day") {
  const root = document.documentElement;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!document.body || window.__robysTakeawayEntryAborted || reduced?.matches ||
      document.querySelector(".robys-takeaway-entry")) {
    delete root.dataset.robysEntryPending;
    return;
  }
  const variant = stored("sessionStorage", SESSION_KEY) === "1" ? "warm" : "cold";
  const cold = variant === "cold";
  const { overlay, content, cup } = createTakeawayScene();
  let exiting = false;
  let done = false;
  let pulsed = false;
  const timers = new Set();
  const later = (callback, ms) => {
    const id = window.setTimeout(callback, ms);
    timers.add(id);
    return id;
  };
  const clearTimers = () => {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  };
  const cleanup = () => {
    if (done) return;
    done = true;
    exiting = true;
    clearTimers();
    overlay.remove();
    delete root.dataset.robysEntryPending;
    root.style.backgroundColor = "";
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pagehide", cleanup);
    document.removeEventListener("visibilitychange", onVisibility);
    reduced?.removeEventListener?.("change", onMotionChange);
    delete window.__robysTakeawayEntryRelease;
    emit("done", scene, variant);
  };
  const pulse = () => {
    if (pulsed || reduced?.matches || document.visibilityState !== "visible" ||
        navigator.userActivation?.hasBeenActive !== true ||
        typeof navigator.vibrate !== "function") return;
    // Best effort only: a browser accepting the call is not hardware proof.
    pulsed = true;
    try { navigator.vibrate(8); } catch { /* Optional tactile feedback. */ }
  };
  const rememberEntry = () => {
    try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* Optional. */ }
  };
  const finish = () => {
    if (exiting) return;
    exiting = true;
    clearTimers();
    rememberEntry();
    emit("handoff", scene, variant);
    delete root.dataset.robysEntryPending;
    // Reveal the real page under a stationary dissolve; no zoom or sliding layer.
    later(cleanup, cold ? 560 : 320);
    animateSafe(overlay, [{ opacity: 1 }, { opacity: 0 }], {
      duration: cold ? 480 : 250,
      easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards"
    }).finally(cleanup);
  };
  const onKey = (event) => {
    if (event.key === "Escape" || event.key === "Tab") {
      rememberEntry();
      cleanup();
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") cleanup();
  };
  const onMotionChange = () => { if (reduced.matches) cleanup(); };
  overlay.addEventListener("pointerdown", () => { pulse(); finish(); }, { passive: true });
  overlay.querySelector("button").addEventListener("click", finish);
  window.addEventListener("keydown", onKey);
  window.addEventListener("pagehide", cleanup);
  document.addEventListener("visibilitychange", onVisibility);
  reduced?.addEventListener?.("change", onMotionChange);
  window.__robysTakeawayEntryRelease = cleanup;
  document.body.append(overlay);
  root.dataset.robysEntryScene = scene;
  emit("loading", scene, variant);
  later(cleanup, HARD_STOP_MS);
  // Never reveal a half-loaded picture or wait indefinitely for an image/font.
  const decoded = typeof cup.decode === "function" ? cup.decode()
    : new Promise((resolve, reject) => {
      if (cup.complete) return cup.naturalWidth ? resolve() : reject();
      cup.addEventListener("load", resolve, { once: true });
      cup.addEventListener("error", reject, { once: true });
    });
  const imageDeadline = later(cleanup, 600);
  decoded.then(() => {
    window.clearTimeout(imageDeadline);
    if (exiting || done || window.__robysTakeawayEntryAborted) return;
    content.style.opacity = "1";
    emit("brand-frame", scene, variant);
    pulse();
    animateSafe(content, [
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], { duration: cold ? 700 : 250, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }).then(() => {
      if (exiting || done) return;
      // Count the readable pause from the settled cup. A busy frame must not
      // consume the pause while the entrance is still moving. The hard stop
      // above still releases a stalled animation.
      later(finish, cold ? 350 : 100);
    });
  }).catch(cleanup);
}

const pending = document.documentElement.dataset.robysEntryPending;
if (pending && !window.__robysTakeawayEntryAborted) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => runTakeawayEntry(pending), { once: true });
  } else runTakeawayEntry(pending);
}
