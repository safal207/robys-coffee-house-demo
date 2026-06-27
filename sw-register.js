const SERVICE_WORKER_URL = "sw.js?v=offline-20260627-5";
const SERVICE_WORKER_ATTEMPT_KEY = "robys-offline-bootstrap";

function returnTarget() {
  const fallback = new URL("menu.html", window.location.href);
  const requested = new URLSearchParams(window.location.search).get("return");
  if (!requested) return fallback;

  try {
    const target = new URL(requested, window.location.href);
    return target.origin === window.location.origin ? target : fallback;
  } catch {
    return fallback;
  }
}

async function registerOfflineMode() {
  const target = returnTarget();
  const status = document.querySelector("[data-connectivity-status]");

  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./" });
    await navigator.serviceWorker.ready;
    registration.update().catch(() => {});
    if (status) status.textContent = "Готово";
  } catch (error) {
    if (status) status.textContent = "Не удалось включить офлайн-режим";
    console.warn("Roby's service worker registration failed", error);
  } finally {
    sessionStorage.removeItem(SERVICE_WORKER_ATTEMPT_KEY);
    window.location.replace(target.href);
  }
}

void registerOfflineMode();
