const viewport = document.querySelector("[data-featured-viewport]");
const track = document.querySelector(".featured-track");
const previousButton = document.querySelector("[data-featured-prev]");
const nextButton = document.querySelector("[data-featured-next]");
const pagination = document.querySelector("[data-featured-pagination]");

const STATIC_IMAGES = [
  "src/robys-hero-poster.jpg",
  "src/products/cards/nutella-card.v3.svg",
  "src/products/cards/san-sebastian-card.v3.svg",
  "src/products/cards/latte-card.v3.svg",
  "src/products/cards/lotus-card.v3.svg"
];

let cards = [];
let products = [];
let dots = [];
let frame = 0;

function currentLanguage() {
  return document.querySelector(".lang-button.active")?.dataset.lang
    || document.documentElement.lang
    || "tr";
}

function localized(value, language = currentLanguage()) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value[language] || value.tr || value.en || value.ru || "";
}

function isOverview(product) {
  return product?.kind === "overview";
}

function attachImageFallback(image, card) {
  if (!image || !card) return;
  image.addEventListener("error", () => {
    image.remove();
    card.classList.add("featured-card--image-missing");
  }, { once: true });
}

function prepareStaticFallback() {
  const staticCards = Array.from(document.querySelectorAll(".featured-card"));
  staticCards.forEach((card, index) => {
    const image = card.querySelector("img");
    const source = STATIC_IMAGES[index];
    if (!image || !source) return;
    image.loading = "eager";
    image.decoding = "async";
    image.src = source;
    attachImageFallback(image, card);
  });
  cards = staticCards;
}

function validProduct(product) {
  return Boolean(
    product
    && typeof product.id === "string"
    && product.active !== false
    && product.title
    && (isOverview(product) || Number.isFinite(Number(product.price)))
    && typeof product.href === "string"
    && product.image
    && typeof product.image.primary === "string"
  );
}

function cardAriaLabel(product, language = currentLanguage()) {
  const title = localized(product.title, language);
  if (isOverview(product)) return title;
  return `${title}, ${Number(product.price)} ${product.currency || "₺"}`;
}

function createCard(product, index) {
  const card = document.createElement("a");
  card.className = "featured-card";
  if (isOverview(product)) {
    card.classList.add("featured-card--overview");
  } else {
    card.classList.add("featured-card--poster");
  }
  card.href = product.href;
  card.dataset.productId = product.id;

  const image = document.createElement("img");
  image.src = product.image.primary;
  image.width = 640;
  image.height = 640;
  image.loading = index < 3 ? "eager" : "lazy";
  image.decoding = "async";
  image.fetchPriority = index === 1 ? "high" : "auto";
  image.alt = localized(product.alt);
  attachImageFallback(image, card);

  const top = document.createElement("div");
  top.className = "featured-card-top";
  const badge = document.createElement("small");
  badge.dataset.productField = "badge";
  badge.textContent = localized(product.badge);
  top.append(badge);

  const bottom = document.createElement("div");
  bottom.className = "featured-card-bottom";

  const titleWrap = document.createElement("div");
  titleWrap.className = "featured-card-title";
  const title = document.createElement("strong");
  title.dataset.productField = "title";
  title.textContent = localized(product.title);
  titleWrap.append(title);

  if (!isOverview(product)) {
    const price = document.createElement("span");
    price.className = "featured-price";
    price.textContent = `${Number(product.price)} ${product.currency || "₺"}`;
    titleWrap.append(price);
  }

  const action = document.createElement("span");
  action.className = "featured-card-action";
  action.setAttribute("aria-hidden", "true");
  action.textContent = isOverview(product) ? "→" : "+";

  bottom.append(titleWrap, action);

  // Product images are finished advertising posters. Keep their typography,
  // branding and prices untouched instead of rebuilding them as HTML overlays.
  if (!isOverview(product)) {
    top.hidden = true;
    bottom.hidden = true;
  }

  card.append(image, top, bottom);
  card.setAttribute("aria-label", cardAriaLabel(product));
  return card;
}

function renderProducts(nextProducts) {
  if (!track) return;
  products = nextProducts
    .filter(validProduct)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  if (!products.length) return;

  const fragment = document.createDocumentFragment();
  products.forEach((product, index) => fragment.append(createCard(product, index)));
  track.replaceChildren(fragment);
  cards = Array.from(track.querySelectorAll(".featured-card"));
  buildPagination();
  updateState();
}

function updateTranslations(language = currentLanguage()) {
  cards.forEach((card, index) => {
    const product = products[index];
    if (!product) return;
    const title = card.querySelector('[data-product-field="title"]');
    const badge = card.querySelector('[data-product-field="badge"]');
    const image = card.querySelector("img");
    if (title) title.textContent = localized(product.title, language);
    if (badge) badge.textContent = localized(product.badge, language);
    if (image) image.alt = localized(product.alt, language);
    card.setAttribute("aria-label", cardAriaLabel(product, language));
  });
}

function closestIndex() {
  if (!viewport || !cards.length) return 0;
  const left = viewport.getBoundingClientRect().left;
  return cards.reduce((bestIndex, card, index) => {
    const bestDistance = Math.abs(cards[bestIndex].getBoundingClientRect().left - left);
    const distance = Math.abs(card.getBoundingClientRect().left - left);
    return distance < bestDistance ? index : bestIndex;
  }, 0);
}

function updateState() {
  if (!viewport) return;
  const index = closestIndex();
  dots.forEach((dot, dotIndex) => dot.setAttribute("aria-current", String(dotIndex === index)));
  previousButton?.toggleAttribute("disabled", viewport.scrollLeft <= 4);
  nextButton?.toggleAttribute(
    "disabled",
    viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 4
  );
}

function step(direction) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const index = closestIndex();
  const targetIndex = Math.max(0, Math.min(cards.length - 1, index + direction));
  cards[targetIndex]?.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "nearest",
    inline: "start"
  });
}

function buildPagination() {
  if (!pagination) return;
  pagination.replaceChildren();
  dots = cards.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "featured-dot";
    dot.setAttribute("aria-label", `Go to featured item ${index + 1}`);
    dot.addEventListener("click", () => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      cards[index]?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "start"
      });
    });
    pagination.append(dot);
    return dot;
  });
}

async function loadProducts() {
  try {
    const response = await fetch("data/featured-products.json?v=20260625-1", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Expected an array");
    renderProducts(payload);
  } catch (error) {
    console.warn("Featured products fallback is active:", error);
    buildPagination();
    updateState();
  }
}

prepareStaticFallback();
buildPagination();
updateState();
loadProducts();

previousButton?.addEventListener("click", () => step(-1));
nextButton?.addEventListener("click", () => step(1));
viewport?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    step(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    step(1);
  }
});
viewport?.addEventListener("scroll", () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(updateState);
}, { passive: true });
window.addEventListener("resize", updateState, { passive: true });
document.querySelectorAll(".lang-button").forEach((button) => {
  button.addEventListener("click", () => {
    window.setTimeout(() => updateTranslations(button.dataset.lang || "tr"), 0);
  });
});
