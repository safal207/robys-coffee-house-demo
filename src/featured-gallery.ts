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

interface PairingPreviewCopy {
  badge: string;
  cta: string;
  active: string;
}

interface GalleryAnalytics {
  track?: (action: string, payload: Record<string, string>) => void;
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
    id: "iced-latte",
    href: "menu.html#cold-coffee",
    image: "src/products/gallery-v5/iced-latte.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/iced-latte-828.webp?v=20260626-7",
    title: { tr: "Iced Latte", en: "Iced Latte", ru: "Холодный латте" },
    price: 180,
    currency: "₺"
  },
  {
    id: "san-sebastian",
    href: "menu.html#pairing-offers",
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
    id: "lotus-cheesecake",
    href: "menu.html#desserts",
    image: "src/products/gallery-v5/lotus-cheesecake.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/lotus-cheesecake-828.webp?v=20260626-7",
    title: { tr: "Lotus Cheesecake", en: "Lotus Cheesecake", ru: "Чизкейк Lotus" },
    price: 190,
    currency: "₺"
  },
  {
    id: "croissant",
    href: "menu.html#food",
    image: "src/products/gallery-v5/croissant.webp?v=20260626-7",
    imageSmall: "src/products/gallery-v5/croissant-828.webp?v=20260626-7",
    title: { tr: "Croissant", en: "Croissant", ru: "Круассан" },
    price: 170,
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
  }
] as const;

const PAIRING_PREVIEW = {
  productId: "san-sebastian",
  pairingId: "iced-san-sebastian",
  href: "menu.html#pairing-offers",
  video: "src/products/sets-v1/iced-san-sebastian-pairing-preview.mp4?v=20260916-2",
  poster: "src/products/sets-v1/iced-san-sebastian.webp?v=20260704-3",
  stylesheet: "pairing-preview.css?v=20260916-2",
  copy: {
    tr: {
      badge: "SET ▶",
      cta: "Set menüsünü aç →",
      active: "Iced Latte + San Sebastian set videosu. Set menüsünü açmak için tekrar dokunun."
    },
    en: {
      badge: "PAIRING ▶",
      cta: "Open pairing menu →",
      active: "Iced Latte + San Sebastian pairing video. Tap again to open the pairing menu."
    },
    ru: {
      badge: "СЕТ ▶",
      cta: "Открыть сет →",
      active: "Видео сета Айс-латте + Сан-Себастьян. Нажмите ещё раз, чтобы открыть сет в меню."
    }
  } satisfies Record<GalleryLanguage, PairingPreviewCopy>
} as const;

function currentGalleryLanguage(): GalleryLanguage {
  const value = document.documentElement.lang;
  return value === "en" || value === "ru" ? value : "tr";
}

function galleryLabel(product: FeaturedProduct, language = currentGalleryLanguage()): string {
  return `${product.title[language]}, ${product.price} ${product.currency}`;
}

function pairingCopy(language = currentGalleryLanguage()): PairingPreviewCopy {
  return PAIRING_PREVIEW.copy[language] ?? PAIRING_PREVIEW.copy.tr;
}

function ensurePairingPreviewStyles(): void {
  if (document.querySelector('link[data-pairing-preview-styles="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = PAIRING_PREVIEW.stylesheet;
  link.dataset.pairingPreviewStyles = "true";
  document.head.append(link);
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

function createPairingBadge(): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = "pairing-preview-badge";
  badge.dataset.pairingPreviewBadge = "true";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = pairingCopy().badge;
  return badge;
}

function createPairingCta(): HTMLSpanElement {
  const cta = document.createElement("span");
  cta.className = "pairing-preview-cta";
  cta.dataset.pairingPreviewCta = "true";
  cta.setAttribute("aria-hidden", "true");
  cta.textContent = pairingCopy().cta;
  return cta;
}

function trackPairing(action: string): void {
  const analytics = (window as Window & { robysAnalytics?: GalleryAnalytics }).robysAnalytics;
  analytics?.track?.(action, {
    pairing: PAIRING_PREVIEW.pairingId,
    placement: "featured_gallery"
  });
}

function activatePairingPreview(event: MouseEvent, card: HTMLAnchorElement): void {
  if (card.dataset.pairingPreviewActive === "true") {
    trackPairing("pairing_preview_menu_open");
    return;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();

  const frame = card.querySelector<HTMLElement>(".poster-card-frame");
  if (!frame) return;

  card.dataset.pairingPreviewActive = "true";
  card.href = PAIRING_PREVIEW.href;
  card.classList.add("is-pairing-preview");
  card.classList.remove("pairing-preview-playing", "pairing-preview-ended", "pairing-preview-error");
  card.setAttribute("aria-label", pairingCopy().active);

  const video = document.createElement("video");
  video.className = "pairing-preview-video";
  video.preload = "metadata";
  video.poster = PAIRING_PREVIEW.poster;
  video.playsInline = true;
  video.loop = false;
  video.controls = false;
  video.defaultMuted = true;
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("aria-hidden", "true");

  const source = document.createElement("source");
  source.src = PAIRING_PREVIEW.video;
  source.type = "video/mp4";
  video.append(source);

  const cta = createPairingCta();
  frame.append(video, cta);

  let failed = false;
  const failPreview = (): void => {
    if (failed) return;
    failed = true;
    card.classList.remove("pairing-preview-playing");
    card.classList.add("pairing-preview-error");
    video.pause();
    video.remove();
    trackPairing("pairing_preview_error");
  };

  video.addEventListener("playing", () => {
    card.classList.remove("pairing-preview-error");
    card.classList.add("pairing-preview-playing");
  }, { once: true });

  video.addEventListener("ended", () => {
    card.classList.add("pairing-preview-ended");
  }, { once: true });

  video.addEventListener("error", failPreview, { once: true });
  source.addEventListener("error", failPreview, { once: true });

  video.load();
  void video.play().catch(failPreview);
  trackPairing("pairing_preview_play");
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

  if (product.id === PAIRING_PREVIEW.productId) {
    frame.append(createPairingBadge());
    card.addEventListener("click", (event) => activatePairingPreview(event, card));
  }

  card.append(frame);
  return card;
}

function updateGalleryLanguage(cards: readonly HTMLAnchorElement[]): void {
  const language = currentGalleryLanguage();

  cards.forEach((card, index) => {
    const product = FEATURED_PRODUCTS[index];
    if (!product) return;

    if (card.dataset.pairingPreviewActive === "true" && product.id === PAIRING_PREVIEW.productId) {
      card.setAttribute("aria-label", pairingCopy(language).active);
    } else {
      card.setAttribute("aria-label", galleryLabel(product, language));
    }

    const image = card.querySelector<HTMLImageElement>("img");
    if (image) image.alt = product.title[language];

    const fallbackTitle = card.querySelector<HTMLElement>(`[data-gallery-title="${product.id}"]`);
    if (fallbackTitle) fallbackTitle.textContent = product.title[language];

    const badge = card.querySelector<HTMLElement>("[data-pairing-preview-badge]");
    if (badge) badge.textContent = pairingCopy(language).badge;

    const cta = card.querySelector<HTMLElement>("[data-pairing-preview-cta]");
    if (cta) cta.textContent = pairingCopy(language).cta;
  });
}

function setupGalleryDockBehavior(section: HTMLElement): void {
  let animationFrame = 0;
  let previousState: boolean | null = null;
  const handoffPending = (): boolean => {
    const state = document.documentElement.dataset.robysAndroidHandoff;
    return state === "loading" || state === "ready";
  };

  const checkPanel = (): void => {
    animationFrame = 0;
    // Geometry reads force layout even in a content-visibility:hidden subtree.
    // Keep the covered product out of the native bridge's first paint.
    if (handoffPending()) return;

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
    if (animationFrame || handoffPending()) return;
    animationFrame = window.requestAnimationFrame(checkPanel);
  };

  if (handoffPending()) {
    const resumeAfterHandoff = (): void => {
      const state = document.documentElement.dataset.robysAndroidHandoff;
      if (state !== "releasing" && state !== "done") return;
      window.removeEventListener("robys:android-handoff", resumeAfterHandoff);
      scheduleCheck();
    };
    window.addEventListener("robys:android-handoff", resumeAfterHandoff);
  }

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

  ensurePairingPreviewStyles();

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
