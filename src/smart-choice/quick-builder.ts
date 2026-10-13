import { menuCategories } from "../../menu-catalog.js";
import {
  ORDER_DRAFT_KEY, readStoredOrderDraft, writeStoredOrderDraft, addOrderGroup, removeOrderGroup,
  type OrderDraft
} from "../order-draft.js";
import type { SmartChoiceLanguage } from "./catalog.js";
import { openQuickCheckout } from "./checkout-link.js";
import { orderProducts, orderProductIds } from "./shared-order.js";
import {
  quickProducts, sweetProducts, drinkCategories, matchesQuickProduct, variantsFor, drinkChoicesFor, drinkChoiceLabel,
  orderGroupName, orderGroupTotal, orderGroupItems, needsOrderVariant, updateQuickGroupVariant, stepQuickGroupQuantity, replaceQuickGroup, type QuickProduct, type QuickOrderItem, type QuickOrderGroup
} from "./quick-builder-domain.js";

const COPY = {
  tr: {
    eyebrow: "ROBY'S · SENİN SEÇİMİN", title: "Bugün ne iyi gider?", lead: "İçeceğini seç, yanına tatlı ekle. Siparişini burada hazırla.",
    help: "Seçmeme yardım et", all: "Tümü", search: "Kahve, çay, tatlı ara", clear: "Aramayı temizle", results: "seçenek", empty: "Bu aramada ürün bulunamadı.",
    reset: "Tüm ürünleri göster", choose: "Seç", chosen: "Seçildi", selection: "Seçimini tamamla", selectHint: "Fotoğrafa dokun, seçimini burada tamamla.",
    sweet: "Yanına bir tatlı", noSweet: "Sadece içecek", flavour: "Lezzet seç", flavourRequired: "Bir lezzet seçin", completeFlavours: "İçecek lezzetlerini seç", quantity: "Adet", pairs: "Çift adedi",
    add: "Siparişe ekle", addPair: "Çifti ekle", added: "Siparişine eklendi", chooseMore: "Başka ürün seç", limit: "Bu miktar eklenemiyor. Sepetteki adedi kontrol edin.",
    cart: "Siparişin", cartEmpty: "Henüz bir şey eklemedin.", cartHint: "İlk içeceğini seçerek başlayabilirsin.", total: "Toplam", checkout: "Tamam, devam et", nextStep: "Bu kadarı yeterli mi, başka bir şey ister misin?", editOrder: "Siparişi düzenle",
    draftNote: "QR'ı kasaya göster. Ödeme ve son onay kafede yapılır.", remove: "Kaldır", increase: "Adedi artır", decrease: "Adedi azalt", pair: "Birlikte",
    updated: "Sipariş güncellendi", removed: "Siparişten kaldırıldı", checkoutError: "Sipariş ekranı açılamadı. Yeniden deneyin.", review: "Siparişi gör",
    coffee: "Kahve molası", tea: "Çay vakti", cold: "Serin bir seçim", catalog: "Menüden seç", itemPrice: "Birim fiyat", pairPrice: "Bir çift", selectedTotal: "Eklenecek tutar",
    close: "Kapat", edit: "Seçimi düzenle", save: "Değişiklikleri kaydet", editTotal: "Yeni tutar", editBlocked: "Sipariş değişti veya adet sınırına ulaşıldı. Sepeti kontrol edip seçimi yeniden açın.", drinkChoice: "İçecek seçeneği"
  },
  en: {
    eyebrow: "ROBY'S · YOUR CHOICE", title: "What sounds good today?", lead: "Pick a drink, add something sweet. Put your order together right here.",
    help: "Help me choose", all: "All", search: "Search coffee, tea, desserts", clear: "Clear search", results: "choices", empty: "No products match your search.",
    reset: "Show all products", choose: "Choose", chosen: "Selected", selection: "Make it yours", selectHint: "Tap a photo to put your selection together here.",
    sweet: "Something sweet with it", noSweet: "Just the drink", flavour: "Choose a flavour", flavourRequired: "Please choose a flavour", completeFlavours: "Choose drink flavours", quantity: "Quantity", pairs: "Number of pairs",
    add: "Add to order", addPair: "Add pair", added: "Added to your order", chooseMore: "Choose more", limit: "That quantity cannot be added. Check the quantity already in your order.",
    cart: "Your order", cartEmpty: "Nothing added yet.", cartHint: "Start with your first drink.", total: "Total", checkout: "All set · continue", nextStep: "All set, or would you like something else?", editOrder: "Edit order",
    draftNote: "Show the QR at the counter. Payment and final confirmation happen at the café.", remove: "Remove", increase: "Increase quantity", decrease: "Decrease quantity", pair: "Together",
    updated: "Order updated", removed: "Removed from your order", checkoutError: "The order screen could not open. Please try again.", review: "Review order",
    coffee: "Coffee break", tea: "Time for tea", cold: "Something refreshing", catalog: "Choose from the menu", itemPrice: "Unit price", pairPrice: "One pair", selectedTotal: "Amount to add",
    close: "Close", edit: "Customize selection", save: "Save changes", editTotal: "Updated amount", editBlocked: "The order changed or reached its quantity limit. Check your order and reopen this selection.", drinkChoice: "Drink option"
  },
  ru: {
    eyebrow: "ROBY'S · ТВОЙ ВЫБОР", title: "Чего хочется сегодня?", lead: "Выбери напиток, добавь сладкое. Собери весь заказ прямо здесь.",
    help: "Помочь с выбором", all: "Всё", search: "Найти кофе, чай, десерт", clear: "Очистить поиск", results: "вариантов", empty: "По этому запросу ничего не нашлось.",
    reset: "Показать все товары", choose: "Выбрать", chosen: "Выбрано", selection: "Собери свой вариант", selectHint: "Нажми на фото и собери свой вариант здесь.",
    sweet: "Сладкое к напитку", noSweet: "Только напиток", flavour: "Выбери вкус", flavourRequired: "Сначала выбери вкус", completeFlavours: "Выбрать вкусы напитков", quantity: "Количество", pairs: "Количество пар",
    add: "Добавить в заказ", addPair: "Добавить пару", added: "Добавлено в заказ", chooseMore: "Выбрать ещё", limit: "Не получается добавить столько. Проверь количество в корзине.",
    cart: "Твой заказ", cartEmpty: "Пока ничего не добавлено.", cartHint: "Начни с первого напитка.", total: "Итого", checkout: "Всё, к оформлению", nextStep: "На этом всё или хочется чего-нибудь ещё?", editOrder: "Изменить заказ",
    draftNote: "Покажи QR на кассе. Оплата и окончательное подтверждение — в кафе.", remove: "Убрать", increase: "Увеличить количество", decrease: "Уменьшить количество", pair: "Вместе",
    updated: "Заказ обновлён", removed: "Убрано из заказа", checkoutError: "Не удалось открыть оформление. Попробуй ещё раз.", review: "Посмотреть заказ",
    coffee: "Кофейная пауза", tea: "Время для чая", cold: "Хочется прохлады", catalog: "Выбирай из меню", itemPrice: "Цена за штуку", pairPrice: "Одна пара", selectedTotal: "Добавится к заказу",
    close: "Закрыть", edit: "Изменить выбор", save: "Сохранить изменения", editTotal: "Новая сумма", editBlocked: "Заказ изменился или достигнут предел количества. Проверь корзину и открой этот выбор заново.", drinkChoice: "Вариант напитка"
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

function saveDraft(draft: OrderDraft): void {
  writeStoredOrderDraft(draft, orderProductIds);
  window.dispatchEvent(new CustomEvent("robys:order-change", { detail: { origin: orderChangeOrigin } }));
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

function productPhoto(product: QuickProduct, className = ""): HTMLImageElement {
  const image = node("img", className);
  image.src = `../${product.image}`;
  image.alt = "";
  image.width = image.height = 320;
  image.loading = "lazy";
  image.decoding = "async";
  return image;
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
      category = key === "tea" ? "all" : target; query = key === "tea" ? "tea" : "";
      search.value = query; renderChips(); renderCatalog(); catalogTitle.scrollIntoView({ block: "start", behavior: "auto" });
    });
    const photo = node("img");
    photo.src = `../src/products/quick-choice-v1/${key}.webp`;
    photo.alt = ""; photo.width = 600; photo.height = 400; photo.decoding = "async";
    button.append(photo, node("span", "", text[key]));
    inspiration.append(button);
  }
  root.append(hero, inspiration);

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
  const clear = action("×", "qb-search-clear", () => { query = ""; search.value = ""; renderCatalog(); search.focus(); });
  clear.setAttribute("aria-label", text.clear);
  search.addEventListener("input", () => {
    query = search.value;
    // A search is across the whole menu, including all three languages.
    if (query.trim() && category !== "all") { category = "all"; renderChips(); }
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
  customizer.addEventListener("close", () => {
    if (customizer.open) return;
    confirmationTitle = "";
    const generation = focusGeneration;
    const target = returnFocus;
    const restoreFocus = (): void => {
      if (!root.isConnected || customizer.open || generation !== focusGeneration
        || document.querySelector(".order-checkout-dialog[open]")) return;
      (target?.isConnected ? target : cart.querySelector<HTMLElement>("h2"))?.focus({ preventScroll: true });
    };
    restoreFocus();
    // Native dialog focus restoration can finish after the close callback.
    requestAnimationFrame(restoreFocus);
  });
  customizer.addEventListener("click", event => {
    if (event.target !== customizer) return;
    const bounds = customizer.getBoundingClientRect();
    const click = event as MouseEvent;
    if (click.clientX < bounds.left || click.clientX > bounds.right || click.clientY < bounds.top || click.clientY > bounds.bottom) customizer.close();
  });
  const cart = node("section", "qb-cart"); cart.id = "qb-cart";
  const notice = node("p", "qb-notice"); notice.setAttribute("role", "status"); notice.setAttribute("aria-live", "polite");
  side.append(notice, cart);
  layout.append(catalog, side);
  const dock = node("div", "qb-cart-dock");
  const dockTotal = node("strong");
  const review = action("", "qb-dock-review", () => { cart.scrollIntoView({ block: "start", behavior: "auto" }); cart.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }); });
  review.append(node("span", "", text.review), dockTotal);
  const dockCheckout = action(text.checkout, "primary-button", () => requestCheckout(dockCheckout));
  dock.append(review, dockCheckout);
  root.append(layout, dock, customizer);

  function announce(message: string): void { notice.textContent = modalNotice.textContent = message; }
  function openCustomizer(trigger: HTMLElement): void {
    focusGeneration += 1;
    returnFocus = trigger;
    confirmationTitle = "";
    announce(""); renderComposer();
    if (!customizer.open) customizer.showModal();
    customizer.scrollTop = 0;
    composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }
  function requestCheckout(button: HTMLButtonElement): void {
    const draft = readDraft();
    if (!draft.groups.length) { renderCart(); showCart(); return; }
    if (needsOrderVariant(draft.groups)) {
      renderCart(); announce(text.completeFlavours);
      showCart(cart.querySelector<HTMLSelectElement>('select[aria-invalid="true"]') ?? undefined);
      return;
    }
    if (customizer.open) showCart();
    button.disabled = true;
    void openQuickCheckout(draft, language, button).catch(() => announce(text.checkoutError))
      .finally(() => { button.disabled = readDraft().groups.length === 0; });
  }
  function showCart(target?: HTMLElement): void {
    returnFocus = target ?? cart.querySelector<HTMLElement>("h2") ?? review;
    if (customizer.open) customizer.close();
    cart.scrollIntoView({ block: "start", behavior: "auto" });
    returnFocus.focus({ preventScroll: true });
  }
  function chooseMore(): void {
    returnFocus = search;
    customizer.close();
    catalog.scrollIntoView({ block: "start", behavior: "auto" });
    search.focus({ preventScroll: true });
    if (search.value) search.select();
  }
  function renderConfirmation(): void {
    const draft = readDraft();
    composer.replaceChildren();
    const title = node("h2", "qb-section-title", confirmationTitle);
    title.id = "qb-customizer-title"; title.tabIndex = -1;
    const header = node("div", "qb-customizer-header");
    const close = action("×", "qb-customizer-close", () => customizer.close());
    close.setAttribute("aria-label", text.close);
    header.append(title, close);
    composer.append(header, node("p", "qb-next-step", text.nextStep));
    const summary = node("div", "qb-confirmation-summary");
    summary.append(node("h3", "", text.cart), action(text.editOrder, "qb-edit", () => showCart()));
    const list = node("ul", "qb-confirmation-lines");
    for (const group of draft.groups) {
      const row = node("li", "qb-confirmation-line");
      const photos = node("span", "qb-confirmation-photos");
      for (const item of orderGroupItems(group)) {
        const product = orderProducts.get(item.id);
        if (product) photos.append(productPhoto(product));
      }
      row.append(photos, node("span", "", `${group.quantity} × ${orderGroupName(group, language)}`),
        node("strong", "", price(orderGroupTotal(group))));
      list.append(row);
    }
    if (!draft.groups.length) list.append(node("li", "qb-muted", text.cartEmpty));
    summary.append(list);
    const footer = node("div", "qb-composer-footer qb-confirmation-actions");
    const total = node("p", "qb-grand-total");
    total.append(node("span", "", text.total), node("strong", "", price(draft.groups.reduce((sum, group) => sum + orderGroupTotal(group), 0))));
    const checkout = action(needsOrderVariant(draft.groups) ? text.completeFlavours : text.checkout, "primary-button qb-confirmation-checkout", () => {
      requestCheckout(dockCheckout);
    });
    checkout.disabled = draft.groups.length === 0;
    footer.append(total, checkout, action(text.chooseMore, "secondary-button qb-confirmation-more", chooseMore),
      node("p", "qb-checkout-note", text.draftNote));
    composer.append(summary, footer);
  }
  function renderChips(): void {
    chips.replaceChildren();
    for (const entry of [{ id: "all", name: text.all }, ...menuCategories.map(item => ({ id: item.id, name: item.name[language] }))]) {
      const chip = action(entry.name, "qb-chip", () => { category = entry.id; renderChips(); renderCatalog();
        chips.querySelector<HTMLButtonElement>(`[data-category="${entry.id}"]`)?.focus(); });
      chip.dataset.category = entry.id;
      chip.setAttribute("aria-pressed", String(entry.id === category));
      chips.append(chip);
    }
  }

  function updateSelectedCards(previousId: string): void {
    for (const id of new Set([previousId, selectedId])) {
      const card = cards.querySelector<HTMLButtonElement>(`[data-product-id="${id}"]`);
      card?.setAttribute("aria-pressed", String(id === selectedId));
      const label = card?.querySelector<HTMLElement>(".qb-product-action");
      if (label) label.textContent = id === selectedId ? `✓ ${text.chosen}` : `${text.choose} +`;
    }
  }

  function renderCatalog(): void {
    const matches = quickProducts.filter(product => matchesQuickProduct(product, query, category));
    count.textContent = `${matches.length} ${text.results}`;
    clear.hidden = !query;
    cards.replaceChildren();
    if (!matches.length) {
      const empty = node("div", "qb-no-results");
      empty.append(node("p", "", text.empty), action(text.reset, "secondary-button", () => {
        category = "all"; query = ""; search.value = ""; renderChips(); renderCatalog(); search.focus();
      }));
      cards.append(empty);
    }
    for (const product of matches) {
      const card = action("", "qb-product", () => {
        const previousId = selectedId;
        editingGroup = undefined;
        if (selectedId !== product.id) { selectedId = product.id; variantId = ""; dessertId = ""; quantity = 1; }
        updateSelectedCards(previousId);
        openCustomizer(card);
      });
      card.dataset.productId = product.id;
      card.setAttribute("aria-pressed", String(selectedId === product.id));
      card.setAttribute("aria-label", `${text.choose}: ${product.name[language]}, ${price(product.unitPriceMinor)}`);
      card.append(productPhoto(product), node("span", "qb-product-name", product.name[language]),
        node("span", "qb-product-price", price(product.unitPriceMinor)),
        node("span", "qb-product-action", selectedId === product.id ? `✓ ${text.chosen}` : `${text.choose} +`));
      cards.append(card);
    }
  }

  function renderComposer(): void {
    composer.replaceChildren();
    const composerTitle = node("h2", "qb-section-title", editingGroup ? text.edit : text.selection); composerTitle.tabIndex = -1; composerTitle.id = "qb-customizer-title";
    const header = node("div", "qb-customizer-header");
    const close = action("×", "qb-customizer-close", () => customizer.close()); close.setAttribute("aria-label", text.close);
    header.append(composerTitle, close); composer.append(header);
    const product = orderProducts.get(selectedId);
    if (!product) { composer.append(node("p", "qb-muted", text.selectHint)); return; }
    const sweet = sweetProducts.find(item => item.id === dessertId);
    const photos = node("div", "qb-selection-photos");
    for (const item of [product, ...(sweet ? [sweet] : [])]) {
      const figure = node("figure");
      figure.append(productPhoto(item), node("figcaption", "", item.name[language]), node("strong", "", price(item.unitPriceMinor)));
      photos.append(figure);
    }
    composer.append(photos);
    if (product.item.description) composer.append(node("p", "qb-product-description", product.item.description[language]));
    const variants = variantsFor(product);
    const drinkChoices = drinkChoicesFor(product);
    if (drinkChoices.length) {
      const field = node("fieldset", "qb-flavours"); field.append(node("legend", "", text.drinkChoice));
      for (const choice of drinkChoices) {
        const key = `${choice.product.id}/${choice.variant?.id ?? "plain"}`;
        const name = `${choice.product.name[language]}${choice.variant ? ` · ${choice.variant.name[language]}` : ""}`;
        const button = action(`${drinkChoiceLabel(choice, language)} · ${price(choice.product.unitPriceMinor)}`, "qb-flavour", () => {
          const previousId = selectedId;
          selectedId = choice.product.id; variantId = choice.variant?.id ?? "";
          updateSelectedCards(previousId); renderComposer();
          composer.querySelector<HTMLButtonElement>(`[data-choice-id="${key}"]`)?.focus({ preventScroll: true });
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
          variantId = variant.id; renderComposer(); composer.querySelector<HTMLButtonElement>(`[data-variant-id="${variant.id}"]`)?.focus({ preventScroll: true });
        });
        button.dataset.variantId = variant.id; button.setAttribute("aria-pressed", String(variant.id === variantId)); field.append(button);
      }
      composer.append(field);
    }
    if (drinkCategories.has(product.categoryId)) {
      const field = node("fieldset", "qb-sweets-field"); field.append(node("legend", "", text.sweet));
      const none = action(text.noSweet, "qb-no-sweet", () => {
        dessertId = ""; renderComposer(); composer.querySelector<HTMLButtonElement>(".qb-no-sweet")?.focus({ preventScroll: true });
      });
      none.setAttribute("aria-pressed", String(!dessertId)); field.append(none);
      const sweets = node("div", "qb-sweets");
      for (const dessert of sweetProducts) {
        const button = action("", "qb-sweet", () => {
          dessertId = dessert.id; renderComposer(); composer.querySelector<HTMLButtonElement>(`[data-dessert-id="${dessert.id}"]`)?.focus({ preventScroll: true });
        });
        button.dataset.dessertId = dessert.id; button.setAttribute("aria-pressed", String(dessert.id === dessertId));
        button.append(productPhoto(dessert), node("span", "qb-sweet-name", dessert.name[language]), node("strong", "", `+${price(dessert.unitPriceMinor)}`));
        sweets.append(button);
      }
      field.append(sweets); composer.append(field);
    }
    const footer = node("div", "qb-composer-footer");
    const row = node("div", "qb-quantity-row");
    row.append(node("span", "", sweet ? text.pairs : text.quantity));
    const stepper = quantityControl(quantity, 99, value => { const direction = value > quantity ? "up" : "down"; quantity = value; renderComposer();
      const target = composer.querySelector<HTMLButtonElement>(`[data-step="${direction}"]`);
      (target && !target.disabled ? target : composer.querySelector<HTMLButtonElement>("[data-step]:not(:disabled)"))?.focus(); }, product.name[language]);
    row.append(stepper); footer.append(row);
    const total = (product.unitPriceMinor + (sweet?.unitPriceMinor ?? 0)) * quantity;
    const totalRow = node("p", "qb-add-total"); totalRow.append(node("span", "", editingGroup ? text.editTotal : text.selectedTotal), node("strong", "", price(total)));
    const needsVariant = variants.length > 0 && !variants.some(item => item.id === variantId);
    const add = action(`${editingGroup ? text.save : sweet ? text.addPair : text.add} · ${price(total)}`, "primary-button qb-add", () => {
      const items: QuickOrderItem[] = [{ id: product.id, quantity: 1, ...(variantId ? { variant: variantId } : {}) },
        ...(sweet ? [{ id: sweet.id, quantity: 1 }] : [])];
      const result = editingGroup ? replaceQuickGroup(readDraft(), editingGroup, items, quantity) : addOrderGroup(readDraft(), items, quantity, orderProductIds);
      if (!result.applied) { announce(editingGroup ? text.editBlocked : text.limit); return; }
      add.disabled = true;
      saveDraft(result.draft);
      announce(`${editingGroup ? text.updated : text.added}: ${product.name[language]}${sweet ? ` + ${sweet.name[language]}` : ""} × ${quantity}`);
      renderCart();
      confirmationTitle = editingGroup ? text.updated : text.added;
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
    cart.replaceChildren();
    const title = node("h2", "qb-section-title", text.cart); title.tabIndex = -1;
    cart.append(title);
    if (!draft.groups.length) cart.append(node("p", "qb-empty-title", text.cartEmpty), node("p", "qb-muted", text.cartHint));
    for (const group of draft.groups) {
      const name = orderGroupName(group, language);
      const row = node("article", "qb-order-group"); row.dataset.groupId = group.id;
      const photos = node("div", "qb-order-photos");
      for (const item of orderGroupItems(group)) { const product = orderProducts.get(item.id); if (product) photos.append(productPhoto(product)); }
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
        select.addEventListener("change", () => {
          const variant = select.value;
          const current = readDraft();
          const updated = updateQuickGroupVariant(current, group.id, itemIndex, variant);
          // Normalization may change or merge a menu group's ID. Derive that
          // same ID from the edited group so another matching drink cannot steal focus.
          const focusGroup = updateQuickGroupVariant({ ...current,
            groups: current.groups.filter(entry => entry.id === group.id) }, group.id, itemIndex, variant).groups[0];
          saveDraft(updated); renderCart(); announce(text.updated);
          const focusRow = [...cart.querySelectorAll<HTMLElement>("[data-group-id]")]
            .find(entry => entry.dataset.groupId === focusGroup?.id);
          [...(focusRow?.querySelectorAll<HTMLSelectElement>("[data-variant-product]") ?? [])]
            .find(control => control.dataset.variantProduct === item.id && control.value === variant)?.focus({ preventScroll: true });
        });
        field.append(select); info.append(field);
      });
      const controls = quantityControl(group.quantity, 99, next => {
        const delta = next - group.quantity;
        const result = stepQuickGroupQuantity(readDraft(), group.id, delta);
        const stillExists = result.draft.groups.some(entry => entry.id === group.id);
        if (!result.applied) {
          renderCart(group.id, delta > 0 ? "up" : "down");
          if (!stillExists) cart.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
          announce(stillExists ? text.limit : text.updated); return;
        }
        saveDraft(result.draft); renderCart(group.id, delta > 0 ? "up" : "down"); announce(text.updated);
      }, name);
      const remove = action(text.remove, "qb-remove", () => {
        saveDraft(removeOrderGroup(readDraft(), group.id, orderProductIds)); renderCart();
        cart.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }); announce(`${text.removed}: ${name}`);
      });
      remove.setAttribute("aria-label", `${text.remove}: ${name}`);
      info.append(controls);
      if (editableItems(group)) {
        const edit = action(text.edit, "qb-edit", () => {
          const latest = readDraft().groups.find(entry => entry.id === group.id);
          const items = latest && editableItems(latest);
          if (!latest || !items) { renderCart(); announce(text.editBlocked); return; }
          const previousId = selectedId;
          editingGroup = latest; selectedId = items[0].id; variantId = items[0].variant ?? "";
          dessertId = items[1]?.id ?? ""; quantity = latest.quantity;
          updateSelectedCards(previousId);
          openCustomizer(edit);
        });
        edit.setAttribute("aria-label", `${text.edit}: ${name}`); info.append(edit);
      }
      info.append(remove); row.append(photos, info); cart.append(row);
    }
    const total = draft.groups.reduce((sum, group) => sum + orderGroupTotal(group), 0);
    dockTotal.textContent = price(total);
    dockCheckout.disabled = draft.groups.length === 0;
    const needsFlavour = needsOrderVariant(draft.groups);
    dockCheckout.textContent = needsFlavour ? text.completeFlavours : text.checkout;
    const footer = node("div", "qb-checkout");
    const priceRow = node("div", "qb-grand-total"); priceRow.append(node("span", "", text.total), node("strong", "", price(total)));
    const checkout = action(needsFlavour ? text.completeFlavours : text.checkout, "primary-button", () => requestCheckout(checkout));
    checkout.disabled = draft.groups.length === 0;
    footer.append(priceRow, checkout, node("p", "qb-checkout-note", text.draftNote)); cart.append(footer);
    if (focusGroup) {
      const row = [...cart.querySelectorAll<HTMLElement>("[data-group-id]")].find(item => item.dataset.groupId === focusGroup);
      const target = row?.querySelector<HTMLButtonElement>(`[data-step="${focusStep}"]`);
      (target && !target.disabled ? target : row?.querySelector<HTMLButtonElement>("[data-step]:not(:disabled)"))?.focus({ preventScroll: true });
    }
  }

  renderChips(); renderCatalog(); renderComposer(); renderCart();
  refreshBuilder = () => {
    if (!root.isConnected) return;
    renderCart();
    if (customizer.open && confirmationTitle) {
      confirmationTitle = text.updated;
      renderConfirmation();
      composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }
  };
  if (prefill) requestAnimationFrame(() => {
    if (root.isConnected) openCustomizer(search);
  });
  return root;
}

window.addEventListener("robys:order-change", event => {
  if ((event as CustomEvent<{ origin?: unknown }>).detail?.origin !== orderChangeOrigin) refreshBuilder?.();
});
window.addEventListener("storage", event => { if (event.key === ORDER_DRAFT_KEY || event.key === null) refreshBuilder?.(); });
