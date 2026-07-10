const SERVICE_WORKER_URL = "sw.js?v=offline-20260710-runtime-1";
const TRUSTED_TYPES_POLICY = "robys-pwa";
let trustedTypesPolicy;

function syncConnectivityState() {
  document.documentElement.classList.toggle("is-offline", !navigator.onLine);
}
function trustedScriptUrl(value) {
  if (!window.trustedTypes) return value;
  trustedTypesPolicy ??= window.trustedTypes.createPolicy(TRUSTED_TYPES_POLICY, {
    createScriptURL(candidate) {
      if (candidate !== SERVICE_WORKER_URL) throw new TypeError("Unexpected script URL");
      return candidate;
    }
  });
  return trustedTypesPolicy.createScriptURL(value);
}
syncConnectivityState();
window.addEventListener("online", syncConnectivityState);
window.addEventListener("offline", syncConnectivityState);
async function startOfflineMode() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(trustedScriptUrl(SERVICE_WORKER_URL), { scope: "./" });
    await navigator.serviceWorker.ready;
    document.documentElement.dataset.offlineReady = "true";
    registration.update().catch(() => {});
  } catch (error) {
    document.documentElement.dataset.offlineReady = "false";
    console.warn("Roby's offline mode could not start", error);
  }
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", () => void startOfflineMode(), { once: true })
  : void startOfflineMode();
