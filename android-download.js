const APK_URL = "downloads/robys-coffee-house-v1.1.apk";
const APK_NAME = "robys-coffee-house-v1.1.apk";

function addAndroidLogo(section) {
  const pill = section.querySelector(".android-app-screen-pill");
  if (!pill || pill.querySelector("img")) return;
  const logo = document.createElement("img");
  logo.src = "src/android-mark.svg?v=20260627-1";
  logo.alt = "";
  logo.width = 48;
  logo.height = 48;
  logo.decoding = "async";
  pill.append(logo);
}

function wireDirectDownload(section) {
  const current = section.querySelector(".android-download-button");
  if (!current) return false;
  const link = current.tagName === "A" ? current : document.createElement("a");
  if (link !== current) {
    for (const { name, value } of Array.from(current.attributes)) {
      if (name !== "type" && name !== "aria-busy" && name !== "aria-disabled") link.setAttribute(name, value);
    }
    while (current.firstChild) link.append(current.firstChild);
    current.replaceWith(link);
  }
  link.href = APK_URL;
  link.download = APK_NAME;
  link.type = "application/vnd.android.package-archive";
  link.setAttribute("data-apk-download", "direct-apk");
  link.removeAttribute("aria-disabled");
  link.removeAttribute("aria-busy");
  link.removeAttribute("tabindex");
  const status = section.querySelector("#android-download-status");
  if (status) status.textContent = "";
  return true;
}

function upgradeAndroidDownload() {
  const section = document.querySelector("#android-app");
  if (!section) return false;
  addAndroidLogo(section);
  return wireDirectDownload(section);
}

if (!upgradeAndroidDownload()) {
  const observer = new MutationObserver(() => {
    if (upgradeAndroidDownload()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
