import { initMenuViewPrefetch } from "./src/menu-view-prefetch.js";
// List and feed are two views of the same menu. Explicit links always win over
// the remembered preference; only an unqualified menu entry can use it.
export const MENU_VIEW_STORAGE_KEY = "robys-menu-view";
const languages = new Set(["tr", "en", "ru"]);
const views = new Set(["list", "feed"]);

export function normalizeMenuSearch(value) {
  return typeof value === "string" ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, 120).join("") : "";
}

function validProduct(value, categories) {
  return typeof value === "string" && value.length <= 160 && /^[a-z0-9-]+:[a-z0-9-]+$/.test(value)
    && categories.includes(value.split(":")[0]) ? value : null;
}

export function readMenuViewContext(href, categories) {
  const url = new URL(href);
  const language = url.searchParams.get("lang");
  const productId = validProduct(url.searchParams.get("item") ?? url.searchParams.get("product"), categories);
  const hash = url.hash.slice(1);
  return {
    language: languages.has(language) ? language : null,
    category: productId?.split(":")[0] ?? (categories.includes(hash) ? hash : "all"),
    search: normalizeMenuSearch(url.searchParams.get("q")),
    hasSearch: url.searchParams.has("q"),
    productId
  };
}

export function menuViewUrl(href, view, context, categories) {
  const target = views.has(view) ? view : "list";
  const url = new URL(target === "feed" ? "menu-feed.html" : "menu.html", href);
  url.searchParams.set("view", target);
  if (languages.has(context.language)) url.searchParams.set("lang", context.language);
  const search = normalizeMenuSearch(context.search);
  const category = categories.includes(context.category) ? context.category : "all";
  if (search) url.searchParams.set("q", search);
  if (category !== "all") url.hash = category;
  const productId = validProduct(context.productId, categories);
  if (!search && productId && (category === "all" || productId.startsWith(`${category}:`))) {
    url.searchParams.set(target === "feed" ? "item" : "product", productId);
  }
  return url.href;
}

export function readMenuViewPreference(storage) {
  try {
    const value = storage?.getItem(MENU_VIEW_STORAGE_KEY);
    return views.has(value) ? value : null;
  } catch { return null; }
}

export function storeMenuViewPreference(storage, view) {
  if (!views.has(view)) return false;
  try { storage?.setItem(MENU_VIEW_STORAGE_KEY, view); return Boolean(storage); }
  catch { return false; }
}

export function readMenuNavigationType(timing) {
  let entryType, legacyType;
  try { entryType = timing?.getEntriesByType?.("navigation")?.[0]?.type; } catch { /* Timing can be unavailable during startup. */ }
  try { legacyType = timing?.navigation?.type; } catch { /* A missing fallback must not imply a fresh visit. */ }
  // Some browsers publish the navigation entry after module initialization.
  // A history/reload signal from either API takes precedence over "navigate".
  if (entryType === "back_forward" || legacyType === 2) return "back_forward";
  if (entryType === "reload" || legacyType === 1) return "reload";
  if (entryType === "prerender") return "prerender";
  if (entryType === "navigate" || legacyType === 0) return "navigate";
  return null;
}

export function shouldOpenPreferredFeed(href, preference, navigationType = null, historyState = null) {
  const url = new URL(href);
  return preference === "feed" && navigationType === "navigate"
    && historyState?.robysMenuViewEntry !== "list"
    && /\/menu(?:\.html)?$/.test(url.pathname) && !url.search && !url.hash;
}

function initializeMenuViews() {
  const feed = document.querySelector("#feed");
  const root = feed ?? document.querySelector("#menu-root");
  if (!root) return;
  const view = feed ? "feed" : "list";
  const searchInput = document.querySelector(feed ? "#feed-search" : "#menu-search");
  const categoryRoot = document.querySelector(feed ? "#feed-categories" : "#menu-category-nav");
  let storage;
  try { storage = window.localStorage; } catch { /* Navigation also works without storage. */ }
  const navigationType = readMenuNavigationType(window.performance);
  if (view === "list" && shouldOpenPreferredFeed(location.href, readMenuViewPreference(storage), navigationType, history.state)) {
    location.replace(menuViewUrl(location.href, "feed", {}, []));
    return;
  }

  const categories = () => [...categoryRoot.querySelectorAll("[data-category]")].map(node => node.dataset.category);
  const activeCategory = () => categoryRoot.querySelector('[data-category][aria-pressed="true"]')?.dataset.category ?? "all";
  const currentContext = () => ({
    ...readMenuViewContext(location.href, categories()),
    language: document.documentElement.lang,
    category: activeCategory(),
    search: searchInput.value
  });
  const refreshLinks = () => {
    const context = currentContext();
    document.querySelectorAll("a[data-menu-view]").forEach(link => {
      link.href = menuViewUrl(location.href, link.dataset.menuView, context, categories());
    });
  };
  let restoringNavigation = false;
  const rememberContext = (clearProduct = false) => {
    if (restoringNavigation) return;
    const url = new URL(location.href);
    const search = normalizeMenuSearch(searchInput.value);
    if (search) url.searchParams.set("q", search);
    else url.searchParams.delete("q");
    if (languages.has(document.documentElement.lang)) url.searchParams.set("lang", document.documentElement.lang);
    // A changed search is a new discovery intent, not a product deep link.
    if (search || clearProduct) { url.searchParams.delete("item"); url.searchParams.delete("product"); }
    try { history.replaceState(history.state, "", url); } catch { /* Links still carry context. */ }
  };
  const restoreContext = (href = location.href) => {
    const context = readMenuViewContext(href, categories());
    if (view === "list" && (context.language || context.hasSearch)) {
      document.dispatchEvent(new CustomEvent("robys:menu-view-context", { detail: {
        language: context.language,
        category: context.category,
        search: context.productId ? "" : context.search
      } }));
    } else if (view === "feed") {
      if (context.language && document.documentElement.lang !== context.language) {
        document.querySelector(`[data-lang="${context.language}"]`)?.click();
      }
      if (context.hasSearch && !context.productId && searchInput.value !== context.search) {
        searchInput.value = context.search;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    refreshLinks();
  };

  const ready = () => {
    // Preserve this actual list visit across Back and reload without changing
    // its URL or the user's preference for future, separate menu entries.
    if (view === "list" && !location.search && !location.hash) {
      try {
        const state = history.state;
        if (state === null || (typeof state === "object" && !Array.isArray(state))) {
          history.replaceState({ ...state, robysMenuViewEntry: "list" }, "", location.href);
        }
      } catch { /* Timing checks still protect history navigation without state. */ }
    }
    restoreContext();
    document.addEventListener("input", event => {
      if (event.target !== searchInput) return;
      rememberContext(true);
      refreshLinks();
    });
    document.addEventListener("click", event => {
      if (event.target.closest?.("[data-lang], [data-category], #feed-search-clear, #feed-reset, #feed-liked-filter")) {
        rememberContext(!event.target.closest?.("[data-lang]"));
        refreshLinks();
      }
    });
    const switchView = event => {
      const link = event.target.closest?.("a[data-menu-view]");
      if (!link || event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
      // Rebuild at activation as well, including keyboard clicks and new tabs.
      refreshLinks();
      storeMenuViewPreference(storage, link.dataset.menuView);
    };
    document.addEventListener("click", switchView, { capture: true });
    document.addEventListener("auxclick", switchView, { capture: true });
    document.addEventListener("robys:menu-view-change", refreshLinks);
    const restoreNavigation = () => {
      const href = location.href;
      restoringNavigation = true;
      queueMicrotask(() => {
        restoreContext(href);
        restoringNavigation = false;
      });
    };
    window.addEventListener("popstate", restoreNavigation, { capture: true });
    window.addEventListener("hashchange", restoreNavigation, { capture: true });
    window.addEventListener("pageshow", event => {
      if (event.persisted) restoreContext();
    });
    document.documentElement.dataset.menuViewReady = "true";
    initMenuViewPrefetch(view);
  };
  if (root.dataset.ready === "true") ready();
  else {
    const observer = new MutationObserver(() => {
      if (root.dataset.ready !== "true") return;
      observer.disconnect();
      ready();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-ready"] });
  }
}

if (typeof document !== "undefined") initializeMenuViews();
