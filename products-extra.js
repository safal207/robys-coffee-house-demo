const PRODUCTS = [
  {
    id: "latte",
    name: "Latte",
    ru: "Латте",
    price: 200,
    image: "src/robys-gallery-latte-art.webp",
    alt: "Roby's Latte — 200 ₺",
  },
  {
    id: "san-sebastian",
    name: "San Sebastian Cheesecake",
    ru: "Сан-Себастьян",
    price: 240,
    image: "src/robys-gallery-signature.webp",
    alt: "San Sebastian Cheesecake — 240 ₺",
  },
  {
    id: "croissant",
    name: "Croissant",
    ru: "Круассан",
    price: 180,
    image: "src/robys-gallery-croissant.webp",
    alt: "Croissant — 180 ₺",
  },
  {
    id: "lotus-cheesecake",
    name: "Lotus Cheesecake",
    ru: "Лотус чизкейк",
    price: 220,
    image: "src/products/lotus-cheesecake.webp",
    alt: "Lotus Cheesecake — 220 ₺",
  },
  {
    id: "nutella-croissant",
    name: "Nutella Croissant",
    ru: "Круассан с Nutella",
    price: 180,
    image: "src/products/nutella-croissant.webp",
    alt: "Nutella Croissant — 180 ₺",
  },
];

const LABELS = {
  tr: "Sepete ekle",
  en: "Add to cart",
  ru: "В корзину",
};

function currentLanguage() {
  try {
    return localStorage.getItem("robys-language") || document.documentElement.lang || "tr";
  } catch {
    return document.documentElement.lang || "tr";
  }
}

function productCard(product) {
  const label = LABELS[currentLanguage()] || LABELS.tr;
  return `
    <article class="price-card" data-product-id="${product.id}" data-product-name="${product.name}" data-product-price="${product.price}">
      <img src="${product.image}" alt="${product.alt}" width="640" height="640" loading="lazy" decoding="async" />
      <div class="price-card-info">
        <div class="price-card-copy">
          <small>ROBY'S SELECTION</small>
          <strong data-localized data-tr="${product.name}" data-en="${product.name}" data-ru="${product.ru}">${product.name}</strong>
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderStableCatalog, { once: true });
} else {
  renderStableCatalog();
}
