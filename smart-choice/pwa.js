const SERVICE_WORKER_URL = "../sw.js?v=premium-cache-new-20260904-1";
const root = document.documentElement;

function reflectConnection() {
  root.classList.toggle("is-offline", !navigator.onLine);
}

async function registerOfflineRuntime() {
  if (!("serviceWorker" in navigator)) {
    root.dataset.offlineReady = "false";
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "../" });
    await registration.update().catch(() => {});
    await navigator.serviceWorker.ready;
    root.dataset.offlineReady = "true";
  } catch {
    root.dataset.offlineReady = "false";
  }
}

reflectConnection();
for (const eventName of ["online", "offline"]) {
  window.addEventListener(eventName, reflectConnection);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", registerOfflineRuntime, { once: true });
} else {
  void registerOfflineRuntime();
}
