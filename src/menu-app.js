import { menuCategories, menuCopy } from "./menu-catalog.js?v=bc69a9e52fa4";
import "./menu-search-clear.js";
import { readStoredOrderDraft, writeStoredOrderDraft } from "./src/order-draft.js";
import { createMenuActionsLoader } from "./src/menu-actions-loader.js";

const supportedLanguages = ["tr", "en", "ru"];
const languageButtons = Array.from(document.querySelectorAll(".lang-button"));
const categoryNav = document.querySelector("#menu-category-nav");
const menuRoot = document.querySelector("#menu-root");
const searchInput = document.querySelector("#menu-search");
const emptyState = document.querySelector("#menu-empty");
const menuShareButton = document.querySelector("#menu-share-button");
const cartTrigger = document.querySelector("#menu-cart-trigger");
const cartCount = document.querySelector("#menu-cart-count");
const cartTriggerTotal = document.querySelector("#menu-cart-total");
const CART_STORAGE_KEY = "robys-menu-order.v1";
const localeTag = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .trim();
}

function localized(value) {
  return value?.[language] ?? value?.tr ?? "";
}

const priceFormatters = new Map();
const itemCountRules = new Map();

function formatPrice(price) {
  let formatter = priceFormatters.get(language);
  if (!formatter) {
    formatter = new Intl.NumberFormat(localeTag[language], { maximumFractionDigits: 0 });
    priceFormatters.set(language, formatter);
  }
  return `${formatter.format(price)} ₺`;
}

function formatItemCount(count) {
  const copy = menuCopy[language].itemCount;
  let rules = itemCountRules.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(localeTag[language]);
    itemCountRules.set(language, rules);
  }
  const category = rules.select(count);
  return copy[category] ?? copy.other;
}

function imageSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function productImage(categoryId, item) {
  return item.image ?? `src/products/menu-v1/${categoryId}--${imageSlug(item.name.en)}.webp`;
}

function productId(categoryId, item) {
  return `${categoryId}:${item.id ?? imageSlug(item.name.en)}`;
}

function buildProductIndex() {
  const index = new Map();
  menuCategories.forEach((category) => {
    const items = category.items ?? category.groups.flatMap((group) => group.items);
    items.forEach((item) => {
      const id = productId(category.id, item);
      index.set(id, {
        id,
        category,
        item,
        image: productImage(category.id, item)
      });
    });
  });
  return index;
}

const productIndex = buildProductIndex();
const orderProductIds = new Set(productIndex.keys());
let orderDraft;

function readCart() {
  orderDraft = readStoredOrderDraft(orderProductIds);
  return new Map(orderDraft.lines.map(line => [line.id, line.quantity]));
}

let cart = readCart();

function writeMenuDraft(draft) {
  orderDraft = writeStoredOrderDraft(draft, orderProductIds);
  cart = new Map(orderDraft.lines.map(line => [line.id, line.quantity]));
  return orderDraft;
}

function cartSummary() {
  const quantity = orderDraft.groups.reduce((sum, group) => sum + group.quantity, 0);
  let total = 0;
  cart.forEach((lineQuantity, id) => {
    const product = productIndex.get(id);
    if (!product) return;
    total += product.item.price * lineQuantity;
  });
  return { quantity, total };
}

function syncMenuCartState() {
  menuRoot.querySelectorAll("[data-product-id]").forEach((row) => {
    const quantity = cart.get(row.dataset.productId) ?? 0;
    const media = row.querySelector(".full-menu-item-media");
    row.classList.toggle("is-in-cart", quantity > 0);
    if (!media) return;
    media.dataset.cartQuantity = String(quantity);
    const product = productIndex.get(row.dataset.productId);
    if (product) media.setAttribute("aria-label", `${menuCopy[language].openProduct}: ${localized(product.item.name)}${quantity ? ` · ${menuCopy[language].cart}: ${quantity}` : ""}`);
  });
}

function renderCart() {
  syncMenuCartState();
  const copy = menuCopy[language];
  const summary = cartSummary();
  cartCount.textContent = String(summary.quantity);
  cartTriggerTotal.textContent = formatPrice(summary.total);
  cartTrigger.classList.toggle("has-items", summary.quantity > 0);
  cartTrigger.setAttribute("aria-label", `${copy.cart}: ${summary.quantity} ${formatItemCount(summary.quantity)}, ${copy.total} ${formatPrice(summary.total)}`);
}

let orderUi;
let orderUiPromise;
let orderUiRetry = 0;
let orderIntent = 0;
function loadOrderUi() {
  if (!orderUiPromise) {
    let loading;
    if (orderUiRetry) {
      const retryUrl = new URL("./menu-order-ui.js", import.meta.url);
      retryUrl.searchParams.set("retry", String(orderUiRetry));
      loading = import(retryUrl.href);
    } else loading = import("./menu-order-ui.js?v=c1a2a9f55898");
    orderUiPromise = loading.then(({ createMenuOrderUi }) => {
      orderUi = createMenuOrderUi({ menuCopy, productIndex, orderProductIds,
        initialLanguage: language, localized, formatPrice, formatItemCount, imageSlug,
        readDraft: () => { cart = readCart(); return orderDraft; },
        writeDraft: writeMenuDraft,
        onCartChange: renderCart
      });
      return orderUi;
    }).catch(error => { orderUiPromise = null; orderUiRetry += 1; throw error; });
  }
  return orderUiPromise;
}
async function openOrderIntent(kind, id, trigger = document.activeElement) {
  const intent = ++orderIntent;
  trigger?.setAttribute("aria-busy", "true");
  try {
    const ui = await loadOrderUi();
    if (intent !== orderIntent) return;
    document.querySelector("#menu-cart-status").classList.remove("is-visible");
    ui.refresh({ nextLanguage: language });
    const returnFocus = trigger?.isConnected ? trigger : (kind === "product"
      ? Array.from(menuRoot.querySelectorAll("[data-product-id]")).find(row => row.dataset.productId === id)?.querySelector(".full-menu-item-media")
      : null) ?? cartTrigger;
    if (kind === "product") ui.openProduct(id, returnFocus);
    else ui.openCart(returnFocus);
  } catch {
    if (intent !== orderIntent) return;
    const message = {
      tr: "Seçim açılamadı. Lütfen tekrar deneyin.",
      en: "Your selection could not open. Please try again.",
      ru: "Не удалось открыть выбор. Попробуйте ещё раз."
    }[language];
    const notice = document.querySelector("#menu-cart-status");
    notice.textContent = message;
    notice.classList.add("is-visible");
  } finally { trigger?.removeAttribute("aria-busy"); }
}
function openProduct(id, trigger) { void openOrderIntent("product", id, trigger); }
const familyTrigger = document.querySelector("#menu-family-trigger");
let familyUi;
let familyUiPromise;
let familyRetry = 0;
let familyIntent = 0;
const familyCopy = {
  tr: { link: "Çocuklarla · 3 fikir", error: "Öneriler açılamadı. Menüden seçim yapabilir veya tekrar deneyebilirsiniz." },
  en: { link: "With kids · 3 ideas", error: "Suggestions could not load. Choose from the menu or try again." },
  ru: { link: "С ребёнком · 3 идеи", error: "Не удалось открыть подборку. Можно выбрать из меню или попробовать ещё раз." }
};
function loadFamilyUi() {
  if (!familyUiPromise) {
    let loading;
    if (familyRetry) {
      const url = new URL("./menu-family-ui.js", import.meta.url);
      url.searchParams.set("retry", String(familyRetry));
      loading = import(url.href);
    } else loading = import("./menu-family-ui.js?v=6f74a92f53a9");
    familyUiPromise = loading.then(({ createMenuFamilyUi }) => {
      familyUi = createMenuFamilyUi({ root: document.querySelector("#menu-family-content"),
        productIndex, orderProductIds, initialLanguage: language, localized, formatPrice,
        readDraft: () => { cart = readCart(); return orderDraft; }, writeDraft: writeMenuDraft,
        onCartChange: renderCart,
        openCart: async (trigger, isCurrent) => {
          const intent = ++orderIntent;
          const ui = await loadOrderUi();
          if (intent !== orderIntent || !isCurrent()) return;
          ui.refresh({ nextLanguage: language });
          ui.openCart(trigger?.isConnected ? trigger : cartTrigger);
        }
      });
      return familyUi;
    }).catch(error => { familyUiPromise = null; familyRetry += 1; throw error; });
  }
  return familyUiPromise;
}
async function openFamilySuggestions(event) {
  event?.preventDefault();
  if (!familyTrigger) return;
  orderIntent += 1;
  const intent = ++familyIntent;
  familyTrigger.setAttribute("aria-busy", "true");
  try {
    const ui = await loadFamilyUi();
    if (intent !== familyIntent) return;
    document.querySelector("#menu-cart-status").classList.remove("is-visible");
    ui.refresh(language);
    document.querySelector("#menu-family").hidden = false;
    ui.reveal();
    familyTrigger.setAttribute("aria-expanded", "true");
    document.querySelector("#menu-family").scrollIntoView({ block: "start" });
  } catch {
    if (intent !== familyIntent) return;
    const notice = document.querySelector("#menu-cart-status");
    notice.textContent = familyCopy[language].error;
    notice.classList.add("is-visible");
  } finally { familyTrigger.removeAttribute("aria-busy"); }
}
familyTrigger?.addEventListener("click", openFamilySuggestions);
// Escape also cancels an intent whose optional code is still downloading.
document.addEventListener("keydown", event => {
  if (event.key === "Escape") { orderIntent += 1; familyIntent += 1; }
});

function createItem(item, { priority = false, categoryId } = {}) {
  const pairing = categoryId === "pairing-offers";
  const visual = pairing || Boolean(categoryId);
  const row = document.createElement(pairing ? "article" : "div");
  row.className = pairing
    ? "full-menu-item full-menu-item--visual"
    : visual
      ? "full-menu-item full-menu-item--product"
      : "full-menu-item";
  if (pairing) row.dataset.pairing = item.journeyId ?? item.id;

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
    const id = productId(categoryId, item);
    row.dataset.productId = id;

    const media = document.createElement("button");
    media.type = "button";
    media.className = "full-menu-item-media";
    media.setAttribute("aria-label", `${menuCopy[language].openProduct}: ${localized(item.name)}`);
    media.addEventListener("click", event => openProduct(id, event.currentTarget));

    const image = document.createElement("img");
    image.src = productImage(categoryId, item);
    image.alt = pairing ? localized(item.imageAlt ?? item.name) : "";
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

function createGroup(group, categoryId) {
  const wrapper = document.createElement("div");
  wrapper.className = "full-menu-group";

  const heading = document.createElement("h3");
  heading.textContent = localized(group.label);
  wrapper.append(heading);

  const list = document.createElement("div");
  list.className = "full-menu-list";
  group.items.forEach((item) => list.append(createItem(item, { categoryId })));
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

function filteredItems(items, category) {
  if (!searchTerm) return items;
  const query = normalize(searchTerm);
  if (category && Object.values(category.name).some(name => normalize(name).includes(query))) return items;
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
    const items = filteredItems(category.items, category);
    if (!items.length) return null;
    const list = document.createElement("div");
    list.className = "full-menu-list";
    items.forEach((item, index) => {
      const priority = category.id === "pairing-offers" && index === 0;
      list.append(createItem(item, { priority, categoryId: category.id }));
    });
    section.append(list);
  } else {
    let renderedGroups = 0;
    category.groups.forEach((group) => {
      const items = filteredItems(group.items, category);
      if (!items.length) return;
      section.append(createGroup({ ...group, items }, category.id));
      renderedGroups += 1;
    });
    if (!renderedGroups) return null;
  }

  return section;
}


// Scrolling must clear the measured toolbar, including translated or zoomed text.
// CSS scroll padding also keeps browser focus/scrollIntoView below sticky controls.
function initializeMenuScrollMetrics() {
  const root = document.documentElement;
  const header = document.querySelector(".site-header");
  const controls = document.querySelector(".menu-controls");
  if (!header || !controls) return;
  const pinned = (element) => ["sticky", "fixed"].includes(getComputedStyle(element).position);
  const measure = () => {
    const headerHeight = pinned(header) ? Math.ceil(header.getBoundingClientRect().height) : 0;
    const controlsHeight = Math.ceil(controls.getBoundingClientRect().height);
    const controlsPinned = pinned(controls);
    for (const [name, value] of [
      ["--menu-header-height", headerHeight],
      ["--menu-sticky-inset", headerHeight + (controlsPinned ? controlsHeight : 0)],
      ["--menu-anchor-gap", controlsPinned ? 12 : controlsHeight + 12]
    ]) {
      const next = value + "px";
      if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
    }
    root.classList.add("menu-scroll-aware");
  };
  measure();
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(controls);
  }
  window.addEventListener("resize", measure, { passive: true });
  window.matchMedia("(hover: none) and (pointer: coarse)").addEventListener?.("change", measure);
  document.fonts?.ready.then(measure);
}

function renderCategoryNav(focusId = null) {
  const previousScrollLeft = categoryNav.scrollLeft;
  categoryNav.replaceChildren();
  let focusButton = null;
  const options = [
    { id: "all", label: menuCopy[language].all },
    ...menuCategories.map((category) => ({ id: category.id, label: localized(category.name) }))
  ];

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-category-chip";
    button.dataset.category = option.id;
    if (option.id === focusId) focusButton = button;
    button.textContent = option.label;
    const active = option.id === activeCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.addEventListener("click", () => {
      activeCategory = option.id;
      syncCategoryHash(option.id);
      renderCategoryNav(option.id);
      renderMenu();
      document.querySelector(".full-menu-wrap")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
    categoryNav.append(button);
  });
  categoryNav.dataset.ready = "true";
  categoryNav.scrollLeft = previousScrollLeft;
  focusButton?.focus({ preventScroll: true });
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
  menuRoot.dataset.ready = "true";
  syncMenuCartState();
}

const menuActions = createMenuActionsLoader({
  loadModule(attempt) {
    if (!attempt) return import("./menu-interactions.js?v=20260923-web-only-v4");
    const retryUrl = new URL("./menu-interactions.js?v=20260923-web-only-v4", import.meta.url);
    retryUrl.searchParams.set("retry", String(attempt));
    return import(retryUrl.href);
  },
  getLanguage: () => language,
  setStatus: text => {
    const status = document.querySelector("#menu-share-status");
    if (status) status.textContent = text;
  }
});
function loadMenuActions() { return menuActions.prefetch(); }

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
  document.querySelectorAll(".menu-dialog-close[data-menu-dialog-close]").forEach((button) => {
    button.setAttribute("aria-label", copy.close);
  });

  languageButtons.forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  renderCart();
  orderUi?.refresh({ nextLanguage: language });
  if (familyTrigger) familyTrigger.textContent = familyCopy[language].link;
  familyUi?.refresh(language);
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
  button.addEventListener("click", () => {
    setLanguage(button.dataset.lang);
    void loadMenuActions();
  });
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  if (searchTerm.trim() && activeCategory !== "all") {
    activeCategory = "all";
    syncCategoryHash("all");
    renderCategoryNav();
  }
  renderMenu();
});

cartTrigger.addEventListener("click", () => { void openOrderIntent("cart", undefined, cartTrigger); });

function runLazyShare(skipNative = false) {
  void menuActions.share(skipNative);
}

menuShareButton?.addEventListener("click", (event) => {
  event.preventDefault();
  if (typeof navigator.share !== "function") {
    runLazyShare();
    return;
  }

  const payload = {
    title: document.title,
    text: menuShareButton.getAttribute(`data-share-text-${language}`) ?? "",
    url: document.querySelector('link[rel="canonical"]')?.href || window.location.href
  };

  try {
    const nativeShare = navigator.share(payload);
    void nativeShare
      .then(() => menuActions.completeNativeShare())
      .catch((error) => {
        if (error?.name !== "AbortError") runLazyShare(true);
      });
  } catch (error) {
    if (error?.name !== "AbortError") runLazyShare(true);
  }
});

document.querySelector("[data-instagram-booking]")?.addEventListener("click", () => {
  void menuActions.track("instagram_booking_click");
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
translateStaticPage();
renderCategoryNav();
renderMenu();
initializeMenuScrollMetrics();

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  cart = readCart();
  orderIntent += 1;
  orderUi?.refresh({ nextLanguage: language, resetAdded: true });
  language = readStoredLanguage();
  translateStaticPage();
  renderCategoryNav();
  renderMenu();
  renderCart();
});

window.addEventListener("storage", event => {
  if (event.key === CART_STORAGE_KEY || event.key === null) {
    cart = readCart();
    orderUi?.refresh({ nextLanguage: language, resetAdded: true });
    renderCart();
  }
  if (event.key === "robys-language" || event.key === null) setLanguage(readStoredLanguage());
});

window.addEventListener("hashchange", () => {
  if (window.location.hash === "#menu-family") {
    void openFamilySuggestions();
    return;
  }
  activeCategory = readInitialCategory();
  searchInput.value = "";
  searchInput.dispatchEvent(new Event("input", { bubbles: true }));
  renderCategoryNav();
});

if (language !== "tr") void loadMenuActions();

if (window.location.hash === "#menu-family") void openFamilySuggestions();

if (activeCategory !== "all") {
  window.requestAnimationFrame(() => {
    document.querySelector(".full-menu-wrap")?.scrollIntoView({ block: "start" });
  });
}
