import { menuCategories, menuCopy } from "./menu-data.js";
import "./menu-search-clear.js";

const supportedLanguages = ["tr", "en", "ru"];
const languageButtons = Array.from(document.querySelectorAll(".lang-button"));
const categoryNav = document.querySelector("#menu-category-nav");
const menuRoot = document.querySelector("#menu-root");
const searchInput = document.querySelector("#menu-search");
const emptyState = document.querySelector("#menu-empty");

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

  const copy = document.createElement("div");
  copy.className = "full-menu-item-copy";

  const name = document.createElement("strong");
  name.textContent = localized(item.name);
  copy.append(name);

  if (item.description) {
    const description = document.createElement("p");
    description.textContent = localized(item.description);
    copy.append(description);
  }

  const price = document.createElement("strong");
  price.className = "full-menu-price";
  price.textContent = formatPrice(item.price);

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

function categoryItems(category) {
  if (category.items) return category.items;
  return category.groups.flatMap((group) => group.items);
}

function matchesSearch(category) {
  if (!searchTerm) return true;
  const query = normalize(searchTerm);
  const haystack = [
    ...Object.values(category.name),
    ...categoryItems(category).flatMap((item) => [
      ...Object.values(item.name),
      ...(item.description ? Object.values(item.description) : [])
    ])
  ].join(" ");
  return normalize(haystack).includes(query);
}

function filteredItems(items) {
  if (!searchTerm) return items;
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

  if (category.items) {
    const items = filteredItems(category.items);
    if (!items.length) return null;
    const list = document.createElement("div");
    list.className = "full-menu-list";
    items.forEach((item, index) => {
      const priority = category.id === "pairing-offers" && index === 0;
      list.append(createItem(item, { priority }));
    });
    section.append(list);
  } else {
    let renderedGroups = 0;
    category.groups.forEach((group) => {
      const items = filteredItems(group.items);
      if (!items.length) return;
      section.append(createGroup({ ...group, items }));
      renderedGroups += 1;
    });
    if (!renderedGroups) return null;
  }

  return section;
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
    const active = option.id === activeCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", () => {
      activeCategory = option.id;
      syncCategoryHash(option.id);
      renderCategoryNav();
      renderMenu();
      document.querySelector(".full-menu-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    categoryNav.append(button);
  });
}

function renderMenu() {
  menuRoot.replaceChildren();
  const categories = menuCategories.filter((category) => {
    const matchesCategory = activeCategory === "all" || activeCategory === category.id;
    return matchesCategory && matchesSearch(category);
  });

  let rendered = 0;
  categories.forEach((category) => {
    const section = createCategory(category);
    if (!section) return;
    menuRoot.append(section);
    rendered += 1;
  });

  emptyState.hidden = rendered > 0;
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

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
translateStaticPage();
renderCategoryNav();
renderMenu();

if (activeCategory !== "all") {
  window.requestAnimationFrame(() => {
    document.querySelector(".full-menu-wrap")?.scrollIntoView({ block: "start" });
  });
}
