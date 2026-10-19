import { getOrderStorageState, resolveLegacyOrderDraft } from "./order-draft.js";

const controllerKey = Symbol.for("robys.order-storage.notice");
const languages = new Set(["tr", "en", "ru"]);
const copy = {
  tr: {
    tabTitle: "Sipariş yalnızca bu sekmede", session: "Ortak depolama kullanılamıyor. Sipariş bu sekmede saklanır ve sekme yenilendiğinde geri gelir. Diğer sekmeler bu siparişi görmez.",
    memory: "Ortak depolama kullanılamıyor. Sipariş yalnızca bu sekme yenilenene veya kapanana kadar saklanır. Diğer sekmeler bu siparişi görmez.",
    staleSession: "Ortak depolama kullanılamıyor. Değişiklikler yalnızca bu sekmenin belleğinde tutulur. Yenileme bu değişiklikleri kaybettirebilir ve önceki siparişi geri getirebilir. Diğer sekmeler bu değişiklikleri görmez.",
    conflictTitle: "Eski menü sürümündeki sipariş", conflict: "Menünün eski sürümünden kaydedilmiş bir sipariş var. İki siparişi karşılaştırıp hangisiyle devam edeceğinizi seçin. Seçene kadar ekleme ve yeni QR oluşturma bekletilir.",
    current: "Güncel sipariş", legacy: "Eski sürümdeki sipariş", empty: "Sipariş boş", total: "Menü fiyatlarıyla toplam", unavailable: "Toplam doğrulanamıyor",
    invalid: "Eski sürümün siparişi okunamadı. Güncel siparişle devam edebilirsiniz.", keep: "Güncel siparişi koru", use: "Eski sürümdeki siparişi kullan",
    saving: "Seçim kaydediliyor…", changed: "Sipariş yeniden değişti. İki listeyi kontrol edip tekrar seçin.", error: "Seçim kaydedilemedi. Tekrar deneyin."
  },
  en: {
    tabTitle: "Order saved in this tab only", session: "Shared storage is unavailable. Your order is saved for this tab and will return after reloading it. Other tabs cannot see this order.",
    memory: "Shared storage is unavailable. Your order lasts only until this tab reloads or closes. Other tabs cannot see this order.",
    staleSession: "Shared storage is unavailable. Changes are held only in this tab's memory. Reloading may lose these changes and restore an earlier order. Other tabs cannot see these changes.",
    conflictTitle: "Order from an older menu", conflict: "An older version of the menu has a saved order. Compare both orders and choose which to continue with. Adding items and creating a new QR are paused until you choose.",
    current: "Current order", legacy: "Order from the older version", empty: "Empty order", total: "Total at menu prices", unavailable: "Total could not be verified",
    invalid: "The order from the older version could not be read. You can continue with the current order.", keep: "Keep current order", use: "Use order from older version",
    saving: "Saving your choice…", changed: "The order changed again. Check both lists and choose again.", error: "Your choice could not be saved. Please try again."
  },
  ru: {
    tabTitle: "Заказ только в этой вкладке", session: "Общее хранилище недоступно. Заказ сохранён для этой вкладки и восстановится после её перезагрузки. Другие вкладки его не видят.",
    memory: "Общее хранилище недоступно. Заказ хранится только до перезагрузки или закрытия этой вкладки. Другие вкладки его не видят.",
    staleSession: "Общее хранилище недоступно. Изменения хранятся только в памяти этой вкладки. После перезагрузки они могут потеряться, а прежняя корзина может вернуться. Другие вкладки не видят эти изменения.",
    conflictTitle: "Корзина старой версии меню", conflict: "Сохранена корзина старой версии меню. Сравни оба заказа и выбери, какую корзину продолжить. До выбора добавление и создание нового QR приостановлены.",
    current: "Текущая корзина", legacy: "Корзина старой версии", empty: "Корзина пуста", total: "Итого по ценам меню", unavailable: "Не удалось проверить сумму",
    invalid: "Не удалось прочитать корзину старой версии. Можно продолжить с текущей корзиной.", keep: "Оставить текущую корзину", use: "Использовать корзину старой версии",
    saving: "Сохраняем выбор…", changed: "Корзина снова изменилась. Проверь оба списка и выбери ещё раз.", error: "Не удалось сохранить выбор. Попробуй ещё раз."
  }
};

// All entry modules share one visible notice, even when several bundles mount
// ordering on the same page. The storage API also owns one state per document.
export function createOrderStorageNotice(options) {
  let controller = window[controllerKey];
  if (!controller) {
    controller = createController();
    window[controllerKey] = controller;
  }
  return controller.subscribe(options);
}

function createController() {
  const providers = new Set();
  const formatters = new Map();
  let notice;
  let observer;
  let queued = false;
  let pending = false;
  let errorKey = "";
  let previousSignature = "";
  let previousToken;
  let destroyed = false;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const locale = () => {
    if (languages.has(document.documentElement.lang)) return document.documentElement.lang;
    for (const provider of providers) {
      const language = provider.getLanguage?.();
      if (languages.has(language)) return language;
    }
    return "tr";
  };
  const product = id => {
    for (const provider of providers) {
      const value = provider.getProduct?.(id);
      if (value) return value;
    }
  };
  const price = (value, language) => {
    if (!formatters.has(language)) formatters.set(language,
      new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], { maximumFractionDigits: 0 }));
    return `${formatters.get(language).format(value)} ₺`;
  };
  function preview(draft, label, language) {
    const text = copy[language];
    const section = element("section", "order-storage-preview");
    section.append(element("h3", "", label));
    const list = element("ul", "order-storage-lines");
    let total = 0;
    let verified = true;
    for (const group of draft?.groups ?? []) {
      const names = group.items.map(item => {
        const entry = product(item.id);
        const name = entry?.name?.[language] ?? entry?.name?.tr ?? item.id;
        const variant = item.variant ? entry?.variants?.find(value => value.id === item.variant) : null;
        const variantName = variant?.name?.[language] ?? variant?.name?.tr ?? item.variant;
        if (!Number.isFinite(entry?.price) || entry.price <= 0) verified = false;
        else total += entry.price * item.quantity * group.quantity;
        return `${item.quantity > 1 ? `${item.quantity} × ` : ""}${name}${variantName ? ` · ${variantName}` : ""}`;
      });
      list.append(element("li", "", `${group.quantity} × ${names.join(" + ")}`));
    }
    if (!list.childElementCount) list.append(element("li", "", text.empty));
    section.append(list, element("p", "order-storage-total", verified ? `${text.total}: ${price(total, language)}` : text.unavailable));
    return section;
  }
  function activeDialog() {
    const dialogs = Array.from(document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]'))
      .filter(node => !node.hidden && node.getClientRects().length > 0);
    try {
      const modal = dialogs.filter(node => node.matches(":modal"));
      return modal[modal.length - 1] ?? dialogs[dialogs.length - 1];
    } catch { return dialogs[dialogs.length - 1]; }
  }
  function focusNotice(token) {
    requestAnimationFrame(() => {
      if (destroyed || !notice?.isConnected || notice.hidden || getOrderStorageState().legacyConflict?.token !== token) return;
      const heading = notice.querySelector("h2");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "nearest" });
    });
  }
  function place(state) {
    if (!notice || notice.hidden) return;
    const dialog = activeDialog();
    const target = dialog?.querySelector(".menu-product-main, #menu-cart-lines, .order-checkout-shell") ?? dialog ?? document.body;
    if (notice.parentElement === target) return;
    const focused = notice.contains(document.activeElement) ? document.activeElement : null;
    target.prepend(notice);
    focused?.focus({ preventScroll: true });
    if (dialog && state.legacyConflict && !pending) focusNotice(state.legacyConflict.token);
  }
  function queueRefresh() {
    if (queued || destroyed) return;
    queued = true;
    queueMicrotask(() => { queued = false; refresh(); });
  }
  async function choose(choice, token) {
    if (pending) return;
    pending = true;
    errorKey = "";
    refresh();
    const ids = new Set();
    for (const provider of providers) for (const id of provider.validIds ?? []) ids.add(id);
    try {
      await resolveLegacyOrderDraft(choice, ids, token);
      await Promise.allSettled(Array.from(providers)
        .filter(provider => !provider.owner || provider.owner.isConnected)
        .map(provider => Promise.resolve().then(() => provider.onResolved?.())));
    } catch {
      errorKey = getOrderStorageState().legacyConflict?.token !== token ? "changed" : "error";
    } finally {
      pending = false;
      refresh();
      const current = getOrderStorageState().legacyConflict;
      if (current) focusNotice(current.token);
    }
  }
  function refresh() {
    if (destroyed) return;
    const state = getOrderStorageState();
    const visible = state.mode === "tab" || Boolean(state.legacyConflict);
    if (!visible) {
      if (notice) notice.hidden = true;
      previousSignature = "";
      previousToken = undefined;
      observer?.disconnect();
      observer = undefined;
      return;
    }
    if (!notice) {
      notice = element("aside", "order-storage-notice");
      notice.setAttribute("role", "region");
      notice.setAttribute("aria-labelledby", "order-storage-notice-title");
    }
    notice.hidden = false;
    const language = locale();
    const text = copy[language];
    const conflict = state.legacyConflict;
    const signature = JSON.stringify([state.mode, state.hasSessionPersistence, state.staleSessionPossible, conflict, language, pending, errorKey]);
    if (signature !== previousSignature) {
      const focusedChoice = notice.contains(document.activeElement) ? document.activeElement?.dataset.orderStorageChoice : null;
      previousSignature = signature;
      notice.lang = language;
      notice.classList.toggle("has-conflict", Boolean(conflict));
      notice.setAttribute("aria-busy", String(pending));
      const heading = element("h2", "", conflict ? text.conflictTitle : text.tabTitle);
      heading.id = "order-storage-notice-title";
      heading.tabIndex = -1;
      notice.replaceChildren(heading);
      if (state.mode === "tab") notice.append(element("p", "order-storage-scope",
        state.staleSessionPossible ? text.staleSession : state.hasSessionPersistence ? text.session : text.memory));
      if (conflict) {
        notice.append(element("p", "order-storage-explanation", text.conflict));
        const previews = element("div", "order-storage-previews");
        previews.append(preview(conflict.currentDraft, text.current, language));
        if (conflict.invalid || !conflict.legacyDraft) {
          const invalid = element("section", "order-storage-preview");
          invalid.append(element("h3", "", text.legacy), element("p", "", text.invalid));
          previews.append(invalid);
        } else previews.append(preview(conflict.legacyDraft, text.legacy, language));
        const actions = element("div", "order-storage-actions");
        for (const [choice, label] of [["keep-current", text.keep], ...(!conflict.invalid && conflict.legacyDraft ? [["use-legacy", text.use]] : [])]) {
          const button = element("button", "order-storage-choice", pending ? text.saving : label);
          button.type = "button";
          button.dataset.orderStorageChoice = choice;
          button.disabled = pending;
          button.addEventListener("click", () => { void choose(choice, conflict.token); });
          actions.append(button);
        }
        notice.append(previews, actions);
      }
      if (errorKey) {
        const error = element("p", "order-storage-error", text[errorKey]);
        error.setAttribute("role", "alert");
        notice.append(error);
      }
      if (focusedChoice && !pending) notice.querySelector(`[data-order-storage-choice="${focusedChoice}"]`)?.focus({ preventScroll: true });
    }
    place(state);
    if (conflict && previousToken !== conflict.token && !pending) focusNotice(conflict.token);
    previousToken = conflict?.token;
    if (!observer) {
      observer = new MutationObserver(queueRefresh);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "aria-modal", "hidden"] });
    }
  }
  const languageObserver = new MutationObserver(queueRefresh);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  window.addEventListener("robys:order-storage-state", queueRefresh);
  return {
    subscribe(options) {
      for (const provider of providers) if (provider.owner && !provider.owner.isConnected) providers.delete(provider);
      providers.add(options);
      refresh();
      return { refresh, destroy() {
        providers.delete(options);
        if (providers.size) return;
        destroyed = true;
        observer?.disconnect();
        languageObserver.disconnect();
        window.removeEventListener("robys:order-storage-state", queueRefresh);
        notice?.remove();
        delete window[controllerKey];
      } };
    }
  };
}
