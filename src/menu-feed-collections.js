import "./choice-help-entry.js";

// Feed and list use the same recipe editors and order transactions. Only the
// presentation around them differs; no recipes, prices or cart state live here.
const copy = {
  tr: { combos: "Setler · 12", takeaway: "Al götür · 4", family: "Çocuklarla · 3 fikir", error: "Seçim açılamadı. Lütfen tekrar deneyin." },
  en: { combos: "Combos · 12", takeaway: "To go · 4", family: "With kids · 3 ideas", error: "Your selection could not open. Please try again." },
  ru: { combos: "Комбо · 12", takeaway: "С собой · 4", family: "С ребёнком · 3 идеи", error: "Не удалось открыть выбор. Попробуй ещё раз." }
};

export function initFeedCollections({ productIndex, orderProductIds, getLanguage, localized,
  formatPrice, order, onCartChange, say }) {
  const combosTrigger = document.querySelector("#menu-combos-trigger");
  const takeawayTrigger = document.querySelector("#menu-combos-takeaway-trigger");
  const familyTrigger = document.querySelector("#menu-family-trigger");
  let combosUi, combosPromise, combosRetry = 0;
  let familyUi, familyPromise, familyRetry = 0;
  const text = () => copy[getLanguage()] ?? copy.tr;
  const onIntent = () => {
    const intent = order.beginIntent();
    return () => order.isCurrent(intent);
  };
  const openCart = (trigger, guard) => order.openCart(trigger, undefined, guard);
  const sharedOptions = () => ({
    productIndex, orderProductIds, initialLanguage: getLanguage(), localized, formatPrice,
    readDraft: order.readDraft, mutateDraft: order.mutateDraft, onCartChange, onIntent, openCart
  });

  function loadCombos() {
    if (!combosPromise) {
      let loading;
      if (combosRetry) {
        const url = new URL("./menu-combos-ui.js", import.meta.url);
        url.searchParams.set("retry", String(combosRetry));
        loading = import(url.href);
      } else loading = import("./menu-combos-ui.js?v=0aad157af9c2");
      combosPromise = loading.then(({ createMenuCombosUi }) => {
        combosUi = createMenuCombosUi({ ...sharedOptions(), root: document.querySelector("#menu-combos-content") });
        return combosUi;
      }).catch(error => { combosPromise = undefined; combosRetry += 1; throw error; });
    }
    return combosPromise;
  }

  function loadFamily() {
    if (!familyPromise) {
      let loading;
      if (familyRetry) {
        const url = new URL("./menu-family-ui.js", import.meta.url);
        url.searchParams.set("retry", String(familyRetry));
        loading = import(url.href);
      } else loading = import("./menu-family-ui.js?v=c6e39d14b3d5");
      familyPromise = loading.then(({ createMenuFamilyUi }) => {
        familyUi = createMenuFamilyUi({ ...sharedOptions(), root: document.querySelector("#menu-family-content"),
          openProduct: order.openProduct, addKidsCombo: order.addKidsCombo });
        return familyUi;
      }).catch(error => { familyPromise = undefined; familyRetry += 1; throw error; });
    }
    return familyPromise;
  }

  async function openCombos(trigger = combosTrigger, filter = "all", recipeId = "") {
    const intent = order.beginIntent(trigger);
    try {
      const ui = await loadCombos();
      if (!order.isCurrent(intent)) return;
      ui.refresh(getLanguage());
      document.querySelector("#menu-combos").hidden = false;
      ui.reveal(filter);
      combosTrigger?.setAttribute("aria-expanded", "true");
      document.querySelector("#menu-combos").scrollIntoView({ block: "start" });
      if (recipeId) {
        const card = Array.from(document.querySelectorAll("#menu-combos [data-combo-recipe]"))
          .find(node => node.dataset.comboRecipe === recipeId);
        ui.open(recipeId, card?.querySelector(".menu-combos-choose") ?? combosTrigger);
      }
    } catch { if (order.isCurrent(intent)) say(text().error); }
    finally { order.finishIntent(intent); }
  }

  async function openFamily(trigger = familyTrigger) {
    combosUi?.close();
    const intent = order.beginIntent(trigger);
    try {
      const ui = await loadFamily();
      if (!order.isCurrent(intent)) return;
      ui.refresh(getLanguage());
      document.querySelector("#menu-family").hidden = false;
      ui.reveal();
      familyTrigger?.setAttribute("aria-expanded", "true");
      document.querySelector("#menu-family").scrollIntoView({ block: "start" });
    } catch { if (order.isCurrent(intent)) say(text().error); }
    finally { order.finishIntent(intent); }
  }

  function routeHash(hash, trigger) {
    const recipe = /^#menu-combo-([a-z][a-z0-9-]{0,50})$/.exec(hash)?.[1];
    if (recipe) void openCombos(trigger, "all", recipe);
    else if (hash === "#menu-combos") void openCombos(trigger);
    else if (hash === "#menu-combos-takeaway") void openCombos(trigger, "takeaway");
    else if (hash === "#menu-family" || hash === "#kids-menu") void openFamily(trigger);
    else return false;
    return true;
  }

  combosTrigger?.addEventListener("click", event => { event.preventDefault(); void openCombos(combosTrigger); });
  takeawayTrigger?.addEventListener("click", event => { event.preventDefault(); void openCombos(takeawayTrigger, "takeaway"); });
  familyTrigger?.addEventListener("click", event => { event.preventDefault(); void openFamily(familyTrigger); });
  // Handles both the helper's recipe link and the collections' family link
  // without a second asynchronous reveal from a subsequent hashchange.
  document.addEventListener("click", event => {
    const anchor = event.target.closest?.(".choice-help-actions a, .menu-combos-links a");
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname) return;
    if (!routeHash(url.hash, anchor)) return;
    event.preventDefault();
    history.replaceState(history.state, "", url);
  });
  function followLocation() { return routeHash(location.hash); }
  window.addEventListener("hashchange", followLocation);
  window.addEventListener("popstate", followLocation);
  order.setBeforeOpen(() => combosUi?.close());

  function refresh() {
    if (combosTrigger) combosTrigger.textContent = text().combos;
    if (takeawayTrigger) takeawayTrigger.textContent = text().takeaway;
    if (familyTrigger) familyTrigger.textContent = text().family;
    combosUi?.refresh(getLanguage());
    familyUi?.refresh(getLanguage());
  }
  refresh();
  queueMicrotask(followLocation);
  return { refresh, followLocation };
}
