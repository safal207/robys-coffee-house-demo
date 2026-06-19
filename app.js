import { dictionaries } from "./src/i18n.js";

const GOOGLE_MAPS = "https://www.google.com/maps/search/?api=1&query=Roby%27s+Coffee+House+Gazipasa";
const YANDEX_MAPS = "https://yandex.com.tr/maps/org/roby_s_coffee_house/194573272549/";
const INSTAGRAM = "https://www.instagram.com/robyscoffeehouse/";
const POSTER = "src/robys-hero-poster.jpg";

const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const readLocal = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

let language = ["tr", "en", "ru"].includes(readLocal("robys-language")) ? readLocal("robys-language") : "tr";
let deferredMounted = false;

function translate(key) {
  return dictionaries[language]?.[key] ?? dictionaries.tr?.[key] ?? "";
}

function updateDockLabels() {
  const labels = {
    tr: ["Menü", "Konfor", "Rota"],
    en: ["Menu", "Comfort", "Route"],
    ru: ["Меню", "Комфорт", "Маршрут"]
  }[language];
  qa("[data-dock-label]").forEach((node, index) => { node.textContent = labels[index] ?? ""; });
}

function setLanguage(next) {
  language = ["tr", "en", "ru"].includes(next) ? next : "tr";
  document.documentElement.lang = language;
  writeLocal("robys-language", language);
  qa("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (key) node.textContent = translate(key);
  });
  qa("[data-i18n-html]").forEach((node) => {
    const key = node.dataset.i18nHtml;
    if (key) node.innerHTML = translate(key);
  });
  qa(".lang-button").forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateDockLabels();
}

function galleryMarkup() {
  const photos = [
    [POSTER, "terrace", "OUTDOOR"],
    ["https://img02.restaurantguru.com/c34f-Restaurant-Robys-Coffee-House-interior.jpg", "interior", "INTERIOR"],
    ["https://img02.restaurantguru.com/c893-Restaurant-Robys-Coffee-House-food.jpg", "food", "FOOD"],
    ["https://img02.restaurantguru.com/cde4-Restaurant-Robys-Coffee-House-beverage.jpg", "drink", "COFFEE"],
    ["https://img02.restaurantguru.com/c188-Restaurant-Robys-Coffee-House-design.jpg", "design", "DETAILS"]
  ];
  return `<section id="gallery" class="social-gallery"><div class="container"><div class="gallery-head visible"><div class="gallery-head-copy"><p class="eyebrow" data-i18n="galleryEyebrow"></p><h2 data-i18n-html="galleryTitle"></h2><p data-i18n="galleryText"></p></div><div class="gallery-source-row"><a class="gallery-source" href="${INSTAGRAM}" target="_blank" rel="noopener noreferrer">Instagram ↗</a><a class="gallery-source" href="${GOOGLE_MAPS}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a><a class="gallery-source" href="${YANDEX_MAPS}" target="_blank" rel="noopener noreferrer">Yandex Maps ↗</a></div></div><div class="gallery-grid">${photos.map(([src,key,label]) => `<article class="gallery-card visible"><img src="${src}" alt="Roby's ${key}" loading="lazy" decoding="async"><span class="gallery-card-caption"><span class="gallery-card-copy"><strong data-i18n="${key}"></strong><span>${label}</span></span></span></article>`).join("")}</div></div></section>`;
}

function reviewsMarkup() {
  const rows = [
    ["Google", "İpek Yıldırım", "★★★★★", "reviewIpek", "reviewIpekMeta", GOOGLE_MAPS],
    ["Google", "Elena Chkalova", "★★★★★", "reviewElena", "reviewElenaMeta", GOOGLE_MAPS]
  ];
  return `<section id="reviews" class="guest-reviews"><div class="container reviews-wrap"><div class="reviews-head visible"><div><p class="eyebrow" data-i18n="reviewsEyebrow"></p><h2 data-i18n-html="reviewsTitle"></h2></div><div class="reviews-summary"><a class="rating-pill" href="${GOOGLE_MAPS}" target="_blank" rel="noopener noreferrer"><div class="rating-pill-top"><strong>4.7</strong><span class="rating-stars">★★★★★</span></div><span data-i18n="googleVotes"></span></a><a class="rating-pill" href="${YANDEX_MAPS}" target="_blank" rel="noopener noreferrer"><div class="rating-pill-top"><strong>4.9</strong><span class="rating-stars">★★★★★</span></div><span data-i18n="yandexRating"></span></a></div></div><div class="reviews-grid">${rows.map(([source,author,rating,quoteKey,metaKey,href]) => `<article class="review-card visible"><div><div class="review-source"><div class="review-source-left"><span class="review-source-icon">${source[0]}</span><span class="review-source-name"><strong>${author}</strong><span>${source}</span></span></div><span class="review-rating">${rating}</span></div><blockquote class="review-quote small" data-i18n="${quoteKey}"></blockquote><p data-i18n="${metaKey}"></p></div><div class="review-footer"><span>${source}</span><a href="${href}" target="_blank" rel="noopener noreferrer"><span data-i18n="sourceOpen"></span> ↗</a></div></article>`).join("")}</div></div></section>`;
}

function mountDeferredSections() {
  if (deferredMounted) return;
  const menu = q("#menu");
  if (!menu) return;
  deferredMounted = true;
  menu.insertAdjacentHTML("afterend", galleryMarkup() + reviewsMarkup());
  setLanguage(language);
}

function setupDeferredSections() {
  const menu = q("#menu");
  if (!menu) return;

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        mountDeferredSections();
        observer.disconnect();
      }
    }, { rootMargin: "700px 0px", threshold: 0 });
    observer.observe(menu);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href="#gallery"]');
    if (!link) return;
    if (!q("#gallery")) {
      event.preventDefault();
      mountDeferredSections();
      requestAnimationFrame(() => q("#gallery")?.scrollIntoView({ behavior: "smooth" }));
    }
  });
}

function setupMenu() {
  const toggle = q(".menu-toggle");
  toggle?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  qa(".main-nav a").forEach((link) => link.addEventListener("click", () => {
    document.body.classList.remove("menu-open");
    toggle?.setAttribute("aria-expanded", "false");
  }));
}

function mountDock() {
  if (q(".mobile-dock")) return;
  document.body.insertAdjacentHTML("beforeend", `<nav class="mobile-dock" aria-label="Quick actions"><a href="#menu"><span>☕</span><small data-dock-label></small></a><a href="#amenities"><span>⌁</span><small data-dock-label></small></a><a href="${GOOGLE_MAPS}" target="_blank" rel="noopener noreferrer"><span>⌖</span><small data-dock-label></small></a></nav>`);
  updateDockLabels();
}

function showStaticContent() {
  qa(".reveal").forEach((node) => node.classList.add("visible"));
}

function init() {
  const year = q("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
  setupMenu();
  mountDock();
  setLanguage(language);
  showStaticContent();
  setupDeferredSections();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => undefined), { once: true });
  }
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", init, { once: true })
  : init();
