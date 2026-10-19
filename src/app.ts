import { dictionaries, type CopyKey, type Lang } from "./i18n";
import "./choice-help-entry.js";
import "../analytics.js";

const q = <T extends Element>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);
const qa = <T extends Element>(selector: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(selector));

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Language persistence is optional.
  }
}

let language: Lang = readStorage("robys-language") === "en"
  ? "en"
  : readStorage("robys-language") === "ru"
    ? "ru"
    : "tr";

function appendSafeRichText(target: HTMLElement, value: string) {
  target.replaceChildren();
  const containers: HTMLElement[] = [target];
  const allowedToken = /<br\s*\/?>|<em>|<\/em>/gi;
  let cursor = 0;

  for (const match of value.matchAll(allowedToken)) {
    const index = match.index ?? 0;
    const container = containers[containers.length - 1] ?? target;
    if (index > cursor) container.append(document.createTextNode(value.slice(cursor, index)));

    const token = match[0].toLowerCase();
    if (token.startsWith("<br")) {
      container.append(document.createElement("br"));
    } else if (token === "<em>") {
      const emphasis = document.createElement("em");
      container.append(emphasis);
      containers.push(emphasis);
    } else if (containers.length > 1) {
      containers.pop();
    }

    cursor = index + match[0].length;
  }

  const container = containers[containers.length - 1] ?? target;
  if (cursor < value.length) container.append(document.createTextNode(value.slice(cursor)));
}

function translateNode(element: HTMLElement) {
  const textKey = element.dataset.i18n as CopyKey | undefined;
  if (textKey) element.textContent = dictionaries[language][textKey];

  const richKey = element.dataset.i18nRich as CopyKey | undefined;
  if (richKey) appendSafeRichText(element, dictionaries[language][richKey]);

  if (element.matches("[data-localized]")) {
    const localized = element.dataset[language];
    if (localized) element.textContent = localized;
  }
}

function translateTree(root: ParentNode = document) {
  if (root instanceof HTMLElement) translateNode(root);
  qa<HTMLElement>("[data-i18n],[data-i18n-rich],[data-localized]", root).forEach(translateNode);
}

function setLanguage(next: Lang) {
  language = next;
  document.documentElement.lang = next;
  writeStorage("robys-language", next);
  translateTree();

  qa<HTMLButtonElement>(".lang-button").forEach((button) => {
    const active = button.dataset.lang === next;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const toggle = q<HTMLButtonElement>(".menu-toggle");
  toggle?.setAttribute("aria-label", dictionaries[language][toggle.getAttribute("aria-expanded") === "true" ? "closeMenu" : "openMenu"]);
}

function setupNavigation() {
  const toggle = q<HTMLButtonElement>(".menu-toggle");
  const navigation = q<HTMLElement>("#main-navigation");

  const close = (restoreFocus = false) => {
    document.body.classList.remove("menu-open");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.setAttribute("aria-label", dictionaries[language].openMenu);
    if (restoreFocus) toggle?.focus();
  };

  toggle?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", dictionaries[language][open ? "closeMenu" : "openMenu"]);
    if (open) navigation?.querySelector<HTMLAnchorElement>("a")?.focus();
  });

  navigation?.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) close();
  });

  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("menu-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      const controls = qa<HTMLElement>("#main-navigation a, .header-actions button")
        .filter((control) => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) close();
  }, { passive: true });
}

function setupLanguageButtons() {
  qa<HTMLButtonElement>(".lang-button").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.lang;
      if (next === "tr" || next === "en" || next === "ru") setLanguage(next);
    });
  });
}

function setupDynamicTranslations() {
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) translateTree(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
}

function removeLegacyRuntimeSections() {
  [
    "#experience",
    ".story-section",
    "#gallery",
    "#reviews",
    "#my-robys",
    ".mobile-dock",
    "#coffee-matcher"
  ].forEach((selector) => qa<HTMLElement>(selector).forEach((element) => element.remove()));
}

function init() {
  removeLegacyRuntimeSections();

  const year = q<HTMLElement>("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());

  setupNavigation();
  setupLanguageButtons();
  setupDynamicTranslations();
  setLanguage(language);
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init, { once: true })
  : init();
