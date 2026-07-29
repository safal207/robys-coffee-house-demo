import { menuCategories } from "./menu-data.js";
import { menuTruth, pairingTruth } from "./menu-truth.js";

const MAPS_URL = "https://www.google.com/maps/dir/?api=1&destination=Roby%27s+Coffee+House+Gazipasa&travelmode=driving";
const LANGUAGES = ["tr", "en", "ru"];

const copy = {
  tr: {
    searchScope: "Arama tüm menü kategorilerinde yapılır.",
    result: (count) => count === 0 ? "Hiç ürün bulunamadı." : count === 1 ? "1 ürün bulundu." : `${count} ürün bulundu.`,
    showBarista: "Baristaya göster",
    directions: "Yol tarifi al",
    dialogTitle: "Seçtiğiniz eşleşme",
    close: "Kapat",
    truthNote: `Menü sürümü ${menuTruth.menuVersion}. Kaynak: onaylı basılı kafe menüsü.`,
    globalSearchActivated: "Arama tüm kategorilere genişletildi."
  },
  en: {
    searchScope: "Search covers all menu categories.",
    result: (count) => count === 0 ? "No items found." : count === 1 ? "1 item found." : `${count} items found.`,
    showBarista: "Show barista",
    directions: "Get directions",
    dialogTitle: "Your selected pairing",
    close: "Close",
    truthNote: `Menu version ${menuTruth.menuVersion}. Source: approved printed café menu.`,
    globalSearchActivated: "Search expanded to all categories."
  },
  ru: {
    searchScope: "Поиск выполняется по всем категориям меню.",
    result: (count) => count === 0 ? "Ничего не найдено." : count === 1 ? "Найдена 1 позиция." : `Найдено позиций: ${count}.`,
    showBarista: "Показать бариста",
    directions: "Построить маршрут",
    dialogTitle: "Выбранное сочетание",
    close: "Закрыть",
    truthNote: `Версия меню ${menuTruth.menuVersion}. Источник: утверждённое печатное меню кафе.`,
    globalSearchActivated: "Поиск расширен на все категории."
  }
};

const menuRoot = document.querySelector("#menu-root");
let menuObserver = null;
let refreshQueued = false;

function language() {
  const value = document.documentElement.lang;
  return LANGUAGES.includes(value) ? value : "tr";
}

function localized(value) {
  return value?.[language()] ?? value?.tr ?? "";
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function pairingItem(pairingId) {
  return menuCategories
    .find((category) => category.id === "pairing-offers")
    ?.items?.find((item) => item.journeyId === pairingId) ?? null;
}

function track(action, details = {}) {
  const payload = {
    event: "robys_action",
    action,
    language: language(),
    path: window.location.pathname,
    placement: "menu_pairing",
    ...details
  };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  document.dispatchEvent(new CustomEvent("robys:analytics", { detail: payload }));
}

function ensureStylesheet() {
  if (document.querySelector('link[data-menu-integrity-style="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "menu-integrity.css?v=menu-truth-20260729-2";
  link.dataset.menuIntegrityStyle = "true";
  document.head.append(link);
}

function activateAllCategoriesWithoutScroll() {
  const allButton = document.querySelector("#menu-category-nav .menu-category-chip");
  if (!allButton || allButton.getAttribute("aria-pressed") === "true") return false;

  const original = Element.prototype.scrollIntoView;
  try {
    Element.prototype.scrollIntoView = function suppressSearchScroll() {};
    allButton.click();
  } finally {
    Element.prototype.scrollIntoView = original;
  }
  return true;
}

function ensureSearchSupport() {
  const search = document.querySelector(".menu-search");
  const input = document.querySelector("#menu-search");
  if (!search || !input || !menuRoot) return;

  menuRoot.removeAttribute("aria-live");

  let scope = document.querySelector("#menu-search-scope");
  if (!scope) {
    scope = document.createElement("p");
    scope.id = "menu-search-scope";
    scope.className = "menu-search-scope";
    search.append(scope);
  }

  let status = document.querySelector("#menu-results-status");
  if (!status) {
    status = document.createElement("p");
    status.id = "menu-results-status";
    status.className = "menu-results-status visually-hidden";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    menuRoot.before(status);
  }

  if (input.dataset.globalSearchReady !== "true") {
    input.dataset.globalSearchReady = "true";
    input.addEventListener("input", () => {
      if (!input.value.trim()) return;
      queueMicrotask(() => {
        if (!activateAllCategoriesWithoutScroll()) return;
        setText(status, copy[language()].globalSearchActivated);
        track("menu_search_expanded_global");
      });
    });
  }

  setText(scope, copy[language()].searchScope);
}

function ensureTruthNote() {
  const anchor = document.querySelector(".menu-page-note");
  if (!anchor) return;
  let note = document.querySelector(".menu-truth-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "menu-truth-note";
    anchor.after(note);
  }
  note.dataset.menuVersion = menuTruth.menuVersion;
  setText(note, copy[language()].truthNote);
}

function element(tag, className, marker) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (marker) node.setAttribute(marker, "");
  return node;
}

function ensureDialog() {
  let dialog = document.querySelector("#pairing-fulfilment-dialog");
  if (dialog) return dialog;

  dialog = element("dialog", "pairing-fulfilment-dialog");
  dialog.id = "pairing-fulfilment-dialog";
  dialog.setAttribute("aria-labelledby", "pairing-dialog-title");

  const card = element("div", "pairing-dialog-card");
  const kicker = element("p", "eyebrow", "data-dialog-kicker");
  const title = element("h2", "", "data-dialog-title");
  title.id = "pairing-dialog-title";
  const price = element("p", "pairing-dialog-price", "data-dialog-price");
  const explanation = element("p", "pairing-dialog-explanation", "data-dialog-explanation");
  const actions = element("div", "pairing-dialog-actions");
  const directions = element("a", "button button-primary", "data-dialog-directions");
  const close = element("button", "button menu-secondary-button", "data-dialog-close");

  directions.href = MAPS_URL;
  directions.target = "_blank";
  directions.rel = "noopener noreferrer";
  close.type = "button";
  actions.append(directions, close);
  card.append(kicker, title, price, explanation, actions);
  dialog.append(card);
  document.body.append(dialog);

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  directions.addEventListener("click", () => {
    track("pairing_directions_click", { pairing_id: dialog.dataset.pairingId ?? "unknown" });
  });
  return dialog;
}

function openPairingDialog(pairingId) {
  const truth = pairingTruth[pairingId];
  const item = pairingItem(pairingId);
  if (!truth || !item) return;

  const dialog = ensureDialog();
  dialog.dataset.pairingId = pairingId;
  setText(dialog.querySelector("[data-dialog-kicker]"), copy[language()].dialogTitle);
  setText(dialog.querySelector("[data-dialog-title]"), localized(item.name));
  setText(dialog.querySelector("[data-dialog-price]"), `${item.price} ₺`);
  setText(dialog.querySelector("[data-dialog-explanation]"), localized(truth.explanation));
  setText(dialog.querySelector("[data-dialog-directions]"), copy[language()].directions);
  setText(dialog.querySelector("[data-dialog-close]"), copy[language()].close);

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  track("pairing_show_barista", { pairing_id: pairingId, menu_version: menuTruth.menuVersion });
}

function enhancePairingCards() {
  document.querySelectorAll(".full-menu-item--visual[data-pairing]").forEach((card) => {
    const pairingId = card.dataset.pairing;
    const truth = pairingTruth[pairingId];
    const details = card.querySelector(".full-menu-item-details");
    if (!truth || !details) return;

    let explanation = details.querySelector(".pairing-price-explanation");
    if (!explanation) {
      explanation = element("p", "pairing-price-explanation");
      details.append(explanation);
    }
    setText(explanation, localized(truth.explanation));

    let actions = details.querySelector(".pairing-card-actions");
    if (!actions) {
      actions = element("div", "pairing-card-actions");
      const show = element("button", "button button-primary pairing-show-barista");
      const route = element("a", "pairing-route-link");
      show.type = "button";
      show.addEventListener("click", () => openPairingDialog(pairingId));
      route.href = MAPS_URL;
      route.target = "_blank";
      route.rel = "noopener noreferrer";
      route.addEventListener("click", () => track("pairing_directions_click", { pairing_id: pairingId }));
      actions.append(show, route);
      details.append(actions);
    }

    setText(actions.querySelector(".pairing-show-barista"), copy[language()].showBarista);
    setText(actions.querySelector(".pairing-route-link"), `${copy[language()].directions} ↗`);
    card.dataset.pricingMode = truth.pricingMode;
    card.dataset.menuVersion = menuTruth.menuVersion;
  });
}

function updateResultStatus() {
  const status = document.querySelector("#menu-results-status");
  if (!status) return;
  setText(status, copy[language()].result(document.querySelectorAll("#menu-root .full-menu-item").length));
}

function refreshIntegrityUi() {
  menuObserver?.disconnect();
  ensureSearchSupport();
  ensureTruthNote();
  ensureDialog();
  enhancePairingCards();
  updateResultStatus();
  document.body.dataset.menuIntegrityReady = "true";
  if (menuRoot) menuObserver?.observe(menuRoot, { childList: true, subtree: true });
}

function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  window.requestAnimationFrame(() => {
    refreshQueued = false;
    refreshIntegrityUi();
  });
}

ensureStylesheet();
if (menuRoot) menuObserver = new MutationObserver(scheduleRefresh);
refreshIntegrityUi();

new MutationObserver(scheduleRefresh).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"]
});
