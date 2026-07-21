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

installAppleTouchIcon();

const photoLogo = document.createElement("link");
photoLogo.rel = "stylesheet";
photoLogo.href = "brand-photo-logo.css?v=20260721-type-2";
document.head.append(photoLogo);

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
