const CART_KEY = "robys-cart-v2";

const productCards = Array.from(document.querySelectorAll("[data-product-id]"));
const products = new Map(
  productCards.map((card) => [
    card.dataset.productId,
    {
      id: card.dataset.productId,
      name: card.dataset.productName,
      price: Number(card.dataset.productPrice),
    },
  ])
);

const labels = {
  tr: {
    add: "Sepete ekle",
    added: "Eklendi",
    cart: "Sepet",
    total: "Toplam",
    empty: "Sepetiniz boş",
    clear: "Temizle",
    qr: "Sipariş QR'ını oluştur",
    qrTitle: "Siparişiniz hazır",
    qrHelp: "Kasiyere bu QR kodunu gösterin",
    close: "Kapat",
  },
  en: {
    add: "Add to cart",
    added: "Added",
    cart: "Cart",
    total: "Total",
    empty: "Your cart is empty",
    clear: "Clear",
    qr: "Create order QR",
    qrTitle: "Your order is ready",
    qrHelp: "Show this QR code to the cashier",
    close: "Close",
  },
  ru: {
    add: "В корзину",
    added: "Добавлено",
    cart: "Корзина",
    total: "Итого",
    empty: "Корзина пуста",
    clear: "Очистить",
    qr: "Получить QR заказа",
    qrTitle: "Заказ сформирован",
    qrHelp: "Покажите этот QR-код кассиру",
    close: "Закрыть",
  },
};

let cart = loadCart();

function language() {
  return document.documentElement.lang || "tr";
}

function t(key) {
  return labels[language()]?.[key] || labels.tr[key] || key;
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
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function items() {
  return Object.entries(cart).flatMap(([id, quantity]) => {
    const product = products.get(id);
    const count = Math.max(0, Number.parseInt(quantity, 10) || 0);
    return product && count ? [{ product, quantity: count }] : [];
  });
}

function totals() {
  return items().reduce(
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

  document.body.insertAdjacentHTML(
    "beforeend",
    `<button class="shop-cart-button" type="button" aria-expanded="false">
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
        <h3 data-order-title></h3>
        <p class="order-help" data-order-help></p>
        <div class="order-qr-frame"><img data-order-qr-image alt="Order QR code" /></div>
        <div class="order-summary" data-order-summary></div>
        <button class="order-picked-up" type="button"></button>
      </div>
    </section>
    <div class="shop-toast" role="status" aria-live="polite"></div>`
  );
}

function renderCart() {
  ensureUi();
  const cartItems = items();
  const summary = totals();
  const list = document.querySelector(".shop-cart-items");

  document.querySelector("[data-cart-button-label]").textContent = t("cart");
  document.querySelector("[data-cart-title]").textContent = t("cart");
  document.querySelector("[data-cart-count]").textContent = String(summary.count);
  document.querySelector("[data-cart-total-label]").textContent = t("total");
  document.querySelector("[data-cart-total]").textContent = money(summary.total);
  document.querySelector(".shop-cart-clear").textContent = t("clear");
  document.querySelector(".shop-order-qr").textContent = t("qr");

  document.querySelectorAll("[data-mobile-cart-label]").forEach((node) => {
    node.textContent = t("cart");
  });
  document.querySelectorAll("[data-mobile-cart-count]").forEach((node) => {
    node.textContent = String(summary.count);
  });

  list.innerHTML = cartItems.length
    ? cartItems
        .map(
          ({ product, quantity }) => `<div class="shop-cart-row">
            <div><strong>${escapeHtml(product.name)}</strong><span>${money(product.price)}</span></div>
            <div class="shop-cart-stepper">
              <button type="button" data-cart-minus="${product.id}" aria-label="Decrease">−</button>
              <span>${quantity}</span>
              <button type="button" data-cart-plus="${product.id}" aria-label="Increase">+</button>
            </div>
          </div>`
        )
        .join("")
    : `<p class="shop-cart-empty">${escapeHtml(t("empty"))}</p>`;

  document.body.classList.toggle("has-cart-items", summary.count > 0);
}

function openCart() {
  renderCart();
  document.body.classList.add("cart-open");
  document.querySelector(".shop-cart").setAttribute("aria-hidden", "false");
  document.querySelector(".shop-cart-button").setAttribute("aria-expanded", "true");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  document.querySelector(".shop-cart").setAttribute("aria-hidden", "true");
  document.querySelector(".shop-cart-button").setAttribute("aria-expanded", "false");
}

function toast(message) {
  const node = document.querySelector(".shop-toast");
  node.textContent = message;
  node.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-visible"), 1800);
}

function addProduct(id, button) {
  if (!products.has(id)) return;
  cart[id] = (Number(cart[id]) || 0) + 1;
  saveCart();
  renderCart();

  if (button) {
    button.textContent = t("added");
    button.classList.add("is-added");
    setTimeout(() => {
      button.textContent = t("add");
      button.classList.remove("is-added");
    }, 700);
  }
}

function orderPayload() {
  const orderItems = items();
  if (!orderItems.length) return null;
  return {
    id: `RBY-${Date.now().toString(36).toUpperCase().slice(-7)}`,
    createdAt: Date.now(),
    items: orderItems.map(({ product, quantity }) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity,
    })),
    total: totals().total,
  };
}

function showOrderQr() {
  const order = orderPayload();
  if (!order) return;

  const text = JSON.stringify(order);
  document.querySelector("[data-order-title]").textContent = t("qrTitle");
  document.querySelector("[data-order-help]").textContent = t("qrHelp");
  document.querySelector("[data-order-qr-image]").src = `https://quickchart.io/qr?size=420&margin=2&text=${encodeURIComponent(text)}`;
  document.querySelector("[data-order-summary]").innerHTML = `${order.items
    .map((item) => `<div><span>${escapeHtml(item.name)} × ${item.quantity}</span><strong>${money(item.price * item.quantity)}</strong></div>`)
    .join("")}<div class="order-summary-total"><span>${t("total")}</span><strong>${money(order.total)}</strong></div>`;
  document.querySelector(".order-picked-up").textContent = t("close");
  closeCart();
  document.body.classList.add("order-modal-open");
  document.querySelector(".order-modal").setAttribute("aria-hidden", "false");
}

function closeOrder() {
  document.body.classList.remove("order-modal-open");
  document.querySelector(".order-modal").setAttribute("aria-hidden", "true");
}

ensureUi();
renderCart();

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

  if (event.target.closest(".shop-cart-button, [data-mobile-cart]")) openCart();
  if (event.target.closest(".shop-cart-close, .shop-cart-backdrop")) closeCart();
  if (event.target.closest(".shop-cart-clear")) {
    cart = {};
    saveCart();
    renderCart();
    toast(t("empty"));
  }
  if (event.target.closest(".shop-order-qr")) showOrderQr();
  if (event.target.closest(".order-modal-close, .order-picked-up")) closeOrder();
});

new MutationObserver(renderCart).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"],
});
