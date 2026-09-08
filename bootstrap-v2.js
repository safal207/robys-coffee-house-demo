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
  window.__robysTakeawayEntryAborted = true;
  window.__robysTakeawayEntryRelease?.();
  window.__robysMorningEntryAborted = true;
  window.__robysContextualEntryAborted = true;
  delete document.documentElement.dataset.robysEntryPending;
  document.documentElement.style.visibility = "";
  document.documentElement.style.backgroundColor = "";
  document.querySelector(".robys-takeaway-entry, .robys-morning-entry, .robys-contextual-entry")?.remove();
}

function revealProductAfterAndroidHandoffFailure() {
  window.__robysAndroidHandoffAborted = true;
  window.__robysAndroidStylesheetErrors?.dispose();
  document.documentElement.style.visibility = "";
  document.documentElement.style.backgroundColor = "";
  document.querySelector(".robys-android-handoff")?.remove();
  delete document.documentElement.dataset.robysAndroidHandoff;
  delete window.__robysAndroidHandoffRelease;
}

function nativeOwnsHandoffSurface() {
  const params = new URLSearchParams(window.location.search);
  const generation = params.get("handoff-gen") ?? "";
  // This is a rendering-route hint supplied by the native launch URL, not an
  // authentication boundary. Generationless browser entry keeps its own cover.
  return params.get("entry") === "android-handoff" &&
    /^[1-9]\d*$/.test(generation) && Number(generation) <= 2_147_483_647;
}

function captureAndroidStylesheetErrors() {
  window.__robysAndroidStylesheetErrors?.dispose();
  const failed = new WeakMap();
  const captureError = (event) => {
    const link = event.target;
    if (link?.tagName === "LINK" && link.rel === "stylesheet") {
      failed.set(link, link.href);
    }
  };
  const tracker = {
    hasFailed: (link) => failed.get(link) === link.href,
    dispose: () => {
      document.removeEventListener("error", captureError, true);
      window.removeEventListener("pagehide", tracker.dispose);
      if (window.__robysAndroidStylesheetErrors === tracker) {
        delete window.__robysAndroidStylesheetErrors;
      }
    }
  };
  // Parser-blocking bootstrap sees resource failures before the dynamically
  // imported module subscribes after DCL. Weak keys retain no detached links;
  // the href binding does not carry an old request failure to a new URL.
  document.addEventListener("error", captureError, true);
  window.addEventListener("pagehide", tracker.dispose, { once: true });
  window.__robysAndroidStylesheetErrors = tracker;
}

function loadAndroidHandoffIfRequested() {
  if (requestedEntryMode() !== ANDROID_HANDOFF_ENTRY_MODE) return false;

  const nativeSurface = nativeOwnsHandoffSurface();
  if (nativeSurface) captureAndroidStylesheetErrors();
  window.__robysAndroidHandoffAborted = false;
  // Bootstrap runs before deferred product scripts; retain the real DOM-ready
  // event even if the handoff module arrives after document parsing finishes.
  window.__robysAndroidHandoffDomReady = new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
  document.documentElement.style.backgroundColor = "#241c1b";
  const handoff = nativeSurface
    ? import("./android-native-product-frame.js?v=d3991aff9c02")
    : import("./android-handoff.js?v=20260808-atomic-v1");
  handoff.catch(revealProductAfterAndroidHandoffFailure);
  return true;
}

function loadEntryIfEligible() {
  const scene = resolveEntryScene();
  if (!scene) return;

  window.__robysTakeawayEntryAborted = false;
  window.__robysMorningEntryAborted = false;
  window.__robysContextualEntryAborted = false;
  document.documentElement.dataset.robysEntryPending = scene;
  document.documentElement.style.backgroundColor = "#241c1b";
  const cupPreload = document.createElement("link");
  cupPreload.rel = "preload";
  cupPreload.as = "image";
  cupPreload.href = "src/brand/robys-takeaway-cup-v1.webp";
  document.head.append(cupPreload);

  const entryImport = import("./takeaway-entry.js?v=9dd7117c7364");

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
