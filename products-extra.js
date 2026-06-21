const PRODUCTS = [
  {
    id: "latte-direct",
    name: "Latte",
    ru: "Латте",
    price: 200,
    tone: "latte",
    symbol: "☕",
    art: "SMOOTH · CREAMY · WARM",
  },
  {
    id: "san-sebastian-direct",
    name: "San Sebastian Cheesecake",
    ru: "Сан-Себастьян",
    price: 240,
    tone: "san-sebastian",
    symbol: "◒",
    art: "BURNT TOP · SOFT CENTER",
  },
  {
    id: "croissant-direct",
    name: "Croissant",
    ru: "Круассан",
    price: 180,
    tone: "croissant",
    symbol: "🥐",
    art: "BUTTERY · FLAKY · FRESH",
  },
  {
    id: "lotus-cheesecake",
    name: "Lotus Cheesecake",
    ru: "Лотус чизкейк",
    price: 220,
    tone: "lotus",
    symbol: "✦",
    art: "CARAMEL · BISCUIT · CREAM",
    image: "src/products/lotus-cheesecake-menu.svg?v=20260621-1",
  },
  {
    id: "nutella-croissant",
    name: "Nutella Croissant",
    ru: "Круассан с Nutella",
    price: 180,
    tone: "nutella",
    symbol: "●",
    art: "CHOCOLATE · HAZELNUT · CRISP",
  },
];

const LABELS = { tr: "Sepete ekle", en: "Add to cart", ru: "В корзину" };
const mobileViewport = window.matchMedia("(max-width: 680px)");

function currentLanguage() {
  try {
    return localStorage.getItem("robys-language") || document.documentElement.lang || "tr";
  } catch {
    return document.documentElement.lang || "tr";
  }
}

function ensureStableStyles() {
  if (document.querySelector('link[data-catalog-stable="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "catalog-stable.css?v=20260621-18";
  link.dataset.catalogStable = "true";
  document.head.append(link);
}

function productCard(product) {
  const lang = currentLanguage();
  const label = LABELS[lang] || LABELS.tr;
  const displayName = lang === "ru" ? product.ru : product.name;
  const photo = product.image
    ? `<img class="price-card-photo" src="${product.image}" alt="" width="480" height="270" loading="lazy" decoding="async" />`
    : "";

  return `
    <article class="price-card price-card--${product.tone}" data-product-id="${product.id}" data-product-name="${product.name}" data-product-price="${product.price}">
      <div class="price-card-media${product.image ? " has-photo" : ""}" aria-hidden="true">
        <span class="price-card-media-brand">ROBY'S</span>
        <span class="price-card-media-symbol">${product.symbol}</span>
        <strong>${product.name}</strong>
        <small>${product.art}</small>
        ${photo}
      </div>
      <div class="price-card-info">
        <div class="price-card-copy">
          <small>ROBY'S SELECTION</small>
          <strong data-localized data-tr="${product.name}" data-en="${product.name}" data-ru="${product.ru}">${displayName}</strong>
          <span class="price-card-price">${product.price} ₺</span>
        </div>
        <button class="price-card-action" type="button" data-add-product="${product.id}" data-localized data-tr="${LABELS.tr}" data-en="${LABELS.en}" data-ru="${LABELS.ru}">${label}</button>
      </div>
    </article>`;
}

function renderStableCatalog() {
  const grid = document.querySelector(".price-grid");
  if (!grid) return;
  grid.innerHTML = PRODUCTS.map(productCard).join("");

  grid.querySelectorAll(".price-card-photo").forEach((image) => {
    image.addEventListener("error", () => {
      image.closest(".price-card-media")?.classList.remove("has-photo");
      image.remove();
    }, { once: true });
  });
}

function placeCartButton() {
  const button = document.querySelector(".shop-cart-button");
  if (!button) return;

  const dock = document.querySelector(".mobile-cta");
  const instagram = dock?.querySelector(".mobile-cta-instagram");
  if (mobileViewport.matches && dock && instagram) {
    button.classList.add("mobile-cta-cart");
    if (button.parentElement !== dock) instagram.before(button);
  } else if (button.parentElement === dock) {
    button.classList.remove("mobile-cta-cart");
    document.body.append(button);
  }
}

function initStableCatalog() {
  ensureStableStyles();
  renderStableCatalog();
  placeCartButton();

  new MutationObserver(placeCartButton).observe(document.body, { childList: true, subtree: true });
  mobileViewport.addEventListener?.("change", placeCartButton);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStableCatalog, { once: true });
} else {
  initStableCatalog();
}
