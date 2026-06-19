import { dictionaries } from "./src/i18n.js";

const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const supportedLanguages = ["tr", "en", "ru"];

function readLanguage() {
  try {
    const saved = localStorage.getItem("robys-language");
    return supportedLanguages.includes(saved) ? saved : "tr";
  } catch {
    return "tr";
  }
}

let language = readLanguage();

function translate(key) {
  return dictionaries[language]?.[key] ?? dictionaries.tr?.[key] ?? "";
}

function updateMenuLabel() {
  const toggle = q(".menu-toggle");
  if (!toggle) return;
  const isOpen = document.body.classList.contains("menu-open");
  toggle.setAttribute("aria-label", translate(isOpen ? "closeMenu" : "openMenu"));
}

function setLanguage(nextLanguage) {
  language = supportedLanguages.includes(nextLanguage) ? nextLanguage : "tr";
  document.documentElement.lang = language;

  try {
    localStorage.setItem("robys-language", language);
  } catch {}

  qa("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (key) node.textContent = translate(key);
  });

  qa("[data-i18n-html]").forEach((node) => {
    const key = node.dataset.i18nHtml;
    if (key) node.innerHTML = translate(key);
  });

  qa("[data-localized]").forEach((node) => {
    node.textContent = node.dataset[language] ?? node.dataset.tr ?? "";
  });

  qa(".lang-button").forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  updateMenuLabel();
}

function setupMenu() {
  const toggle = q(".menu-toggle");
  toggle?.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    updateMenuLabel();
  });

  qa(".main-nav a").forEach((link) => {
    link.addEventListener("click", () => {
      document.body.classList.remove("menu-open");
      toggle?.setAttribute("aria-expanded", "false");
      updateMenuLabel();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.body.classList.remove("menu-open");
    toggle?.setAttribute("aria-expanded", "false");
    updateMenuLabel();
  });
}

function setupHeroVideo() {
  const video = q(".hero-video");
  const hero = q(".hero");
  if (!video || !hero) return;

  video.addEventListener("error", () => {
    hero.classList.add("video-fallback");
    video.remove();
  }, { once: true });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.pause();
    video.removeAttribute("autoplay");
  }
}

function init() {
  const year = q("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());

  setupMenu();
  setupHeroVideo();

  qa(".lang-button").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });

  setLanguage(language);
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init, { once: true })
  : init();
