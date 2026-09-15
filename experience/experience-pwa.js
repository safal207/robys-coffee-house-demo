const SERVICE_WORKER_PATH = "../sw.js?v=premium-cache-new-20260904-1";
const SERVICE_WORKER_SCOPE = "../";
const trustedTypesApi = globalThis.trustedTypes;
let trustedPolicy;

function trustedScriptUrl(value) {
  if (!trustedTypesApi) return value;
  trustedPolicy ??= trustedTypesApi.createPolicy("robys-pwa", {
    createScriptURL(candidate) {
      if (candidate === new URL(SERVICE_WORKER_PATH, document.baseURI).href) return candidate;
      throw new TypeError("Rejected service worker URL");
    }
  });
  return trustedPolicy.createScriptURL(value);
}

async function registerExperienceServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const serviceWorkerUrl = new URL(SERVICE_WORKER_PATH, document.baseURI).href;
  const scopeUrl = new URL(SERVICE_WORKER_SCOPE, document.baseURI).href;
  try {
    await navigator.serviceWorker.register(trustedScriptUrl(serviceWorkerUrl), { scope: scopeUrl });
    await navigator.serviceWorker.ready;
    document.documentElement.dataset.offlineReady = "true";
  } catch {
    document.documentElement.dataset.offlineReady = "false";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", registerExperienceServiceWorker, { once: true });
} else {
  registerExperienceServiceWorker();
}
