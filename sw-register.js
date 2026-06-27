const RETURN_FALLBACK = new URL("menu.html", location.href);

function safeReturnTarget() {
  const requested = new URLSearchParams(location.search).get("return");
  if (!requested) return RETURN_FALLBACK;
  try {
    const target = new URL(requested, location.href);
    return target.origin === location.origin ? target : RETURN_FALLBACK;
  } catch {
    return RETURN_FALLBACK;
  }
}

async function registerOfflineWorker() {
  const status = document.querySelector("[data-connectivity-status]");
  const target = safeReturnTarget();
  try {
    const registration = await navigator.serviceWorker.register("sw.js?v=20260627-1", { scope: "./" });
    await navigator.serviceWorker.ready;
    registration.update().catch(() => {});
    if (status) status.textContent = "Готово";
  } catch (error) {
    if (status) status.textContent = "Не удалось включить офлайн-режим";
    console.warn("Roby's service worker registration failed", error);
  } finally {
    sessionStorage.removeItem("robys-offline-bootstrap");
    location.replace(target.href);
  }
}

void registerOfflineWorker();
