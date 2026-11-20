"use strict";

/* Photo-grid only: honor ?lang before first content paint.
   This blocking, same-origin script is deliberately small and CSP-safe.
   The shared menu app remains the authority after hydration. */
(() => {
  const supported = ["tr", "en", "ru"];
  const requested = new URLSearchParams(location.search).get("lang");
  let language = requested;
  if (!supported.includes(language)) {
    try { language = localStorage.getItem("robys-language"); } catch { /* optional storage */ }
  }
  if (!supported.includes(language)) language = "tr";

  document.documentElement.lang = language;
  if (language === "tr") return;

  // Mirror the static entry labels from menu-catalog.js and menu-app.js.
  // Dynamic catalog cards and cart totals are still rendered by menu-app.js.
  const copy = {
    en: {
      back: "Back to café",
      pageTitle: "Full Menu",
      pageLead: "Coffee, cold drinks, teas, desserts and easy bites.",
      searchLabel: "Search the menu",
      searchPlaceholder: "Search coffee, dessert or drink",
      noResults: "No menu items match your search.",
      priceNote: "Prices are based on the photographed printed menu and may change.",
      categories: "Menu categories",
      smartChoice: "Smart Choice",
      cart: "My order",
      cartEmpty: "You have not added anything yet.",
      total: "Total",
      route: "Get directions",
      quantity: "Quantity",
      addToCart: "Add to order",
      orderDraft: "This is an order draft; it is not sent automatically to the café or payment system.",
      combos: "Combos · 12",
      takeaway: "To go · 4",
      family: "With kids · 3 ideas"
    },
    ru: {
      back: "На главную",
      pageTitle: "Полное меню",
      pageLead: "Кофе, холодные напитки, чай, десерты и лёгкие закуски.",
      searchLabel: "Поиск по меню",
      searchPlaceholder: "Найти кофе, десерт или напиток",
      noResults: "По вашему запросу ничего не найдено.",
      priceNote: "Цены перенесены с сфотографированного печатного меню и могут измениться.",
      categories: "Категории меню",
      smartChoice: "Умный подбор",
      cart: "Мой заказ",
      cartEmpty: "Вы пока ничего не добавили.",
      total: "Итого",
      route: "Построить маршрут",
      quantity: "Количество",
      addToCart: "Добавить в заказ",
      orderDraft: "Это предварительный расчёт: заказ не отправляется в кафе или платёжную систему автоматически.",
      combos: "Комбо · 12",
      takeaway: "С собой · 4",
      family: "С ребёнком · 3 идеи"
    }
  }[language];

  document.title = `${copy.pageTitle} | Roby's Coffee House`;

  function translateParsedNodes() {
    for (const node of document.querySelectorAll("[data-menu-copy]")) {
      const next = copy[node.dataset.menuCopy];
      if (next && node.textContent !== next) node.textContent = next;
    }
    for (const node of document.querySelectorAll("[data-localized][data-tr][data-en][data-ru]")) {
      const next = node.dataset[language];
      if (next && node.textContent !== next) node.textContent = next;
    }
    const firstPaintLabels = [
      ["menu-combos-trigger", copy.combos],
      ["menu-combos-takeaway-trigger", copy.takeaway],
      ["menu-family-trigger", copy.family]
    ];
    for (const [id, next] of firstPaintLabels) {
      const node = document.getElementById(id);
      if (node && node.textContent !== next) node.textContent = next;
    }
    const search = document.getElementById("menu-search");
    if (search && search.placeholder !== copy.searchPlaceholder) search.placeholder = copy.searchPlaceholder;
    for (const button of document.querySelectorAll(".lang-button[data-lang]")) {
      const active = button.dataset.lang === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  // Mutation callbacks run after parser DOM insertion, before the next paint.
  // Disconnect once the deferred module-based menu app has initialized.
  const observer = new MutationObserver(translateParsedNodes);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => {
    observer.disconnect();
    translateParsedNodes();
  }, { once: true });
})();
