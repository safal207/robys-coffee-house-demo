const extraProducts = [
  {
    id: "lotus-cheesecake",
    name: "Lotus Cheesecake",
    price: 220,
    fallback: "src/robys-gallery-signature.webp",
    alt: "Lotus cheesecake — 220 Turkish lira",
    assetParts: ["src/products/lotus-cheesecake.b64"],
  },
  {
    id: "nutella-croissant",
    name: "Nutella Croissant",
    price: 180,
    fallback: "src/robys-gallery-croissant.webp",
    alt: "Nutella croissant — 180 Turkish lira",
    assetParts: ["src/products/nutella-croissant.b64"],
  },
];

const addLabels = {
  tr: "Sepete ekle",
  en: "Add to cart",
  ru: "В корзину",
};

function preferredLanguage() {
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

async function hydrateProductImage(product) {
  const card = document.querySelector(`[data-product-id="${product.id}"]`);
  const image = card?.querySelector("img");
  if (!card || !image) return;

  card.classList.add("is-image-loading");
  try {
    const responses = await Promise.all(
      product.assetParts.map((url) => fetch(`${url}?v=20260621-1`, { cache: "force-cache" }))
    );
    if (responses.some((response) => !response.ok)) {
      throw new Error("Product artwork unavailable");
    }

    const base64 = (await Promise.all(responses.map((response) => response.text()))).join("");
    const blobUrl = base64ToBlobUrl(base64);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = blobUrl;
    });
    card.classList.add("is-image-ready");
  } catch (error) {
    card.classList.add("is-image-fallback");
    console.warn("Extra product artwork fallback used", product.id, error);
  } finally {
    card.classList.remove("is-image-loading");
  }
}

function insertExtraProducts() {
  const grid = document.querySelector(".price-grid");
  if (!grid) return;

  const language = preferredLanguage();
  const label = addLabels[language] || addLabels.tr;

  extraProducts.forEach((product) => {
    if (grid.querySelector(`[data-product-id="${product.id}"]`)) return;

    grid.insertAdjacentHTML("beforeend", `
      <article class="price-card" data-product-id="${product.id}" data-product-name="${product.name}" data-product-price="${product.price}">
        <img src="${product.fallback}" alt="${product.alt}" width="640" height="640" loading="lazy" decoding="async" />
        <button class="price-card-action" type="button" data-add-product="${product.id}" data-localized data-tr="${addLabels.tr}" data-en="${addLabels.en}" data-ru="${addLabels.ru}">${label}</button>
      </article>
    `);
  });

  extraProducts.forEach(hydrateProductImage);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", insertExtraProducts, { once: true });
} else {
  insertExtraProducts();
}
