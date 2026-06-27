const SERVICE_WORKER_BRIDGE = "sw-register.html";
const SERVICE_WORKER_ATTEMPT_KEY = "robys-offline-bootstrap";
// Registration is delegated to sw-register.js, where navigator.serviceWorker.register(..., { scope: "./" }) runs outside the strict Trusted Types page.

function syncConnectivityState() {
  document.documentElement.classList.toggle("is-offline", !navigator.onLine);
  const status = document.querySelector("[data-connectivity-status]");
  if (status) status.textContent = navigator.onLine ? "Online" : "Offline";
}

function decorateAndroidButton() {
  const icon = document.querySelector(".android-download-icon");
  if (!icon || icon.querySelector("img")) return Boolean(icon);
  const logo = document.createElement("img");
  logo.src = "src/android-mark.svg?v=20260627-2";
  logo.alt = "";
  logo.width = 24;
  logo.height = 24;
  logo.decoding = "async";
  logo.setAttribute("aria-hidden", "true");
  icon.replaceChildren(logo);
  return true;
}

function watchAndroidButton() {
  if (decorateAndroidButton()) return;
  const observer = new MutationObserver(() => {
    if (decorateAndroidButton()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function canBootstrapOfflineMode() {
  const path = window.location.pathname;
  return path.endsWith("/menu.html") || path.endsWith("/404.html") || path.endsWith("404.html");
}

async function ensureOfflineMode() {
  if (!("serviceWorker" in navigator) || !canBootstrapOfflineMode()) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration("./");
    if (registration) {
      sessionStorage.removeItem(SERVICE_WORKER_ATTEMPT_KEY);
      await navigator.serviceWorker.ready;
      registration.update().catch(() => {});
      return;
    }

    if (sessionStorage.getItem(SERVICE_WORKER_ATTEMPT_KEY) === "1") return;
    sessionStorage.setItem(SERVICE_WORKER_ATTEMPT_KEY, "1");

    const bridge = new URL(SERVICE_WORKER_BRIDGE, window.location.href);
    bridge.searchParams.set("return", window.location.href);
    window.location.replace(bridge.href);
  } catch (error) {
    console.warn("Roby's offline mode could not start", error);
  }
}

syncConnectivityState();
watchAndroidButton();
window.addEventListener("online", syncConnectivityState);
window.addEventListener("offline", syncConnectivityState);
window.addEventListener("load", () => void ensureOfflineMode(), { once: true });
