import { dictionaries, type CopyKey, type Lang } from "./i18n";

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
}

function setupNavigation() {
  const toggle = q<HTMLButtonElement>(".menu-toggle");
  const navigation = q<HTMLElement>("#main-navigation");

  const close = () => {
    document.body.classList.remove("menu-open");
    toggle?.setAttribute("aria-expanded", "false");
  };

  toggle?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  navigation?.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) close();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) close();
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
