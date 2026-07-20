document.documentElement.classList.add("js");

const ANDROID_LOGO_OBSERVER_TIMEOUT_MS = 10_000;
const ANDROID_LOGO_MAX_ATTEMPTS = 100;

function installAppleTouchIcon() {
  if (document.head.querySelector('link[rel="apple-touch-icon"]')) return;

  const link = document.createElement("link");
  link.rel = "apple-touch-icon";
  link.href = "apple-touch-icon.png?v=ios-install-20260707-1";
  document.head.append(link);
}

function installAndroidButtonLogo() {
  const placeholder = document.querySelector("#android-app .android-download-button .android-download-icon");
  if (!placeholder) return false;

  const logo = document.createElement("img");
  logo.className = "android-download-logo";
  logo.src = "src/android-mark.svg?v=20260627-2";
  logo.alt = "";
  logo.width = 20;
  logo.height = 22;
  logo.decoding = "async";
  logo.setAttribute("aria-hidden", "true");
  placeholder.replaceWith(logo);
  return true;
}

installAppleTouchIcon();

if (!installAndroidButtonLogo()) {
  let attempts = 0;
  let timeoutId;
  const observer = new MutationObserver(() => {
    attempts += 1;
    if (installAndroidButtonLogo() || attempts >= ANDROID_LOGO_MAX_ATTEMPTS) {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  timeoutId = window.setTimeout(() => observer.disconnect(), ANDROID_LOGO_OBSERVER_TIMEOUT_MS);
}

const MOBILE_NAVIGATION_LABELS = {
  tr: { open: "Menüyü aç", close: "Menüyü kapat" },
  en: { open: "Open menu", close: "Close menu" },
  ru: { open: "Открыть меню", close: "Закрыть меню" }
};

function installMobileNavigationAccessibility() {
  const toggle = document.querySelector(".menu-toggle");
  const navigation = document.querySelector("#main-navigation");
  if (!(toggle instanceof HTMLButtonElement) || !(navigation instanceof HTMLElement)) return;

  const mobileQuery = window.matchMedia("(max-width: 980px)");
  const isOpen = () => document.body.classList.contains("menu-open");
  const languageButtons = () => Array.from(document.querySelectorAll(".header-actions .lang-button"));
  const navigationLinks = () => Array.from(navigation.querySelectorAll("a[href]"));
  const focusableElements = () => [...navigationLinks(), ...languageButtons(), toggle]
    .filter((element) => element instanceof HTMLElement && !element.hasAttribute("disabled") && element.getClientRects().length > 0);

  const updateToggleLabel = () => {
    const lang = document.documentElement.lang;
    const labels = MOBILE_NAVIGATION_LABELS[lang] ?? MOBILE_NAVIGATION_LABELS.tr;
    toggle.setAttribute("aria-label", isOpen() ? labels.close : labels.open);
  };

  const syncState = ({ focusMenu = false, restoreToggle = false } = {}) => {
    const open = isOpen();
    navigation.toggleAttribute("inert", mobileQuery.matches && !open);
    toggle.setAttribute("aria-expanded", String(open));
    updateToggleLabel();

    if (focusMenu && mobileQuery.matches && open) {
      navigationLinks()[0]?.focus();
    } else if (restoreToggle) {
      toggle.focus();
    }
  };

  toggle.addEventListener("click", () => {
    const wasOpen = isOpen();
    queueMicrotask(() => syncState({ focusMenu: !wasOpen, restoreToggle: wasOpen }));
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      queueMicrotask(() => syncState());
    }
  });

  document.querySelectorAll(".header-actions .lang-button").forEach((button) => {
    button.addEventListener("click", () => queueMicrotask(updateToggleLabel));
  });

  document.addEventListener("keydown", (event) => {
    if (!mobileQuery.matches || !isOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      document.body.classList.remove("menu-open");
      syncState({ restoreToggle: true });
      return;
    }

    if (event.key !== "Tab") return;
    const focusables = focusableElements();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (!focusables.includes(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const syncViewport = () => {
    if (!mobileQuery.matches) document.body.classList.remove("menu-open");
    syncState();
  };

  mobileQuery.addEventListener?.("change", syncViewport);
  window.addEventListener("resize", syncViewport, { passive: true });
  syncState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installMobileNavigationAccessibility, { once: true });
} else {
  installMobileNavigationAccessibility();
}
