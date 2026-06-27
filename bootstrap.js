document.documentElement.classList.add("js");

function installAndroidButtonLogo() {
  const placeholder = document.querySelector("#android-app .android-download-button .android-download-icon");
  if (!placeholder) return false;

  const logo = document.createElement("img");
  logo.className = "android-download-logo";
  logo.src = "src/android-mark.svg?v=20260627-2";
  logo.alt = "";
  logo.width = 25;
  logo.height = 25;
  logo.decoding = "async";
  logo.setAttribute("aria-hidden", "true");
  placeholder.replaceWith(logo);
  return true;
}

if (!installAndroidButtonLogo()) {
  const observer = new MutationObserver(() => {
    if (installAndroidButtonLogo()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
