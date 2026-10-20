// The feed presents the same order editor as the list. Storage and optional
// dialogs have one owner, so changing presentation never changes an order.
export function createFeedOrder({ menuCopy, productIndex, orderProductIds,
  getLanguage, localized, formatPrice, onCartChange, say }) {
  const origin = "menu-feed";
  let draft = { version: 1, groups: [], lines: [] };
  let storage, storagePromise, storageRetry = 0, storageNotice;
  let ui, uiPromise, uiRetry = 0, readGeneration = 0;
  let intent = 0, busyTrigger, beforeOpen;
  const pendingKids = new Set();
  const errorCopy = {
    tr: "Seçim açılamadı. Lütfen tekrar deneyin.",
    en: "Your selection could not open. Please try again.",
    ru: "Не удалось открыть выбор. Попробуйте ещё раз."
  };
  const imageSlug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function formatItemCount(count) {
    const language = getLanguage();
    const category = new Intl.PluralRules({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language]).select(count);
    return menuCopy[language].itemCount[category] ?? menuCopy[language].itemCount.other;
  }
  function beginIntent(trigger) {
    busyTrigger?.removeAttribute("aria-busy");
    busyTrigger = trigger;
    trigger?.setAttribute("aria-busy", "true");
    return ++intent;
  }
  const isCurrent = token => token === intent;
  function finishIntent(token) {
    if (!isCurrent(token)) return;
    busyTrigger?.removeAttribute("aria-busy");
    busyTrigger = null;
  }
  function cancelPending() { finishIntent(beginIntent()); }
  function loadStorage() {
    if (!storagePromise) {
      let loading;
      if (storageRetry) {
        const url = new URL("./order-storage.js", import.meta.url);
        url.searchParams.set("retry", String(storageRetry));
        loading = import(url.href);
      } else loading = import("./order-storage.js?v=6908555cd79b");
      storagePromise = loading.then(module => {
        storage = module;
        storageNotice = module.createOrderStorageNotice({ owner: document.querySelector("#feed"),
          getLanguage, validIds: orderProductIds, getProduct: id => productIndex.get(id)?.item,
          onResolved: async () => {
            await refresh({ resetAdded: true });
            ui?.refresh({ nextLanguage: getLanguage(), clearStorageError: true });
          }
        });
        return module;
      }).catch(error => { storagePromise = null; storageRetry += 1; throw error; });
    }
    return storagePromise;
  }
  function readDraft() {
    if (storage) draft = storage.readStoredOrderDraft(orderProductIds);
    return draft;
  }
  async function readLatestDraft() {
    const generation = ++readGeneration;
    const module = await loadStorage();
    const latest = await module.readLatestStoredOrderDraft(orderProductIds);
    if (generation === readGeneration) { draft = latest; onCartChange(); }
    return readDraft();
  }
  async function mutateDraft(updater) {
    const generation = ++readGeneration;
    const module = await loadStorage();
    const result = await module.transactStoredOrderDraft(updater, orderProductIds, { origin });
    if (generation === readGeneration) draft = result.draft;
    onCartChange();
    return result;
  }
  async function addProduct(id, variant, trigger) {
    const token = beginIntent(trigger);
    try {
      const module = await loadStorage();
      return await mutateDraft(current => module.addOrderGroup(current,
        [{ id, ...(variant ? { variant } : {}) }], 1, orderProductIds));
    } finally { finishIntent(token); }
  }
  async function refresh({ refreshUi = true, resetAdded = false } = {}) {
    await readLatestDraft();
    storageNotice?.refresh();
    if (refreshUi) ui?.refresh({ nextLanguage: getLanguage(), resetAdded });
  }
  function refreshLanguage() {
    storageNotice?.refresh();
    ui?.refresh({ nextLanguage: getLanguage() });
  }
  function loadUi() {
    if (!uiPromise) {
      let loading;
      if (uiRetry) {
        const url = new URL("./menu-order-ui.js", import.meta.url);
        url.searchParams.set("retry", String(uiRetry));
        loading = import(url.href);
      } else loading = import("./menu-order-ui.js?v=206dca9f16f0");
      uiPromise = Promise.all([loading, loadStorage()]).then(([{ createMenuOrderUi }]) => {
        ui = createMenuOrderUi({ menuCopy, productIndex, orderProductIds,
          initialLanguage: getLanguage(), localized, formatPrice, formatItemCount, imageSlug,
          readDraft, readLatestDraft, mutateDraft, onCartChange,
          reopenCart: (trigger, groupId) => openCart(trigger, groupId)
        });
        return ui;
      }).catch(error => { uiPromise = null; uiRetry += 1; throw error; });
    }
    return uiPromise;
  }
  async function open(kind, id, trigger = document.activeElement, guard) {
    if (guard && !guard()) return false;
    const kidsId = kind === "kids" ? id?.id : null;
    if (kidsId && pendingKids.has(kidsId)) return false;
    if (kidsId) pendingKids.add(kidsId);
    const token = guard ? intent : beginIntent(trigger);
    const current = () => isCurrent(token) && (!guard || guard());
    // A collection's completed Add already closed its preview and owns the
    // continuation guard. Closing it again would invalidate that same guard.
    if (!guard) beforeOpen?.();
    try {
      const [editor] = await Promise.all([loadUi(), readLatestDraft()]);
      if (!current()) return false;
      editor.refresh({ nextLanguage: getLanguage() });
      const returnFocus = trigger?.isConnected ? trigger : document.querySelector("#menu-cart-trigger");
      if (kind === "kids") return await editor.addKidsCombo(id, returnFocus, current);
      if (kind === "product") editor.openProduct(id, returnFocus);
      else editor.openCart(returnFocus, id);
      return true;
    } catch (error) {
      if (!current()) return false;
      // The collection already saved the selection. Let its existing error
      // handler explain that only opening the cart failed, avoiding another Add.
      if (guard) throw error;
      say(errorCopy[getLanguage()]);
      return false;
    } finally {
      if (kidsId) pendingKids.delete(kidsId);
      finishIntent(token);
    }
  }
  const openProduct = (id, trigger) => open("product", id, trigger);
  const openCart = (trigger, groupId, guard) => open("cart", groupId, trigger, guard);
  const addKidsCombo = (combo, trigger, guard) => open("kids", combo, trigger, guard);
  document.addEventListener("keydown", event => { if (event.key === "Escape") cancelPending(); });
  window.addEventListener("pagehide", cancelPending);
  window.addEventListener("robys:order-change", event => {
    if (event.detail?.origin !== origin) void refresh({ resetAdded: true }).catch(() => {});
  });
  return { openProduct, openCart, addKidsCombo, addProduct, mutateDraft, readDraft, readLatestDraft,
    refresh, refreshLanguage, beginIntent, finishIntent, isCurrent, cancelPending,
    setBeforeOpen: callback => { beforeOpen = callback; }
  };
}
