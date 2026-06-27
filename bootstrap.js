document.documentElement.classList.add("js");

const ROBYS_APK_NAME = "robys-coffee-house-v1.1.apk";
const ROBYS_APK_SHA256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const ROBYS_APK_BYTES = 25231;
const ROBYS_APK_PARTS = Array.from({ length: 9 }, (_, index) => `downloads/android-v1.1-packed/a-${String(index + 1).padStart(2, "0")}.txt`);
const ROBYS_OFFLINE_ATTEMPT = "robys-offline-bootstrap";
const ROBYS_PAYLOAD_ALPHABET_OFFSET = "a".charCodeAt(0);
let robysApkObjectUrl = "";

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function reconstructVerifiedApk() {
  if (!("DecompressionStream" in window)) throw new Error("Gzip decompression is not supported by this browser");

  const encodedParts = await Promise.all(ROBYS_APK_PARTS.map(async (path) => {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) throw new Error(`APK payload is unavailable: ${path}`);
    return (await response.text()).replace(/\s+/g, "");
  }));

  const encoded = encodedParts.join("");
  if (encoded.length % 2 !== 0 || !/^[a-p]+$/.test(encoded)) throw new Error("APK payload encoding is invalid");

  const compressed = new Uint8Array(encoded.length / 2);
  for (let offset = 0; offset < encoded.length; offset += 2) {
    const high = encoded.charCodeAt(offset) - ROBYS_PAYLOAD_ALPHABET_OFFSET;
    const low = encoded.charCodeAt(offset + 1) - ROBYS_PAYLOAD_ALPHABET_OFFSET;
    compressed[offset / 2] = ((high << 4) | low) ^ 0xa5;
  }

  const decompressedStream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const apk = new Uint8Array(await new Response(decompressedStream).arrayBuffer());
  if (apk.length !== ROBYS_APK_BYTES) throw new Error(`APK byte size changed: ${apk.length}`);
  if (apk[0] !== 0x50 || apk[1] !== 0x4b) throw new Error("APK ZIP signature is invalid");

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", apk));
  if (bytesToHex(digest) !== ROBYS_APK_SHA256) throw new Error("APK checksum verification failed");
  return apk;
}

async function prepareAndroidDownload(link, status) {
  if (link.dataset.apkState === "loading" || link.dataset.apkState === "ready") return;
  link.dataset.apkState = "loading";
  link.dataset.apkDownload = "verifying";
  link.href = "#android-app";
  link.setAttribute("aria-busy", "true");
  link.setAttribute("aria-disabled", "true");
  if (status) status.textContent = "Проверяем APK…";

  try {
    const apk = await reconstructVerifiedApk();
    if (robysApkObjectUrl) URL.revokeObjectURL(robysApkObjectUrl);
    robysApkObjectUrl = URL.createObjectURL(new Blob([apk], { type: "application/vnd.android.package-archive" }));
    link.href = robysApkObjectUrl;
    link.download = ROBYS_APK_NAME;
    link.type = "application/vnd.android.package-archive";
    link.dataset.apkState = "ready";
    link.dataset.apkDownload = "verified-blob";
    link.removeAttribute("aria-busy");
    link.removeAttribute("aria-disabled");
    link.removeAttribute("tabindex");
    if (status) status.textContent = "APK проверен — можно скачивать";
  } catch (error) {
    link.dataset.apkState = "error";
    link.dataset.apkDownload = "error";
    link.removeAttribute("aria-busy");
    link.setAttribute("aria-disabled", "true");
    if (status) status.textContent = "Не удалось подготовить APK. Обновите страницу.";
    console.warn("Roby's APK verification failed", error);
  }
}

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
    mark.decoding = "async";
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

  if (link.dataset.apkGuard !== "ready") {
    link.dataset.apkGuard = "ready";
    link.addEventListener("click", (event) => {
      if (link.dataset.apkState !== "ready") event.preventDefault();
    });
  }
  void prepareAndroidDownload(link, section.querySelector("#android-download-status"));
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
window.addEventListener("pagehide", () => {
  if (robysApkObjectUrl) URL.revokeObjectURL(robysApkObjectUrl);
}, { once: true });
window.addEventListener("load", () => bootstrapOfflineMenu().catch((error) => console.warn("Roby's offline mode could not start", error)), { once: true });
