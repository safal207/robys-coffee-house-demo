import { menuCategories } from "./menu-data.js";
import { menuTruth, pairingTruth } from "./menu-truth.js";

const MAPS_URL = "https://www.google.com/maps/dir/?api=1&destination=Roby%27s+Coffee+House+Gazipasa&travelmode=driving";
const SUPPORTED_LANGUAGES = ["tr", "en", "ru"];

const copy = Object.freeze({
  tr: Object.freeze({
    searchScope: "Arama tüm menü kategorilerinde yapılır.",
    resultOne: "1 ürün bulundu.",
    resultMany: (count) => `${count} ürün bulundu.`,
    resultNone: "Hiç ürün bulunamadı.",
    showBarista: "Baristaya göster",
    directions: "Yol tarifi al",
    dialogTitle: "Seçtiğiniz eşleşme",
    close: "Kapat",
    truthNote: `Menü sürümü ${menuTruth.menuVersion}. Kaynak: onaylı basılı kafe menüsü.`,
    globalSearchActivated: "Arama tüm kategorilere genişletildi."
  }),
  en: Object.freeze({
    searchScope: "Search covers all menu categories.",
    resultOne: "1 item found.",
    resultMany: (count) => `${count} items found.`,
    resultNone: "No items found.",
    showBarista: "Show barista",
    directions: "Get directions",
    dialogTitle: "Your selected pairing",
    close: "Close",
    truthNote: `Menu version ${menuTruth.menuVersion}. Source: approved printed café menu.`,
    globalSearchActivated: "Search expanded to all categories."
  }),
  ru: Object.freeze({
    searchScope: "Поиск выполняется по всем категориям меню.",
    resultOne: "Найдена 1 позиция.",
    resultMany: (count) => `Найдено позиций: ${count}.`,
    resultNone: "Ничего не найдено.",
    showBarista: "Показать бариста",
    directions: "Построить маршрут",
    dialogTitle: "Выбранное сочетание",
    close: "Закрыть",
    truthNote: `Версия меню ${menuTruth.menuVersion}. Источник: утверждённое печатное меню кафе.`,
    globalSearchActivated: "Поиск расширен на все категории."
  })
});

function currentLanguage() {
  const language = document.documentElement.lang;
  return SUPPORTED_LANGUAGES.includes(language) ? language : "tr";
}

function localized(value) {
  const language = currentLanguage();
  return value?.[language] ?? value?.tr ?? "";
}

function menuItemForPairing(pairingId) {
  const category = menuCategories.find((entry) => entry.id === "pairing-offers");
  return category?.items?.find((item) => item.journeyId === pairingId) ?? null;
}

function track(action, details = {}) {
  const payload = {
    event: "robys_action",
    action,
    language: currentLanguage(),
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
  link.href = "menu-integrity.css?v=menu-truth-20260729-1";
  link.dataset.menuIntegrityStyle = "true";
  document.head.append(link);
}

function ensureSearchSupport() {
  const search = document.querySelector(".menu-search");
  const input = document.querySelector("#menu-search");
  const root = document.querySelector("#menu-root");
  if (!search || !input || !root) return;

  root.removeAttribute("aria-live");

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
    root.before(status);
  }

  if (input.dataset.globalSearchReady !== "true") {
    input.dataset.globalSearchReady = "true";
    input.addEventListener("input", () => {
      if (!input.value.trim()) return;
      queueMicrotask(() => {
        const allButton = document.querySelector("#menu-category-nav .menu-category-chip");
        if (!allButton || allButton.getAttribute("aria-pressed") === "true") return;

        const originalScrollIntoView = Element.prototype.scrollIntoView;
        try {
          Element.prototype.scrollIntoView = function suppressRouterScroll() {};
          allButton.click();
        } finally {
          Element.prototype.scrollIntoView = originalScrollIntoView;
        }
        status.textContent = copy[currentLanguage()].globalSearchActivated;
        track("menu_search_expanded_global");
      });
    });
  }
}

function ensureTruthNote() {
  const existing = document.querySelector(".menu-truth-note");
  const anchor = document.querySelector(".menu-page-note");
  if (!anchor) return;
  const note = existing ?? document.createElement("p");
  note.className = "menu-truth-note";
  note.dataset.menuVersion = menuTruth.menuVersion;
  note.textContent = copy[currentLanguage()].truthNote;
  if (!existing) anchor.after(note);
}

function ensureDialog() {
  let dialog = document.querySelector("#pairing-fulfilment-dialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "pairing-fulfilment-dialog";
  dialog.className = "pairing-fulfilment-dialog";
  dialog.innerHTML = [
    '<div class="pairing-dialog-card">',
    '<p class="eyebrow" data-dialog-kicker></p>',
    '<h2 id="pairing-dialog-title" data-dialog-title></h2>',
    '<p class="pairing-dialog-price" data-dialog-price></p>',
    '<p class="pairing-dialog-explanation" data-dialog-explanation></p>',
    '<div class="pairing-dialog-actions">',
    `<a class="button button-primary" href="${MAPS_URL}" target="_blank" rel="noopener noreferrer" data-dialog-directions></a>`,
    '<button class="button menu-secondary-button" type="button" data-dialog-close></button>',
    "</div>",
    "</div>"
  ].join("");
  dialog.setAttribute("aria-labelledby", "pairing-dialog-title");
  document.body.append(dialog);

  dialog.querySelector("[data-dialog-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector("[data-dialog-directions]")?.addEventListener("click", () => {
    track("pairing_directions_click", { pairing_id: dialog.dataset.pairingId ?? "unknown" });
  });
  return dialog;
}

function openPairingDialog(pairingId) {
  const truth = pairingTruth[pairingId];
  const item = menuItemForPairing(pairingId);
  if (!truth || !item) return;

  const dialog = ensureDialog();
  dialog.dataset.pairingId = pairingId;
  dialog.querySelector("[data-dialog-kicker]").textContent = copy[currentLanguage()].dialogTitle;
  dialog.querySelector("[data-dialog-title]").textContent = localized(item.name);
  dialog.querySelector("[data-dialog-price]").textContent = `${item.price} ₺`;
  dialog.querySelector("[data-dialog-explanation]").textContent = localized(truth.explanation);
  dialog.querySelector("[data-dialog-directions]").textContent = copy[currentLanguage()].directions;
  dialog.querySelector("[data-dialog-close]").textContent = copy[currentLanguage()].close;

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  track("pairing_show_barista", { pairing_id: pairingId, menu_version: menuTruth.menuVersion });
}

function enhancePairingCards() {
  document.querySelectorAll(".full-menu-item--visual[data-pairing]").forEach((card) => {
    const pairingId = card.dataset.pairing;
    const truth = pairingTruth[pairingId];
    if (!truth) return;

    const details = card.querySelector(".full-menu-item-details");
    if (!details) return;

    let explanation = details.querySelector(".pairing-price-explanation");
    if (!explanation) {
      explanation = document.createElement("p");
      explanation.className = "pairing-price-explanation";
      details.append(explanation);
    }
    explanation.textContent = localized(truth.explanation);

    let actions = details.querySelector(".pairing-card-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "pairing-card-actions";

      const showButton = document.createElement("button");
      showButton.type = "button";
      showButton.className = "button button-primary pairing-show-barista";
      showButton.dataset.pairingId = pairingId;
      showButton.addEventListener("click", () => openPairingDialog(pairingId));

      const route = document.createElement("a");
      route.className = "pairing-route-link";
      route.href = MAPS_URL;
      route.target = "_blank";
      route.rel = "noopener noreferrer";
      route.addEventListener("click", () => track("pairing_directions_click", { pairing_id: pairingId }));

      actions.append(showButton, route);
      details.append(actions);
    }

    actions.querySelector(".pairing-show-barista").textContent = copy[currentLanguage()].showBarista;
    actions.querySelector(".pairing-route-link").textContent = `${copy[currentLanguage()].directions} ↗`;
    card.dataset.pricingMode = truth.pricingMode;
    card.dataset.menuVersion = menuTruth.menuVersion;
  });
}

function updateResultStatus() {
  const status = document.querySelector("#menu-results-status");
  const scope = document.querySelector("#menu-search-scope");
  if (!status || !scope) return;
  const localizedCopy = copy[currentLanguage()];
  scope.textContent = localizedCopy.searchScope;
  const count = document.querySelectorAll("#menu-root .full-menu-item").length;
  status.textContent = count === 0 ? localizedCopy.resultNone : count === 1 ? localizedCopy.resultOne : localizedCopy.resultMany(count);
}

function refreshIntegrityUi() {
  ensureSearchSupport();
  ensureTruthNote();
  enhancePairingCards();
  updateResultStatus();
  document.body.dataset.menuIntegrityReady = "true";
}

ensureStylesheet();
ensureSearchSupport();
ensureDialog();
refreshIntegrityUi();

const menuRoot = document.querySelector("#menu-root");
if (menuRoot) {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      refreshIntegrityUi();
    });
  }).observe(menuRoot, { childList: true, subtree: true });
}

new MutationObserver(refreshIntegrityUi).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"]
});
