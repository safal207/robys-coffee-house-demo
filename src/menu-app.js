import { menuCategories, menuCopy } from "./menu-catalog.js?v=05e7dac3c17b";
import "./menu-search-clear.js";
import "./src/choice-help-entry.js";
import "./src/menu-feedback-entry.js";
import { canWarmMenu } from "./src/menu-view-prefetch.js";
import { warmFeedOnIntent } from "./src/menu-feed-warmup.js";
import { createMenuActionsLoader } from "./src/menu-actions-loader.js";

// Decide the generic entry before rendering cards or starting optional modules.
function initializeMenu() {
  try {
    if (!location.search && !location.hash) {
      const type = performance.getEntriesByType?.("navigation")?.[0]?.type, legacy = performance.navigation?.type;
      if (history.state?.robysMenuViewEntry !== "list" && !["reload", "back_forward", "prerender"].includes(type)
        && legacy !== 1 && legacy !== 2 && (type === "navigate" || legacy === 0) && localStorage.getItem("robys-menu-view") === "feed") {
        location.replace("menu-feed.html?view=feed");
        return;
      }
      history.replaceState({ ...history.state, robysMenuViewEntry: "list" }, "", location.href);
    }
  } catch { /* Unavailable preferences or timing keep the list usable. */ }

  // On menu interaction, prepare the exact alternate revision without executing it.
  warmFeedOnIntent("./menu-feed.js?v=7370a20b4c4a");

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
const CART_PROJECTION_KEY = "robys-menu-order.v2";
const localeTag = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };

let language = readEntryLanguage();
storeLanguage(language);
let activeCategory = readInitialCategory();
let searchTerm = menuSearch();
searchInput.value = searchTerm;
searchInput.dispatchEvent(new Event("change", { bubbles: true }));
function readEntryLanguage() {
  const requested = new URL(location.href).searchParams.get("lang");
  return supportedLanguages.includes(requested) ? requested : readStoredLanguage();
}
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

function menuSearch(value = new URL(location.href).searchParams.get("q") ?? "") {
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, 120).join("");
}

function syncCategoryHash(categoryId) {
  const url = new URL(location.href);
  url.searchParams.set("lang", language);
  const query = menuSearch(searchTerm);
  if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
  if (categoryId !== undefined) {
    url.hash = categoryId === "all" ? "" : categoryId;
    url.searchParams.delete("product"); url.searchParams.delete("item");
  }
  history.replaceState(history.state, "", url);
}

const menuViewLinks = document.querySelectorAll("[data-menu-view]");
function updateMenuViews() {
  const query = menuSearch(searchTerm), product = new URL(location.href).searchParams.get("product");
  menuViewLinks.forEach(link => {
    const view = link.dataset.menuView;
    const url = new URL(view === "feed" ? "menu-feed.html" : "menu.html", location.href);
    url.searchParams.set("view", view); url.searchParams.set("lang", language);
    if (query) url.searchParams.set("q", query);
    if (activeCategory !== "all") url.hash = activeCategory;
    if (!query && productIndex.has(product) && (activeCategory === "all" || product.startsWith(activeCategory + ":"))) {
      url.searchParams.set(view === "feed" ? "item" : "product", product);
    }
    link.href = url;
  });
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
const linkedProduct = productIndex.get(new URL(location.href).searchParams.get("product"));
if (linkedProduct) {
  activeCategory = linkedProduct.category.id;
  searchInput.value = searchTerm = "";
  searchInput.dispatchEvent(new Event("change", { bubbles: true }));
}
// Start the existing low-priority document hint before rendering the catalog.
// Its URL already carries the initial language, search and product context.
updateMenuViews();
if (canWarmMenu(navigator.connection, document.hidden, navigator.onLine)) {
  const hint = document.createElement("link");
  if (hint.relList?.supports("prefetch")) {
    hint.rel = "prefetch"; hint.as = "document"; hint.fetchPriority = "low";
    hint.href = Array.from(menuViewLinks).find(link => link.dataset.menuView === "feed").href.split("#")[0];
    document.head.append(hint);
  }
}
const orderProductIds = new Set(productIndex.keys());
let orderDraft;
let cartReadGeneration = 0;
let storageNotice;
let orderStorage;
let orderStoragePromise;
let orderStorageRetry = 0;

// The initial catalog only reads a disposable badge projection. It never
// writes storage or starts the authoritative ordering system before intent.
function readCartProjection() {
  let raw;
  try { raw = JSON.parse(sessionStorage.getItem("robys-menu-order.tab.v1") ?? "null")?.draft; } catch {}
  if (!raw) try { raw = JSON.parse(localStorage.getItem(CART_PROJECTION_KEY) ?? localStorage.getItem(CART_STORAGE_KEY) ?? "null"); } catch {}
  const counts = new Map();
  const groups = [];
  const valid = value => Number.isInteger(value) && value > 0 && value <= 99;
  if (raw?.version !== 1) return { version: 1, groups, lines: [] };
  if (Array.isArray(raw.groups)) {
    for (const group of raw.groups) {
      if (!valid(group?.quantity) || !Array.isArray(group.items) || !group.items.length) continue;
      const next = new Map(counts);
      let accepted = true;
      for (const item of group.items) {
        const quantity = item?.quantity ?? 1;
        const total = (next.get(item?.id) ?? 0) + quantity * group.quantity;
        if (!orderProductIds.has(item?.id) || !valid(quantity) || !valid(total)) { accepted = false; break; }
        next.set(item.id, total);
      }
      if (!accepted) continue;
      next.forEach((quantity, id) => counts.set(id, quantity));
      groups.push({ quantity: group.quantity });
    }
  } else if (Array.isArray(raw.lines)) {
    for (const line of raw.lines) if (orderProductIds.has(line?.id) && valid(line.quantity)) counts.set(line.id, line.quantity);
    counts.forEach(quantity => groups.push({ quantity }));
  }
  return { version: 1, groups, lines: Array.from(counts, ([id, quantity]) => ({ id, quantity })) };
}

function loadOrderStorage() {
  if (!orderStoragePromise) {
    let loading;
    if (orderStorageRetry) {
      const retryUrl = new URL("./order-storage.js", import.meta.url);
      retryUrl.searchParams.set("retry", String(orderStorageRetry));
      loading = import(retryUrl.href);
    } else loading = import("./order-storage.js?v=6908555cd79b");
    orderStoragePromise = loading.then(storage => {
      storageNotice = storage.createOrderStorageNotice({
        getLanguage: () => language,
        getProduct: id => productIndex.get(id)?.item,
        validIds: orderProductIds,
        onResolved: async () => {
          await refreshLatestCart({ resetAdded: true });
          orderUi?.refresh({ nextLanguage: language, clearStorageError: true });
        }
      });
      orderStorage = storage;
      return storage;
    }).catch(error => { orderStoragePromise = null; orderStorageRetry += 1; throw error; });
  }
  return orderStoragePromise;
}

function readCart() {
  orderDraft = orderStorage ? orderStorage.readStoredOrderDraft(orderProductIds) : readCartProjection();
  return new Map(orderDraft.lines.map(line => [line.id, line.quantity]));
}

let cart = readCart();

async function refreshLatestCart({ refreshUi = true, resetAdded = false } = {}) {
  const generation = ++cartReadGeneration;
  const storage = await loadOrderStorage();
  const draft = await storage.readLatestStoredOrderDraft(orderProductIds);
  if (generation !== cartReadGeneration) return;
  orderDraft = draft;
  cart = new Map(draft.lines.map(line => [line.id, line.quantity]));
  renderCart();
  if (refreshUi) orderUi?.refresh({ nextLanguage: language, resetAdded });
}

async function mutateMenuDraft(updater) {
  const generation = ++cartReadGeneration;
  const storage = await loadOrderStorage();
  const result = await storage.transactStoredOrderDraft(updater, orderProductIds, { origin: MENU_ORDER_ORIGIN });
  if (generation === cartReadGeneration) {
    orderDraft = result.draft;
    cart = new Map(orderDraft.lines.map(line => [line.id, line.quantity]));
  }
  return result;
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
const MENU_ORDER_ORIGIN = "menu-app";
let orderUiPromise;
let orderUiRetry = 0;
const pendingKidsAdds = new Set();
// Product, cart and family downloads belong to one navigation stream. A late
// import may initialize its module, but only the latest user intent can reveal,
// scroll or focus a view. Clear the previous trigger's busy state immediately.
let menuIntent = 0;
let busyTrigger;
function beginMenuIntent(trigger) {
  busyTrigger?.removeAttribute("aria-busy");
  busyTrigger = trigger;
  trigger?.setAttribute("aria-busy", "true");
  return ++menuIntent;
}
function finishMenuIntent(intent) {
  if (intent !== menuIntent) return;
  busyTrigger?.removeAttribute("aria-busy");
  busyTrigger = null;
}
function loadOrderUi() {
  if (!orderUiPromise) {
    let loading;
    if (orderUiRetry) {
      const retryUrl = new URL("./menu-order-ui.js", import.meta.url);
      retryUrl.searchParams.set("retry", String(orderUiRetry));
      loading = import(retryUrl.href);
    } else loading = import("./menu-order-ui.js?v=206dca9f16f0");
    orderUiPromise = Promise.all([loading, loadOrderStorage()]).then(([{ createMenuOrderUi }]) => {
      orderUi = createMenuOrderUi({ menuCopy, productIndex, orderProductIds,
        initialLanguage: language, localized, formatPrice, formatItemCount, imageSlug,
        readDraft: () => { cart = readCart(); return orderDraft; },
        readLatestDraft: async () => {
          await refreshLatestCart({ refreshUi: false });
          return orderStorage.readStoredOrderDraft(orderProductIds);
        },
        mutateDraft: mutateMenuDraft,
        reopenCart: (trigger, groupId) => openOrderIntent("cart", groupId, trigger),
        onCartChange: renderCart
      });
      return orderUi;
    }).catch(error => { orderUiPromise = null; orderUiRetry += 1; throw error; });
  }
  return orderUiPromise;
}
async function openOrderIntent(kind, id, trigger = document.activeElement) {
  const kidsId = kind === "kids" ? id?.id : null;
  if (kidsId && pendingKidsAdds.has(kidsId)) return false;
  if (kidsId) pendingKidsAdds.add(kidsId);
  combosUi?.close({ restoreFocus: false });
  const intent = beginMenuIntent(trigger);
  try {
    const [ui] = await Promise.all([loadOrderUi(), refreshLatestCart({ refreshUi: false })]);
    if (intent !== menuIntent) return false;
    document.querySelector("#menu-cart-status").classList.remove("is-visible");
    ui.refresh({ nextLanguage: language });
    const returnFocus = trigger?.isConnected ? trigger : (kind === "product"
      ? Array.from(menuRoot.querySelectorAll("[data-product-id]")).find(row => row.dataset.productId === id)?.querySelector(".full-menu-item-media")
      : null) ?? cartTrigger;
    if (kind === "kids") return await ui.addKidsCombo(id, returnFocus, () => intent === menuIntent);
    if (kind === "product") ui.openProduct(id, returnFocus);
    else ui.openCart(returnFocus, id);
  } catch {
    if (intent !== menuIntent) return false;
    const message = {
      tr: "Seçim açılamadı. Lütfen tekrar deneyin.",
      en: "Your selection could not open. Please try again.",
      ru: "Не удалось открыть выбор. Попробуйте ещё раз."
    }[language];
    const notice = document.querySelector("#menu-cart-status");
    notice.textContent = message;
    notice.classList.add("is-visible");
    return false;
  } finally {
    if (kidsId) pendingKidsAdds.delete(kidsId);
    finishMenuIntent(intent);
  }
}
function openProduct(id, trigger) { void openOrderIntent("product", id, trigger); }
const familyTrigger = document.querySelector("#menu-family-trigger");
let familyUi;
let familyUiPromise;
let familyRetry = 0;
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
    } else loading = import("./menu-family-ui.js?v=e9cf66bcd351");
    familyUiPromise = loading.then(({ createMenuFamilyUi }) => {
      familyUi = createMenuFamilyUi({ root: document.querySelector("#menu-family-content"),
        productIndex, orderProductIds, initialLanguage: language, localized, formatPrice,
        readDraft: () => { cart = readCart(); return orderDraft; }, mutateDraft: mutateMenuDraft,
        addKidsCombo: (combo, trigger) => openOrderIntent("kids", combo, trigger),
        openProduct,
        onCartChange: renderCart,
        onIntent: () => {
          const intent = beginMenuIntent();
          return () => intent === menuIntent;
        },
        openCart: async (trigger, isCurrent) => {
          // This is feedback for the original Add action, not a fresh intent.
          // A later product/cart click or dismissal wins even during storage.
          if (!isCurrent()) return;
          const intent = menuIntent;
          try {
            const [ui] = await Promise.all([loadOrderUi(), refreshLatestCart({ refreshUi: false })]);
            if (intent !== menuIntent || !isCurrent()) return;
            ui.refresh({ nextLanguage: language });
            ui.openCart(trigger?.isConnected ? trigger : cartTrigger);
          } catch (error) {
            if (intent !== menuIntent || !isCurrent()) return;
            throw error;
          }
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
  combosUi?.close({ restoreFocus: false });
  const intent = beginMenuIntent(familyTrigger);
  try {
    const ui = await loadFamilyUi();
    if (intent !== menuIntent) return;
    document.querySelector("#menu-cart-status").classList.remove("is-visible");
    ui.refresh(language);
    document.querySelector("#menu-family").hidden = false;
    ui.reveal();
    familyTrigger.setAttribute("aria-expanded", "true");
    document.querySelector("#menu-family").scrollIntoView({ block: "start" });
  } catch {
    if (intent !== menuIntent) return;
    const notice = document.querySelector("#menu-cart-status");
    notice.textContent = familyCopy[language].error;
    notice.classList.add("is-visible");
  } finally { finishMenuIntent(intent); }
}
familyTrigger?.addEventListener("click", openFamilySuggestions);

const combosTrigger = document.querySelector("#menu-combos-trigger");
let combosUi;
let combosUiPromise;
let combosRetry = 0;
const combosCopy = {
  tr: { link: "Setler · 12", takeaway: "Al götür · 4", error: "Setler açılamadı. Menüden seçim yapabilir veya tekrar deneyebilirsiniz." },
  en: { link: "Combos · 12", takeaway: "To go · 4", error: "Combos could not load. Choose from the menu or try again." },
  ru: { link: "Комбо · 12", takeaway: "С собой · 4", error: "Не удалось открыть комбо. Можно выбрать из меню или попробовать ещё раз." }
};
function loadCombosUi() {
  if (!combosUiPromise) {
    let loading;
    if (combosRetry) {
      const url = new URL("./menu-combos-ui.js", import.meta.url);
      url.searchParams.set("retry", String(combosRetry));
      loading = import(url.href);
    } else loading = import("./menu-combos-ui.js?v=7ceff359f5a2");
    combosUiPromise = loading.then(({ createMenuCombosUi }) => {
      combosUi = createMenuCombosUi({ root: document.querySelector("#menu-combos-content"),
        productIndex, orderProductIds, initialLanguage: language, localized, formatPrice,
        readDraft: () => { cart = readCart(); return orderDraft; }, mutateDraft: mutateMenuDraft,
        onCartChange: renderCart,
        onIntent: () => { const intent = beginMenuIntent(); return () => intent === menuIntent; },
        openCart: async (trigger, isCurrent) => {
          if (!isCurrent()) return;
          const intent = menuIntent;
          const [ui] = await Promise.all([loadOrderUi(), refreshLatestCart({ refreshUi: false })]);
          if (intent !== menuIntent || !isCurrent()) return;
          ui.refresh({ nextLanguage: language });
          ui.openCart(trigger?.isConnected ? trigger : cartTrigger);
        }
      });
      return combosUi;
    }).catch(error => { combosUiPromise = null; combosRetry += 1; throw error; });
  }
  return combosUiPromise;
}
async function openComboSuggestions(event, filter = "all", recipeId = "") {
  event?.preventDefault();
  const trigger = event?.target?.closest?.("a,button") ?? event?.currentTarget ?? combosTrigger;
  const intent = beginMenuIntent(trigger);
  try {
    const ui = await loadCombosUi();
    if (intent !== menuIntent) return;
    document.querySelector("#menu-cart-status").classList.remove("is-visible");
    ui.refresh(language);
    document.querySelector("#menu-combos").hidden = false;
    ui.reveal(filter);
    combosTrigger?.setAttribute("aria-expanded", "true");
    document.querySelector("#menu-combos").scrollIntoView({ block: "start" });
    if (recipeId) {
      // The quiet helper closes before navigation. Return focus to the matching
      // visible card instead of its now-hidden suggestion link.
      const card = Array.from(document.querySelectorAll("#menu-combos [data-combo-recipe]"))
        .find(node => node.dataset.comboRecipe === recipeId);
      const returnFocus = card?.querySelector(".menu-combos-choose") ?? combosTrigger;
      ui.open(recipeId, returnFocus);
    }
  } catch {
    if (intent !== menuIntent) return;
    const notice = document.querySelector("#menu-cart-status");
    notice.textContent = combosCopy[language].error;
    notice.classList.add("is-visible");
  } finally { finishMenuIntent(intent); }
}
combosTrigger?.addEventListener("click", event => { void openComboSuggestions(event); });
document.querySelector("#menu-combos-takeaway-trigger")?.addEventListener("click", event => { void openComboSuggestions(event, "takeaway"); });
document.addEventListener("click", event => {
  const anchor = event.target.closest?.(".choice-help-actions a");
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
  const recipeId = comboRecipeFromHash(url.hash);
  if (recipeId) {
    // replaceState avoids a second asynchronous reveal from hashchange.
    window.history.replaceState(null, "", url);
    void openComboSuggestions(event, "all", recipeId);
  } else if (url.hash === "#menu-combos") void openComboSuggestions(event);
});
function comboRecipeFromHash(hash = window.location.hash) {
  return /^#menu-combo-([a-z][a-z0-9-]{0,50})$/.exec(hash)?.[1] ?? "";
}
// Escape also cancels an intent whose optional code is still downloading.
document.addEventListener("keydown", event => {
  if (event.key === "Escape") beginMenuIntent();
});
document.addEventListener("click", event => {
  if (event.target.closest?.("[data-menu-dialog-close]")) beginMenuIntent();
}, true);

// Native lazy loading can fetch several screens of large catalog photos on a
// slow connection. Keep those requests close to the viewport so they do not
// compete with the first visible photograph. Older browsers retain native loading.
function loadMenuProductPhoto(image, sourceUrl) {
  // Both views use the same full-frame delivery choices, so a view switch can
  // reuse the photo already selected by the browser. Dense screens keep 1024px.
  const compact = sourceUrl.replace("/products/", "/products/quick-v1/").replace(/\.webp$/, "-512.webp");
  image.sizes = "(max-width: 460px) 100vw, 460px";
  image.addEventListener("error", () => {
    if (!image.srcset) return;
    image.removeAttribute("srcset");
    image.src = sourceUrl;
  });
  image.srcset = `${compact} 512w, ${sourceUrl} 1024w`;
  image.src = sourceUrl;
}

function createProductImageObserver() {
  if (typeof IntersectionObserver !== "function") return null;
  try {
    return new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const image = entry.target;
        observer.unobserve(image);
        const sourceUrl = image.dataset.menuLazySrc;
        if (!image.isConnected || !sourceUrl) continue;
        delete image.dataset.menuLazySrc;
        loadMenuProductPhoto(image, sourceUrl);
      }
    }, { rootMargin: "150px 0px", threshold: 0 });
  } catch { return null; }
}

const productImageObserver = createProductImageObserver();

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
    const sourceUrl = productImage(categoryId, item);
    image.alt = pairing ? localized(item.imageAlt ?? item.name) : "";
    image.loading = priority ? "eager" : "lazy";
    image.decoding = "async";
    if (priority) image.fetchPriority = "high";
    image.width = 1024;
    image.height = 1024;
    if (!priority && productImageObserver) {
      image.dataset.menuLazySrc = sourceUrl;
      productImageObserver.observe(image);
    } else loadMenuProductPhoto(image, sourceUrl);
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
      combosUi?.close({ restoreFocus: false });
      beginMenuIntent();
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
  productImageObserver?.takeRecords();
  productImageObserver?.disconnect();
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
  updateMenuViews();
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
  const skipLink = document.querySelector(".skip-link[data-localized]");
  if (skipLink) skipLink.textContent = skipLink.dataset[language] ?? skipLink.dataset.tr;
  document.querySelectorAll("[data-menu-feed]").forEach(link => { link.textContent = link.dataset[language] ?? link.dataset.tr; });

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
  if (combosTrigger) combosTrigger.textContent = combosCopy[language].link;
  const takeawayTrigger = document.querySelector("#menu-combos-takeaway-trigger");
  if (takeawayTrigger) takeawayTrigger.textContent = combosCopy[language].takeaway;
  combosUi?.refresh(language);
  storageNotice?.refresh();
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
    syncCategoryHash();
    void loadMenuActions();
  });
});

searchInput.addEventListener("input", () => {
  combosUi?.close({ restoreFocus: false });
  beginMenuIntent();
  searchTerm = searchInput.value;
  if (searchTerm.trim() && activeCategory !== "all") {
    activeCategory = "all";
    syncCategoryHash("all");
    renderCategoryNav();
  } else syncCategoryHash(activeCategory);
  renderMenu();
});
searchInput.addEventListener("focus", () => document.body.classList.add("menu-text-input-active"));
searchInput.addEventListener("blur", () => document.body.classList.remove("menu-text-input-active"));

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
menuViewLinks.forEach(link => {
  const choose = event => {
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
    updateMenuViews();
    try { localStorage.setItem("robys-menu-view", link.dataset.menuView); } catch {}
  };
  link.addEventListener("click", choose, true);
  link.addEventListener("auxclick", choose, true);
});
document.documentElement.dataset.menuViewReady = "true";
function refreshObservedCart(resetAdded = false) {
  if (orderStorage) { void refreshLatestCart({ resetAdded }).catch(() => {}); return; }
  cart = readCart();
  renderCart();
}

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  beginMenuIntent();
  language = readEntryLanguage();
  translateStaticPage();
  renderCategoryNav();
  renderMenu();
  refreshObservedCart(true);
});

window.addEventListener("storage", event => {
  if (event.key === CART_STORAGE_KEY || event.key === CART_PROJECTION_KEY || event.key === null) refreshObservedCart(true);
  if (event.key === "robys-language" || event.key === null) setLanguage(readStoredLanguage());
});
window.addEventListener("robys:order-change", event => {
  if (event.detail?.origin !== MENU_ORDER_ORIGIN) refreshObservedCart(true);
});
window.addEventListener("focus", () => refreshObservedCart());

window.addEventListener("hashchange", () => {
  const recipeId = comboRecipeFromHash();
  if (recipeId) {
    void openComboSuggestions(undefined, "all", recipeId);
    return;
  }
  if (["#menu-combos", "#menu-combos-takeaway"].includes(window.location.hash)) {
    void openComboSuggestions(undefined, window.location.hash.endsWith("-takeaway") ? "takeaway" : "all");
    return;
  }
  if (["#menu-family", "#kids-menu"].includes(window.location.hash)) {
    void openFamilySuggestions();
    return;
  }
  combosUi?.close({ restoreFocus: false });
  beginMenuIntent();
  activeCategory = readInitialCategory();
  searchInput.value = searchTerm = menuSearch();
  searchInput.dispatchEvent(new Event("change", { bubbles: true }));
  renderCategoryNav();
  renderMenu();
});

if (language !== "tr") void loadMenuActions();

if (["#menu-family", "#kids-menu"].includes(window.location.hash)) void openFamilySuggestions();
if (["#menu-combos", "#menu-combos-takeaway"].includes(window.location.hash)) {
  void openComboSuggestions(undefined, window.location.hash.endsWith("-takeaway") ? "takeaway" : "all");
}
if (comboRecipeFromHash()) void openComboSuggestions(undefined, "all", comboRecipeFromHash());

if (activeCategory !== "all") {
  window.requestAnimationFrame(() => {
    document.querySelector(".full-menu-wrap")?.scrollIntoView({ block: "start" });
  });
}

}

initializeMenu();
