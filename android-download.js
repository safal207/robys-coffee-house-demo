const APK_NAME = "robys-coffee-house-v1.1.apk";
const APK_BYTES = 25231;
const PACKED_APK_BYTES = 25927;
const APK_SHA256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const APK_PARTS = Array.from({ length: 6 }, (_, index) => `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`);

let preparedUrl = "";
let preparePromise;

function localizedStatus(key) {
  const language = document.documentElement.lang || "tr";
  const copy = {
    preparing: { tr: "APK hazırlanıyor…", en: "Preparing APK…", ru: "Подготавливаем APK…" },
    ready: { tr: "İndirmeye hazır", en: "Ready to download", ru: "Готово к скачиванию" },
    error: { tr: "Tekrar deneyin", en: "Tap to retry", ru: "Нажмите, чтобы повторить" }
  };
  return copy[key]?.[language] ?? copy[key]?.tr ?? "";
}

function addAndroidLogo(section) {
  const pill = section.querySelector(".android-app-screen-pill");
  if (!pill || pill.querySelector("img")) return;
  const logo = document.createElement("img");
  logo.src = "src/android-mark.svg?v=20260627-2";
  logo.alt = "";
  logo.width = 48;
  logo.height = 48;
  logo.decoding = "async";
  pill.append(logo);
}

function replaceButton(section) {
  const current = section.querySelector(".android-download-button");
  if (!current) return null;
  if (current.tagName === "A") return current;

  const link = document.createElement("a");
  for (const { name, value } of Array.from(current.attributes)) {
    if (name !== "type" && name !== "aria-busy") link.setAttribute(name, value);
  }
  link.type = "application/vnd.android.package-archive";
  link.setAttribute("aria-disabled", "true");
  link.tabIndex = -1;
  while (current.firstChild) link.append(current.firstChild);
  current.replaceWith(link);
  return link;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function repairPackedApk(packed) {
  if (packed.byteLength !== PACKED_APK_BYTES) {
    throw new Error(`APK packed size mismatch: ${packed.byteLength}`);
  }

  const repaired = new Uint8Array(APK_BYTES);
  repaired.set(packed.subarray(0, 3145), 0);
  repaired.set(packed.subarray(3145, 16372), 3157);
  repaired.set(packed.subarray(17242, 25248), 16384);
  repaired.set(packed.subarray(25248), 24552);
  return repaired;
}

async function prepareApk(link, status) {
  if (preparedUrl) return preparedUrl;
  if (preparePromise) return preparePromise;

  status.textContent = localizedStatus("preparing");
  link.setAttribute("aria-busy", "true");

  preparePromise = (async () => {
    const responses = await Promise.all(APK_PARTS.map((path) => fetch(path, { cache: "force-cache" })));
    if (responses.some((response) => !response.ok)) throw new Error("APK part unavailable");
    const base64 = (await Promise.all(responses.map((response) => response.text()))).join("").replace(/\s+/g, "");
    const binary = atob(base64);
    const packed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bytes = repairPackedApk(packed);
    if (await sha256Hex(bytes) !== APK_SHA256) throw new Error("APK checksum mismatch");

    const blob = new Blob([bytes], { type: "application/vnd.android.package-archive" });
    preparedUrl = URL.createObjectURL(blob);
    link.href = preparedUrl;
    link.download = APK_NAME;
    link.setAttribute("data-apk-download", "verified-blob");
    link.removeAttribute("aria-disabled");
    link.removeAttribute("aria-busy");
    link.tabIndex = 0;
    status.textContent = localizedStatus("ready");
    return preparedUrl;
  })().catch((error) => {
    preparePromise = undefined;
    link.removeAttribute("aria-busy");
    status.textContent = localizedStatus("error");
    console.warn("Roby's APK preparation failed", error);
    throw error;
  });

  return preparePromise;
}

function upgradeAndroidDownload() {
  const section = document.querySelector("#android-app");
  if (!section) return false;

  addAndroidLogo(section);
  const link = replaceButton(section);
  if (!link) return false;
  const status = section.querySelector("#android-download-status") || document.createElement("span");

  link.addEventListener("click", (event) => {
    if (link.getAttribute("aria-disabled") !== "true") return;
    event.preventDefault();
    void prepareApk(link, status);
  });

  void prepareApk(link, status);
  return true;
}

if (!upgradeAndroidDownload()) {
  const observer = new MutationObserver(() => {
    if (upgradeAndroidDownload()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

window.addEventListener("pagehide", () => {
  if (preparedUrl) URL.revokeObjectURL(preparedUrl);
}, { once: true });
