document.documentElement.classList.add("js");

const ROBYS_APK_URL = "downloads/robys-coffee-house-v1.1.apk";
const ROBYS_APK_NAME = "robys-coffee-house-v1.1.apk";
const ROBYS_OFFLINE_ATTEMPT = "robys-offline-bootstrap";

function upgradeAndroidDownload() {
  const section = document.querySelector("#android-app");
  if (!section) return false;

  const icon = section.querySelector(".android-download-icon");
  if (icon && !icon.querySelector("img")) {
    const mark = document.createElement("img");
    mark.src = "src/android-mark.svg?v=20260627-2";
    mark.alt = "";
    mark.width = 24;
    mark.height = 24;
    mark.setAttribute("aria-hidden", "true");
    icon.replaceChildren(mark);
    icon.className = "android-download-logo";
  }

  const current = section.querySelector(".android-download-button");
  if (!current) return false;
  const link = current.tagName === "A" ? current : document.createElement("a");
  if (link !== current) {
    for (const { name, value } of Array.from(current.attributes)) {
      if (name !== "type" && name !== "disabled" && name !== "aria-busy") link.setAttribute(name, value);
    }
    while (current.firstChild) link.append(current.firstChild);
    current.replaceWith(link);
  }
  link.href = ROBYS_APK_URL;
  link.download = ROBYS_APK_NAME;
  link.type = "application/vnd.android.package-archive";
  link.dataset.apkDownload = "direct-apk";
  link.removeAttribute("aria-disabled");
  link.removeAttribute("tabindex");
  return true;
}

function watchAndroidDownload() {
  if (upgradeAndroidDownload()) return;
  const observer = new MutationObserver(() => {
    if (upgradeAndroidDownload()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function syncConnectivityState() {
  document.documentElement.classList.toggle("is-offline", !navigator.onLine);
  const status = document.querySelector("[data-connectivity-status]");
  if (status) status.textContent = navigator.onLine ? "Online" : "Offline";
}

async function bootstrapOfflineMenu() {
  if (!("serviceWorker" in navigator)) return;
  const path = location.pathname;
  if (!path.endsWith("/menu.html") && !path.endsWith("/404.html") && !path.endsWith("404.html")) return;

  const registration = await navigator.serviceWorker.getRegistration("./");
  if (registration) {
    sessionStorage.removeItem(ROBYS_OFFLINE_ATTEMPT);
    await navigator.serviceWorker.ready;
    registration.update().catch(() => {});
    return;
  }

  if (sessionStorage.getItem(ROBYS_OFFLINE_ATTEMPT) === "1") return;
  sessionStorage.setItem(ROBYS_OFFLINE_ATTEMPT, "1");
  const bridge = new URL("sw-register.html", location.href);
  bridge.searchParams.set("return", location.href);
  location.replace(bridge.href);
}

syncConnectivityState();
watchAndroidDownload();
window.addEventListener("online", syncConnectivityState);
window.addEventListener("offline", syncConnectivityState);
window.addEventListener("load", () => bootstrapOfflineMenu().catch((error) => console.warn("Roby's offline mode could not start", error)), { once: true });
