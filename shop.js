const CART_KEY = "robys-cart-v1";

const products = new Map(
  Array.from(document.querySelectorAll("[data-product-id]")).map((card) => [
    card.dataset.productId,
    {
      id: card.dataset.productId,
      name: card.dataset.productName,
      price: Number(card.dataset.productPrice),
    },
  ])
);

const premiumAssets = {
  latte: ["src/premium-latte.b64"],
  "san-sebastian": ["src/premium-san-sebastian.b64"],
  croissant: ["src/premium-croissant.b64"],
};

const labels = {
  tr: { add: "Sepete ekle", added: "Eklendi", cart: "Sepet", total: "Toplam", send: "Telegram’da gönder", empty: "Sepetiniz boş", clear: "Temizle" },
  en: { add: "Add to cart", added: "Added", cart: "Cart", total: "Total", send: "Send in Telegram", empty: "Your cart is empty", clear: "Clear" },
  ru: { add: "В корзину", added: "Добавлено", cart: "Корзина", total: "Итого", send: "Отправить в Telegram", empty: "Корзина пуста", clear: "Очистить" },
};

let cart = loadCart();

function currentLanguage() {
  return document.documentElement.lang || "tr";
}

function t(key) {
  return labels[currentLanguage()]?.[key] || labels.tr[key];
}

async function hydratePremiumImages() {
  await Promise.all(Object.entries(premiumAssets).map(async ([id, urls]) => {
    const image = document.querySelector(`[data-product-id="${id}"] img`);
    if (!image) return;
    try {
      const parts = await Promise.all(urls.map(async (url) => {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.text()).trim();
      }));
      image.src = `data:image/webp;base64,${parts.join("")}`;
      image.removeAttribute("data-premium-src");
    } catch (error) {
      console.warn("Premium artwork fallback used", id, error);
    }
  }));
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
  return Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
}

function money(value) {
  return `${value} ₺`;
}

function ensureCartUi() {
  if (document.querySelector(".shop-cart")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <button class="shop-cart-button" type="button" aria-expanded="false">
      <span aria-hidden="true">🛍</span>
      <span data-cart-button-label></span>
      <strong data-cart-count>0</strong>
    </button>
    <aside class="shop-cart" aria-hidden="true" aria-label="Cart">
      <div class="shop-cart-head">
        <h3 data-cart-title></h3>
        <button class="shop-cart-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="shop-cart-items"></div>
      <div class="shop-cart-footer">
        <div class="shop-cart-total"><span data-cart-total-label></span><strong data-cart-total>0 ₺</strong></div>
        <a class="shop-cart-send" target="_blank" rel="noopener noreferrer"></a>
        <button class="shop-cart-clear" type="button"></button>
      </div>
    </aside>
    <button class="shop-cart-backdrop" type="button" aria-label="Close cart"></button>
  `);
}

function orderText() {
  const lines = ["Roby's Coffee House — order"];
  let total = 0;
  Object.entries(cart).forEach(([id, quantity]) => {
    const product = products.get(id);
    if (!product || quantity < 1) return;
    const subtotal = product.price * quantity;
    total += subtotal;
    lines.push(`${product.name} × ${quantity} — ${money(subtotal)}`);
  });
  lines.push(`${t("total")}: ${money(total)}`);
  return lines.join("\n");
}

function renderCart() {
  ensureCartUi();
  const lang = currentLanguage();
  const items = document.querySelector(".shop-cart-items");
  const count = quantityTotal();
  let total = 0;

  document.querySelector("[data-cart-button-label]").textContent = labels[lang]?.cart || labels.tr.cart;
  document.querySelector("[data-cart-title]").textContent = labels[lang]?.cart || labels.tr.cart;
  document.querySelector("[data-cart-count]").textContent = String(count);
  document.querySelector("[data-cart-total-label]").textContent = labels[lang]?.total || labels.tr.total;
  document.querySelector(".shop-cart-clear").textContent = labels[lang]?.clear || labels.tr.clear;
  document.querySelector(".shop-cart-send").textContent = labels[lang]?.send || labels.tr.send;

  const rows = Object.entries(cart).flatMap(([id, quantity]) => {
    const product = products.get(id);
    if (!product || quantity < 1) return [];
    total += product.price * quantity;
    return [`<div class="shop-cart-row">
      <div><strong>${product.name}</strong><span>${money(product.price)}</span></div>
      <div class="shop-cart-stepper">
        <button type="button" data-cart-minus="${id}" aria-label="Decrease">−</button>
        <span>${quantity}</span>
        <button type="button" data-cart-plus="${id}" aria-label="Increase">+</button>
      </div>
    </div>`];
  });

  items.innerHTML = rows.length ? rows.join("") : `<p class="shop-cart-empty">${labels[lang]?.empty || labels.tr.empty}</p>`;
  document.querySelector("[data-cart-total]").textContent = money(total);
  document.querySelector(".shop-cart-send").href = `https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(orderText())}`;
  document.body.classList.toggle("has-cart-items", count > 0);
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

function addProduct(id, button) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  renderCart();
  const original = button.textContent;
  button.textContent = t("added");
  button.classList.add("is-added");
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove("is-added");
  }, 850);
}

ensureCartUi();
renderCart();
hydratePremiumImages();

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add-product]");
  if (add) addProduct(add.dataset.addProduct, add);

  const plus = event.target.closest("[data-cart-plus]");
  if (plus) {
    cart[plus.dataset.cartPlus] = (cart[plus.dataset.cartPlus] || 0) + 1;
    saveCart();
    renderCart();
  }

  const minus = event.target.closest("[data-cart-minus]");
  if (minus) {
    const id = minus.dataset.cartMinus;
    cart[id] = Math.max(0, (cart[id] || 0) - 1);
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
});

new MutationObserver(renderCart).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
