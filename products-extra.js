const PRODUCT_ASSETS = {
  "san-sebastian": [
    "src/products/san-sebastian-1.b64",
    "src/products/san-sebastian-2.b64",
    "src/products/san-sebastian-3.b64",
  ],
  "lotus-cheesecake": ["src/products/lotus-cheesecake.b64"],
  "nutella-croissant": ["src/products/nutella-croissant.b64"],
};

const EXTRA_PRODUCTS = [
  {
    id: "lotus-cheesecake",
    name: "Lotus Cheesecake",
    price: 220,
    fallback: "src/robys-gallery-signature.webp",
    alt: "Lotus Cheesecake — 220 ₺",
  },
  {
    id: "nutella-croissant",
    name: "Nutella Croissant",
    price: 180,
    fallback: "src/robys-gallery-croissant.webp",
    alt: "Nutella Croissant — 180 ₺",
  },
];

const ADD_LABELS = {
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

function base64ToBlobUrl(base64) {
  const clean = base64.replace(/\s+/g, "");
  if (!clean.startsWith("UklGR") || clean.length < 5000) {
    throw new Error("Invalid WebP data");
  }

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
}

async function hydrateArtwork(productId) {
  const image = document.querySelector(`[data-product-id="${productId}"] img`);
  if (!image) return;

  try {
    const responses = await Promise.all(
      PRODUCT_ASSETS[productId].map((path) => fetch(`${path}?v=20260621-4`, { cache: "reload" }))
    );
    if (responses.some((response) => !response.ok)) {
      throw new Error("Artwork unavailable");
    }

    const parts = await Promise.all(responses.map((response) => response.text()));
    image.src = base64ToBlobUrl(parts.join(""));
    image.removeAttribute("data-premium-src");
  } catch (error) {
    console.warn("Product artwork fallback used", productId, error);
  }
}

function insertExtraProducts() {
  const grid = document.querySelector(".price-grid");
  if (!grid) return;

  const label = ADD_LABELS[currentLanguage()] || ADD_LABELS.tr;
  EXTRA_PRODUCTS.forEach((product) => {
    if (grid.querySelector(`[data-product-id="${product.id}"]`)) return;

    grid.insertAdjacentHTML("beforeend", `
      <article class="price-card" data-product-id="${product.id}" data-product-name="${product.name}" data-product-price="${product.price}">
        <img src="${product.fallback}" alt="${product.alt}" width="640" height="640" loading="lazy" decoding="async" />
        <button class="price-card-action" type="button" data-add-product="${product.id}" data-localized data-tr="${ADD_LABELS.tr}" data-en="${ADD_LABELS.en}" data-ru="${ADD_LABELS.ru}">${label}</button>
      </article>
    `);
  });
}

function initProducts() {
  insertExtraProducts();
  hydrateArtwork("san-sebastian");
  hydrateArtwork("lotus-cheesecake");
  hydrateArtwork("nutella-croissant");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProducts, { once: true });
} else {
  initProducts();
}
