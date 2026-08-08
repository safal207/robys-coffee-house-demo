document.documentElement.classList.add("js");

const ANDROID_LOGO_OBSERVER_TIMEOUT_MS = 10_000;
const ANDROID_LOGO_MAX_ATTEMPTS = 100;

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

const MORNING_ENTRY_PREPAINT_TIMEOUT_MS = 2_600;

function morningEntryEligible() {
  const mode = new URLSearchParams(window.location.search).get("entry");
  if (mode === "off") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (mode === "morning") return true;

  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  if (navigation?.type === "back_forward") return false;

  const hour = new Date().getHours();
  return hour >= 5 && hour < 12;
}

function revealProductAfterEntryFailure() {
  window.__robysMorningEntryAborted = true;
  document.documentElement.style.visibility = "";
  document.documentElement.style.backgroundColor = "";
  document.querySelector(".robys-morning-entry")?.remove();
}

function loadMorningEntryIfEligible() {
  if (!morningEntryEligible()) return;

  window.__robysMorningEntryAborted = false;
  document.documentElement.style.backgroundColor = "#170a08";

  import("./morning-entry.js?v=20260808-volumetric-v2")
    .catch(revealProductAfterEntryFailure);

  window.setTimeout(() => {
    const overlay = document.querySelector(".robys-morning-entry");
    if (!overlay) revealProductAfterEntryFailure();
    else {
      document.documentElement.style.visibility = "";
      document.documentElement.style.backgroundColor = "";
      overlay.remove();
    }
  }, MORNING_ENTRY_PREPAINT_TIMEOUT_MS);
}

installAppleTouchIcon();

loadMorningEntryIfEligible();

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
