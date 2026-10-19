import { menuCategories } from "../../menu-catalog.js";
import {
  ORDER_DRAFT_KEY, readStoredOrderDraft, readLatestStoredOrderDraft, getOrderStorageState, transactStoredOrderDraft,
  createOrderStorageNotice
} from "../order-storage.js";
import { addOrderGroup, removeOrderGroup, type OrderDraft, type OrderGroupResult
} from "../order-draft.js";
import type { SmartChoiceLanguage } from "./catalog.js";
import { openQuickCheckout } from "./checkout-link.js";
import { orderProducts, orderProductIds } from "./shared-order.js";
import { createProductPhoto, retryProductPhoto, type PhotoPlacement } from "./product-photo.js";
import { createKidsMenuSection, kidsMenuCopy, kidsComboForItems, type KidsCombo } from "../kids-menu.js";
import {
  quickProducts, sweetProducts, drinkCategories, matchesQuickProduct, variantsFor, drinkChoicesFor, drinkChoiceLabel,
  orderGroupName, orderGroupTotal, orderGroupItems, needsOrderVariant, updateQuickGroupVariant, stepQuickGroupQuantity, replaceQuickGroup, type QuickProduct, type QuickOrderItem, type QuickOrderGroup
} from "./quick-builder-domain.js";

const COPY = {
  tr: {
    eyebrow: "ROBY'S · SENİN SEÇİMİN", title: "Bugün ne iyi gider?", lead: "İçeceğini seç, yanına tatlı ekle. Siparişini burada hazırla.",
    help: "Seçmeme yardım et", all: "Tümü", search: "Kahve, çay, tatlı ara", clear: "Aramayı temizle", results: "seçenek", empty: "Bu aramada ürün bulunamadı.",
    reset: "Tüm ürünleri göster", choose: "Seç", selection: "Seçimini tamamla", selectHint: "Fotoğrafa dokun, seçimini burada tamamla.",
    sweet: "Yanına bir tatlı", noSweet: "Sadece içecek", flavour: "Lezzet seç", flavourRequired: "Bir lezzet seçin", completeFlavours: "İçecek lezzetlerini seç", quantity: "Adet", pairs: "Çift adedi",
    add: "Siparişe ekle", addPair: "Çifti ekle", added: "Siparişine eklendi", chooseMore: "Başka ürün seç", limit: "Bu miktar eklenemiyor. Sepetteki adedi kontrol edin.",
    cart: "Siparişin", cartEmpty: "Henüz bir şey eklemedin.", cartHint: "İlk içeceğini seçerek başlayabilirsin.", total: "Toplam", checkout: "Kasa için QR oluştur", nextStep: "Bu kadarı yeterli mi, başka bir şey ister misin?", editOrder: "Siparişi düzenle",
    draftNote: "QR'ı kasaya göster. Ödeme ve son onay kafede yapılır.", remove: "Kaldır", increase: "Adedi artır", decrease: "Adedi azalt", pair: "Birlikte",
    updated: "Sipariş güncellendi", removed: "Siparişten kaldırıldı", checkoutError: "Sipariş ekranı açılamadı. Yeniden deneyin.", review: "Siparişi gör",
    coffee: "Kahve molası", tea: "Çay vakti", cold: "Serin bir seçim", catalog: "Menüden seç", itemPrice: "Birim fiyat", pairPrice: "Bir çift", selectedTotal: "Eklenecek tutar",
    close: "Kapat", edit: "Seçimi düzenle", save: "Değişiklikleri kaydet", editTotal: "Yeni tutar", editBlocked: "Sipariş değişti veya adet sınırına ulaşıldı. Sepeti kontrol edip seçimi yeniden açın.", drinkChoice: "İçecek seçeneği",
    replace: "Değiştir", alternative: "Yerine ne istersin?", replaceHint: "Adet ve yanındaki tatlı korunur. Kaydedene kadar siparişin değişmez.", cancel: "Olduğu gibi bırak", selected: "Seçimin", inCart: "Siparişte", saveReplacement: "Değişimi kaydet"
  },
  en: {
    eyebrow: "ROBY'S · YOUR CHOICE", title: "What sounds good today?", lead: "Pick a drink, add something sweet. Put your order together right here.",
    help: "Help me choose", all: "All", search: "Search coffee, tea, desserts", clear: "Clear search", results: "choices", empty: "No products match your search.",
    reset: "Show all products", choose: "Choose", selection: "Make it yours", selectHint: "Tap a photo to put your selection together here.",
    sweet: "Something sweet with it", noSweet: "Just the drink", flavour: "Choose a flavour", flavourRequired: "Please choose a flavour", completeFlavours: "Choose drink flavours", quantity: "Quantity", pairs: "Number of pairs",
    add: "Add to order", addPair: "Add pair", added: "Added to your order", chooseMore: "Choose more", limit: "That quantity cannot be added. Check the quantity already in your order.",
    cart: "Your order", cartEmpty: "Nothing added yet.", cartHint: "Start with your first drink.", total: "Total", checkout: "Get QR for the counter", nextStep: "All set, or would you like something else?", editOrder: "Edit order",
    draftNote: "Show the QR at the counter. Payment and final confirmation happen at the café.", remove: "Remove", increase: "Increase quantity", decrease: "Decrease quantity", pair: "Together",
    updated: "Order updated", removed: "Removed from your order", checkoutError: "The order screen could not open. Please try again.", review: "Review order",
    coffee: "Coffee break", tea: "Time for tea", cold: "Something refreshing", catalog: "Choose from the menu", itemPrice: "Unit price", pairPrice: "One pair", selectedTotal: "Amount to add",
    close: "Close", edit: "Customize selection", save: "Save changes", editTotal: "Updated amount", editBlocked: "The order changed or reached its quantity limit. Check your order and reopen this selection.", drinkChoice: "Drink option",
    replace: "Replace", alternative: "What would you like instead?", replaceHint: "Keep the quantity and accompanying dessert. Your order changes only when you save.", cancel: "Keep the original", selected: "Your selection", inCart: "In your order", saveReplacement: "Save replacement"
  },
  ru: {
    eyebrow: "ROBY'S · ТВОЙ ВЫБОР", title: "Чего хочется сегодня?", lead: "Выбери напиток, добавь сладкое. Собери весь заказ прямо здесь.",
    help: "Помочь с выбором", all: "Всё", search: "Найти кофе, чай, десерт", clear: "Очистить поиск", results: "вариантов", empty: "По этому запросу ничего не нашлось.",
    reset: "Показать все товары", choose: "Выбрать", selection: "Собери свой вариант", selectHint: "Нажми на фото и собери свой вариант здесь.",
    sweet: "Сладкое к напитку", noSweet: "Только напиток", flavour: "Выбери вкус", flavourRequired: "Сначала выбери вкус", completeFlavours: "Выбрать вкусы напитков", quantity: "Количество", pairs: "Количество пар",
    add: "Добавить в заказ", addPair: "Добавить пару", added: "Добавлено в заказ", chooseMore: "Выбрать ещё", limit: "Не получается добавить столько. Проверь количество в корзине.",
    cart: "Твой заказ", cartEmpty: "Пока ничего не добавлено.", cartHint: "Начни с первого напитка.", total: "Итого", checkout: "Получить QR для кассы", nextStep: "На этом всё или хочется чего-нибудь ещё?", editOrder: "Изменить заказ",
    draftNote: "Покажи QR на кассе. Оплата и окончательное подтверждение — в кафе.", remove: "Убрать", increase: "Увеличить количество", decrease: "Уменьшить количество", pair: "Вместе",
    updated: "Заказ обновлён", removed: "Убрано из заказа", checkoutError: "Не удалось открыть оформление. Попробуй ещё раз.", review: "Посмотреть заказ",
    coffee: "Кофейная пауза", tea: "Время для чая", cold: "Хочется прохлады", catalog: "Выбирай из меню", itemPrice: "Цена за штуку", pairPrice: "Одна пара", selectedTotal: "Добавится к заказу",
    close: "Закрыть", edit: "Изменить выбор", save: "Сохранить изменения", editTotal: "Новая сумма", editBlocked: "Заказ изменился или достигнут предел количества. Проверь корзину и открой этот выбор заново.", drinkChoice: "Вариант напитка",
    replace: "Заменить", alternative: "Что выбрать вместо?", replaceHint: "Количество и десерт к напитку сохранятся. Заказ изменится только после сохранения.", cancel: "Оставить как было", selected: "Выбрано", inCart: "В заказе", saveReplacement: "Сохранить замену"
  }
};

let category = "all";
let query = "";
let selectedId = "";
let dessertId = "";
let variantId = "";
let quantity = 1;
let refreshBuilder: (() => void) | undefined;
const orderChangeOrigin = {};
const priceFormatters = new Map<string, Intl.NumberFormat>();

function readDraft(): OrderDraft {
  return readStoredOrderDraft(orderProductIds);
}

function saveDraft(updater: (draft: OrderDraft) => OrderGroupResult): Promise<OrderGroupResult> {
  return transactStoredOrderDraft(updater, orderProductIds, { origin: orderChangeOrigin });
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function action(text: string, className: string, listener: () => void): HTMLButtonElement {
  const button = node("button", className, text);
  button.type = "button";
  button.addEventListener("click", listener);
  return button;
}

export interface QuickBuilderSelection {
  productId: string;
  quantity: number;
}

export function createQuickBuilder(language: SmartChoiceLanguage, onHelp: () => void, selection?: QuickBuilderSelection): HTMLElement {
  const prefill = selection && orderProducts.has(selection.productId) && Number.isInteger(selection.quantity)
    && selection.quantity >= 1 && selection.quantity <= 6 ? selection : undefined;
  if (prefill) {
    selectedId = prefill.productId;
    quantity = prefill.quantity;
    variantId = "";
    dessertId = "";
    category = "all";
    query = "";
  }
  const text = COPY[language];
  const kidsText = kidsMenuCopy[language];
  const photoCache = new Map<string, HTMLSpanElement>();
  const catalogCards = new Map<string, HTMLButtonElement>();
  function productPhoto(product: QuickProduct, placement: PhotoPlacement, key = product.id): HTMLSpanElement {
    const cacheKey = `${placement}:${key}`;
    let photo = photoCache.get(cacheKey);
    if (!photo) {
      photo = createProductPhoto(product.image, language, placement, placement === "catalog" ? "lazy" : "eager");
      photoCache.set(cacheKey, photo);
    } else if (placement !== "catalog") retryProductPhoto(photo);
    return photo;
  }
  const storageError = { tr: "Sipariş kaydedilemedi. Tarayıcı depolamasını kontrol edip tekrar deneyin.",
    en: "Your order could not be saved. Check browser storage and try again.",
    ru: "Не удалось сохранить заказ. Проверь доступ к памяти браузера и попробуй ещё раз." }[language];
  const price = (minor: number): string => {
    const digits = minor % 100 ? 2 : 0;
    const key = `${language}:${digits}`;
    let formatter = priceFormatters.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], {
        style: "currency", currency: "TRY", maximumFractionDigits: digits
      });
      priceFormatters.set(key, formatter);
    }
    return formatter.format(minor / 100);
  };
  const root = node("section", "quick-builder");
  root.dataset.quickBuilder = "true";
  const hero = node("div", "qb-hero");
  const heading = node("div");
  const title = node("h1", "qb-title", text.title);
  title.id = "smart-choice-title";
  heading.append(node("p", "eyebrow", text.eyebrow), title, node("p", "qb-lead", text.lead));
  hero.append(heading, action(text.help, "secondary-button qb-help", onHelp));
  const inspiration = node("div", "qb-inspiration");
  for (const [key, target] of [["coffee", "hot-coffee"], ["tea", "brew-hot"], ["cold", "cold-coffee"]] as const) {
    const button = action("", "qb-inspiration-card", () => {
      invalidatePendingCheckout();
      category = key === "tea" ? "all" : target; query = key === "tea" ? "tea" : "";
      search.value = query; renderChips(); renderCatalog(); catalogTitle.scrollIntoView({ block: "start", behavior: "auto" });
    });
    const photo = createProductPhoto(`src/products/quick-choice-v1/${key}.webp`, language, "inspiration");
    button.append(photo, node("span", "", text[key]));
    inspiration.append(button);
  }
  const kidsEntry = action(kidsText.title, "qb-kids-entry", () => {
    invalidatePendingCheckout(); category = "kids-menu"; query = ""; search.value = "";
    renderChips(); renderCatalog(); catalogTitle.scrollIntoView({ block: "start", behavior: "auto" });
    cards.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  });
  kidsEntry.append(node("span", "", kidsText.lead), node("strong", "", "→"));
  root.append(hero, inspiration, kidsEntry);

  const layout = node("div", "qb-layout");
  const catalog = node("section", "qb-catalog");
  const catalogTitle = node("h2", "qb-section-title", text.catalog);
  catalogTitle.id = "qb-catalog-title";
  catalog.setAttribute("aria-labelledby", catalogTitle.id);
  const searchWrap = node("div", "qb-search");
  const label = node("label", "visually-hidden", text.search);
  label.htmlFor = "qb-search";
  const search = node("input"); search.type = "search"; search.id = "qb-search";
  search.placeholder = text.search; search.value = query; search.autocomplete = "off";
  const clear = action("×", "qb-search-clear", () => { invalidatePendingCheckout(); query = ""; search.value = ""; renderCatalog(); search.focus(); });
  clear.setAttribute("aria-label", text.clear);
  search.addEventListener("input", () => {
    invalidatePendingCheckout();
    query = search.value;
    // A search is across the whole menu, including all three languages.
    if (query.trim() && category !== "all" && category !== "kids-menu") { category = "all"; renderChips(); }
    renderCatalog();
  });
  searchWrap.append(label, search, clear);
  const chips = node("nav", "qb-chips"); chips.setAttribute("aria-label", text.catalog);
  const count = node("p", "qb-count"); count.setAttribute("role", "status");
  const cards = node("div", "qb-products");
  catalog.append(catalogTitle, searchWrap, chips, count, cards);
  const side = node("div", "qb-side");
  const customizer = node("dialog", "qb-customizer");
  customizer.setAttribute("aria-labelledby", "qb-customizer-title");
  const composer = node("section", "qb-composer"); composer.id = "qb-composer";
  const modalNotice = node("p", "qb-notice"); modalNotice.setAttribute("role", "status"); modalNotice.setAttribute("aria-live", "polite");
  customizer.append(composer);
  let returnFocus: HTMLElement | undefined;
  let editingGroup: QuickOrderGroup | undefined;
  let confirmationTitle = "";
  let focusGeneration = 0;
  let customizerChangedAt = 0;
  let checkoutOpening = false;
  customizer.addEventListener("close", () => {
    if (customizer.open) return;
    confirmationTitle = "";
    const generation = focusGeneration;
    const target = returnFocus;
    const restoreFocus = (): void => {
      if (!root.isConnected || customizer.open || generation !== focusGeneration
        || document.querySelector(".order-checkout-dialog[open]")) return;
      (target?.isConnected ? target : review).focus({ preventScroll: true });
    };
    restoreFocus();
    // Native dialog focus restoration can finish after the close callback.
    requestAnimationFrame(restoreFocus);
  });
  customizer.addEventListener("cancel", () => invalidatePendingCheckout());
  customizer.addEventListener("click", event => {
    // A second Add tap can hit the backdrop after confirmation becomes shorter.
    // Keep the completed action visible; explicit close stays available.
    if (event.target !== customizer || performance.now() - customizerChangedAt < 500) return;
    const bounds = customizer.getBoundingClientRect();
    const click = event as MouseEvent;
    if (click.clientX < bounds.left || click.clientX > bounds.right || click.clientY < bounds.top || click.clientY > bounds.bottom) closeCustomizer();
  });
  const cart = node("section", "qb-cart"); cart.id = "qb-cart";
  const notice = node("p", "qb-notice"); notice.setAttribute("role", "status"); notice.setAttribute("aria-live", "polite");
  side.append(notice, cart);
  layout.append(catalog, side);
  const dock = node("div", "qb-cart-dock");
  const dockTotal = node("strong");
  const review = action("", "qb-dock-review", () => {
    focusGeneration += 1; returnFocus = review; confirmationTitle = text.cart;
    announce(""); renderConfirmation();
    if (!customizer.open) customizer.showModal();
    customizer.scrollTop = 0; composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  });
  review.append(node("span", "", text.review), dockTotal);
  const dockCheckout = action(text.checkout, "primary-button", () => requestCheckout(dockCheckout));
  dock.append(review, dockCheckout);
  root.append(layout, dock, customizer);

  function announce(message: string): void { notice.textContent = modalNotice.textContent = message; }
  function invalidatePendingCheckout(): void { if (checkoutOpening) focusGeneration += 1; }
  function closeCustomizer(): void { invalidatePendingCheckout(); customizer.close(); }
  function canFocusCart(): boolean {
    return root.isConnected && !customizer.open && !document.querySelector(".order-checkout-dialog[open]");
  }
  function openCustomizer(trigger: HTMLElement): void {
    focusGeneration += 1;
    if (!customizer.open) returnFocus = trigger;
    confirmationTitle = "";
    announce(""); renderComposer();
    if (!customizer.open) customizer.showModal();
    customizer.scrollTop = 0;
    composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }
  async function requestCheckout(button: HTMLButtonElement): Promise<void> {
    if (checkoutOpening) return;
    const generation = ++focusGeneration;
    checkoutOpening = true;
    button.disabled = dockCheckout.disabled = true;
    try {
      const draft = await readLatestStoredOrderDraft(orderProductIds);
      if (!root.isConnected || !button.isConnected || generation !== focusGeneration) return;
      if (getOrderStorageState().legacyConflict) return;
      if (!draft.groups.length) { renderCart(); showCart(); return; }
      if (needsOrderVariant(draft.groups)) {
        renderCart(); announce(text.completeFlavours);
        showCart(cart.querySelector<HTMLSelectElement>('select[aria-invalid="true"]') ?? undefined);
        return;
      }
      announce("");
      if (customizer.open) showCart(undefined, true);
      const signature = JSON.stringify(draft);
      await openQuickCheckout(draft, language, dockCheckout, () => root.isConnected && generation === focusGeneration
        && !getOrderStorageState().legacyConflict && JSON.stringify(readDraft()) === signature);
    } catch { if (root.isConnected && generation === focusGeneration) announce(text.checkoutError); }
    finally {
      checkoutOpening = false;
      if (root.isConnected) {
        const empty = readDraft().groups.length === 0;
        dockCheckout.disabled = empty;
        const cartCheckout = cart.querySelector<HTMLButtonElement>(".primary-button");
        const confirmationCheckout = composer.querySelector<HTMLButtonElement>(".qb-confirmation-checkout");
        if (cartCheckout) cartCheckout.disabled = empty;
        if (confirmationCheckout) confirmationCheckout.disabled = empty;
      }
    }
  }
  function showCart(target?: HTMLElement, preserveCheckout = false): void {
    if (!preserveCheckout) invalidatePendingCheckout();
    returnFocus = target ?? cart.querySelector<HTMLElement>("h2") ?? review;
    if (customizer.open) customizer.close();
    cart.scrollIntoView({ block: "start", behavior: "auto" });
    returnFocus.focus({ preventScroll: true });
  }
  function chooseMore(): void {
    returnFocus = search;
    closeCustomizer();
    catalog.scrollIntoView({ block: "start", behavior: "auto" });
    search.focus({ preventScroll: true });
    if (search.value) search.select();
  }
  function renderConfirmation(): void {
    customizerChangedAt = performance.now();
    const draft = readDraft();
    composer.replaceChildren();
    const title = node("h2", "qb-section-title", confirmationTitle);
    title.id = "qb-customizer-title"; title.tabIndex = -1;
    const header = node("div", "qb-customizer-header");
    const close = action("×", "qb-customizer-close", () => closeCustomizer());
    close.setAttribute("aria-label", text.close);
    header.append(title, close);
    composer.append(header, node("p", "qb-next-step", draft.groups.length ? text.nextStep : text.cartHint));
    const summary = node("div", "qb-confirmation-summary");
    summary.append(node("h3", "", text.cart), action(text.editOrder, "qb-edit", () => showCart()));
    const list = node("ul", "qb-confirmation-lines");
    for (const group of draft.groups) {
      const row = node("li", "qb-confirmation-line");
      row.dataset.groupId = group.id;
      const kidsCombo = kidsComboForItems(group.items);
      if (kidsCombo) row.dataset.kidsSelection = kidsCombo.id;
      const photos = node("span", "qb-confirmation-photos");
      for (const [itemIndex, item] of orderGroupItems(group).entries()) {
        const product = orderProducts.get(item.id);
        if (product) photos.append(productPhoto(product, "confirmation", `${group.id}:${itemIndex}:${product.id}`));
      }
      row.append(photos, node("span", "", `${group.quantity} × ${orderGroupName(group, language)}`),
        node("strong", "", price(orderGroupTotal(group))));
      const maximum = stepQuickGroupQuantity(draft, group.id, 1).applied ? 99 : group.quantity;
      const controls = quantityControl(group.quantity, maximum, async next => {
        const delta = next - group.quantity;
        const generation = focusGeneration;
        let result;
        try { result = await saveDraft(current => stepQuickGroupQuantity(current, group.id, delta)); }
        catch { renderCart(); announce(storageError); return; }
        renderCart();
        if (!result.applied) { announce(text.limit); return; }
        const current = result.draft.groups.find(item => item.id === group.id);
        announce(`${text.updated}: ${orderGroupName(group, language)} × ${current?.quantity ?? next}`);
        if (!root.isConnected || !customizer.open || !confirmationTitle || generation !== focusGeneration) return;
        renderConfirmation();
        const updated = [...composer.querySelectorAll<HTMLElement>("[data-group-id]")].find(item => item.dataset.groupId === group.id);
        const target = updated?.querySelector<HTMLButtonElement>(`[data-step="${delta > 0 ? "up" : "down"}"]`);
        (target && !target.disabled ? target : updated?.querySelector<HTMLButtonElement>("[data-step]:not(:disabled)"))?.focus({ preventScroll: true });
      }, orderGroupName(group, language));
      const actions = lineActions(group); actions.prepend(controls);
      row.append(actions);
      list.append(row);
    }
    if (!draft.groups.length) list.append(node("li", "qb-muted", text.cartEmpty));
    summary.append(list, modalNotice);
    const footer = node("div", "qb-composer-footer qb-confirmation-actions");
    const total = node("p", "qb-grand-total");
    total.append(node("span", "", text.total), node("strong", "", price(draft.groups.reduce((sum, group) => sum + orderGroupTotal(group), 0))));
    const checkout = action(needsOrderVariant(draft.groups) ? text.completeFlavours : text.checkout, "primary-button qb-confirmation-checkout", () => {
      requestCheckout(dockCheckout);
    });
    checkout.disabled = checkoutOpening || draft.groups.length === 0;
    footer.append(total, checkout, action(text.chooseMore, "secondary-button qb-confirmation-more", chooseMore),
      node("p", "qb-checkout-note", text.draftNote));
    composer.append(summary, footer);
  }
  function renderChips(): void {
    chips.replaceChildren();
    for (const entry of [{ id: "all", name: text.all }, { id: "kids-menu", name: kidsText.title }, ...menuCategories.map(item => ({ id: item.id, name: item.name[language] }))]) {
      const chip = action(entry.name, "qb-chip", () => { invalidatePendingCheckout(); category = entry.id; renderChips(); renderCatalog();
        chips.querySelector<HTMLButtonElement>(`[data-category="${entry.id}"]`)?.focus(); });
      chip.dataset.category = entry.id;
      chip.setAttribute("aria-pressed", String(entry.id === category));
      chips.append(chip);
    }
  }

  function renderCatalog(): void {
    if (category === "kids-menu") {
      clear.hidden = !query;
      const section = createKidsMenuSection({ language, products: orderProducts, query,
        photo: (product, key) => productPhoto(orderProducts.get(product.id)!, "catalog", `kids:${key}`),
        onAdd: addKidsCombo,
        onProduct: (id, trigger) => {
          editingGroup = undefined; selectedId = id; variantId = ""; dessertId = ""; quantity = 1;
          openCustomizer(trigger);
        }
      });
      cards.replaceChildren();
      if (section) {
        section.querySelector<HTMLElement>("h2")!.tabIndex = -1;
        count.textContent = `${section.querySelectorAll(".kids-combo").length} ${text.results}`;
        for (const image of [...section.querySelectorAll<HTMLImageElement>("img")]) image.loading = "eager";
        cards.append(section);
      } else {
        count.textContent = `0 ${text.results}`;
        cards.append(node("p", "qb-no-results", text.empty), action(text.clear, "secondary-button", () => {
          query = ""; search.value = ""; renderCatalog(); search.focus();
        }));
      }
      return;
    }
    const matches = quickProducts.filter(product => matchesQuickProduct(product, query, category));
    count.textContent = `${matches.length} ${text.results}`;
    clear.hidden = !query;
    cards.replaceChildren();
    if (!matches.length) {
      const empty = node("div", "qb-no-results");
      empty.append(node("p", "", text.empty), action(text.reset, "secondary-button", () => {
        invalidatePendingCheckout();
        category = "all"; query = ""; search.value = ""; renderChips(); renderCatalog(); search.focus();
      }));
      cards.append(empty);
    }
    for (const [index, product] of matches.entries()) {
      let card = catalogCards.get(product.id);
      if (!card) {
        const newCard = action("", "qb-product", () => {
          editingGroup = undefined;
          if (selectedId !== product.id) { selectedId = product.id; variantId = ""; dessertId = ""; quantity = 1; }
          openCustomizer(newCard);
        });
        newCard.dataset.productId = product.id;
        newCard.setAttribute("aria-haspopup", "dialog");
        newCard.setAttribute("aria-label", `${text.choose}: ${product.name[language]}, ${price(product.unitPriceMinor)}`);
        newCard.append(productPhoto(product, "catalog"), node("span", "qb-product-name", product.name[language]),
          node("span", "qb-in-cart"),
          node("span", "qb-product-price", price(product.unitPriceMinor)),
          node("span", "qb-product-action", `${text.choose} +`));
        catalogCards.set(product.id, newCard);
        card = newCard;
      }
      // The first visible choices should start loading before lazy intersection.
      // Promoted images stay eager when returning from a filter; their DOM and
      // decoded pixels remain available instead of starting with a blank frame.
      if (index < 6) card.querySelector<HTMLImageElement>("img")!.loading = "eager";
      retryProductPhoto(card.querySelector<HTMLSpanElement>(".qb-photo")!);
      cards.append(card);
    }
    updateCatalogBadges();
  }

  function finishKidsChange(trigger: HTMLElement, title: string): void {
    focusGeneration += 1;
    if (!customizer.open) returnFocus = trigger;
    editingGroup = undefined; confirmationTitle = title; announce("");
    renderCart(); renderConfirmation();
    if (!customizer.open) customizer.showModal();
    customizer.scrollTop = 0; composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  async function addKidsCombo(combo: KidsCombo, trigger: HTMLButtonElement): Promise<boolean> {
    invalidatePendingCheckout();
    const generation = focusGeneration;
    let result;
    try { result = await saveDraft(current => addOrderGroup(current, combo.items, 1, orderProductIds)); }
    catch { announce(storageError); return false; }
    if (!result.applied) { announce(text.limit); return false; }
    renderCart();
    if (root.isConnected && trigger.isConnected && generation === focusGeneration) finishKidsChange(trigger, text.added);
    return true;
  }

  function replaceKidsCombo(groupId: string, trigger: HTMLElement): void {
    const original = readDraft().groups.find(group => group.id === groupId);
    if (!original || !kidsComboForItems(original.items)) { renderCart(); announce(text.editBlocked); return; }
    focusGeneration += 1;
    if (!customizer.open) returnFocus = trigger;
    editingGroup = original; confirmationTitle = ""; customizerChangedAt = performance.now(); announce("");
    composer.replaceChildren();
    const header = node("div", "qb-customizer-header");
    const title = node("h2", "qb-section-title", text.alternative); title.id = "qb-customizer-title"; title.tabIndex = -1;
    const close = action("×", "qb-customizer-close", () => closeCustomizer()); close.setAttribute("aria-label", text.close);
    header.append(title, close);
    const cancel = action(text.cancel, "secondary-button", () => {
      editingGroup = undefined; focusGeneration += 1;
      confirmationTitle = text.cart; renderConfirmation(); composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
    const section = createKidsMenuSection({ language, products: orderProducts, idPrefix: "kids-replacement", actionLabel: text.replace, quantity: original.quantity,
      photo: (product, key) => productPhoto(orderProducts.get(product.id)!, "selection", `kids-replace:${key}`),
      onAdd: async combo => {
        const generation = focusGeneration;
        const choices = [...(section?.querySelectorAll<HTMLButtonElement>(".kids-combo-add") ?? [])];
        cancel.disabled = true;
        choices.forEach(button => { button.disabled = true; });
        let result;
        try { result = await saveDraft(current => replaceQuickGroup(current, original, combo.items, original.quantity)); }
        catch { announce(storageError); return false; }
        finally { cancel.disabled = false; choices.forEach(button => { button.disabled = false; }); }
        if (!result.applied) { announce(text.editBlocked); return false; }
        renderCart();
        if (root.isConnected && customizer.open && editingGroup === original && generation === focusGeneration) finishKidsChange(trigger, text.updated);
        return true;
      }
    });
    composer.append(header, node("p", "qb-choice-summary", `${original.quantity} × ${orderGroupName(original, language)}`));
    if (section) composer.append(section);
    composer.append(modalNotice, cancel);
    if (!customizer.open) customizer.showModal();
    customizer.scrollTop = 0; title.focus({ preventScroll: true });
  }

  function updateCatalogBadges(): void {
    const amounts = new Map<string, number>();
    for (const group of readDraft().groups) for (const item of group.items) {
      amounts.set(item.id, (amounts.get(item.id) ?? 0) + item.quantity * group.quantity);
    }
    for (const [id, card] of catalogCards) {
      const amount = amounts.get(id) ?? 0;
      const badge = card.querySelector<HTMLElement>(".qb-in-cart")!;
      badge.hidden = !amount; badge.textContent = amount ? `✓ ${text.inCart}: ${amount}` : "";
      const product = orderProducts.get(id)!;
      card.setAttribute("aria-label", `${text.choose}: ${product.name[language]}, ${price(product.unitPriceMinor)}${amount ? `. ${text.inCart}: ${amount}` : ""}`);
    }
  }

  function beginEdit(groupId: string, trigger: HTMLElement, alternatives = false): void {
    const latest = readDraft().groups.find(entry => entry.id === groupId);
    const items = latest && editableItems(latest);
    if (!latest || !items) { renderCart(); announce(text.editBlocked); return; }
    editingGroup = latest; selectedId = items[0].id; variantId = items[0].variant ?? "";
    dessertId = items[1]?.id ?? ""; quantity = latest.quantity;
    openCustomizer(trigger);
    if (alternatives) renderAlternatives();
  }

  async function removeSelection(group: QuickOrderGroup): Promise<void> {
    const generation = focusGeneration;
    let result;
    try {
      result = await saveDraft(draft => {
        const current = draft.groups.find(item => item.id === group.id);
        if (!current || current.quantity !== group.quantity || JSON.stringify(current.items) !== JSON.stringify(group.items)) {
          return { draft, applied: false, blocked: true };
        }
        return { draft: removeOrderGroup(draft, group.id, orderProductIds), applied: true, blocked: false };
      });
    } catch { renderCart(); announce(storageError); return; }
    renderCart();
    if (!result.applied) { announce(text.editBlocked); return; }
    announce(`${text.removed}: ${orderGroupName(group, language)}`);
    if (generation !== focusGeneration || !root.isConnected || document.querySelector(".order-checkout-dialog[open]")) return;
    if (customizer.open) {
      confirmationTitle = text.removed; renderConfirmation();
      composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    } else if (canFocusCart()) cart.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  function lineActions(group: QuickOrderGroup): HTMLElement {
    const actions = node("div", "qb-line-actions");
    const name = orderGroupName(group, language);
    if (editableItems(group)) {
      const edit = action(text.edit, "qb-edit", () => beginEdit(group.id, edit));
      edit.setAttribute("aria-label", `${text.edit}: ${name}`);
      actions.append(edit);
    }
    if (kidsComboForItems(group.items) || editableItems(group)) {
      const replace = action(text.replace, "qb-replace", () => kidsComboForItems(group.items)
        ? replaceKidsCombo(group.id, replace) : beginEdit(group.id, replace, true));
      replace.setAttribute("aria-label", `${text.replace}: ${name}`); actions.append(replace);
    }
    const remove = action(text.remove, "qb-remove", () => removeSelection(group));
    remove.setAttribute("aria-label", `${text.remove}: ${name}`); actions.append(remove);
    return actions;
  }

  function renderAlternatives(): void {
    if (!editingGroup) return;
    customizerChangedAt = performance.now();
    const current = orderProducts.get(selectedId)!;
    const isDrink = drinkCategories.has(current.categoryId);
    composer.replaceChildren();
    const header = node("div", "qb-customizer-header");
    const title = node("h2", "qb-section-title", text.alternative); title.id = "qb-customizer-title"; title.tabIndex = -1;
    const close = action("×", "qb-customizer-close", () => closeCustomizer()); close.setAttribute("aria-label", text.close);
    header.append(title, close);
    composer.append(header, node("p", "qb-choice-summary", `${quantity} × ${current.name[language]}`), node("p", "qb-muted", text.replaceHint));
    const label = node("label", "qb-field", text.search);
    const filter = node("input"); filter.type = "search"; filter.id = "qb-alternative-search"; label.htmlFor = filter.id;
    filter.placeholder = text.search; filter.autocomplete = "off"; label.append(filter);
    const options = node("div", "qb-products qb-replacement");
    const renderOptions = (): void => {
      options.replaceChildren();
      const alternatives = quickProducts.filter(product => drinkCategories.has(product.categoryId) === isDrink
        && matchesQuickProduct(product, filter.value)).sort((a, b) => Number(b.categoryId === current.categoryId) - Number(a.categoryId === current.categoryId));
      for (const [index, product] of alternatives.entries()) {
        const button = action("", "qb-product qb-alternative", () => {
          if (selectedId !== product.id) variantId = "";
          selectedId = product.id; renderComposer(); customizer.scrollTop = 0;
          composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
        });
        button.dataset.alternativeId = product.id;
        button.setAttribute("aria-label", `${text.replace}: ${product.name[language]}, ${price(product.unitPriceMinor)}`);
        const photo = productPhoto(product, "catalog", `alternative:${product.id}`);
        retryProductPhoto(photo);
        button.append(photo, node("span", "qb-product-name", product.name[language]),
          node("span", "qb-product-price", price(product.unitPriceMinor)), node("span", "qb-product-action", product.id === selectedId ? `✓ ${text.selected}` : text.replace));
        if (index < 6) button.querySelector<HTMLImageElement>("img")!.loading = "eager";
        options.append(button);
      }
      if (!alternatives.length) options.append(node("p", "qb-muted", text.empty));
    };
    filter.addEventListener("input", renderOptions);
    composer.append(label, options, action(text.cancel, "secondary-button qb-replacement-cancel", () => closeCustomizer()));
    renderOptions(); customizer.scrollTop = 0; title.focus({ preventScroll: true });
  }

  function updateComposer(controlSelector: string, fallbackSelector?: string): void {
    const previous = composer.querySelector<HTMLElement>(controlSelector);
    const previousTop = previous?.getBoundingClientRect().top;
    const scrollTop = customizer.scrollTop;
    renderComposer();
    // A drink's description or the selected pair can change the content above
    // the tapped control. Keep that control under the same finger position.
    customizer.scrollTop = scrollTop;
    const current = composer.querySelector<HTMLButtonElement>(controlSelector);
    if (current && previousTop !== undefined) {
      customizer.scrollTop += current.getBoundingClientRect().top - previousTop;
    }
    const target = current && !current.disabled ? current
      : fallbackSelector ? composer.querySelector<HTMLButtonElement>(fallbackSelector) : undefined;
    target?.focus({ preventScroll: true });
  }

  function renderComposer(): void {
    customizerChangedAt = performance.now();
    // Reuse the same photo frames through quantity, flavour and pair changes,
    // including reopening a drink after its previous dialog has been removed.
    const composerPhoto = (product: QuickProduct, placement: "selection" | "sweet"): HTMLSpanElement => productPhoto(product, placement);
    composer.replaceChildren();
    const composerTitle = node("h2", "qb-section-title", editingGroup ? text.edit : text.selection); composerTitle.tabIndex = -1; composerTitle.id = "qb-customizer-title";
    const header = node("div", "qb-customizer-header");
    const close = action("×", "qb-customizer-close", () => closeCustomizer()); close.setAttribute("aria-label", text.close);
    header.append(composerTitle, close); composer.append(header);
    const product = orderProducts.get(selectedId);
    if (!product) { composer.append(node("p", "qb-muted", text.selectHint)); return; }
    const sweet = sweetProducts.find(item => item.id === dessertId);
    const photos = node("div", "qb-selection-photos");
    for (const item of [product, ...(sweet ? [sweet] : [])]) {
      const figure = node("figure");
      figure.append(composerPhoto(item, "selection"), node("figcaption", "", item.name[language]), node("strong", "", price(item.unitPriceMinor)));
      photos.append(figure);
    }
    composer.append(photos);
    if (editingGroup) {
      const actions = node("div", "qb-line-actions");
      actions.append(action(text.replace, "qb-replace", renderAlternatives),
        action(text.remove, "qb-remove", () => removeSelection(editingGroup!)));
      composer.append(actions);
    }
    if (product.item.description) composer.append(node("p", "qb-product-description", product.item.description[language]));
    const variants = variantsFor(product);
    const drinkChoices = drinkChoicesFor(product);
    if (drinkChoices.length) {
      const field = node("fieldset", "qb-flavours"); field.append(node("legend", "", text.drinkChoice));
      for (const choice of drinkChoices) {
        const key = `${choice.product.id}/${choice.variant?.id ?? "plain"}`;
        const name = `${choice.product.name[language]}${choice.variant ? ` · ${choice.variant.name[language]}` : ""}`;
        const button = action(`${drinkChoiceLabel(choice, language)} · ${price(choice.product.unitPriceMinor)}`, "qb-flavour", () => {
          selectedId = choice.product.id; variantId = choice.variant?.id ?? "";
          updateComposer(`[data-choice-id="${key}"]`);
        });
        button.setAttribute("aria-label", `${name} · ${price(choice.product.unitPriceMinor)}`);
        button.dataset.choiceId = key;
        if (choice.variant) button.dataset.variantId = choice.variant.id;
        button.setAttribute("aria-pressed", String(choice.product.id === selectedId && (choice.variant?.id ?? "") === variantId));
        field.append(button);
      }
      composer.append(field);
    } else if (variants.length) {
      const field = node("fieldset", "qb-flavours"); field.append(node("legend", "", text.flavour));
      for (const variant of variants) {
        const button = action(variant.name[language], "qb-flavour", () => {
          variantId = variant.id; updateComposer(`[data-variant-id="${variant.id}"]`);
        });
        button.dataset.variantId = variant.id; button.setAttribute("aria-pressed", String(variant.id === variantId)); field.append(button);
      }
      composer.append(field);
    }
    if (drinkCategories.has(product.categoryId)) {
      const field = node("fieldset", "qb-sweets-field"); field.append(node("legend", "", text.sweet));
      const none = action(text.noSweet, "qb-no-sweet", () => {
        dessertId = ""; updateComposer(".qb-no-sweet");
      });
      none.setAttribute("aria-pressed", String(!dessertId)); field.append(none);
      const sweets = node("div", "qb-sweets");
      for (const dessert of sweetProducts) {
        const button = action("", "qb-sweet", () => {
          dessertId = dessert.id; updateComposer(`[data-dessert-id="${dessert.id}"]`);
        });
        button.dataset.dessertId = dessert.id; button.setAttribute("aria-pressed", String(dessert.id === dessertId));
        button.append(composerPhoto(dessert, "sweet"), node("span", "qb-sweet-name", dessert.name[language]), node("strong", "", `+${price(dessert.unitPriceMinor)}`));
        sweets.append(button);
      }
      field.append(sweets); composer.append(field);
    }
    const footer = node("div", "qb-composer-footer");
    const selectedItems: QuickOrderItem[] = [{ id: product.id, quantity: 1, ...(variantId ? { variant: variantId } : {}) },
      ...(sweet ? [{ id: sweet.id, quantity: 1 }] : [])];
    footer.append(node("p", "qb-choice-summary", `${text.selected}: ${quantity} × ${orderGroupName({ id: "selection", items: selectedItems, quantity }, language)}`));
    const row = node("div", "qb-quantity-row");
    row.append(node("span", "", sweet ? text.pairs : text.quantity));
    const stepper = quantityControl(quantity, 99, value => { const direction = value > quantity ? "up" : "down"; quantity = value;
      updateComposer(`[data-step="${direction}"]`, "[data-step]:not(:disabled)"); }, product.name[language]);
    row.append(stepper); footer.append(row);
    const total = (product.unitPriceMinor + (sweet?.unitPriceMinor ?? 0)) * quantity;
    const totalRow = node("p", "qb-add-total"); totalRow.append(node("span", "", editingGroup ? text.editTotal : text.selectedTotal), node("strong", "", price(total)));
    const needsVariant = variants.length > 0 && !variants.some(item => item.id === variantId);
    const isReplacement = editingGroup && selectedId !== orderGroupItems(editingGroup)[0].id;
    const add = action(`${editingGroup ? isReplacement ? text.saveReplacement : text.save : sweet ? text.addPair : text.add} · ${price(total)}`, "primary-button qb-add", async () => {
      if (add.disabled) return;
      const items = selectedItems;
      const original = editingGroup;
      const selectedQuantity = quantity;
      add.disabled = true;
      let result;
      try {
        result = await saveDraft(current => original ? replaceQuickGroup(current, original, items, selectedQuantity)
          : addOrderGroup(current, items, selectedQuantity, orderProductIds));
      } catch { announce(storageError); add.disabled = false; return; }
      if (!result.applied) { announce(original ? text.editBlocked : text.limit); add.disabled = false; return; }
      announce(`${original ? text.updated : text.added}: ${product.name[language]}${sweet ? ` + ${sweet.name[language]}` : ""} × ${selectedQuantity}`);
      renderCart();
      if (!customizer.open || !add.isConnected) return;
      confirmationTitle = original ? text.updated : text.added;
      renderConfirmation();
      customizer.scrollTop = 0;
      composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
    add.disabled = needsVariant;
    if (needsVariant) footer.append(node("p", "qb-muted", text.flavourRequired));
    const browse = action(text.chooseMore, "secondary-button qb-continue-shopping", chooseMore);
    footer.append(totalRow, add, browse, modalNotice); composer.append(footer);
  }

  function quantityControl(value: number, max: number, onChange: (quantity: number) => void, name: string): HTMLElement {
    const controls = node("div", "qb-stepper");
    const decrease = action("−", "", () => onChange(value - 1));
    decrease.dataset.step = "down"; decrease.disabled = value <= 1;
    decrease.setAttribute("aria-label", `${text.decrease}: ${name}`);
    const amount = node("output", "", String(value)); amount.setAttribute("aria-label", text.quantity);
    const increase = action("+", "", () => onChange(value + 1));
    increase.dataset.step = "up"; increase.disabled = value >= max;
    increase.setAttribute("aria-label", `${text.increase}: ${name}`);
    controls.append(decrease, amount, increase); return controls;
  }

  function editableItems(group: QuickOrderGroup): QuickOrderItem[] | undefined {
    if (!group.items.every(item => item.quantity === 1)) return;
    const items = orderGroupItems(group);
    if (items.length === 1) return items;
    if (items.length === 2 && drinkCategories.has(orderProducts.get(items[0].id)?.categoryId ?? "") && sweetProducts.some(item => item.id === items[1].id)) return items;
  }

  function renderCart(focusGroup?: string, focusStep?: string): void {
    const draft = readDraft();
    updateCatalogBadges();
    cart.replaceChildren();
    const title = node("h2", "qb-section-title", text.cart); title.tabIndex = -1;
    cart.append(title);
    if (!draft.groups.length) cart.append(node("p", "qb-empty-title", text.cartEmpty), node("p", "qb-muted", text.cartHint));
    for (const group of draft.groups) {
      const name = orderGroupName(group, language);
      const row = node("article", "qb-order-group"); row.dataset.groupId = group.id;
      const photos = node("div", "qb-order-photos");
      for (const [itemIndex, item] of orderGroupItems(group).entries()) {
        const product = orderProducts.get(item.id);
        if (product) photos.append(productPhoto(product, "cart", `${group.id}:${itemIndex}:${product.id}`));
      }
      const info = node("div", "qb-order-info");
      if (group.items.length > 1) info.append(node("span", "qb-pair-badge", text.pair));
      info.append(node("h3", "", name), node("strong", "qb-order-price", price(orderGroupTotal(group))));
      group.items.forEach((item, itemIndex) => {
        const product = orderProducts.get(item.id);
        if (!product || !variantsFor(product).length) return;
        const field = node("label", "qb-field", `${text.flavour} · ${product.name[language]}`);
        const select = node("select"); select.required = true; select.dataset.variantProduct = item.id;
        const placeholder = node("option", "", text.flavour); placeholder.value = ""; placeholder.disabled = true;
        select.append(placeholder);
        for (const variant of variantsFor(product)) {
          const option = node("option", "", variant.name[language]); option.value = variant.id; select.append(option);
        }
        const valid = variantsFor(product).some(variant => variant.id === item.variant);
        select.value = valid ? item.variant! : "";
        select.setAttribute("aria-invalid", String(!valid));
        select.addEventListener("change", async () => {
          const variant = select.value;
          let focusGroup: QuickOrderGroup | undefined;
          // Normalization may change or merge a menu group's ID. Derive that
          // same ID from the edited group so another matching drink cannot steal focus.
          try {
            await saveDraft(current => {
              const latest = current.groups.find(entry => entry.id === group.id);
              if (!latest?.items[itemIndex] || latest.items[itemIndex].id !== item.id) return { draft: current, applied: false, blocked: true };
              focusGroup = updateQuickGroupVariant({ ...current, groups: [latest] }, group.id, itemIndex, variant).groups[0];
              return { draft: updateQuickGroupVariant(current, group.id, itemIndex, variant), applied: true, blocked: false };
            });
          } catch { renderCart(); announce(storageError); return; }
          renderCart(); announce(text.updated);
          if (!canFocusCart()) return;
          const focusRow = [...cart.querySelectorAll<HTMLElement>("[data-group-id]")]
            .find(entry => entry.dataset.groupId === focusGroup?.id);
          [...(focusRow?.querySelectorAll<HTMLSelectElement>("[data-variant-product]") ?? [])]
            .find(control => control.dataset.variantProduct === item.id && control.value === variant)?.focus({ preventScroll: true });
        });
        field.append(select); info.append(field);
      });
      const maximum = stepQuickGroupQuantity(draft, group.id, 1).applied ? 99 : group.quantity;
      const controls = quantityControl(group.quantity, maximum, async next => {
        const delta = next - group.quantity;
        let result;
        try { result = await saveDraft(current => stepQuickGroupQuantity(current, group.id, delta)); }
        catch { renderCart(); announce(storageError); return; }
        const stillExists = result.draft.groups.some(entry => entry.id === group.id);
        if (!result.applied) {
          renderCart(group.id, delta > 0 ? "up" : "down");
          if (!stillExists && canFocusCart()) cart.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
          announce(stillExists ? text.limit : text.updated); return;
        }
        renderCart(group.id, delta > 0 ? "up" : "down"); announce(text.updated);
      }, name);
      info.append(controls, lineActions(group)); row.append(photos, info); cart.append(row);
    }
    const total = draft.groups.reduce((sum, group) => sum + orderGroupTotal(group), 0);
    dockTotal.textContent = price(total);
    dockCheckout.disabled = checkoutOpening || draft.groups.length === 0;
    const needsFlavour = needsOrderVariant(draft.groups);
    dockCheckout.textContent = needsFlavour ? text.completeFlavours : text.checkout;
    const footer = node("div", "qb-checkout");
    const priceRow = node("div", "qb-grand-total"); priceRow.append(node("span", "", text.total), node("strong", "", price(total)));
    const checkout = action(needsFlavour ? text.completeFlavours : text.checkout, "primary-button", () => requestCheckout(checkout));
    checkout.disabled = checkoutOpening || draft.groups.length === 0;
    footer.append(priceRow, checkout, node("p", "qb-checkout-note", text.draftNote)); cart.append(footer);
    if (focusGroup && canFocusCart()) {
      const row = [...cart.querySelectorAll<HTMLElement>("[data-group-id]")].find(item => item.dataset.groupId === focusGroup);
      const target = row?.querySelector<HTMLButtonElement>(`[data-step="${focusStep}"]`);
      (target && !target.disabled ? target : row?.querySelector<HTMLButtonElement>("[data-step]:not(:disabled)"))?.focus({ preventScroll: true });
    }
  }

  renderChips(); renderCatalog(); renderComposer(); renderCart();
  let refreshRevision = 0;
  const refreshCanonical = async (): Promise<void> => {
    const revision = ++refreshRevision;
    try { await readLatestStoredOrderDraft(orderProductIds); }
    catch { if (root.isConnected && revision === refreshRevision) announce(storageError); return; }
    if (!root.isConnected || revision !== refreshRevision) return;
    renderCart();
    if (customizer.open && confirmationTitle) {
      confirmationTitle = text.updated;
      renderConfirmation();
      if (!document.querySelector(".order-checkout-dialog[open]")) composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }
  };
  refreshBuilder = () => { void refreshCanonical(); };
  createOrderStorageNotice({ owner: root, getLanguage: () => language,
    getProduct: (id: string) => orderProducts.get(id)?.item, validIds: orderProductIds,
    onResolved: async () => { announce(""); await refreshCanonical(); } });
  void refreshCanonical();
  if (prefill) requestAnimationFrame(() => {
    if (root.isConnected) openCustomizer(search);
  });
  return root;
}

window.addEventListener("robys:order-change", event => {
  if ((event as CustomEvent<{ origin?: unknown }>).detail?.origin !== orderChangeOrigin) refreshBuilder?.();
});
window.addEventListener("storage", event => { if (event.key === ORDER_DRAFT_KEY || event.key === null) refreshBuilder?.(); });
window.addEventListener("focus", () => refreshBuilder?.());
window.addEventListener("pageshow", () => refreshBuilder?.());
