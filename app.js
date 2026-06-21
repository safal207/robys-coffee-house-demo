import { dictionaries } from "./src/i18n.js";

const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const supportedLanguages = ["tr", "en", "ru"];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function readLanguage() {
  try {
    const saved = localStorage.getItem("robys-language");
    return supportedLanguages.includes(saved) ? saved : "tr";
  } catch {
    return "tr";
  }
}

let language = readLanguage();
let languageTimer;
let languageFinishTimer;

function translate(key) {
  return dictionaries[language]?.[key] ?? dictionaries.tr?.[key] ?? "";
}

function updateMenuLabel() {
  const toggle = q(".menu-toggle");
  if (!toggle) return;
  const isOpen = document.body.classList.contains("menu-open");
  toggle.setAttribute("aria-label", translate(isOpen ? "closeMenu" : "openMenu"));
}

function applyLanguage(nextLanguage) {
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

function setLanguage(nextLanguage, animate = true) {
  const resolved = supportedLanguages.includes(nextLanguage) ? nextLanguage : "tr";
  if (resolved === language) return;

  const main = q("main");
  clearTimeout(languageTimer);
  clearTimeout(languageFinishTimer);

  if (!animate || reduceMotion || !main) {
    applyLanguage(resolved);
    return;
  }

  main.classList.add("language-changing");
  languageTimer = window.setTimeout(() => {
    applyLanguage(resolved);
    languageFinishTimer = window.setTimeout(() => {
      main.classList.remove("language-changing");
    }, 150);
  }, 110);
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

  if (reduceMotion) {
    video.pause();
    video.removeAttribute("autoplay");
  }
}

function setupReveal() {
  const targets = qa([
    ".section-heading",
    ".feature-card",
    ".amenities-line",
    ".menu-intro",
    ".menu-card",
    ".gallery-card",
    ".visit-card",
    ".map-card",
    ".mobile-quick-info"
  ].join(","));

  targets.forEach((node, index) => {
    node.classList.add("reveal-item");
    node.style.setProperty("--reveal-delay", `${(index % 4) * 65}ms`);
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    targets.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -8% 0px"
  });

  targets.forEach((node) => observer.observe(node));
}

function setupGalleryLightbox() {
  const cards = qa(".gallery-card");
  if (!cards.length) return;

  const lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-hidden", "true");
  lightbox.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Close image">×</button>
    <button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous image">‹</button>
    <figure class="lightbox-figure">
      <img class="lightbox-image" alt="" />
      <figcaption class="lightbox-caption"></figcaption>
    </figure>
    <button class="lightbox-nav lightbox-next" type="button" aria-label="Next image">›</button>
  `;
  document.body.append(lightbox);

  const image = q(".lightbox-image", lightbox);
  const caption = q(".lightbox-caption", lightbox);
  const closeButton = q(".lightbox-close", lightbox);
  const previousButton = q(".lightbox-prev", lightbox);
  const nextButton = q(".lightbox-next", lightbox);
  let currentIndex = 0;
  let lastFocused;

  function render() {
    const card = cards[currentIndex];
    const source = q("img", card);
    const text = q("figcaption", card)?.textContent?.trim() || "Roby's Coffee House";
    image.src = source?.currentSrc || source?.src || "";
    image.alt = source?.alt || "Roby's Coffee House";
    caption.textContent = text;
  }

  function open(index) {
    currentIndex = index;
    lastFocused = document.activeElement;
    render();
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");
    closeButton.focus();
  }

  function close() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lightbox-open");
    lastFocused?.focus?.();
  }

  function move(step) {
    currentIndex = (currentIndex + step + cards.length) % cards.length;
    render();
  }

  cards.forEach((card, index) => {
    const label = q("figcaption", card)?.textContent?.trim() || "Roby's Coffee House";
    card.classList.add("gallery-interactive");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${label}: open image`);
    card.addEventListener("click", () => open(index));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open(index);
    });
  });

  closeButton.addEventListener("click", close);
  previousButton.addEventListener("click", () => move(-1));
  nextButton.addEventListener("click", () => move(1));
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) close();
  });

  window.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
}

let initialized = false;
let fullStylesPromise;

function loadFullStyles() {
  if (fullStylesPromise) return fullStylesPromise;
  fullStylesPromise = new Promise((resolve) => {
    const existing = document.querySelector('link[data-full-styles]');
    if (existing) {
      if (existing.sheet) resolve();
      else existing.addEventListener("load", resolve, { once: true });
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "full.css?v=perf-20260621-4";
    link.dataset.fullStyles = "true";
    link.addEventListener("load", resolve, { once: true });
    document.head.append(link);
  });
  return fullStylesPromise;
}

function init() {
  if (initialized) return;
  initialized = true;

  const year = q("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());

  setupMenu();
  setupHeroVideo();
  applyLanguage(language);
  setupReveal();
  setupGalleryLightbox();

  qa(".lang-button").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });
}

function activatePage() {
  loadFullStyles();
  init();
}

window.addEventListener("pointerdown", activatePage, { once: true, passive: true });
window.addEventListener("touchstart", activatePage, { once: true, passive: true });
window.addEventListener("wheel", activatePage, { once: true, passive: true });
window.addEventListener("scroll", activatePage, { once: true, passive: true });
window.addEventListener("keydown", activatePage, { once: true });
document.addEventListener("click", activatePage, { once: true, capture: true });

if (language !== "tr" || new URLSearchParams(location.search).has("order")) {
  activatePage();
}
