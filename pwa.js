const SERVICE_WORKER_URL = "sw.js?v=pairing-video-fix-20260916-2";
const root = document.documentElement;
let workerPolicy;

function syncOfflineState() {
  root.classList.toggle("is-offline", !navigator.onLine);
}

const trustedWorkerUrl = (value) => globalThis.trustedTypes
  ? (workerPolicy ??= globalThis.trustedTypes.createPolicy("robys-pwa", {
    createScriptURL(url) {
      if (url !== SERVICE_WORKER_URL) throw new TypeError("Unexpected service worker URL");
      return url;
    }
  })).createScriptURL(value)
  : value;

async function registerOfflineWorker() {
  try {
    await navigator.serviceWorker.register(trustedWorkerUrl(SERVICE_WORKER_URL), { scope: "./" });
    await navigator.serviceWorker.ready;
    root.dataset.offlineReady = "true";
  } catch {
    root.dataset.offlineReady = "false";
  }
}

syncOfflineState();
for (const eventName of ["online", "offline"]) {
  addEventListener(eventName, syncOfflineState);
}
if ("serviceWorker" in navigator) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerOfflineWorker, { once: true });
  } else {
    void registerOfflineWorker();
  }
}
