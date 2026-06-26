const APK_URL = "downloads/robys-coffee-house-v1.1.apk";
const APK_NAME = "robys-coffee-house-v1.1.apk";

function upgradeAndroidDownload() {
  const section = document.querySelector("#android-app");
  if (!section) return false;

  const pill = section.querySelector(".android-app-screen-pill");
  if (pill && !pill.querySelector("img")) {
    const logo = document.createElement("img");
    logo.src = "src/android-mark.svg?v=20260627-1";
    logo.alt = "";
    logo.width = 48;
    logo.height = 48;
    logo.decoding = "async";
    pill.append(logo);
  }

  const current = section.querySelector(".android-download-button");
  if (current && current.tagName !== "A") {
    const link = document.createElement("a");
    for (const { name, value } of Array.from(current.attributes)) {
      if (name !== "type" && name !== "aria-busy") link.setAttribute(name, value);
    }
    link.href = APK_URL;
    link.download = APK_NAME;
    link.type = "application/vnd.android.package-archive";
    link.setAttribute("data-apk-download", "direct");
    while (current.firstChild) link.append(current.firstChild);
    current.replaceWith(link);
  }

  return true;
}

if (!upgradeAndroidDownload()) {
  const observer = new MutationObserver(() => {
    if (upgradeAndroidDownload()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
