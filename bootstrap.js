document.documentElement.classList.add("js");

const ANDROID_LOGO_OBSERVER_TIMEOUT_MS = 10_000;
const ANDROID_LOGO_MAX_ATTEMPTS = 100;
const MORNING_ENTRY_SESSION_KEY = "robys-morning-entry-v1";
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

function createMorningEntry() {
  const overlay = applyStyles(document.createElement("div"), {
    position: "fixed",
    inset: "0",
    zIndex: "2147483000",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    background: "#241c1b",
    opacity: "1",
    touchAction: "manipulation"
  });
  overlay.className = "robys-morning-entry";
  overlay.setAttribute("aria-hidden", "true");

  const glow = applyStyles(document.createElement("div"), {
    position: "absolute",
    inset: "-18%",
    background: "radial-gradient(circle at 50% 42%, rgba(244,241,236,.18), rgba(36,28,27,0) 44%)",
    opacity: "0",
    transform: "scale(.92)"
  });

  const stage = applyStyles(document.createElement("div"), {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    width: "min(78vw, 320px)",
    minHeight: "250px"
  });

  const cupWrap = applyStyles(document.createElement("div"), {
    position: "relative",
    width: "180px",
    height: "150px",
    opacity: "0",
    transform: "translateY(14px) scale(.96)"
  });

  const cup = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "31px",
    bottom: "24px",
    width: "116px",
    height: "72px",
    border: "2px solid rgba(255,253,249,.82)",
    borderTop: "0",
    borderRadius: "0 0 54px 54px"
  });

  const handle = applyStyles(document.createElement("div"), {
    position: "absolute",
    right: "-26px",
    top: "10px",
    width: "34px",
    height: "36px",
    border: "2px solid rgba(255,253,249,.72)",
    borderLeft: "0",
    borderRadius: "0 26px 26px 0"
  });
  cup.append(handle);

  const mark = document.createElement("img");
  mark.src = "src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4";
  mark.alt = "";
  mark.width = 28;
  mark.height = 32;
  mark.decoding = "async";
  mark.setAttribute("aria-hidden", "true");
  applyStyles(mark, {
    position: "absolute",
    left: "50%",
    top: "27px",
    width: "28px",
    height: "32px",
    transform: "translate(-50%, -50%)",
    opacity: ".96"
  });
  cup.append(mark);

  const saucer = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "14px",
    bottom: "12px",
    width: "152px",
    height: "10px",
    borderBottom: "2px solid rgba(255,253,249,.55)",
    borderRadius: "50%"
  });
  cupWrap.append(cup, saucer);

  const steamGroup = applyStyles(document.createElement("div"), {
    position: "absolute",
    left: "48px",
    top: "4px",
    width: "84px",
    height: "64px"
  });

  [-18, 0, 18].forEach((offset, index) => {
    const steam = applyStyles(document.createElement("span"), {
      position: "absolute",
      left: `${38 + offset}px`,
      bottom: "0",
      width: "3px",
      height: `${38 + (index === 1 ? 8 : 0)}px`,
      borderRadius: "999px",
      background: "rgba(255,253,249,.72)",
      opacity: "0",
      transform: `translateY(12px) rotate(${offset / 3}deg)`
    });
    steamGroup.append(steam);
  });
  cupWrap.append(steamGroup);

  const wordmarkCard = applyStyles(document.createElement("div"), {
    display: "grid",
    placeItems: "center",
    minWidth: "210px",
    marginTop: "8px",
    padding: "12px 20px",
    borderRadius: "999px",
    background: "#fffdf9",
    boxShadow: "0 18px 54px rgba(17,17,17,.28)",
    opacity: "0",
    transform: "translateY(10px) scale(.98)"
  });

  const wordmark = document.createElement("img");
  wordmark.src = "src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4";
  wordmark.alt = "";
  wordmark.width = 168;
  wordmark.height = 58;
  wordmark.decoding = "async";
  wordmark.setAttribute("aria-hidden", "true");
  applyStyles(wordmark, {
    display: "block",
    width: "168px",
    height: "58px",
    objectFit: "contain"
  });
  wordmarkCard.append(wordmark);

  stage.append(cupWrap, wordmarkCard);
  overlay.append(glow, stage);

  return { overlay, glow, cupWrap, steamGroup, wordmarkCard };
}

function runMorningEntry({ forced }) {
  if (!document.body || window.__robysMorningEntryAborted) return;

  const variant = forced || !readSessionFlag(MORNING_ENTRY_SESSION_KEY) ? "cold" : "warm";
  const { overlay, glow, cupWrap, steamGroup, wordmarkCard } = createMorningEntry();
  document.body.append(overlay);
  document.documentElement.style.visibility = "";
  document.documentElement.dataset.robysEntryScene = "morning";
  emitEntryState("brand-frame", variant);

  const cold = variant === "cold";
  const minHoldMs = cold ? 1_280 : 520;
  const exitMs = cold ? 320 : 180;
  const steamNodes = Array.from(steamGroup.children);
  let exiting = false;
  let canSkip = false;

  requestAnimationFrame(() => {
    animateSafe(glow, [
      { opacity: 0, transform: "scale(.92)" },
      { opacity: 1, transform: "scale(1)" }
    ], { duration: cold ? 760 : 300, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });

    animateSafe(cupWrap, [
      { opacity: 0, transform: "translateY(14px) scale(.96)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ], { duration: cold ? 620 : 260, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });

    steamNodes.forEach((steam, index) => {
      animateSafe(steam, [
        { opacity: 0, transform: "translateY(12px) scaleY(.82)" },
        { opacity: .72, offset: .55, transform: "translateY(-4px) scaleY(1)" },
        { opacity: 0, transform: "translateY(-20px) scaleY(1.08)" }
      ], {
        duration: cold ? 760 : 340,
        delay: cold ? 250 + index * 90 : 90 + index * 45,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "forwards"
      });
    });

    animateSafe(wordmarkCard, [
      { opacity: 0, transform: "translateY(10px) scale(.98)" },
      { opacity: 1, transform: "translateY(0) scale(1)" }
    ], {
      duration: cold ? 520 : 240,
      delay: cold ? 650 : 210,
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
      { opacity: 0, transform: "scale(1.012)" }
    ], { duration: exitMs, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" })
      .finally(() => {
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
  document.documentElement.style.backgroundColor = "#241c1b";

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
