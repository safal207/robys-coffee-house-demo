document.documentElement.classList.add("js");

const ANDROID_LOGO_OBSERVER_TIMEOUT_MS = 10_000;
const ANDROID_LOGO_MAX_ATTEMPTS = 100;
const ANDROID_HANDOFF_ENTRY_MODE = "android-handoff";
const ENTRY_PREPAINT_TIMEOUT_MS = 2_800;

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

function requestedEntryMode() {
  return new URLSearchParams(window.location.search).get("entry");
}

function resolveEntryScene() {
  const mode = requestedEntryMode();
  if (mode === "off" || mode === ANDROID_HANDOFF_ENTRY_MODE) return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;

  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  if (navigation?.type === "back_forward") return null;

  if (mode === "morning" || mode === "day" || mode === "night") return mode;

  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "night";
}

function revealProductAfterEntryFailure() {
  window.__robysMorningEntryAborted = true;
  window.__robysContextualEntryAborted = true;
  delete document.documentElement.dataset.robysEntryPending;
  document.documentElement.style.visibility = "";
  document.documentElement.style.backgroundColor = "";
  document.querySelector(".robys-morning-entry, .robys-contextual-entry")?.remove();
}

function revealProductAfterAndroidHandoffFailure() {
  window.__robysAndroidHandoffAborted = true;
  document.documentElement.style.visibility = "";
  document.documentElement.style.backgroundColor = "";
  document.querySelector(".robys-android-handoff")?.remove();
  delete document.documentElement.dataset.robysAndroidHandoff;
  delete window.__robysAndroidHandoffRelease;
}

function loadAndroidHandoffIfRequested() {
  if (requestedEntryMode() !== ANDROID_HANDOFF_ENTRY_MODE) return false;

  window.__robysAndroidHandoffAborted = false;
  document.documentElement.style.backgroundColor = "#241c1b";
  import("./android-handoff.js?v=20260808-atomic-v1")
    .catch(revealProductAfterAndroidHandoffFailure);
  return true;
}

function loadEntryIfEligible() {
  const scene = resolveEntryScene();
  if (!scene) return;

  window.__robysMorningEntryAborted = false;
  window.__robysContextualEntryAborted = false;
  document.documentElement.dataset.robysEntryPending = scene;
  document.documentElement.style.backgroundColor = scene === "morning"
    ? "#170a08"
    : scene === "day"
      ? "#2d0d0c"
      : "#0d0505";

  const entryImport = scene === "morning"
    ? import("./morning-entry-v2.js?v=8a158515f4de")
    : import("./day-night-entry.js?v=20260904-compositor-v25");

  entryImport.catch(revealProductAfterEntryFailure);

  window.setTimeout(() => {
    if (document.documentElement.dataset.robysEntryPending) {
      revealProductAfterEntryFailure();
    }
  }, ENTRY_PREPAINT_TIMEOUT_MS);
}

installAppleTouchIcon();

if (!loadAndroidHandoffIfRequested()) {
  loadEntryIfEligible();
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
