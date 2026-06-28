type GalleryLanguage = "tr" | "en" | "ru";

type LocalizedText = Record<GalleryLanguage, string>;

interface FeaturedProduct {
  id: string;
  href: string;
  image: string;
  imageSmall: string;
  title: LocalizedText;
  price: number;
  currency: string;
}

const FEATURED_PRODUCTS: readonly FeaturedProduct[] = [
  {
    id: "latte",
    href: "menu.html#hot-coffee",
    image: "src/products/gallery-v5/latte.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/latte-828.webp?v=20260626-7",
    title: { tr: "Latte", en: "Latte", ru: "Латте" },
    price: 180,
    currency: "₺"
  },
  {
    id: "san-sebastian",
    href: "menu.html#desserts",
    image: "src/products/gallery-v5/san-sebastian.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/san-sebastian-828.webp?v=20260626-7",
    title: {
      tr: "San Sebastian Cheesecake",
      en: "San Sebastian Cheesecake",
      ru: "Чизкейк Сан-Себастьян"
    },
    price: 190,
    currency: "₺"
  },
  {
    id: "iced-latte",
    href: "menu.html#cold-coffee",
    image: "src/products/gallery-v5/iced-latte.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/iced-latte-828.webp?v=20260626-7",
    title: { tr: "Iced Latte", en: "Iced Latte", ru: "Холодный латте" },
    price: 180,
    currency: "₺"
  },
  {
    id: "nutella-croissant",
    href: "menu.html#food",
    image: "src/products/gallery-v5/nutella-croissant.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/nutella-croissant-828.webp?v=20260626-7",
    title: {
      tr: "Nutella Croissant",
      en: "Nutella Croissant",
      ru: "Круассан с Nutella"
    },
    price: 170,
    currency: "₺"
  },
  {
    id: "lotus-cheesecake",
    href: "menu.html#desserts",
    image: "src/products/gallery-v5/lotus-cheesecake.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/lotus-cheesecake-828.webp?v=20260626-7",
    title: { tr: "Lotus Cheesecake", en: "Lotus Cheesecake", ru: "Чизкейк Lotus" },
    price: 190,
    currency: "₺"
  }
] as const;

function currentGalleryLanguage(): GalleryLanguage {
  const value = document.documentElement.lang;
  return value === "en" || value === "ru" ? value : "tr";
}

function galleryLabel(product: FeaturedProduct, language = currentGalleryLanguage()): string {
  return `${product.title[language]}, ${product.price} ${product.currency}`;
}

function createFallback(product: FeaturedProduct): HTMLElement {
  const fallback = document.createElement("span");
  fallback.className = "poster-card-fallback";

  const title = document.createElement("strong");
  title.dataset.galleryTitle = product.id;
  title.textContent = product.title[currentGalleryLanguage()];

  const price = document.createElement("span");
  price.textContent = `${product.price} ${product.currency}`;

  fallback.append(title, price);
  return fallback;
}

function createPosterCard(product: FeaturedProduct, index: number): HTMLAnchorElement {
  const card = document.createElement("a");
  card.className = "featured-card featured-card--poster poster-card";
  card.href = product.href;
  card.dataset.productId = product.id;
  card.setAttribute("aria-label", galleryLabel(product));

  const frame = document.createElement("span");
  frame.className = "poster-card-frame";

  const image = document.createElement("img");
  image.src = product.imageSmall;
  image.srcset = `${product.imageSmall} 828w, ${product.image} 1254w`;
  image.sizes = "(max-width: 680px) calc(100vw - 40px), (max-width: 1100px) 42vw, 360px";
  image.alt = product.title[currentGalleryLanguage()];
  image.width = 1254;
  image.height = 1254;
  image.loading = index === 0 ? "eager" : "lazy";
  image.decoding = "async";
  if (index === 0) image.fetchPriority = "low";

  const fallback = createFallback(product);

  image.addEventListener("load", () => {
    card.classList.add("is-loaded");
    card.classList.remove("is-error");
  }, { once: true });

  image.addEventListener("error", () => {
    card.classList.add("is-error");
    image.remove();
  }, { once: true });

  frame.append(image, fallback);
  card.append(frame);
  return card;
}

function updateGalleryLanguage(cards: readonly HTMLAnchorElement[]): void {
  const language = currentGalleryLanguage();

  cards.forEach((card, index) => {
    const product = FEATURED_PRODUCTS[index];
    if (!product) return;

    card.setAttribute("aria-label", galleryLabel(product, language));
    const image = card.querySelector<HTMLImageElement>("img");
    if (image) image.alt = product.title[language];

    const fallbackTitle = card.querySelector<HTMLElement>(`[data-gallery-title="${product.id}"]`);
    if (fallbackTitle) fallbackTitle.textContent = product.title[language];
  });
}

function setupGalleryDockBehavior(section: HTMLElement): void {
  let animationFrame = 0;
  let previousState: boolean | null = null;

  const checkPanel = (): void => {
    animationFrame = 0;

    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportBottom = viewportTop + viewportHeight;
    const rect = section.getBoundingClientRect();
    const galleryVisible = rect.top < viewportBottom && rect.bottom > viewportTop;

    if (galleryVisible === previousState) return;
    previousState = galleryVisible;
    document.body.classList.toggle("featured-gallery-active", galleryVisible);
  };

  const scheduleCheck = (): void => {
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(checkPanel);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(scheduleCheck, {
      rootMargin: "0px",
      threshold: [0, 0.12, 0.35]
    });
    observer.observe(section);
  }

  window.addEventListener("scroll", scheduleCheck, { passive: true });
  window.addEventListener("resize", scheduleCheck, { passive: true });
  window.addEventListener("orientationchange", scheduleCheck, { passive: true });
  window.addEventListener("pageshow", scheduleCheck, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleCheck, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleCheck, { passive: true });

  scheduleCheck();
}

function initFeaturedGallery(): void {
  const track = document.querySelector<HTMLElement>(".featured-track");
  const section = document.querySelector<HTMLElement>(".featured-strip");
  if (!track || !section) return;

  const fragment = document.createDocumentFragment();
  const cards = FEATURED_PRODUCTS.map((product, index) => {
    const card = createPosterCard(product, index);
    fragment.append(card);
    return card;
  });

  track.replaceChildren(fragment);
  track.dataset.galleryReady = "true";

  const languageObserver = new MutationObserver(() => updateGalleryLanguage(cards));
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  setupGalleryDockBehavior(section);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFeaturedGallery, { once: true });
} else {
  initFeaturedGallery();
}
