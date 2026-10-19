import { addOrderGroup, normalizeOrderDraft, updateOrderGroupQuantity, updateOrderGroupVariant } from "./src/order-draft.js";
import { isHotDrink, quoteMenuSelection } from "./src/menu-pairing.js";
import { kidsComboForItems } from "./src/kids-menu.js";

let checkoutModulePromise;
let checkoutModuleRetry = 0;
function loadCheckoutModule() {
  if (!checkoutModulePromise) {
    let loading;
    if (checkoutModuleRetry) {
      const retryUrl = new URL("./order-checkout.js", import.meta.url);
      retryUrl.searchParams.set("retry", String(checkoutModuleRetry));
      loading = import(retryUrl.href);
    } else loading = import("./order-checkout.js?v=9c561c168e25");
    // A browser remembers a failed module URL. Only a later checkout action
    // starts one fresh same-origin request; a failure never retries itself.
    checkoutModulePromise = loading.catch(error => {
      checkoutModulePromise = null;
      checkoutModuleRetry += 1;
      throw error;
    });
  }
  return checkoutModulePromise;
}

// Replace one component without changing its pair, quantity, or unrelated edits.
// The editor's snapshot is checked against fresh storage before any write.
export function replaceMenuGroupItem(raw, original, itemIndex, replacement, validIds, variantIds = []) {
  const draft = normalizeOrderDraft(raw, validIds);
  const current = draft.groups.find(group => group.id === original?.id);
  const blocked = reason => ({ draft, applied: false, blocked: true, reason });
  if (!current || JSON.stringify(current) !== JSON.stringify(original)) return blocked("stale");
  if (!Number.isInteger(itemIndex) || !current.items[itemIndex] || !validIds.has(replacement?.id)
      || (variantIds.length ? !variantIds.includes(replacement.variant) : replacement.variant !== undefined)) return blocked("invalid");
  const items = [];
  current.items.forEach((item, index) => {
    const next = index === itemIndex ? { id: replacement.id, quantity: item.quantity,
      ...(replacement.variant ? { variant: replacement.variant } : {}) } : { ...item };
    const same = items.find(entry => entry.id === next.id && entry.variant === next.variant);
    if (same) same.quantity += next.quantity;
    else items.push(next);
  });
  const groups = draft.groups.map(group => group.id === current.id ? { ...group, items } : group);
  const totals = new Map();
  groups.forEach(group => group.items.forEach(item => totals.set(item.id,
    (totals.get(item.id) ?? 0) + item.quantity * group.quantity)));
  if ([...totals.values()].some(quantity => quantity > 99)) return blocked("limit");
  let recommendation = draft.recommendation;
  if (current.source === "recommendation" && recommendation) {
    const remaining = new Map();
    items.forEach(item => remaining.set(item.id, (remaining.get(item.id) ?? 0) + item.quantity * current.quantity));
    const removed = new Map(recommendation.removedLines.map(line => [line.id, line.quantity]));
    for (const line of recommendation.selectedLines) {
      const before = current.items.filter(item => item.id === line.id).reduce((sum, item) => sum + item.quantity * current.quantity, 0);
      if (before === (remaining.get(line.id) ?? 0)) continue;
      const difference = line.quantity - (remaining.get(line.id) ?? 0);
      if (difference > 0) removed.set(line.id, difference);
      else removed.delete(line.id);
    }
    recommendation = { ...recommendation, removedLines: [...removed].map(([id, quantity]) => ({ id, quantity })) };
  }
  return { draft: normalizeOrderDraft({ ...draft, groups, recommendation }, validIds), applied: true, blocked: false };
}

// Ordering dialogs are initialized only after a product/cart intent. Storage
// stays in the eager owner, including its in-memory quota-error fallback.
export function createMenuOrderUi({ menuCopy, productIndex, orderProductIds,
  initialLanguage, localized, formatPrice, formatItemCount, imageSlug,
  readDraft, writeDraft, onCartChange }) {
let language = initialLanguage;
const MAX_ITEM_QUANTITY = 99;
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
const pairingPicker = document.querySelector("#menu-pairing-picker");
const pairingPreview = document.querySelector("#menu-pairing-preview");
const cartDialog = document.querySelector("#menu-cart-dialog");
const cartLinesRoot = document.querySelector("#menu-cart-lines");
const cartEmpty = document.querySelector("#menu-cart-empty");
const cartDialogTotal = document.querySelector("#menu-cart-dialog-total");
const cartTitle = document.querySelector("#menu-cart-title");
const cartAddedSummary = document.querySelector("#menu-cart-added-summary");
const cartNextStep = document.querySelector("#menu-cart-next-step");
const cartCheckoutError = document.querySelector("#menu-cart-checkout-error");
const cartContinue = document.querySelector(".menu-cart-continue");
let lastAddedSelection = null;
let checkoutOpening = false;
let cartSession = 0;
let replacementEditor = null;
const replacementCopy = {
  tr: { replace: "Değiştir", component: "Neyi değiştirelim?", alternative: "Yerine ne istersin?", choose: "Bir ürün seç", save: "Değişimi kaydet", cancel: "Olduğu gibi bırak", total: "Yeni seçim tutarı", updated: "Sipariş güncellendi", hint: "Adet ve diğer ürünler korunur. Kaydedene kadar sipariş değişmez.", stale: "Bu seçim değişti. Sepeti kontrol edip yeniden açın.", limit: "Adet sınırına ulaşıldı. Sipariş değişmedi.", invalid: "Geçerli bir ürün ve lezzet seçin." },
  en: { replace: "Replace", component: "What should we replace?", alternative: "What would you like instead?", choose: "Choose a product", save: "Save replacement", cancel: "Keep the original", total: "Updated selection total", updated: "Order updated", hint: "Quantity and other items stay the same. Your order changes only when you save.", stale: "This selection changed. Check your order and reopen it.", limit: "The quantity limit was reached. Your order has not changed.", invalid: "Choose an available product and flavor." },
  ru: { replace: "Заменить", component: "Что заменить?", alternative: "Что выбрать вместо?", choose: "Выберите позицию", save: "Сохранить замену", cancel: "Оставить как было", total: "Новая сумма выбора", updated: "Заказ обновлён", hint: "Количество и остальные позиции сохранятся. Заказ изменится только после сохранения.", stale: "Этот выбор уже изменился. Проверьте корзину и откройте замену заново.", limit: "Достигнут предел количества. Заказ не изменился.", invalid: "Выберите доступную позицию и вкус." }
};

let selectedProductId = "";
let selectedProductQuantity = 1;
let selectedProductVariant = "";
let preferredDessertId = "";
const preferenceKey = "robys-menu-preferences.v1";
let productPreferences = {};
try {
  const stored = JSON.parse(localStorage.getItem(preferenceKey) ?? "{}");
  if (stored && typeof stored === "object" && !Array.isArray(stored)) productPreferences = stored;
} catch {}
const productUnitPrice = document.createElement("p");
productUnitPrice.id = "menu-product-unit-price";
productUnitPrice.className = "menu-product-unit-price";
productDialogPrice.after(productUnitPrice);
const variantField = document.createElement("label");
variantField.className = "menu-variant-field";
const variantLabel = document.createElement("span");
const variantSelect = document.createElement("select");
variantSelect.id = "menu-product-variant";
variantSelect.required = true;
variantField.append(variantLabel, variantSelect);
productDialogPrice.before(variantField);
const productVisual = productDialogImage.closest(".menu-product-visual");
const pairImage = document.createElement("img");
pairImage.id = "menu-product-pair-image";
pairImage.width = pairImage.height = 1024;
pairImage.hidden = true;
productDialogImage.after(pairImage);
let pairingView;
let pairingViewPromise;
let pairingRetryCount = 0;
let pairingLoading = false;
let productSession = 0;
const pairingActionCopy = {
  tr: { add: "Çifti siparişe ekle", quantity: "Çift adedi", loading: "Tatlı seçenekleri yükleniyor…", error: "Tatlı seçenekleri açılamadı. İçeceği tek başına ekleyebilirsiniz.", retry: "Tekrar dene" },
  en: { add: "Add pair to order", quantity: "Number of pairs", loading: "Loading sweet options…", error: "Sweet options could not load. You can add just the drink.", retry: "Try again" },
  ru: { add: "Добавить пару в заказ", quantity: "Количество пар", loading: "Загружаем сладкое…", error: "Не удалось открыть выбор сладкого. Можно добавить только напиток.", retry: "Попробовать ещё раз" }
};
const orderUiCopy = {
  tr: { flavor: "Lezzet seçin", required: "Önce lezzet seçin", each: "Birim fiyat", pair: "Bir çiftin fiyatı", adding: "Seçilen adet toplamı", more: "Bir seçim daha ekle", checkout: "Tamam, devam et", continue: "Başka bir şey seç", added: "Siparişine eklendi", next: "Seçimin tamam mı? Devam edebilir veya başka bir şey seçebilirsin.", payment: "Sonraki adımda kasa için QR kodunu al. Ödeme kasada yapılır.", checkoutError: "QR açılamadı. Seçimin burada duruyor; tekrar deneyebilirsin." },
  en: { flavor: "Choose a flavor", required: "Choose a flavor first", each: "Price each", pair: "Price per pair", adding: "Total for this quantity", more: "Add another selection", checkout: "All set · continue", continue: "Choose something else", added: "Added to your order", next: "Happy with your choice? Continue when ready, or choose something else.", payment: "Next, get a QR code for the cashier. Payment is at the counter.", checkoutError: "Could not open the QR. Your selection is still here; please try again." },
  ru: { flavor: "Выберите вкус", required: "Сначала выберите вкус", each: "Цена за штуку", pair: "Цена за одну пару", adding: "Сумма выбранного количества", more: "Добавить ещё", checkout: "Всё, к оформлению", continue: "Выбрать ещё", added: "Добавлено в заказ", next: "Уже всё, чего хотелось? Можно перейти к оформлению или выбрать ещё что-то.", payment: "Дальше — QR для кассира. Оплата на кассе.", checkoutError: "Не удалось открыть QR. Твой выбор сохранён здесь — попробуй ещё раз." }
};
const checkoutButton = document.querySelector("#menu-checkout-trigger") ?? document.createElement("button");
checkoutButton.id = "menu-checkout-trigger";
checkoutButton.type = "button";
checkoutButton.className = "button button-primary menu-checkout-trigger";
if (!checkoutButton.isConnected) cartContinue.before(checkoutButton);
checkoutButton.addEventListener("click", async () => {
  if (checkoutOpening) return;
  cart = readCart();
  renderCart();
  if (!orderDraft.groups.length || hasMissingVariant()) return;
  cartCheckoutError.hidden = true;
  checkoutOpening = true;
  const session = cartSession;
  checkoutButton.disabled = true;
  try {
    const { openOrderCheckout } = await loadCheckoutModule();
    if (!cartDialog.hasAttribute("open") || session !== cartSession) return;
    cart = readCart();
    if (!orderDraft.groups.length || hasMissingVariant()) return;
    const checkoutDraft = orderDraft, checkoutLanguage = language;
    await openOrderCheckout({ draft: checkoutDraft, language: checkoutLanguage, returnFocus: checkoutButton,
      shouldOpen: () => cartDialog.hasAttribute("open") && session === cartSession && language === checkoutLanguage
        && JSON.stringify(readDraft()) === JSON.stringify(checkoutDraft) });
  } catch {
    if (!cartDialog.hasAttribute("open") || session !== cartSession) return;
    cartCheckoutError.textContent = orderUiCopy[language].checkoutError;
    cartCheckoutError.hidden = false;
    cartCheckoutError.focus({ preventScroll: true });
  }
  finally { checkoutOpening = false; renderCart(); }
});
const dialogReturnFocus = new WeakMap();
const dialogOpenedAt = new WeakMap();

let orderDraft;
function readCart() {
  orderDraft = readDraft();
  return new Map(orderDraft.lines.map(line => [line.id, line.quantity]));
}

let cart = readCart();

function saveCart() {
  orderDraft = writeDraft(orderDraft);
  cart = new Map(orderDraft.lines.map(line => [line.id, line.quantity]));
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

function createButton(className, label, listener) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", listener);
  return button;
}

function setCartQuantity(id, quantity, focusControl = null, shouldAnnounce = false) {
  cart = readCart();
  const group = orderDraft.groups.find(entry => entry.id === id);
  // Apply a +/- gesture to the latest shared quantity, even before another
  // tab's storage event has replaced the row captured by this click handler.
  if (group && focusControl === "increase") quantity = group.quantity + 1;
  if (group && focusControl === "decrease") quantity = group.quantity - 1;
  const result = updateOrderGroupQuantity(orderDraft, id, quantity, orderProductIds);
  if (!result.applied) {
    renderCart();
    return;
  }
  orderDraft = result.draft;
  lastAddedSelection = null;
  cartCheckoutError.hidden = true;
  saveCart();
  renderCart(focusControl ? { id, control: focusControl } : null);
  if (shouldAnnounce && group) {
    const copy = menuCopy[language];
    const name = groupName(group);
    announceCart(quantity === 0
      ? `${copy.removedFromCart}: ${name}`
      : `${copy.quantityUpdated}: ${name} × ${quantity}`);
  }
}

function variantsFor(product) {
  return (product?.item.variants ?? []).map((variant, index) => ({
    id: variant.id ?? imageSlug(variant.name?.en ?? variant.en ?? String(index)),
    name: variant.name ?? variant.label ?? variant
  }));
}

function itemName(item) {
  const product = productIndex.get(item.id);
  if (!product) return "";
  const variant = variantsFor(product).find(entry => entry.id === item.variant);
  return `${item.quantity > 1 ? `${item.quantity} × ` : ""}${localized(product.item.name)}${variant ? ` · ${typeof variant.name === "string" ? variant.name : localized(variant.name)}` : ""}`;
}

function groupName(group) {
  const components = group.items.map(itemName).join(" + ");
  const combo = kidsComboForItems(group.items);
  return combo ? `${localized(combo.name)} · ${components}` : components;
}

function hasMissingVariant() {
  return orderDraft.groups.some(group => group.items.some(item => {
    const variants = variantsFor(productIndex.get(item.id));
    return variants.length > 0 && !variants.some(variant => variant.id === item.variant);
  }));
}

function setCartVariant(groupId, itemIndex, variant) {
  cart = readCart();
  const group = orderDraft.groups.find(entry => entry.id === groupId);
  const item = group?.items[itemIndex];
  if (!item || !variantsFor(productIndex.get(item.id)).some(entry => entry.id === variant)) return;
  orderDraft = updateOrderGroupVariant(orderDraft, groupId, itemIndex, variant, orderProductIds).draft;
  lastAddedSelection = null;
  cartCheckoutError.hidden = true;
  saveCart();
  renderCart();
  Array.from(cartLinesRoot.querySelectorAll("select[data-product-id]"))
    .find(select => select.dataset.productId === item.id && select.value === variant)?.focus({ preventScroll: true });
}

function renderVariantOptions(select, variants, selected) {
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.textContent = orderUiCopy[language].flavor;
  select.append(placeholder);
  variants.forEach(variant => {
    const option = document.createElement("option");
    option.value = variant.id;
    option.textContent = typeof variant.name === "string" ? variant.name : localized(variant.name);
    select.append(option);
  });
  select.value = selected ?? "";
}

function groupUnitPrice(group) {
  return group.items.reduce((sum, item) => sum + productIndex.get(item.id).item.price * item.quantity, 0);
}

function groupPriceLabel(group) {
  if (kidsComboForItems(group.items) || group.items.reduce((sum, item) => sum + item.quantity, 0) > 2)
    return { tr: "Bir setin fiyatı", en: "Price per set", ru: "Цена набора" }[language];
  return group.items.length > 1 ? orderUiCopy[language].pair : orderUiCopy[language].each;
}

function groupMaximum(group) {
  const requirements = new Map();
  group.items.forEach(item => requirements.set(item.id, (requirements.get(item.id) ?? 0) + item.quantity));
  return Math.min(MAX_ITEM_QUANTITY, ...Array.from(requirements, ([id, required]) =>
    group.quantity + Math.floor((MAX_ITEM_QUANTITY - (cart.get(id) ?? 0)) / required)));
}

let cartNoticeTimer;
let cartNoticeFrame;
function clearCartNotice() {
  window.clearTimeout(cartNoticeTimer);
  window.cancelAnimationFrame(cartNoticeFrame);
  cartStatuses.forEach((status) => { status.textContent = ""; });
  document.querySelector("#menu-cart-status")?.classList.remove("is-visible");
}
function announceCart(message) {
  clearCartNotice();
  cartNoticeFrame = window.requestAnimationFrame(() => {
    cartStatuses.forEach((status) => { status.textContent = message; });
    const notice = document.querySelector("#menu-cart-status");
    notice?.classList.add("is-visible");
    cartNoticeTimer = window.setTimeout(clearCartNotice, 3200);
  });
}

function startReplacement(id) {
  cart = readCart();
  const group = orderDraft.groups.find(entry => entry.id === id);
  if (!group) { renderCart(); return; }
  replacementEditor = { original: JSON.parse(JSON.stringify(group)), itemIndex: 0, productId: "", variant: "", error: "" };
  clearCartNotice();
  renderCart();
  document.querySelector("#menu-replacement-product")?.focus();
}

function saveReplacement() {
  const editor = replacementEditor;
  if (!editor) return;
  cart = readCart();
  const result = replaceMenuGroupItem(orderDraft, editor.original, editor.itemIndex,
    { id: editor.productId, ...(editor.variant ? { variant: editor.variant } : {}) },
    orderProductIds, variantsFor(productIndex.get(editor.productId)).map(variant => variant.id));
  if (!result.applied) {
    editor.error = result.reason;
    renderCart();
    announceCart(replacementCopy[language][result.reason] ?? replacementCopy[language].invalid);
    document.querySelector("#menu-replacement-error")?.focus();
    return;
  }
  orderDraft = result.draft;
  replacementEditor = null;
  lastAddedSelection = null;
  cartCheckoutError.hidden = true;
  saveCart();
  renderCart();
  cartTitle.focus({ preventScroll: true });
  announceCart(replacementCopy[language].updated);
}

function renderReplacement() {
  const editor = replacementEditor;
  const copy = replacementCopy[language];
  const root = document.createElement("div");
  root.className = "menu-cart-replacement";
  const hint = document.createElement("p");
  hint.textContent = copy.hint;
  root.append(hint);
  const field = (text, select) => {
    const label = document.createElement("label");
    label.className = "menu-variant-field";
    label.append(document.createTextNode(text), select);
    root.append(label);
  };
  const rerender = focusId => {
    editor.error = "";
    renderCart();
    document.getElementById(focusId)?.focus({ preventScroll: true });
  };
  if (editor.original.items.length > 1) {
    const component = document.createElement("select");
    component.id = "menu-replacement-component";
    editor.original.items.forEach((item, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = itemName(item);
      component.append(option);
    });
    component.value = String(editor.itemIndex);
    component.addEventListener("change", () => {
      editor.itemIndex = Number(component.value);
      editor.productId = "";
      editor.variant = "";
      rerender(component.id);
    });
    field(copy.component, component);
  }
  const select = document.createElement("select");
  select.id = "menu-replacement-product";
  select.required = true;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.textContent = copy.choose;
  select.append(placeholder);
  productIndex.forEach(product => {
    // A ready-made set cannot stand in for one component of another pair.
    if (product.category.id === "pairing-offers") return;
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = `${localized(product.item.name)} · ${formatPrice(product.item.price)}`;
    select.append(option);
  });
  select.value = editor.productId;
  select.addEventListener("change", () => {
    editor.productId = select.value;
    editor.variant = "";
    rerender(select.id);
  });
  field(`${copy.alternative} (${itemName(editor.original.items[editor.itemIndex])})`, select);
  const product = productIndex.get(editor.productId);
  const variants = variantsFor(product);
  if (variants.length) {
    const flavor = document.createElement("select");
    flavor.id = "menu-replacement-variant";
    flavor.required = true;
    renderVariantOptions(flavor, variants, editor.variant);
    flavor.addEventListener("change", () => { editor.variant = flavor.value; rerender(flavor.id); });
    field(orderUiCopy[language].flavor, flavor);
  }
  const originalTotal = groupUnitPrice(editor.original) * editor.original.quantity;
  const oldItem = editor.original.items[editor.itemIndex];
  const newTotal = product ? originalTotal
    + (product.item.price - productIndex.get(oldItem.id).item.price) * oldItem.quantity * editor.original.quantity : originalTotal;
  const total = document.createElement("p");
  total.className = "menu-cart-replacement-total";
  total.setAttribute("aria-live", "polite");
  total.textContent = `${copy.total}: ${formatPrice(originalTotal)} → ${formatPrice(newTotal)}`;
  root.append(total);
  if (editor.error) {
    const error = document.createElement("p");
    error.id = "menu-replacement-error";
    error.tabIndex = -1;
    error.setAttribute("role", "alert");
    error.textContent = copy[editor.error] ?? copy.invalid;
    root.append(error);
  }
  const actions = document.createElement("div");
  actions.className = "menu-cart-replacement-actions";
  const save = createButton("button button-primary", copy.save, saveReplacement);
  save.disabled = !product || (variants.length > 0 && !variants.some(variant => variant.id === editor.variant));
  const cancel = createButton("button button-light", copy.cancel, () => {
    replacementEditor = null;
    renderCart();
    cartTitle.focus({ preventScroll: true });
  });
  actions.append(save, cancel);
  root.append(actions);
  return root;
}

function renderCart(focusTarget = null) {
  onCartChange();
  const copy = menuCopy[language];
  const summary = cartSummary();
  const ui = orderUiCopy[language];
  cartTitle.textContent = lastAddedSelection ? ui.added : copy.cartTitle;
  cartAddedSummary.hidden = !lastAddedSelection;
  if (lastAddedSelection) cartAddedSummary.textContent = `${groupName(lastAddedSelection)} × ${lastAddedSelection.quantity} · ${formatPrice(groupUnitPrice(lastAddedSelection) * lastAddedSelection.quantity)}`;
  cartNextStep.textContent = ui.next;
  cartNextStep.hidden = summary.quantity === 0;
  cartContinue.textContent = ui.continue;
  document.querySelector("#menu-cart-draft-note").textContent = ui.payment;
  let focusCandidate = null;
  cartCount.textContent = String(summary.quantity);
  cartTriggerTotal.textContent = formatPrice(summary.total);
  cartDialogTotal.textContent = formatPrice(summary.total);
  cartTrigger.classList.toggle("has-items", summary.quantity > 0);
  const missingVariant = hasMissingVariant();
  checkoutButton.textContent = missingVariant ? orderUiCopy[language].required : orderUiCopy[language].checkout;
  checkoutButton.disabled = checkoutOpening || summary.quantity === 0 || missingVariant;
  cartTrigger.setAttribute(
    "aria-label",
    `${copy.cart}: ${summary.quantity} ${formatItemCount(summary.quantity)}, ${copy.total} ${formatPrice(summary.total)}`
  );

  cartLinesRoot.replaceChildren();
  cartEmpty.hidden = orderDraft.groups.length > 0;

  orderDraft.groups.forEach((group) => {
    const { id, quantity: lineQuantity } = group;
    const name = groupName(group);
    const line = document.createElement("article");
    line.className = "menu-cart-line";
    line.setAttribute("aria-label", name);

    const images = document.createElement("div");
    images.className = "menu-cart-group-images";
    group.items.forEach(item => {
      const image = document.createElement("img");
      image.src = productIndex.get(item.id).image;
      image.alt = "";
      image.width = image.height = 128;
      image.loading = "eager";
      image.decoding = "async";
      images.append(image);
    });

    const details = document.createElement("div");
    details.className = "menu-cart-line-details";
    const title = document.createElement("strong");
    title.textContent = name;
    const unit = document.createElement("span");
    unit.textContent = `${groupPriceLabel(group)}: ${formatPrice(groupUnitPrice(group))} × ${lineQuantity}`;
    details.append(title, unit);
    group.items.forEach((item, itemIndex) => {
      const variants = variantsFor(productIndex.get(item.id));
      if (!variants.length) return;
      const label = document.createElement("label");
      label.className = "menu-variant-field";
      label.textContent = orderUiCopy[language].flavor;
      const select = document.createElement("select");
      select.required = true;
      select.dataset.productId = item.id;
      renderVariantOptions(select, variants, item.variant);
      select.addEventListener("change", () => setCartVariant(id, itemIndex, select.value));
      label.append(select);
      details.append(label);
    });

    const controls = document.createElement("div");
    controls.className = "menu-cart-line-controls";
    const decrease = createButton("menu-cart-step", "−", () => setCartQuantity(id, lineQuantity - 1, "decrease", true));
    decrease.setAttribute("aria-label", `${copy.decrease}: ${name}`);
    const count = document.createElement("span");
    count.textContent = String(lineQuantity);
    const increase = createButton("menu-cart-step", "+", () => setCartQuantity(id, lineQuantity + 1, "increase", true));
    increase.setAttribute("aria-label", `${copy.increase}: ${name}`);
    increase.disabled = lineQuantity >= groupMaximum(group);
    const remove = createButton("menu-cart-remove", copy.remove, () => {
      setCartQuantity(id, 0, "remove", true);
    });
    remove.setAttribute("aria-label", `${copy.remove}: ${name}`);
    const replace = createButton("menu-cart-replace", replacementCopy[language].replace, () => startReplacement(id));
    replace.setAttribute("aria-label", `${replacementCopy[language].replace}: ${name}`);
    replace.setAttribute("aria-expanded", String(replacementEditor?.original.id === id));
    controls.append(decrease, count, increase, replace, remove);

    const lineTotal = document.createElement("strong");
    lineTotal.className = "menu-cart-line-total";
    lineTotal.textContent = formatPrice(groupUnitPrice(group) * lineQuantity);
    line.append(images, details, controls, lineTotal);
    if (replacementEditor?.original.id === id) line.append(renderReplacement());
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

function openDialog(dialog, initialFocus = null, returnFocus = document.activeElement) {
  if (dialog === cartDialog) cartSession += 1;
  dialogOpenedAt.set(dialog, performance.now());
  dialogReturnFocus.set(dialog, returnFocus);
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.classList.add("menu-dialog--fallback");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("open", "");
  }
  if (initialFocus || dialog.classList.contains("menu-dialog--fallback")) window.requestAnimationFrame(() => {
    if (dialog.hasAttribute("open") && !document.querySelector(".order-checkout-dialog[open]")) {
      (initialFocus ?? dialog.querySelector("[data-menu-dialog-close]"))?.focus({ preventScroll: true });
    }
  });
  document.body.classList.add("menu-dialog-open");
}

function closeDialog(dialog) {
  if (dialog === productDialog) {
    productSession += 1;
    pairingView?.clear();
    pairingPicker.hidden = true;
    pairingPreview.hidden = true;
  }
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
    'button:not([disabled]):not([hidden]),a[href]:not([hidden]),input:not([disabled]):not([hidden]),select:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"]):not([hidden])'
  )).filter((control) => control.tabIndex >= 0 && !control.matches(":disabled")
    && control.getClientRects().length > 0
    && (control.type !== "radio" || control.checked));
}

document.addEventListener("keydown", (event) => {
  const dialog = document.querySelector(".menu-dialog[open]");
  if (!dialog || !dialog.contains(event.target)) return;
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

function selectedProducts() {
  const product = productIndex.get(selectedProductId);
  if (!product) return [];
  const sweet = isHotDrink(product) ? pairingView?.getSelectedProduct() : null;
  return sweet ? [product, productIndex.get(sweet.id)] : [product];
}

function rememberSelection() {
  if (!selectedProductId || pairingLoading) return;
  productPreferences[selectedProductId] = {
    dessertId: pairingView?.getSelectedProduct()?.id ?? "",
    quantity: selectedProductQuantity,
    variant: selectedProductVariant
  };
  try { localStorage.setItem(preferenceKey, JSON.stringify(productPreferences)); } catch {}
}

function updateProductQuantity() {
  const products = selectedProducts();
  if (!products.length) return;
  const copy = menuCopy[language];
  const { availableQuantity, quantity, total } = quoteMenuSelection(cart, products, selectedProductQuantity, MAX_ITEM_QUANTITY);
  selectedProductQuantity = quantity;
  productQuantityOutput.textContent = String(selectedProductQuantity);
  productDecrease.disabled = availableQuantity === 0 || selectedProductQuantity <= 1;
  productIncrease.disabled = availableQuantity === 0 || selectedProductQuantity >= availableQuantity;
  const product = products[0];
  const missingVariant = variantsFor(product).length > 0 && !variantsFor(product).some(variant => variant.id === selectedProductVariant);
  const waitingForPair = pairingLoading && Boolean(preferredDessertId);
  const ui = orderUiCopy[language];
  const names = products.map((entry, index) => itemName({ id: entry.id, quantity: 1, ...(index === 0 && selectedProductVariant ? { variant: selectedProductVariant } : {}) }));
  productDialogTitle.textContent = names.join(" + ");
  productDialogPrice.textContent = formatPrice(total);
  productDialogPrice.setAttribute("aria-label", `${ui.adding}: ${formatPrice(total)}`);
  const unitTotal = products.reduce((sum, entry) => sum + entry.item.price, 0);
  productUnitPrice.textContent = `${products.length === 2 ? ui.pair : ui.each}: ${formatPrice(unitTotal)} · × ${selectedProductQuantity}`;
  const sweet = products[1];
  productVisual.classList.toggle("has-selected-pair", Boolean(sweet));
  pairImage.hidden = !sweet;
  if (sweet) {
    pairImage.src = sweet.image;
    pairImage.alt = localized(sweet.item.name);
  } else pairImage.removeAttribute("src");
  addToCartButton.disabled = availableQuantity === 0 || missingVariant || waitingForPair;
  addToCartButton.textContent = waitingForPair ? pairingActionCopy[language].loading : missingVariant ? ui.required : availableQuantity === 0
    ? copy.maxQuantity
    : `${cart.has(product.id) ? ui.more : products.length === 2 ? pairingActionCopy[language].add : copy.addToCart} · ${formatPrice(total)}`;
  document.querySelector("#menu-quantity-label").textContent = products.length === 2
    ? pairingActionCopy[language].quantity : copy.quantity;
}

async function loadPairingPicker(product, session, retryLoad = false) {
  pairingPicker.hidden = false;
  if (pairingView) {
    pairingLoading = false;
    pairingView.render(product, language, true, preferredDessertId);
    updateProductQuantity();
    return;
  }
  const status = document.createElement("p");
  pairingLoading = true;
  updateProductQuantity();
  status.className = "menu-pairing-loading";
  status.setAttribute("role", "status");
  status.textContent = pairingActionCopy[language].loading;
  pairingPicker.replaceChildren(status);
  delete pairingPicker.dataset.ready;
  try {
    // A failed module import is cached by the browser. Give an explicit retry
    // a new, fixed same-origin URL so a recovered connection can fetch again.
    if (retryLoad) {
      const retryUrl = new URL("./menu-pairing.js", import.meta.url);
      retryUrl.searchParams.set("retry", String(++pairingRetryCount));
      pairingViewPromise = import(retryUrl.href);
    }
    pairingViewPromise ??= import("./menu-pairing.js?v=c0e800261c91");
    const module = await pairingViewPromise;
    if (session !== productSession || selectedProductId !== product.id || !productDialog.hasAttribute("open")) return;
    pairingLoading = false;
    pairingView ??= module.createMenuPairingView({ root: pairingPicker, preview: pairingPreview,
      productIndex, onChange: () => { updateProductQuantity(); rememberSelection(); }, localized, formatPrice });
    pairingView.render(product, language, true, preferredDessertId);
    updateProductQuantity();
  } catch {
    pairingViewPromise = null;
    if (session !== productSession || selectedProductId !== product.id || !productDialog.hasAttribute("open")) return;
    pairingLoading = false;
    preferredDessertId = "";
    status.textContent = pairingActionCopy[language].error;
    const retry = createButton("button button-light menu-pairing-retry", pairingActionCopy[language].retry,
      () => { void loadPairingPicker(productIndex.get(selectedProductId), productSession, true); });
    pairingPicker.replaceChildren(status, retry);
    updateProductQuantity();
  }
}

function hydrateProductDialog() {
  const product = productIndex.get(selectedProductId);
  if (!product) return;
  productDialogImage.src = product.image;
  productDialogImage.alt = localized(product.item.imageAlt ?? product.item.name);
  productDialogCategory.textContent = localized(product.category.name);
  productDialogTitle.textContent = localized(product.item.name);
  productDialogPrice.textContent = formatPrice(product.item.price);
  const description = localized(product.item.description);
  productDialogDescription.textContent = description;
  productDialogDescription.hidden = !description;
  const variants = variantsFor(product);
  variantField.hidden = variants.length === 0;
  variantLabel.textContent = orderUiCopy[language].flavor;
  renderVariantOptions(variantSelect, variants, selectedProductVariant);
  if (pairingView && productDialog.hasAttribute("open")) pairingView.render(product, language);
  updateProductQuantity();
}

function openProduct(id, returnFocus) {
  if (!productIndex.has(id)) return;
  clearCartNotice();
  selectedProductId = id;
  const preference = productPreferences[id];
  selectedProductQuantity = Number.isInteger(preference?.quantity) && preference.quantity > 0 ? Math.min(MAX_ITEM_QUANTITY, preference.quantity) : 1;
  selectedProductVariant = variantsFor(productIndex.get(id)).some(variant => variant.id === preference?.variant) ? preference.variant : "";
  preferredDessertId = typeof preference?.dessertId === "string" ? preference.dessertId : "";
  pairingLoading = Boolean(preferredDessertId) && !pairingView;
  cart = readCart();
  productSession += 1;
  pairingView?.clear();
  pairingPicker.hidden = true;
  pairingPreview.hidden = true;
  productDialog.classList.toggle("has-custom-pairing", isHotDrink(productIndex.get(id)));
  hydrateProductDialog();
  openDialog(productDialog, null, returnFocus);
  document.querySelector(".menu-product-main").scrollTop = 0;
  if (isHotDrink(productIndex.get(id))) void loadPairingPicker(productIndex.get(id), productSession);
}

function addSelectedProduct() {
  const product = productIndex.get(selectedProductId);
  if (!product) return;
  const copy = menuCopy[language];
  if (addToCartButton.disabled) return;
  cart = readCart();
  const products = selectedProducts();
  const selection = addOrderGroup(orderDraft, products.map((entry, index) => ({ id: entry.id,
    ...(index === 0 && selectedProductVariant ? { variant: selectedProductVariant } : {}) })), selectedProductQuantity, orderProductIds);
  if (!selection.applied) {
    announceCart(`${copy.maxQuantity}: ${localized(product.item.name)}`);
    updateProductQuantity();
    return;
  }
  orderDraft = selection.draft;
  clearCartNotice();
  rememberSelection();
  saveCart();
  lastAddedSelection = { items: products.map((entry, index) => ({ id: entry.id, quantity: 1,
    ...(index === 0 && selectedProductVariant ? { variant: selectedProductVariant } : {}) })), quantity: selectedProductQuantity };
  cartCheckoutError.hidden = true;
  renderCart();
  const returnFocus = dialogReturnFocus.get(productDialog) ?? cartTrigger;
  closeDialog(productDialog);
  openDialog(cartDialog, cartTitle, returnFocus);
  cartLinesRoot.scrollTop = 0;
}

function addKidsCombo(combo, returnFocus) {
  const canonical = kidsComboForItems(combo?.items);
  if (!canonical || canonical.id !== combo.id
      || canonical.items.some(item => !orderProductIds.has(item.id))) return false;
  cart = readCart();
  const selection = addOrderGroup(orderDraft, canonical.items, 1, orderProductIds);
  if (!selection.applied) return false;
  orderDraft = selection.draft;
  replacementEditor = null;
  clearCartNotice();
  saveCart();
  lastAddedSelection = { items: canonical.items.map(item => ({ ...item })), quantity: 1 };
  cartCheckoutError.hidden = true;
  renderCart();
  openDialog(cartDialog, cartTitle, returnFocus);
  cartLinesRoot.scrollTop = 0;
  return true;
}

productDecrease.addEventListener("click", () => {
  selectedProductQuantity = Math.max(1, selectedProductQuantity - 1);
  updateProductQuantity();
  rememberSelection();
});

productIncrease.addEventListener("click", () => {
  selectedProductQuantity = Math.min(MAX_ITEM_QUANTITY, selectedProductQuantity + 1);
  updateProductQuantity();
  rememberSelection();
});

variantSelect.addEventListener("change", () => {
  selectedProductVariant = variantSelect.value;
  updateProductQuantity();
  rememberSelection();
});

addToCartButton.addEventListener("click", addSelectedProduct);

document.querySelectorAll("[data-menu-dialog-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closeDialog(button.dataset.menuDialogClose === "product" ? productDialog : cartDialog);
  });
});

[productDialog, cartDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    // A second tap on Add can land on the newly opened cart's backdrop.
    // Keep that same gesture from dismissing the confirmation. Explicit
    // close buttons and Escape remain available immediately.
    if (event.target !== dialog || performance.now() - dialogOpenedAt.get(dialog) < 500) return;
    const rect = dialog.querySelector(".menu-dialog-shell").getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
  });
  dialog.addEventListener("close", () => {
    if (!document.querySelector(".menu-dialog[open]")) {
      document.body.classList.remove("menu-dialog-open");
    }
  });
});


function refresh({ nextLanguage = language, resetAdded = false } = {}) {
  if (nextLanguage !== language) clearCartNotice();
  language = nextLanguage;
  cart = readCart();
  if (resetAdded) lastAddedSelection = null;
  const copy = menuCopy[language];
  productDecrease.setAttribute("aria-label", copy.decrease);
  productIncrease.setAttribute("aria-label", copy.increase);
  document.querySelectorAll(".menu-dialog-close[data-menu-dialog-close]").forEach(button => button.setAttribute("aria-label", copy.close));
  if (selectedProductId) hydrateProductDialog();
  renderCart();
}
function openCart(returnFocus) {
  replacementEditor = null;
  clearCartNotice();
  refresh({ resetAdded: true });
  cartCheckoutError.hidden = true;
  openDialog(cartDialog, cartTitle, returnFocus);
}
refresh();
return { openProduct, openCart, addKidsCombo, refresh };
}
