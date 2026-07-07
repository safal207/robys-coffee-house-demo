const MOBILE_INSTALL_COPY_URL = "mobile-install-copy.json?v=ios-install-20260707-1";
const MOBILE_INSTALL_OBSERVER_TIMEOUT_MS = 10000;
const MOBILE_INSTALL_MAX_ATTEMPTS = 50;

let mobileInstallCopy = {};
let mobileInstallCopyPromise;

function loadMobileInstallCopy() {
  if (mobileInstallCopyPromise) return mobileInstallCopyPromise;
  mobileInstallCopyPromise = fetch(MOBILE_INSTALL_COPY_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`Mobile install copy unavailable: ${response.status}`);
      return response.json();
    })
    .then((copy) => {
      if (!copy?.tr || !copy?.en || !copy?.ru) throw new TypeError("Mobile install copy is incomplete");
      mobileInstallCopy = copy;
      return copy;
    })
    .catch((error) => {
      mobileInstallCopyPromise = undefined;
      throw error;
    });
  return mobileInstallCopyPromise;
}

function currentMobileInstallLanguage() {
  const language = document.documentElement.lang;
  return Object.prototype.hasOwnProperty.call(mobileInstallCopy, language) ? language : "tr";
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function bindMobileCopy(element, key) {
  if (!element) return;
  element.removeAttribute("data-localized");
  element.removeAttribute("data-tr");
  element.removeAttribute("data-en");
  element.removeAttribute("data-ru");
  element.dataset.mobileInstallCopy = key;
}

function bindMobileAriaLabel(element, key) {
  if (!element) return;
  element.dataset.mobileInstallAriaLabel = key;
}

function syncMobileInstallCopy(root = document) {
  const copy = mobileInstallCopy[currentMobileInstallLanguage()];
  if (!copy) return;
  root.querySelectorAll("[data-mobile-install-copy]").forEach((element) => {
    const value = copy[element.dataset.mobileInstallCopy];
    if (value) element.textContent = value;
  });
  root.querySelectorAll("[data-mobile-install-aria-label]").forEach((element) => {
    const value = copy[element.dataset.mobileInstallAriaLabel];
    if (value) element.setAttribute("aria-label", value);
  });
}

function createInstallDialog() {
  const existing = document.querySelector("#ios-install-dialog");
  if (existing) return existing;

  const dialog = document.createElement("dialog");
  dialog.id = "ios-install-dialog";
  dialog.className = "mobile-install-dialog";
  dialog.setAttribute("aria-labelledby", "ios-install-dialog-title");

  const inner = document.createElement("div");
  inner.className = "mobile-install-dialog-inner";

  const closeIcon = document.createElement("button");
  closeIcon.className = "mobile-install-dialog-close";
  closeIcon.type = "button";
  bindMobileAriaLabel(closeIcon, "closeLabel");
  closeIcon.textContent = "×";

  const kicker = document.createElement("p");
  kicker.className = "mobile-install-dialog-kicker";
  bindMobileCopy(kicker, "dialogKicker");

  const title = document.createElement("h2");
  title.id = "ios-install-dialog-title";
  bindMobileCopy(title, "dialogTitle");

  const lead = document.createElement("p");
  lead.className = "mobile-install-dialog-lead";
  bindMobileCopy(lead, "dialogLead");

  const steps = document.createElement("ol");
  steps.className = "mobile-install-steps";
  [
    ["step1Title", "step1Text"],
    ["step2Title", "step2Text"],
    ["step3Title", "step3Text"]
  ].forEach(([titleKey, textKey]) => {
    const item = document.createElement("li");
    item.className = "mobile-install-step";
    const body = document.createElement("div");
    const stepTitle = document.createElement("strong");
    const stepText = document.createElement("span");
    bindMobileCopy(stepTitle, titleKey);
    bindMobileCopy(stepText, textKey);
    body.append(stepTitle, stepText);
    item.append(body);
    steps.append(item);
  });

  const done = document.createElement("button");
  done.className = "mobile-install-dialog-done";
  done.type = "button";
  bindMobileCopy(done, "close");

  const close = () => dialog.close();
  closeIcon.addEventListener("click", close);
  done.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });

  inner.append(closeIcon, kicker, title, lead, steps, done);
  dialog.append(inner);
  document.body.append(dialog);
  syncMobileInstallCopy(dialog);
  return dialog;
}

function createIosInstallAction() {
  const action = document.createElement("div");
  action.className = "mobile-install-action ios-install-action";
  const dialog = createInstallDialog();

  const button = document.createElement("button");
  button.className = "ios-install-button";
  button.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", dialog.id);

  const icon = document.createElement("span");
  icon.className = "ios-install-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "";

  const label = document.createElement("span");
  bindMobileCopy(label, "iosButton");
  button.append(icon, label);

  const meta = document.createElement("span");
  meta.className = "ios-install-meta";
  bindMobileCopy(meta, "iosMeta");

  button.addEventListener("click", () => {
    syncMobileInstallCopy(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  action.append(button, meta);
  return action;
}

function enhanceMobileInstallSection() {
  const section = document.querySelector("#android-app");
  const visit = document.querySelector("#visit");
  if (!section || !visit || section.dataset.mobileInstallEnhanced === "true") return false;

  section.dataset.mobileInstallEnhanced = "true";
  section.classList.add("mobile-app-section");
  section.dataset.platform = isIosDevice() ? "ios" : isAndroidDevice() ? "android" : "desktop";
  section.dataset.installed = String(isStandaloneMode());
  visit.after(section);

  const title = section.querySelector("h2");
  const titleParts = title ? Array.from(title.querySelectorAll("span, em")) : [];
  bindMobileCopy(titleParts[0], "titlePrimary");
  bindMobileCopy(titleParts[1], "titleAccent");
  bindMobileCopy(section.querySelector(".android-app-description"), "description");

  const actions = section.querySelector(".android-app-actions");
  const androidButton = actions?.querySelector(".android-download-button");
  const androidMeta = actions?.querySelector(".android-app-meta");
  if (actions && androidButton && !actions.querySelector(".android-install-action")) {
    const androidAction = document.createElement("div");
    androidAction.className = "mobile-install-action android-install-action";
    androidButton.before(androidAction);
    androidAction.append(androidButton);
    if (androidMeta) androidAction.append(androidMeta);
    actions.prepend(createIosInstallAction());
  }

  const note = section.querySelector(".android-app-note");
  const noteKey = isStandaloneMode()
    ? "installed"
    : section.dataset.platform === "ios"
      ? "noteIos"
      : section.dataset.platform === "android"
        ? "noteAndroid"
        : "noteDesktop";
  bindMobileCopy(note, noteKey);

  syncMobileInstallCopy(section);
  return true;
}

async function setupMobileInstallExperience() {
  try {
    await loadMobileInstallCopy();
  } catch (error) {
    console.warn("Roby's mobile install copy could not load", error);
    window.addEventListener("online", () => void setupMobileInstallExperience(), { once: true });
    document.addEventListener("pointerdown", () => void setupMobileInstallExperience(), { once: true, passive: true });
    return;
  }

  if (enhanceMobileInstallSection()) return;
  let attempts = 0;
  let timeoutId;
  const observer = new MutationObserver(() => {
    attempts += 1;
    if (enhanceMobileInstallSection() || attempts >= MOBILE_INSTALL_MAX_ATTEMPTS) {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  timeoutId = window.setTimeout(() => observer.disconnect(), MOBILE_INSTALL_OBSERVER_TIMEOUT_MS);
}

new MutationObserver(() => syncMobileInstallCopy()).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"]
});

void setupMobileInstallExperience();
