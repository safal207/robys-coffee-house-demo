import { order, resolveOrderProduct, ORDER_KEY } from "./order-store.js";
import { menuCategories, menuCopy } from "./menu-catalog.js?v=20260904-premium-order-v1";
import "./menu-search-clear.js";

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
const cartStatuses = Array.from(document.querySelectorAll("[data-menu-cart-status]"));
const productDialog = document.querySelector("#menu-product-dialog");
const productDialogImage = document.querySelector("#menu-product-image");
const productDialogCategory = document.querySelector("#menu-product-category");
const productDialogTitle = document.querySelector("#menu-product-title");
const productDialogDescription = document.querySelector("#menu-product-description");
const productDialogPrice = document.querySelector("#menu-product-price");
const productQuantityOutput = document.querySelector("#menu-product-quantity");
const productDecrease = document.querySelector("#menu-quantity-decrease");
const productIncrease = document.querySelector("#menu-quantity-increase");
const addToCartButton = document.querySelector("#menu-add-to-cart");
const cartDialog = document.querySelector("#menu-cart-dialog");
const cartLinesRoot = document.querySelector("#menu-cart-lines");
const cartEmpty = document.querySelector("#menu-cart-empty");
const cartDialogTotal = document.querySelector("#menu-cart-dialog-total");


const MAX_ITEM_QUANTITY = 99;
const localeTag = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };

let language = readStoredLanguage();
let activeCategory = readInitialCategory();
let searchTerm = "";
let selectedProductId = "";
let selectedProductQuantity = 1;
const dialogReturnFocus = new WeakMap();

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
  return `${new Intl.NumberFormat(localeTag[language], { maximumFractionDigits: 0 }).format(price)} ₺`;
}

function formatItemCount(count) {
  const copy = menuCopy[language].itemCount;
  const category = new Intl.PluralRules(localeTag[language]).select(count);
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

function readCart() { return new Map(order.get().lines.map(line => [line.id, line.quantity])); }
let cart = readCart();
function saveCart() { order.replace(Array.from(cart, ([id, quantity]) => ({ id, quantity }))); }

function cartSummary() {
  let quantity = 0;
  let total = 0;
  cart.forEach((lineQuantity, id) => {
    const product = resolveOrderProduct(id);
    if (!product) return;
    quantity += lineQuantity;
    total += product.item.price * lineQuantity;
  });
  return { quantity, total };
}

function createButton(className, label, listener) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", listener);
  return button;
}

function setCartQuantity(id, quantity, focusControl = null, shouldAnnounce = false) {
  const normalized = Math.max(0, Math.min(MAX_ITEM_QUANTITY, quantity));
  if (normalized === 0) cart.delete(id);
  else cart.set(id, normalized);
  saveCart();
  renderCart(focusControl ? { id, control: focusControl } : null);
  const product = resolveOrderProduct(id);
  if (shouldAnnounce && product) {
    const copy = menuCopy[language];
    const name = localized(product.item.name);
    announceCart(normalized === 0
      ? `${copy.removedFromCart}: ${name}`
      : `${copy.quantityUpdated}: ${name} × ${normalized}`);
  }
}

let cartNoticeTimer;
function announceCart(message) {
  window.clearTimeout(cartNoticeTimer);
  cartStatuses.forEach((status) => { status.textContent = ""; });
  window.requestAnimationFrame(() => {
    cartStatuses.forEach((status) => { status.textContent = message; });
    const notice = document.querySelector("#menu-cart-status");
    notice?.classList.add("is-visible");
    cartNoticeTimer = window.setTimeout(() => notice?.classList.remove("is-visible"), 3200);
  });
}

function syncMenuCartState() {
  menuRoot.querySelectorAll("[data-product-id]").forEach((row) => {
    const quantity = Array.from(cart).filter(([id]) => id.split("|")[0] === row.dataset.productId).reduce((sum, [, count]) => sum + count, 0);
    const media = row.querySelector(".full-menu-item-media");
    row.classList.toggle("is-in-cart", quantity > 0);
    if (!media) return;
    media.dataset.cartQuantity = String(quantity);
    const product = resolveOrderProduct(row.dataset.productId);
    if (product) media.setAttribute("aria-label", `${menuCopy[language].openProduct}: ${localized(product.item.name)}${quantity ? ` · ${menuCopy[language].cart}: ${quantity}` : ""}`);
  });
}

function renderCart(focusTarget = null) {
  syncMenuCartState();
  const copy = menuCopy[language];
  const summary = cartSummary();
  let focusCandidate = null;
  cartCount.textContent = String(summary.quantity);
  cartTriggerTotal.textContent = formatPrice(summary.total);
  cartDialogTotal.textContent = formatPrice(summary.total);
  cartTrigger.classList.toggle("has-items", summary.quantity > 0);
  cartTrigger.setAttribute(
    "aria-label",
    `${copy.cart}: ${summary.quantity} ${formatItemCount(summary.quantity)}, ${copy.total} ${formatPrice(summary.total)}`
  );

  cartLinesRoot.replaceChildren();
  cartEmpty.hidden = cart.size > 0;

  cart.forEach((lineQuantity, id) => {
    const product = resolveOrderProduct(id);
    if (!product) return;
    const name = localized(product.item.name);
    const line = document.createElement("article");
    line.className = "menu-cart-line";
    line.setAttribute("aria-label", name);

    const image = document.createElement("img");
    image.src = product.image;
    image.alt = "";
    image.width = 128;
    image.height = 128;
    image.loading = "lazy";
    image.decoding = "async";

    const details = document.createElement("div");
    details.className = "menu-cart-line-details";
    const title = document.createElement("strong");
    title.textContent = name;
    const unit = document.createElement("span");
    unit.textContent = `${formatPrice(product.item.price)} × ${lineQuantity}`;
    details.append(title, unit);

    const controls = document.createElement("div");
    controls.className = "menu-cart-line-controls";
    const decrease = createButton("menu-cart-step", "−", () => setCartQuantity(id, lineQuantity - 1, "decrease", true));
    decrease.setAttribute("aria-label", `${copy.decrease}: ${name}`);
    const count = document.createElement("span");
    count.textContent = String(lineQuantity);
    const increase = createButton("menu-cart-step", "+", () => setCartQuantity(id, lineQuantity + 1, "increase", true));
    increase.setAttribute("aria-label", `${copy.increase}: ${name}`);
    increase.disabled = lineQuantity >= MAX_ITEM_QUANTITY;
    const remove = createButton("menu-cart-remove", copy.remove, () => {
      setCartQuantity(id, 0, "remove", true);
    });
    remove.setAttribute("aria-label", `${copy.remove}: ${name}`);
    controls.append(decrease, count, increase, remove);

    const lineTotal = document.createElement("strong");
    lineTotal.className = "menu-cart-line-total";
    lineTotal.textContent = formatPrice(product.item.price * lineQuantity);
    line.append(image, details, controls, lineTotal);
    cartLinesRoot.append(line);

    if (focusTarget?.id === id) {
      focusCandidate = focusTarget.control === "increase" && !increase.disabled ? increase : decrease;
    }
  });

  if (focusTarget) {
    const fallback = cartLinesRoot.querySelector("button:not([disabled])")
      ?? cartDialog.querySelector("[data-menu-dialog-close]");
    (focusCandidate ?? fallback)?.focus({ preventScroll: true });
  }
}

function openDialog(dialog) {
  dialogReturnFocus.set(dialog, document.activeElement);
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.classList.add("menu-dialog--fallback");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("open", "");
    window.requestAnimationFrame(() => {
      dialog.querySelector("[data-menu-dialog-close]")?.focus({ preventScroll: true });
    });
  }
  document.body.classList.add("menu-dialog-open");
}

function closeDialog(dialog) {
  const isFallback = dialog.classList.contains("menu-dialog--fallback");
  if (!isFallback && typeof dialog.close === "function" && dialog.hasAttribute("open")) dialog.close();
  else dialog.removeAttribute("open");
  dialog.classList.remove("menu-dialog--fallback");
  dialog.removeAttribute("aria-modal");
  if (!document.querySelector(".menu-dialog[open]")) {
    document.body.classList.remove("menu-dialog-open");
  }
  const returnFocus = dialogReturnFocus.get(dialog);
  dialogReturnFocus.delete(dialog);
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}

function fallbackFocusableControls(dialog) {
  return Array.from(dialog.querySelectorAll(
    'button:not([disabled]):not([hidden]),a[href]:not([hidden]),input:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"]):not([hidden])'
  ));
}

document.addEventListener("keydown", (event) => {
  const dialog = document.querySelector(".menu-dialog--fallback[open]");
  if (!dialog) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog(dialog);
    return;
  }
  if (event.key !== "Tab") return;
  const controls = fallbackFocusableControls(dialog);
  if (controls.length === 0) {
    event.preventDefault();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function updateProductQuantity() {
  const product = resolveOrderProduct(selectedProductId);
  if (!product) return;
  const copy = menuCopy[language];
  const currentQuantity = cart.get(selectedProductId) ?? 0;
  const availableQuantity = Math.max(0, MAX_ITEM_QUANTITY - currentQuantity);
  selectedProductQuantity = availableQuantity === 0
    ? 0
    : Math.max(1, Math.min(selectedProductQuantity, availableQuantity));
  productQuantityOutput.textContent = String(selectedProductQuantity);
  productDecrease.disabled = availableQuantity === 0 || selectedProductQuantity <= 1;
  productIncrease.disabled = availableQuantity === 0 || selectedProductQuantity >= availableQuantity;
  addToCartButton.disabled = availableQuantity === 0;
  addToCartButton.textContent = availableQuantity === 0
    ? copy.maxQuantity
    : `${copy.addToCart} · ${formatPrice(product.item.price * selectedProductQuantity)}`;
}

function hydrateProductDialog() {
  const product = resolveOrderProduct(selectedProductId);
  if (!product) return;
  productDialogImage.src = product.image;
  productDialogImage.alt = localized(product.item.imageAlt ?? product.item.name);
  productDialogCategory.textContent = localized(product.category.name);
  productDialogTitle.textContent = localized(product.item.name);
  productDialogPrice.textContent = formatPrice(product.item.price);
  const description = localized(product.item.description);
  productDialogDescription.textContent = description;
  productDialogDescription.hidden = !description;
  updateProductQuantity();
}

function openProduct(id) {
  if (!productIndex.has(id)) return;
  selectedProductId = id;
  selectedProductQuantity = 1;
  hydrateProductDialog();
  openDialog(productDialog);
}

function addSelectedProduct() {
  const product = resolveOrderProduct(selectedProductId);
  if (!product) return;
  const currentQuantity = cart.get(selectedProductId) ?? 0;
  const copy = menuCopy[language];
  const addedQuantity = Math.min(selectedProductQuantity, MAX_ITEM_QUANTITY - currentQuantity);
  if (addedQuantity <= 0) {
    announceCart(`${copy.maxQuantity}: ${localized(product.item.name)}`);
    updateProductQuantity();
    return;
  }
  setCartQuantity(selectedProductId, currentQuantity + addedQuantity);
  announceCart(`${copy.added}: ${localized(product.item.name)} × ${addedQuantity}`);
  closeDialog(productDialog);
  cartTrigger.classList.add("is-emphasized");
  window.setTimeout(() => cartTrigger.classList.remove("is-emphasized"), 620);
}

function createItem(item, { priority = false, categoryId } = {}) {
  const pairing = Boolean(item.image);
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
    media.addEventListener("click", () => openProduct(id));

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
      list.append(createItem(item, { priority, categoryId: category.id }));
    });
    section.append(list);
  } else {
    let renderedGroups = 0;
    category.groups.forEach((group) => {
      const items = filteredItems(group.items);
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

let menuActionsPromise;
function loadMenuActions() {
  menuActionsPromise ??= import("./menu-interactions.js?v=20260904-interaction-v3");
  return menuActionsPromise;
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
  productDecrease.setAttribute("aria-label", copy.decrease);
  productIncrease.setAttribute("aria-label", copy.increase);
  document.querySelectorAll("[data-menu-dialog-close]").forEach((button) => {
    button.setAttribute("aria-label", copy.close);
  });

  languageButtons.forEach((button) => {
    const active = button.dataset.lang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (selectedProductId) hydrateProductDialog();
  renderCart();
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
  renderMenu();
});

cartTrigger.addEventListener("click", () => {
  renderCart();
  openDialog(cartDialog);
});

function isAndroidWebView() {
  const userAgent = navigator.userAgent || "";
  return /Android/i.test(userAgent) && (/(?:^|[;\s])wv(?:[;)\s]|$)/i.test(userAgent) || /Version\/4\.0/i.test(userAgent));
}

function runLazyShare(skipNative = false) {
  void loadMenuActions().then(({ shareMenu }) => shareMenu(null, { skipNative }));
}

menuShareButton?.addEventListener("click", (event) => {
  event.preventDefault();
  if (isAndroidWebView() || typeof navigator.share !== "function") {
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
      .then(() => loadMenuActions().then(({ completeNativeShare }) => completeNativeShare()))
      .catch((error) => {
        if (error?.name !== "AbortError") runLazyShare(true);
      });
  } catch {
    runLazyShare(true);
  }
});

document.querySelector("[data-instagram-booking]")?.addEventListener("click", () => {
  void loadMenuActions().then(({ track }) => track("instagram_booking_click"));
});

productDecrease.addEventListener("click", () => {
  selectedProductQuantity = Math.max(1, selectedProductQuantity - 1);
  updateProductQuantity();
});

productIncrease.addEventListener("click", () => {
  selectedProductQuantity = Math.min(MAX_ITEM_QUANTITY, selectedProductQuantity + 1);
  updateProductQuantity();
});

addToCartButton.addEventListener("click", addSelectedProduct);

document.querySelectorAll("[data-menu-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closeDialog(button.dataset.menuDialogClose === "product" ? productDialog : cartDialog);
  });
});

[productDialog, cartDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener("close", () => {
    if (!document.querySelector(".menu-dialog[open]")) {
      document.body.classList.remove("menu-dialog-open");
    }
  });
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
translateStaticPage();
renderCategoryNav();
renderMenu();
initializeMenuScrollMetrics();

if (language !== "tr") void loadMenuActions();

if (activeCategory !== "all") {
  window.requestAnimationFrame(() => {
    document.querySelector(".full-menu-wrap")?.scrollIntoView({ block: "start" });
  });
}

// Shared state also refreshes menu views after edits made through the global drawer.
order.subscribe(() => { cart = readCart(); renderCart(); });

if (new URLSearchParams(window.location.search).get("order") === "open") openDialog(cartDialog);
