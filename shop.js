const CART_KEY = "robys-cart-v2";
const REMINDER_KEY = "robys-cake-reminder-at";
const REMINDER_SHOWN_KEY = "robys-cake-reminder-shown";
const DEFAULT_REMINDER_MS = 30 * 60 * 1000;
const DEMO_REMINDER_MS = 15 * 1000;

const productCards = Array.from(document.querySelectorAll("[data-product-id]"));
const products = new Map(
  productCards.map((card) => [
    card.dataset.productId,
    {
      id: card.dataset.productId,
      name: card.dataset.productName,
      price: Number(card.dataset.productPrice),
      card,
    },
  ])
);

const premiumAssets = {
  latte: ["src/premium-latte.b64"],
  "san-sebastian": ["src/premium-san-sebastian.b64"],
  croissant: ["src/premium-croissant.b64"],
};

const labels = {
  tr: {
    add: "Sepete ekle", added: "Eklendi", cart: "Sepet", total: "Toplam",
    qr: "Sipariş QR'ını oluştur", empty: "Sepetiniz boş", clear: "Temizle",
    qrTitle: "Siparişiniz hazır", showCashier: "Kasiyere bu QR kodunu gösterin",
    payCounter: "Ödeme kasada", pickedUp: "Siparişi teslim aldım", close: "Kapat",
    cashierTitle: "Müşteri siparişi", cashierPay: "Ödeme kasada alınacak",
    complete: "Ödendi ve teslim edildi", completed: "Sipariş teslim edildi",
    reminderSet: "30 dakika sonra tatlı önerisi göndereceğiz ☕",
    cakeTitle: "Bir tatlıya ne dersiniz?", cakeBody: "San Sebastian Cheesecake — 240 ₺",
    cakeCta: "Sepete ekle", code: "Sipariş", invalidOrder: "Sipariş kodu okunamadı",
    cartEmpty: "Önce sepete bir ürün ekleyin",
  },
  en: {
    add: "Add to cart", added: "Added", cart: "Cart", total: "Total",
    qr: "Create order QR", empty: "Your cart is empty", clear: "Clear",
    qrTitle: "Your order is ready", showCashier: "Show this QR code to the cashier",
    payCounter: "Pay at the counter", pickedUp: "I picked up my order", close: "Close",
    cashierTitle: "Customer order", cashierPay: "Payment will be taken at the counter",
    complete: "Paid and handed over", completed: "Order handed over",
    reminderSet: "We'll suggest a dessert in 30 minutes ☕",
    cakeTitle: "How about dessert?", cakeBody: "San Sebastian Cheesecake — 240 ₺",
    cakeCta: "Add to cart", code: "Order", invalidOrder: "Order code could not be read",
    cartEmpty: "Add something to the cart first",
  },
  ru: {
    add: "В корзину", added: "Добавлено", cart: "Корзина", total: "Итого",
    qr: "Получить QR заказа", empty: "Корзина пуста", clear: "Очистить",
    qrTitle: "Заказ сформирован", showCashier: "Покажите этот QR-код кассиру",
    payCounter: "Оплата на кассе", pickedUp: "Я забрал заказ", close: "Закрыть",
    cashierTitle: "Заказ клиента", cashierPay: "Клиент оплачивает на кассе",
    complete: "Оплачен и выдан", completed: "Заказ выдан",
    reminderSet: "Через 30 минут напомним о десерте ☕",
    cakeTitle: "Может, тортик?", cakeBody: "Сан-Себастьян — 240 ₺",
    cakeCta: "Добавить в корзину", code: "Заказ", invalidOrder: "Не удалось прочитать заказ",
    cartEmpty: "Сначала добавьте товар в корзину",
  },
};

let cart = loadCart();
let reminderTimer = null;
let activeOrder = null;

function currentLanguage() {
  return document.documentElement.lang || "tr";
}

function t(key) {
  return labels[currentLanguage()]?.[key] || labels.tr[key] || key;
}

function money(value) {
  return `${value} ₺`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function quantityTotal() {
  return Object.values(cart).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
}

function validatedItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.flatMap((item) => {
    const product = products.get(String(item?.id || ""));
    const quantity = Math.min(20, Math.max(0, Number.parseInt(item?.quantity ?? item?.qty, 10) || 0));
    return product && quantity ? [{ product, quantity }] : [];
  });
}

function totalsFor(items) {
  return items.reduce(
    (result, item) => {
      result.count += item.quantity;
      result.total += item.product.price * item.quantity;
      return result;
    },
    { count: 0, total: 0 }
  );
}

function ensureUi() {
  if (document.querySelector(".shop-cart")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <button class="shop-cart-button" type="button" aria-expanded="false">
      <span aria-hidden="true">🛍</span><span data-cart-button-label></span><strong data-cart-count>0</strong>
    </button>
    <aside class="shop-cart" aria-hidden="true" aria-label="Cart">
      <div class="shop-cart-head"><h3 data-cart-title></h3><button class="shop-cart-close" type="button" aria-label="Close">×</button></div>
      <div class="shop-cart-items"></div>
      <div class="shop-cart-footer">
        <div class="shop-cart-total"><span data-cart-total-label></span><strong data-cart-total>0 ₺</strong></div>
        <button class="shop-order-qr" type="button"></button>
        <button class="shop-cart-clear" type="button"></button>
      </div>
    </aside>
    <button class="shop-cart-backdrop" type="button" aria-label="Close cart"></button>

    <section class="order-modal" aria-hidden="true" role="dialog" aria-modal="true">
      <div class="order-modal-card">
        <button class="order-modal-close" type="button" aria-label="Close">×</button>
        <p class="order-kicker" data-order-code></p>
        <h3 data-order-title></h3>
        <p class="order-help" data-order-help></p>
        <div class="order-qr-frame"><img data-order-qr-image alt="Order QR code" /></div>
        <div class="order-summary" data-order-summary></div>
        <div class="order-pay-note" data-order-pay></div>
        <button class="order-picked-up" type="button"></button>
      </div>
    </section>

    <section class="cashier-modal" aria-hidden="true" role="dialog" aria-modal="true">
      <div class="cashier-card">
        <p class="order-kicker" data-cashier-code></p>
        <h3 data-cashier-title></h3>
        <div class="cashier-items" data-cashier-items></div>
        <div class="cashier-total"><span data-cashier-total-label></span><strong data-cashier-total></strong></div>
        <p class="cashier-pay-note" data-cashier-pay></p>
        <button class="cashier-complete" type="button"></button>
        <a class="cashier-home" href="./"></a>
      </div>
    </section>

    <section class="cake-offer" aria-hidden="true" role="dialog" aria-modal="true">
      <button class="cake-offer-backdrop" type="button" aria-label="Close"></button>
      <div class="cake-offer-card">
        <button class="cake-offer-close" type="button" aria-label="Close">×</button>
        <img data-cake-image alt="San Sebastian cheesecake" />
        <div><p>ROBY'S DESSERT</p><h3 data-cake-title></h3><span data-cake-body></span><button type="button" data-cake-add></button></div>
      </div>
    </section>

    <div class="shop-toast" role="status" aria-live="polite"></div>
  `);
}

function renderCart() {
  ensureUi();
  const items = validatedItems(Object.entries(cart).map(([id, quantity]) => ({ id, quantity })));
  const totals = totalsFor(items);
  const itemsNode = document.querySelector(".shop-cart-items");

  document.querySelector("[data-cart-button-label]").textContent = t("cart");
  document.querySelector("[data-cart-title]").textContent = t("cart");
  document.querySelector("[data-cart-count]").textContent = String(totals.count);
  document.querySelector("[data-cart-total-label]").textContent = t("total");
  document.querySelector("[data-cart-total]").textContent = money(totals.total);
  document.querySelector(".shop-cart-clear").textContent = t("clear");
  document.querySelector(".shop-order-qr").textContent = t("qr");

  itemsNode.innerHTML = items.length
    ? items.map(({ product, quantity }) => `<div class="shop-cart-row">
        <div><strong>${escapeHtml(product.name)}</strong><span>${money(product.price)}</span></div>
        <div class="shop-cart-stepper"><button type="button" data-cart-minus="${product.id}" aria-label="Decrease">−</button><span>${quantity}</span><button type="button" data-cart-plus="${product.id}" aria-label="Increase">+</button></div>
      </div>`).join("")
    : `<p class="shop-cart-empty">${escapeHtml(t("empty"))}</p>`;

  document.body.classList.toggle("has-cart-items", totals.count > 0);
}

function openCart() {
  document.body.classList.add("cart-open");
  document.querySelector(".shop-cart").setAttribute("aria-hidden", "false");
  document.querySelector(".shop-cart-button").setAttribute("aria-expanded", "true");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  document.querySelector(".shop-cart").setAttribute("aria-hidden", "true");
  document.querySelector(".shop-cart-button").setAttribute("aria-expanded", "false");
}

function showToast(message) {
  const toast = document.querySelector(".shop-toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function addProduct(id, button) {
  if (!products.has(id)) return;
  cart[id] = (Number(cart[id]) || 0) + 1;
  saveCart();
  renderCart();
  if (button) {
    const original = button.textContent;
    button.textContent = t("added");
    button.classList.add("is-added");
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove("is-added");
    }, 850);
  }
}

function bytesToBlobUrl(base64) {
  const clean = base64.replace(/\s+/g, "");
  if (!clean.startsWith("UklGR") || clean.length < 5000) throw new Error("Invalid WebP data");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
}

async function hydratePremiumImages() {
  await Promise.all(Object.entries(premiumAssets).map(async ([id, urls]) => {
    const product = products.get(id);
    const image = product?.card.querySelector("img");
    if (!image) return;
    product.card.classList.add("is-image-loading");
    try {
      const responses = await Promise.all(urls.map((url) => fetch(`${url}?v=2`, { cache: "no-store" })));
      if (responses.some((response) => !response.ok)) throw new Error("Image source unavailable");
      const parts = await Promise.all(responses.map((response) => response.text()));
      const blobUrl = bytesToBlobUrl(parts.join(""));
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = blobUrl;
      });
      product.card.classList.add("is-image-ready");
    } catch (error) {
      product.card.classList.add("is-image-fallback");
      console.warn("Premium image fallback used", id, error);
    } finally {
      product.card.classList.remove("is-image-loading");
      image.removeAttribute("data-premium-src");
    }
  }));
}

function createOrderId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `RBY-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const binary = unescape(encodeURIComponent(json));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodePayload(value) {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    if (parsed?.v !== 1 || typeof parsed?.id !== "string") return null;
    const items = validatedItems(parsed.items);
    return items.length ? { ...parsed, items } : null;
  } catch {
    return null;
  }
}

function buildOrder() {
  const items = validatedItems(Object.entries(cart).map(([id, quantity]) => ({ id, quantity })));
  if (!items.length) return null;
  return {
    v: 1,
    id: createOrderId(),
    createdAt: Date.now(),
    items: items.map(({ product, quantity }) => ({ id: product.id, quantity })),
  };
}

function orderUrl(order) {
  const url = new URL(`${location.origin}${location.pathname}`);
  url.searchParams.set("order", encodePayload(order));
  url.hash = "cashier-order";
  return url.toString();
}

function itemRows(items) {
  return items.map(({ product, quantity }) => `<div><span>${escapeHtml(product.name)} × ${quantity}</span><strong>${money(product.price * quantity)}</strong></div>`).join("");
}

function showOrderQr() {
  const order = buildOrder();
  if (!order) {
    showToast(t("cartEmpty"));
    return;
  }
  activeOrder = order;
  const items = validatedItems(order.items);
  const totals = totalsFor(items);
  const url = orderUrl(order);
  const qr = document.querySelector("[data-order-qr-image]");
  qr.src = `https://quickchart.io/qr?size=420&margin=2&text=${encodeURIComponent(url)}`;
  document.querySelector("[data-order-code]").textContent = `${t("code")} ${order.id}`;
  document.querySelector("[data-order-title]").textContent = t("qrTitle");
  document.querySelector("[data-order-help]").textContent = t("showCashier");
  document.querySelector("[data-order-summary]").innerHTML = `${itemRows(items)}<div class="order-summary-total"><span>${t("total")}</span><strong>${money(totals.total)}</strong></div>`;
  document.querySelector("[data-order-pay]").textContent = t("payCounter");
  document.querySelector(".order-picked-up").textContent = t("pickedUp");
  closeCart();
  document.body.classList.add("order-modal-open");
  document.querySelector(".order-modal").setAttribute("aria-hidden", "false");
}

function closeOrderModal() {
  document.body.classList.remove("order-modal-open");
  document.querySelector(".order-modal").setAttribute("aria-hidden", "true");
}

function showCashierOrder(order) {
  const items = order?.items || [];
  const modal = document.querySelector(".cashier-modal");
  if (!items.length) return;
  const totals = totalsFor(items);
  document.querySelector("[data-cashier-code]").textContent = `${t("code")} ${order.id}`;
  document.querySelector("[data-cashier-title]").textContent = t("cashierTitle");
  document.querySelector("[data-cashier-items]").innerHTML = itemRows(items);
  document.querySelector("[data-cashier-total-label]").textContent = t("total");
  document.querySelector("[data-cashier-total]").textContent = money(totals.total);
  document.querySelector("[data-cashier-pay]").textContent = t("cashierPay");
  document.querySelector(".cashier-complete").textContent = t("complete");
  document.querySelector(".cashier-home").textContent = t("close");
  document.body.classList.add("cashier-order-open");
  modal.setAttribute("aria-hidden", "false");
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

function reminderDelay() {
  return new URLSearchParams(location.search).get("reminderDemo") === "1" ? DEMO_REMINDER_MS : DEFAULT_REMINDER_MS;
}

function scheduleCakeReminder() {
  const dueAt = Date.now() + reminderDelay();
  localStorage.setItem(REMINDER_KEY, String(dueAt));
  localStorage.removeItem(REMINDER_SHOWN_KEY);
  armReminderTimer(dueAt);
}

function armReminderTimer(dueAt) {
  window.clearTimeout(reminderTimer);
  const delay = Math.max(0, dueAt - Date.now());
  reminderTimer = window.setTimeout(triggerCakeReminder, delay);
}

function cakeImageSource() {
  return products.get("san-sebastian")?.card.querySelector("img")?.src || "src/robys-gallery-signature.webp";
}

function showCakeOffer() {
  document.querySelector("[data-cake-image]").src = cakeImageSource();
  document.querySelector("[data-cake-title]").textContent = t("cakeTitle");
  document.querySelector("[data-cake-body]").textContent = t("cakeBody");
  document.querySelector("[data-cake-add]").textContent = t("cakeCta");
  document.body.classList.add("cake-offer-open");
  document.querySelector(".cake-offer").setAttribute("aria-hidden", "false");
}

function closeCakeOffer() {
  document.body.classList.remove("cake-offer-open");
  document.querySelector(".cake-offer").setAttribute("aria-hidden", "true");
}

function triggerCakeReminder() {
  if (localStorage.getItem(REMINDER_SHOWN_KEY)) return;
  localStorage.setItem(REMINDER_SHOWN_KEY, String(Date.now()));
  localStorage.removeItem(REMINDER_KEY);
  showCakeOffer();
  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(t("cakeTitle"), {
      body: t("cakeBody"),
      icon: "icon.svg",
      image: cakeImageSource().startsWith("blob:") ? undefined : cakeImageSource(),
      tag: "robys-dessert-reminder",
    });
    notification.onclick = () => {
      window.focus();
      showCakeOffer();
      notification.close();
    };
  }
}

function restoreReminder() {
  const dueAt = Number(localStorage.getItem(REMINDER_KEY));
  if (!dueAt || localStorage.getItem(REMINDER_SHOWN_KEY)) return;
  if (dueAt <= Date.now()) window.setTimeout(triggerCakeReminder, 600);
  else armReminderTimer(dueAt);
}

function confirmPickup() {
  requestNotificationPermission();
  scheduleCakeReminder();
  cart = {};
  saveCart();
  renderCart();
  closeOrderModal();
  showToast(t("reminderSet"));
}

function handleOrderFromUrl() {
  const encoded = new URLSearchParams(location.search).get("order");
  if (!encoded) return;
  const order = decodePayload(encoded);
  if (!order) {
    showToast(t("invalidOrder"));
    return;
  }
  showCashierOrder(order);
}

ensureUi();
renderCart();
hydratePremiumImages();
restoreReminder();
handleOrderFromUrl();

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add-product]");
  if (add) addProduct(add.dataset.addProduct, add);

  const plus = event.target.closest("[data-cart-plus]");
  if (plus && products.has(plus.dataset.cartPlus)) {
    cart[plus.dataset.cartPlus] = (Number(cart[plus.dataset.cartPlus]) || 0) + 1;
    saveCart();
    renderCart();
  }

  const minus = event.target.closest("[data-cart-minus]");
  if (minus) {
    const id = minus.dataset.cartMinus;
    cart[id] = Math.max(0, (Number(cart[id]) || 0) - 1);
    if (!cart[id]) delete cart[id];
    saveCart();
    renderCart();
  }

  if (event.target.closest(".shop-cart-button")) openCart();
  if (event.target.closest(".shop-cart-close, .shop-cart-backdrop")) closeCart();
  if (event.target.closest(".shop-cart-clear")) {
    cart = {};
    saveCart();
    renderCart();
  }
  if (event.target.closest(".shop-order-qr")) showOrderQr();
  if (event.target.closest(".order-modal-close")) closeOrderModal();
  if (event.target.closest(".order-picked-up")) confirmPickup();
  if (event.target.closest(".cashier-complete")) {
    event.target.textContent = t("completed");
    event.target.disabled = true;
    document.querySelector(".cashier-card").classList.add("is-complete");
  }
  if (event.target.closest(".cake-offer-close, .cake-offer-backdrop")) closeCakeOffer();
  if (event.target.closest("[data-cake-add]")) {
    addProduct("san-sebastian", event.target.closest("[data-cake-add]"));
    closeCakeOffer();
    openCart();
  }
});

new MutationObserver(() => {
  renderCart();
  if (document.body.classList.contains("cake-offer-open")) showCakeOffer();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
