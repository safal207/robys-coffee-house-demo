const SERVICE_WORKER_URL = "sw.js?v=offline-20260707-ios-install-3";
function syncConnectivityState() {
  document.documentElement.classList.toggle("is-offline", !navigator.onLine);
}
function trustedScriptUrl(value) {
  if (!window.trustedTypes) return value;
  const policy = window.trustedTypes.createPolicy("robys-pwa", {
    createScriptURL(candidate) {
      if (candidate !== SERVICE_WORKER_URL) throw new TypeError("Unexpected script URL");
      return candidate;
    }
  });
  return policy.createScriptURL(value);
}
syncConnectivityState();
window.addEventListener("online", syncConnectivityState);
window.addEventListener("offline", syncConnectivityState);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(trustedScriptUrl(SERVICE_WORKER_URL), { scope: "./" });
      await navigator.serviceWorker.ready;
      document.documentElement.dataset.offlineReady = "true";
      registration.update().catch(() => {});
    } catch (error) {
      document.documentElement.dataset.offlineReady = "false";
      console.warn("Roby's offline mode could not start", error);
    }
  }, { once: true });
}
