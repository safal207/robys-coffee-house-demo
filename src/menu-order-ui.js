import { addOrderGroup, replaceOrderGroup, updateOrderGroupQuantity, updateOrderGroupVariant } from "./src/order-draft.js";
import { getSweetProducts, isHotDrink, quoteMenuSelection } from "./src/menu-pairing.js";

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
let lastSelectionWasEdit = false;
let editingGroup = null;
let editingCartReturnFocus = null;
let checkoutOpening = false;
let cartSession = 0;

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
  tr: { flavor: "Lezzet seçin", required: "Önce lezzet seçin", each: "Birim fiyat", pair: "Bir çiftin fiyatı", adding: "Seçilen adet toplamı", more: "Bir seçim daha ekle", checkout: "Kasa için QR oluştur", continue: "Başka bir şey seç", added: "Siparişine eklendi", next: "Seçimin tamam mı? Devam edebilir veya başka bir şey seçebilirsin.", payment: "Sonraki adımda kasa için QR kodunu al. Ödeme kasada yapılır.", checkoutError: "QR açılamadı. Seçimin burada duruyor; tekrar deneyebilirsin." },
  en: { flavor: "Choose a flavor", required: "Choose a flavor first", each: "Price each", pair: "Price per pair", adding: "Total for this quantity", more: "Add another selection", checkout: "Get QR for the counter", continue: "Choose something else", added: "Added to your order", next: "Happy with your choice? Continue when ready, or choose something else.", payment: "Next, get a QR code for the cashier. Payment is at the counter.", checkoutError: "Could not open the QR. Your selection is still here; please try again." },
  ru: { flavor: "Выберите вкус", required: "Сначала выберите вкус", each: "Цена за штуку", pair: "Цена за одну пару", adding: "Сумма выбранного количества", more: "Добавить ещё", checkout: "Получить QR для кассы", continue: "Выбрать ещё", added: "Добавлено в заказ", next: "Уже всё, чего хотелось? Можно перейти к оформлению или выбрать ещё что-то.", payment: "Дальше — QR для кассира. Оплата на кассе.", checkoutError: "Не удалось открыть QR. Твой выбор сохранён здесь — попробуй ещё раз." }
};
const editCopy = {
  tr: { edit: "Seçimi değiştir", save: "Değişiklikleri kaydet", saved: "Seçimin güncellendi", stale: "Bu seçim başka bir yerde değiştirildi. Sepete dönüp güncel seçimi yeniden aç." },
  en: { edit: "Edit selection", save: "Save changes", saved: "Selection updated", stale: "This selection changed elsewhere. Return to your order and reopen the current selection." },
  ru: { edit: "Изменить состав", save: "Сохранить изменения", saved: "Состав обновлён", stale: "Этот состав уже изменён в другом окне. Вернись в заказ и открой актуальный состав снова." }
};
const productEditError = document.createElement("p");
productEditError.id = "menu-product-edit-error";
productEditError.className = "menu-cart-checkout-error";
productEditError.setAttribute("role", "alert");
productEditError.tabIndex = -1;
productEditError.hidden = true;
productUnitPrice.after(productEditError);
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
    const { openOrderCheckout } = await import("./order-checkout.js?v=6aa30239d031");
    if (!cartDialog.hasAttribute("open") || session !== cartSession) return;
    cart = readCart();
    if (!orderDraft.groups.length || hasMissingVariant()) return;
    await openOrderCheckout({ draft: orderDraft, language, returnFocus: checkoutButton });
  } catch {
    if (!cartDialog.hasAttribute("open") || session !== cartSession) return;
    cartCheckoutError.textContent = orderUiCopy[language].checkoutError;
    cartCheckoutError.hidden = false;
    cartCheckoutError.focus({ preventScroll: true });
  }
  finally { checkoutOpening = false; renderCart(); }
});
const dialogReturnFocus = new WeakMap();

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

function groupName(group) { return group.items.map(itemName).join(" + "); }

function editablePair(group) {
  if (!group || group.items.length !== 2 || group.items.some(item => item.quantity !== 1)) return null;
  const drink = group.items.find(item => isHotDrink(productIndex.get(item.id)));
  const sweets = new Set(getSweetProducts(productIndex).map(product => product.id));
  const sweet = group.items.find(item => sweets.has(item.id));
  return drink && sweet ? { drink, sweet } : null;
}

function editCartGroup(id) {
  cart = readCart();
  const group = orderDraft.groups.find(entry => entry.id === id);
  const pair = editablePair(group);
  if (!pair) { renderCart(); return; }
  const returnFocus = dialogReturnFocus.get(cartDialog) ?? cartTrigger;
  closeDialog(cartDialog);
  openProduct(pair.drink.id, cartTrigger, group);
  editingCartReturnFocus = returnFocus;
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

function groupMaximum(group) {
  const requirements = new Map();
  group.items.forEach(item => requirements.set(item.id, (requirements.get(item.id) ?? 0) + item.quantity));
  return Math.min(MAX_ITEM_QUANTITY, ...Array.from(requirements, ([id, required]) =>
    group.quantity + Math.floor((MAX_ITEM_QUANTITY - (cart.get(id) ?? 0)) / required)));
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

function renderCart(focusTarget = null) {
  onCartChange();
  const copy = menuCopy[language];
  const summary = cartSummary();
  const ui = orderUiCopy[language];
  cartTitle.textContent = lastAddedSelection ? lastSelectionWasEdit ? editCopy[language].saved : ui.added : copy.cartTitle;
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
      image.loading = "lazy";
      image.decoding = "async";
      images.append(image);
    });

    const details = document.createElement("div");
    details.className = "menu-cart-line-details";
    const title = document.createElement("strong");
    title.textContent = name;
    const unit = document.createElement("span");
    unit.textContent = `${group.items.length > 1 ? orderUiCopy[language].pair : orderUiCopy[language].each}: ${formatPrice(groupUnitPrice(group))} × ${lineQuantity}`;
    details.append(title, unit);
    let editButton;
    if (editablePair(group)) {
      editButton = createButton("button button-light menu-cart-edit", editCopy[language].edit, () => editCartGroup(id));
      editButton.setAttribute("aria-label", `${editCopy[language].edit}: ${name}`);
      details.append(editButton);
    }
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
    controls.append(decrease, count, increase, remove);

    const lineTotal = document.createElement("strong");
    lineTotal.className = "menu-cart-line-total";
    lineTotal.textContent = formatPrice(groupUnitPrice(group) * lineQuantity);
    line.append(images, details, controls, lineTotal);
    cartLinesRoot.append(line);

    if (focusTarget?.id === id) {
      focusCandidate = focusTarget.control === "edit" && editButton ? editButton
        : focusTarget.control === "increase" && !increase.disabled ? increase : decrease;
    }
  });

  if (focusTarget) {
    const fallback = cartLinesRoot.querySelector("button:not([disabled])")
      ?? cartDialog.querySelector("[data-menu-dialog-close]");
    (focusCandidate ?? fallback)?.focus({ preventScroll: true });
    return focusCandidate ?? fallback;
  }
}

function openDialog(dialog, initialFocus = null, returnFocus = document.activeElement) {
  if (dialog === cartDialog) cartSession += 1;
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
  const cancelledEdit = dialog === productDialog ? editingGroup : null;
  const cartReturnFocus = editingCartReturnFocus;
  if (dialog === productDialog) {
    editingGroup = null;
    editingCartReturnFocus = null;
    productEditError.hidden = true;
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
  if (cancelledEdit) {
    cart = readCart();
    const focus = renderCart({ id: cancelledEdit.id, control: "edit" });
    openDialog(cartDialog, focus ?? cartTitle, cartReturnFocus ?? cartTrigger);
    focus?.focus({ preventScroll: true });
  } else if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
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
  if (!selectedProductId || pairingLoading || editingGroup) return;
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
  const quoteCart = new Map(cart);
  if (editingGroup) editingGroup.items.forEach(item => {
    quoteCart.set(item.id, Math.max(0, (quoteCart.get(item.id) ?? 0) - item.quantity * editingGroup.quantity));
  });
  const { availableQuantity, quantity, unitTotal } = quoteMenuSelection(quoteCart, products, selectedProductQuantity, MAX_ITEM_QUANTITY);
  if (!editingGroup) selectedProductQuantity = quantity;
  const total = unitTotal * selectedProductQuantity;
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
  productUnitPrice.textContent = `${products.length === 2 ? ui.pair : ui.each}: ${formatPrice(unitTotal)} · × ${selectedProductQuantity}`;
  const sweet = products[1];
  productVisual.classList.toggle("has-selected-pair", Boolean(sweet));
  pairImage.hidden = !sweet;
  if (sweet) {
    pairImage.src = sweet.image;
    pairImage.alt = localized(sweet.item.name);
  } else pairImage.removeAttribute("src");
  const atLimit = availableQuantity === 0 || selectedProductQuantity > availableQuantity;
  addToCartButton.disabled = atLimit || missingVariant || waitingForPair;
  addToCartButton.textContent = waitingForPair ? pairingActionCopy[language].loading : missingVariant ? ui.required : atLimit
    ? copy.maxQuantity
    : `${editingGroup ? editCopy[language].save : cart.has(product.id) ? ui.more : products.length === 2 ? pairingActionCopy[language].add : copy.addToCart} · ${formatPrice(total)}`;
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
    pairingViewPromise ??= import("./menu-pairing.js?v=b58eeb51ad92");
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

function openProduct(id, returnFocus, originalGroup = null) {
  if (!productIndex.has(id)) return;
  editingGroup = originalGroup ? { ...originalGroup, items: originalGroup.items.map(item => ({ ...item })) } : null;
  editingCartReturnFocus = null;
  productEditError.hidden = true;
  selectedProductId = id;
  const preference = productPreferences[id];
  const pair = editablePair(editingGroup);
  selectedProductQuantity = editingGroup?.quantity ?? (Number.isInteger(preference?.quantity) && preference.quantity > 0 ? Math.min(MAX_ITEM_QUANTITY, preference.quantity) : 1);
  selectedProductVariant = pair ? pair.drink.variant ?? "" : variantsFor(productIndex.get(id)).some(variant => variant.id === preference?.variant) ? preference.variant : "";
  preferredDessertId = pair ? pair.sweet.id : typeof preference?.dessertId === "string" ? preference.dessertId : "";
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
  const items = products.map((entry, index) => ({ id: entry.id, quantity: 1,
    ...(index === 0 && selectedProductVariant ? { variant: selectedProductVariant } : {}) }));
  const selection = editingGroup
    ? replaceOrderGroup(orderDraft, editingGroup, items, selectedProductQuantity, orderProductIds)
    : addOrderGroup(orderDraft, items, selectedProductQuantity, orderProductIds);
  if (!selection.applied) {
    if (editingGroup) {
      productEditError.textContent = selection.stale ? editCopy[language].stale : copy.maxQuantity;
      productEditError.hidden = false;
      productEditError.focus({ preventScroll: true });
      productEditError.scrollIntoView({ block: "center", inline: "nearest" });
    } else announceCart(`${copy.maxQuantity}: ${localized(product.item.name)}`);
    updateProductQuantity();
    return;
  }
  const wasEdit = Boolean(editingGroup);
  const editReturnFocus = editingCartReturnFocus;
  orderDraft = selection.draft;
  rememberSelection();
  saveCart();
  lastAddedSelection = { items, quantity: selectedProductQuantity };
  lastSelectionWasEdit = wasEdit;
  cartCheckoutError.hidden = true;
  renderCart();
  const returnFocus = wasEdit ? editReturnFocus ?? cartTrigger : dialogReturnFocus.get(productDialog) ?? cartTrigger;
  editingGroup = null;
  editingCartReturnFocus = null;
  closeDialog(productDialog);
  openDialog(cartDialog, cartTitle, returnFocus);
  cartLinesRoot.scrollTop = 0;
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
    if (event.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener("close", () => {
    if (!document.querySelector(".menu-dialog[open]")) {
      document.body.classList.remove("menu-dialog-open");
    }
  });
});


function refresh({ nextLanguage = language, resetAdded = false } = {}) {
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
  refresh({ resetAdded: true });
  cartCheckoutError.hidden = true;
  openDialog(cartDialog, cartTitle, returnFocus);
}
refresh();
return { openProduct, openCart, refresh };
}
