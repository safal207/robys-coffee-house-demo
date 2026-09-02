import { menuCategories, menuCopy } from "./menu-data.js";
import "./menu-search-clear.js";

const supportedLanguages = ["tr", "en", "ru"];
const languageButtons = Array.from(document.querySelectorAll(".lang-button"));
const categoryNav = document.querySelector("#menu-category-nav");
const menuRoot = document.querySelector("#menu-root");
const searchInput = document.querySelector("#menu-search");
const emptyState = document.querySelector("#menu-empty");
const resultsStatus = document.querySelector("#menu-results-status");
const showAllButton = document.querySelector("#menu-show-all");
const routeQuick = document.querySelector(".menu-route-quick");
const routeQuickShort = routeQuick?.querySelector(".menu-route-quick-short");

const behaviorCopy = {
  tr: {
    showAll: "Tüm menüyü göster",
    routeShort: "Yol",
    results: (count) => `${count} ürün gösteriliyor.`
  },
  en: {
    showAll: "Show full menu",
    routeShort: "Route",
    results: (count) => `Showing ${count} menu ${count === 1 ? "item" : "items"}.`
  },
  ru: {
    showAll: "Показать всё меню",
    routeShort: "Карта",
    results: (count) => `Показано позиций: ${count}.`
  }
};

let language = readStoredLanguage();
let activeCategory = readInitialCategory();
let searchTerm = "";

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem("robys-language");
    return supportedLanguages.includes(stored) ? stored : "tr";
  } catch {
    return "tr";
  }
}

function readInitialCategory() {
  const requested = window.location.hash.slice(1);
  return menuCategories.some((category) => category.id === requested) ? requested : "all";
}

function storeLanguage(next) {
  try {
    localStorage.setItem("robys-language", next);
  } catch {
    // Persistence is optional; the menu still works without storage access.
  }
}

function syncCategoryHash(categoryId) {
  const url = new URL(window.location.href);
  url.hash = categoryId === "all" ? "" : categoryId;
  window.history.replaceState(null, "", url);
}

function normalize(value) {
  return value
    .toLocaleLowerCase(language === "tr" ? "tr-TR" : language)
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function localized(value) {
  return value?.[language] ?? value?.tr ?? "";
}

function formatPrice(price) {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(price)} ₺`;
}

function createItem(item, { priority = false } = {}) {
  const visual = Boolean(item.image);
  const row = document.createElement(visual ? "article" : "div");
  row.className = visual ? "full-menu-item full-menu-item--visual" : "full-menu-item";
  if (visual) row.dataset.pairing = item.journeyId ?? item.id;

  const itemName = localized(item.name);
  const itemDescription = item.description ? localized(item.description) : "";
  const itemPrice = formatPrice(item.price);

  const copy = document.createElement("div");
  copy.className = "full-menu-item-copy";

  const name = document.createElement("strong");
  name.textContent = itemName;
  copy.append(name);

  if (item.description) {
    const description = document.createElement("p");
    description.textContent = itemDescription;
    copy.append(description);
  }

  const price = document.createElement("strong");
  price.className = "full-menu-price";
  price.textContent = itemPrice;

  if (visual) {
    const media = document.createElement("div");
    media.className = "full-menu-item-media";

    const image = document.createElement("img");
    image.src = item.image;
    image.alt = localized(item.imageAlt ?? item.name);
    image.loading = priority ? "eager" : "lazy";
    image.decoding = "async";
    if (priority) image.fetchPriority = "high";
    image.width = 1024;
    image.height = 1024;
    media.append(image);

    const details = document.createElement("div");
    details.className = "full-menu-item-details";
    details.append(copy, price);
    row.append(media, details);
    return row;
  }

  const dots = document.createElement("span");
  dots.className = "full-menu-dots";
  dots.setAttribute("aria-hidden", "true");
  row.append(copy, dots, price);
  return row;
}

function createGroup(group) {
  const wrapper = document.createElement("div");
  wrapper.className = "full-menu-group";

  const heading = document.createElement("h3");
  heading.textContent = localized(group.label);
  wrapper.append(heading);

  const list = document.createElement("div");
  list.className = "full-menu-list";
  group.items.forEach((item) => list.append(createItem(item)));
  wrapper.append(list);
  return wrapper;
}

function categoryNameMatchesSearch(category) {
  if (!searchTerm) return false;
  const query = normalize(searchTerm);
  const haystack = Object.values(category.name).join(" ");
  return normalize(haystack).includes(query);
}

function filteredItems(items, includeAll = false) {
  if (!searchTerm || includeAll) return items;
  const query = normalize(searchTerm);
  return items.filter((item) => {
    const haystack = [
      ...Object.values(item.name),
      ...(item.description ? Object.values(item.description) : [])
    ].join(" ");
    return normalize(haystack).includes(query);
  });
}

function createCategory(category) {
  const section = document.createElement("section");
  section.className = "full-menu-panel";
  section.classList.toggle("full-menu-panel--featured", category.id === "pairing-offers");
  section.id = category.id;

  const header = document.createElement("header");
  header.className = "full-menu-panel-header";

  const icon = document.createElement("span");
  icon.className = "full-menu-panel-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = category.icon;

  const heading = document.createElement("div");
  heading.className = "full-menu-panel-heading";

  const title = document.createElement("h2");
  title.textContent = localized(category.name);
  heading.append(title);

  if (category.lead) {
    const lead = document.createElement("p");
    lead.textContent = localized(category.lead);
    heading.append(lead);
  }

  header.append(icon, heading);
  section.append(header);

  const includeAllItems = categoryNameMatchesSearch(category);
  let itemCount = 0;

  if (category.items) {
    const publicItems = category.id === "pairing-offers"
      ? category.items.filter((item) => item.sourceStatus === "confirmed" && item.availability === "available")
      : category.items;
    const items = filteredItems(publicItems, includeAllItems);
    if (!items.length) return null;
    const list = document.createElement("div");
    list.className = "full-menu-list";
    items.forEach((item, index) => {
      const priority = category.id === "pairing-offers" && index === 0;
      list.append(createItem(item, { priority }));
    });
    section.append(list);
    itemCount = items.length;
  } else {
    let renderedGroups = 0;
    category.groups.forEach((group) => {
      const items = filteredItems(group.items, includeAllItems);
      if (!items.length) return;
      section.append(createGroup({ ...group, items }));
      renderedGroups += 1;
      itemCount += items.length;
    });
    if (!renderedGroups) return null;
  }

  return { section, itemCount };
}

function updateCategoryNavState() {
  categoryNav.querySelectorAll(".menu-category-chip").forEach((button) => {
    const active = button.dataset.categoryId === activeCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  showAllButton.hidden = activeCategory === "all";
}

function revealActiveCategory() {
  const activeChip = Array.from(categoryNav.querySelectorAll(".menu-category-chip"))
    .find((button) => button.dataset.categoryId === activeCategory);
  if (!activeChip) return;

  const navRect = categoryNav.getBoundingClientRect();
  const chipRect = activeChip.getBoundingClientRect();
  const centeredScrollLeft = categoryNav.scrollLeft + chipRect.left - navRect.left - ((navRect.width - chipRect.width) / 2);
  categoryNav.scrollTo({
    left: Math.max(0, centeredScrollLeft),
    behavior: "auto",
  });
}

function selectCategory(categoryId, { focusActiveChip = false } = {}) {
  activeCategory = categoryId;
  syncCategoryHash(categoryId);
  updateCategoryNavState();
  revealActiveCategory();
  renderMenu();

  if (focusActiveChip) {
    const activeChip = Array.from(categoryNav.querySelectorAll(".menu-category-chip"))
      .find((button) => button.dataset.categoryId === activeCategory);
    activeChip?.focus({ preventScroll: true });
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.querySelector(".full-menu-wrap")?.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start"
  });
}

function renderCategoryNav() {
  categoryNav.replaceChildren();
  const options = [
    { id: "all", label: menuCopy[language].all },
    ...menuCategories.map((category) => ({ id: category.id, label: localized(category.name) }))
  ];

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-category-chip";
    button.textContent = option.label;
    button.dataset.categoryId = option.id;
    const active = option.id === activeCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", () => {
      selectCategory(option.id);
    });
    categoryNav.append(button);
  });

  updateCategoryNavState();
  revealActiveCategory();
}

function renderMenu() {
  menuRoot.replaceChildren();
  const categories = menuCategories.filter((category) => activeCategory === "all" || activeCategory === category.id);

  let renderedItems = 0;
  categories.forEach((category) => {
    const renderedCategory = createCategory(category);
    if (!renderedCategory) return;
    menuRoot.append(renderedCategory.section);
    renderedItems += renderedCategory.itemCount;
  });

  emptyState.hidden = renderedItems > 0;
  resultsStatus.textContent = behaviorCopy[language].results(renderedItems);
}

function translateStaticPage() {
  const copy = menuCopy[language];
  document.documentElement.lang = language;
  document.title = `${copy.pageTitle} | Roby's Coffee House`;

  document.querySelectorAll("[data-menu-copy]").forEach((element) => {
    const key = element.dataset.menuCopy;
    if (copy[key]) element.textContent = copy[key];
  });

  searchInput.setAttribute("aria-label", copy.searchLabel);
  searchInput.placeholder = copy.searchPlaceholder;
  categoryNav.setAttribute("aria-label", copy.categories);
  showAllButton.textContent = behaviorCopy[language].showAll;
  routeQuick?.setAttribute("aria-label", copy.route);
  if (routeQuickShort) routeQuickShort.textContent = behaviorCopy[language].routeShort;

  languageButtons.forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setLanguage(next) {
  if (!supportedLanguages.includes(next)) return;
  language = next;
  storeLanguage(next);
  translateStaticPage();
  renderCategoryNav();
  renderMenu();
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  renderMenu();
});

showAllButton.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.dispatchEvent(new Event("input", { bubbles: true }));
  selectCategory("all", { focusActiveChip: true });
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
translateStaticPage();
renderCategoryNav();
renderMenu();

if (activeCategory !== "all") {
  window.requestAnimationFrame(() => {
    document.querySelector(".full-menu-wrap")?.scrollIntoView({ block: "start" });
  });
}
