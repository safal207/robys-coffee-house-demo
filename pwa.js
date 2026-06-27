const SERVICE_WORKER_URL = "sw.js?v=offline-20260627-4";

function syncConnectivityState() {
  document.documentElement.classList.toggle("is-offline", !navigator.onLine);
  const status = document.querySelector("[data-connectivity-status]");
  if (status) status.textContent = navigator.onLine ? "Online" : "Offline";
}

syncConnectivityState();
window.addEventListener("online", syncConnectivityState);
window.addEventListener("offline", syncConnectivityState);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./" });
      await navigator.serviceWorker.ready;
      registration.update().catch(() => {});
    } catch (error) {
      console.warn("Roby's offline mode could not start", error);
    }
  }, { once: true });
}
