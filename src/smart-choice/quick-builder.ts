import { menuCategories } from "../../menu-catalog.js";
import {
  ORDER_DRAFT_KEY, readStoredOrderDraft, writeStoredOrderDraft, addOrderGroup, removeOrderGroup,
  type OrderDraft
} from "../order-draft.js";
import type { SmartChoiceLanguage } from "./catalog.js";
import { openQuickCheckout } from "./checkout-link.js";
import { orderProducts, orderProductIds } from "./shared-order.js";
import {
  quickProducts, sweetProducts, drinkCategories, matchesQuickProduct, variantsFor,
  orderGroupName, orderGroupTotal, orderGroupItems, needsOrderVariant, updateQuickGroupVariant, stepQuickGroupQuantity, type QuickProduct, type QuickOrderItem
} from "./quick-builder-domain.js";

const COPY = {
  tr: {
    eyebrow: "ROBY'S · SENİN SEÇİMİN", title: "Bugün ne iyi gider?", lead: "İçeceğini seç, yanına tatlı ekle. Siparişini burada hazırla.",
    help: "Seçmeme yardım et", all: "Tümü", search: "Kahve, çay, tatlı ara", clear: "Aramayı temizle", results: "seçenek", empty: "Bu aramada ürün bulunamadı.",
    reset: "Tüm ürünleri göster", choose: "Seç", chosen: "Seçildi", selection: "Seçimini tamamla", selectHint: "Fotoğrafa dokun, seçimini burada tamamla.",
    sweet: "Yanına bir tatlı", noSweet: "Sadece içecek", flavour: "Lezzet seç", flavourRequired: "Bir lezzet seçin", completeFlavours: "İçecek lezzetlerini seç", quantity: "Adet", pairs: "Çift adedi",
    add: "Siparişe ekle", addPair: "Çifti ekle", added: "Siparişine eklendi", chooseMore: "Başka ürün seç", limit: "Bu miktar eklenemiyor. Sepetteki adedi kontrol edin.",
    cart: "Siparişin", cartEmpty: "Henüz bir şey eklemedin.", cartHint: "İlk içeceğini seçerek başlayabilirsin.", total: "Toplam", checkout: "Siparişi hazırla · QR",
    draftNote: "QR'ı kasaya göster. Ödeme ve son onay kafede yapılır.", remove: "Kaldır", increase: "Adedi artır", decrease: "Adedi azalt", pair: "Birlikte",
    updated: "Sipariş güncellendi", removed: "Siparişten kaldırıldı", checkoutError: "Sipariş ekranı açılamadı. Yeniden deneyin.", review: "Siparişi gör",
    coffee: "Kahve molası", tea: "Çay vakti", cold: "Serin bir seçim", catalog: "Menüden seç", itemPrice: "Birim fiyat", pairPrice: "Bir çift", selectedTotal: "Eklenecek tutar"
  },
  en: {
    eyebrow: "ROBY'S · YOUR CHOICE", title: "What sounds good today?", lead: "Pick a drink, add something sweet. Put your order together right here.",
    help: "Help me choose", all: "All", search: "Search coffee, tea, desserts", clear: "Clear search", results: "choices", empty: "No products match your search.",
    reset: "Show all products", choose: "Choose", chosen: "Selected", selection: "Make it yours", selectHint: "Tap a photo to put your selection together here.",
    sweet: "Something sweet with it", noSweet: "Just the drink", flavour: "Choose a flavour", flavourRequired: "Please choose a flavour", completeFlavours: "Choose drink flavours", quantity: "Quantity", pairs: "Number of pairs",
    add: "Add to order", addPair: "Add pair", added: "Added to your order", chooseMore: "Choose more", limit: "That quantity cannot be added. Check the quantity already in your order.",
    cart: "Your order", cartEmpty: "Nothing added yet.", cartHint: "Start with your first drink.", total: "Total", checkout: "Prepare order · QR",
    draftNote: "Show the QR at the counter. Payment and final confirmation happen at the café.", remove: "Remove", increase: "Increase quantity", decrease: "Decrease quantity", pair: "Together",
    updated: "Order updated", removed: "Removed from your order", checkoutError: "The order screen could not open. Please try again.", review: "Review order",
    coffee: "Coffee break", tea: "Time for tea", cold: "Something refreshing", catalog: "Choose from the menu", itemPrice: "Unit price", pairPrice: "One pair", selectedTotal: "Amount to add"
  },
  ru: {
    eyebrow: "ROBY'S · ТВОЙ ВЫБОР", title: "Чего хочется сегодня?", lead: "Выбери напиток, добавь сладкое. Собери весь заказ прямо здесь.",
    help: "Помочь с выбором", all: "Всё", search: "Найти кофе, чай, десерт", clear: "Очистить поиск", results: "вариантов", empty: "По этому запросу ничего не нашлось.",
    reset: "Показать все товары", choose: "Выбрать", chosen: "Выбрано", selection: "Собери свой вариант", selectHint: "Нажми на фото и собери свой вариант здесь.",
    sweet: "Сладкое к напитку", noSweet: "Только напиток", flavour: "Выбери вкус", flavourRequired: "Сначала выбери вкус", completeFlavours: "Выбрать вкусы напитков", quantity: "Количество", pairs: "Количество пар",
    add: "Добавить в заказ", addPair: "Добавить пару", added: "Добавлено в заказ", chooseMore: "Выбрать ещё", limit: "Не получается добавить столько. Проверь количество в корзине.",
    cart: "Твой заказ", cartEmpty: "Пока ничего не добавлено.", cartHint: "Начни с первого напитка.", total: "Итого", checkout: "Оформить заказ · QR",
    draftNote: "Покажи QR на кассе. Оплата и окончательное подтверждение — в кафе.", remove: "Убрать", increase: "Увеличить количество", decrease: "Уменьшить количество", pair: "Вместе",
    updated: "Заказ обновлён", removed: "Убрано из заказа", checkoutError: "Не удалось открыть оформление. Попробуй ещё раз.", review: "Посмотреть заказ",
    coffee: "Кофейная пауза", tea: "Время для чая", cold: "Хочется прохлады", catalog: "Выбирай из меню", itemPrice: "Цена за штуку", pairPrice: "Одна пара", selectedTotal: "Добавится к заказу"
  }
};

let category = "all";
let query = "";
let selectedId = "";
let dessertId = "";
let variantId = "";
let quantity = 1;
let refreshBuilder: (() => void) | undefined;

function readDraft(): OrderDraft {
  return readStoredOrderDraft(orderProductIds);
}

function saveDraft(draft: OrderDraft): void {
  writeStoredOrderDraft(draft, orderProductIds);
  window.dispatchEvent(new CustomEvent("robys:order-change"));
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

export function createQuickBuilder(language: SmartChoiceLanguage, onHelp: () => void): HTMLElement {
  const text = COPY[language];
  const price = (minor: number): string => new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], {
    style: "currency", currency: "TRY", maximumFractionDigits: minor % 100 ? 2 : 0
  }).format(minor / 100);
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
  const composer = node("section", "qb-composer"); composer.id = "qb-composer";
  const cart = node("section", "qb-cart"); cart.id = "qb-cart";
  const notice = node("p", "qb-notice"); notice.setAttribute("role", "status"); notice.setAttribute("aria-live", "polite");
  side.append(composer, notice, cart);
  layout.append(catalog, side);
  const dock = node("div", "qb-cart-dock");
  const dockTotal = node("strong");
  const review = action("", "qb-dock-review", () => { cart.scrollIntoView({ block: "start", behavior: "auto" }); cart.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }); });
  review.append(node("span", "", text.review), dockTotal);
  const dockCheckout = action(text.checkout, "primary-button", () => requestCheckout(dockCheckout));
  dock.append(review, dockCheckout);
  root.append(layout, dock);

  function announce(message: string): void { notice.textContent = message; }
  function requestCheckout(button: HTMLButtonElement): void {
    const draft = readDraft();
    if (!draft.groups.length) { renderCart(); return; }
    if (needsOrderVariant(draft.groups)) {
      renderCart(); announce(text.completeFlavours);
      cart.querySelector<HTMLSelectElement>('select[aria-invalid="true"]')?.focus();
      return;
    }
    button.disabled = true;
    void openQuickCheckout(draft, language, button).catch(() => announce(text.checkoutError))
      .finally(() => { button.disabled = readDraft().groups.length === 0; });
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
        if (selectedId !== product.id) { selectedId = product.id; variantId = ""; dessertId = ""; quantity = 1; }
        announce(""); renderCatalog(); renderComposer();
        composer.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
        if (window.matchMedia("(max-width: 850px)").matches) composer.scrollIntoView({ block: "start", behavior: "auto" });
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
    const composerTitle = node("h2", "qb-section-title", text.selection); composerTitle.tabIndex = -1;
    composer.append(composerTitle);
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
    if (variants.length) {
      const field = node("label", "qb-field", text.flavour);
      const select = node("select"); select.id = "qb-flavour"; select.required = true;
      const placeholder = node("option", "", text.flavour); placeholder.value = ""; placeholder.disabled = true;
      select.append(placeholder);
      for (const variant of variants) { const option = node("option", "", variant.name[language]); option.value = variant.id; select.append(option); }
      select.value = variantId;
      select.addEventListener("change", () => { variantId = select.value; renderComposer(); composer.querySelector<HTMLSelectElement>("#qb-flavour")?.focus(); });
      field.append(select); composer.append(field);
    }
    if (drinkCategories.has(product.categoryId)) {
      const field = node("label", "qb-field", text.sweet);
      const select = node("select"); select.id = "qb-dessert";
      const none = node("option", "", text.noSweet); none.value = ""; select.append(none);
      for (const dessert of sweetProducts) {
        const option = node("option", "", `${dessert.name[language]} · +${price(dessert.unitPriceMinor)}`);
        option.value = dessert.id; select.append(option);
      }
      select.value = dessertId;
      select.addEventListener("change", () => { dessertId = select.value; renderComposer(); composer.querySelector<HTMLSelectElement>("#qb-dessert")?.focus(); });
      field.append(select); composer.append(field);
    }
    const row = node("div", "qb-quantity-row");
    row.append(node("span", "", sweet ? text.pairs : text.quantity));
    const stepper = quantityControl(quantity, 99, value => { const direction = value > quantity ? "up" : "down"; quantity = value; renderComposer();
      const target = composer.querySelector<HTMLButtonElement>(`[data-step="${direction}"]`);
      (target && !target.disabled ? target : composer.querySelector<HTMLButtonElement>("[data-step]:not(:disabled)"))?.focus(); }, product.name[language]);
    row.append(stepper); composer.append(row);
    const total = (product.unitPriceMinor + (sweet?.unitPriceMinor ?? 0)) * quantity;
    const totalRow = node("p", "qb-add-total"); totalRow.append(node("span", "", text.selectedTotal), node("strong", "", price(total)));
    const needsVariant = variants.length > 0 && !variants.some(item => item.id === variantId);
    const add = action(`${sweet ? text.addPair : text.add} · ${price(total)}`, "primary-button qb-add", () => {
      const items: QuickOrderItem[] = [{ id: product.id, quantity: 1, ...(variantId ? { variant: variantId } : {}) },
        ...(sweet ? [{ id: sweet.id, quantity: 1 }] : [])];
      const result = addOrderGroup(readDraft(), items, quantity, orderProductIds);
      if (!result.applied) { announce(text.limit); return; }
      saveDraft(result.draft);
      announce(`${text.added}: ${product.name[language]}${sweet ? ` + ${sweet.name[language]}` : ""} × ${quantity}`);
      renderCart();
    });
    add.disabled = needsVariant;
    if (needsVariant) composer.append(node("p", "qb-muted", text.flavourRequired));
    const chooseMore = action(text.chooseMore, "secondary-button qb-continue-shopping", () => {
      catalog.scrollIntoView({ block: "start", behavior: "auto" });
      search.focus({ preventScroll: true });
      if (search.value) search.select();
    });
    composer.append(totalRow, add, chooseMore);
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
      info.append(controls, remove); row.append(photos, info); cart.append(row);
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
  refreshBuilder = () => { if (root.isConnected) renderCart(); };
  return root;
}

window.addEventListener("robys:order-change", () => refreshBuilder?.());
window.addEventListener("storage", event => { if (event.key === ORDER_DRAFT_KEY || event.key === null) refreshBuilder?.(); });
