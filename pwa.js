const SERVICE_WORKER_URL = "sw.js?v=offline-20260707-8";
const TRUSTED_TYPES_POLICY = "robys-pwa";

function syncConnectivityState() {
  document.documentElement.classList.toggle("is-offline", !navigator.onLine);
  const status = document.querySelector("[data-connectivity-status]");
  if (status) status.textContent = navigator.onLine ? "Online" : "Offline";
}

function serviceWorkerUrl() {
  if (!window.trustedTypes) return SERVICE_WORKER_URL;
  const policy = window.trustedTypes.createPolicy(TRUSTED_TYPES_POLICY, {
    createScriptURL(value) {
      if (value !== SERVICE_WORKER_URL) throw new TypeError("Unexpected service worker URL");
      return value;
    }
  });
  return policy.createScriptURL(SERVICE_WORKER_URL);
}

syncConnectivityState();
window.addEventListener("online", syncConnectivityState);
window.addEventListener("offline", syncConnectivityState);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: "./" });
      await navigator.serviceWorker.ready;
      document.documentElement.dataset.offlineReady = "true";
      registration.update().catch(() => {});
    } catch (error) {
      document.documentElement.dataset.offlineReady = "false";
      console.warn("Roby's offline mode could not start", error);
    }
  }, { once: true });
}
