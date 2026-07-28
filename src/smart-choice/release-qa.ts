import {
  RELEASE_QA_COPY,
  normalizeReleaseLocale,
  releaseNotice,
  type ReleaseLocale,
  type ReleaseNoticeKind
} from "./release-qa-domain.js";

declare global {
  interface Window {
    RobysSmartChoiceReleaseQA?: {
      getLocale(): ReleaseLocale;
      announcePrice(value: string): void;
      showFallback(kind: ReleaseNoticeKind): void;
    };
  }
}

const MENU_HREF = "../menu.html";
let lastAnnouncedPrice = "";
let observer: MutationObserver | null = null;

function currentLocale(): ReleaseLocale {
  return normalizeReleaseLocale(document.documentElement.lang);
}

function statusRegion(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#smart-choice-status");
}

function alertRegion(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#smart-choice-alert");
}

function announce(message: string): void {
  const region = statusRegion();
  if (!region) return;
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = message;
  }, 0);
}

function announcePrice(value: string): void {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized === lastAnnouncedPrice) return;
  lastAnnouncedPrice = normalized;
  announce(`${RELEASE_QA_COPY[currentLocale()].priceUpdated}: ${normalized}`);
}

function visiblePriceText(): string | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    ".result-price, [data-cart-total], .cart-total, .selected-summary [data-price]"
  );
  for (const candidate of candidates) {
    if (candidate.hidden) continue;
    const value = candidate.textContent?.trim();
    if (value) return value;
  }
  return null;
}

function observePrices(): void {
  observer?.disconnect();
  observer = new MutationObserver(() => {
    const price = visiblePriceText();
    if (price) announcePrice(price);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const initial = visiblePriceText();
  if (initial) announcePrice(initial);
}

function enhanceLanguageControls(): void {
  const locale = currentLocale();
  const copy = RELEASE_QA_COPY[locale];
  const group = document.querySelector<HTMLElement>(".language-switcher");
  group?.setAttribute("aria-label", copy.languageSelector);
  document.querySelectorAll<HTMLButtonElement>(".lang-button[data-lang]").forEach((button) => {
    const language = normalizeReleaseLocale(button.dataset.lang);
    const name = copy.languageNames[language];
    button.setAttribute("aria-label", name);
    button.title = name;
  });
}

function renderAlert(kind: ReleaseNoticeKind): void {
  const region = alertRegion();
  if (!region) return;
  if (kind === "online") {
    region.hidden = true;
    region.replaceChildren();
    announce(releaseNotice(currentLocale(), "online").title);
    return;
  }

  const locale = currentLocale();
  const copy = RELEASE_QA_COPY[locale];
  const notice = releaseNotice(locale, kind);
  const wrapper = document.createElement("div");
  wrapper.className = "release-alert__inner";
  const title = document.createElement("strong");
  title.textContent = notice.title;
  const body = document.createElement("span");
  body.textContent = notice.body ?? "";
  const link = document.createElement("a");
  link.href = MENU_HREF;
  link.textContent = copy.fallbackMenu;
  wrapper.append(title, body, link);
  region.replaceChildren(wrapper);
  region.hidden = false;
}

function installFatalFallbacks(): void {
  window.addEventListener("error", () => renderAlert("fatal"));
  window.addEventListener("unhandledrejection", () => renderAlert("fatal"));
  window.addEventListener("offline", () => renderAlert("offline"));
  window.addEventListener("online", () => renderAlert("online"));
  if (!navigator.onLine) renderAlert("offline");
}

function installLocaleObserver(): void {
  const localeObserver = new MutationObserver(() => {
    enhanceLanguageControls();
    const price = visiblePriceText();
    if (price) {
      lastAnnouncedPrice = "";
      announcePrice(price);
    }
  });
  localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}

function initialize(): void {
  enhanceLanguageControls();
  observePrices();
  installFatalFallbacks();
  installLocaleObserver();
  window.RobysSmartChoiceReleaseQA = {
    getLocale: currentLocale,
    announcePrice,
    showFallback: renderAlert
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
  initialize();
}
