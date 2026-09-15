"use strict";

const FEATURED_PRODUCTS = [
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
    title: { tr: "San Sebastian Cheesecake", en: "San Sebastian Cheesecake", ru: "Чизкейк Сан-Себастьян" },
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
    title: { tr: "Nutella Croissant", en: "Nutella Croissant", ru: "Круассан с Nutella" },
    price: 170,
    currency: "₺"
  }
];

const PAIRING_PREVIEW = {
  productId: "san-sebastian",
  pairingId: "iced-san-sebastian",
  href: "menu.html#pairing-offers",
  video: "src/products/sets-v1/iced-san-sebastian-pairing-preview.mp4?v=20260916-1",
  stylesheet: "pairing-preview.css?v=20260916-1",
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
  }
};

function currentGalleryLanguage() {
  const value = document.documentElement.lang;
  return value === "en" || value === "ru" ? value : "tr";
}

function galleryLabel(product, language = currentGalleryLanguage()) {
  return `${product.title[language]}, ${product.price} ${product.currency}`;
}

function pairingCopy(language = currentGalleryLanguage()) {
  return PAIRING_PREVIEW.copy[language] ?? PAIRING_PREVIEW.copy.tr;
}

function ensurePairingPreviewStyles() {
  if (document.querySelector('link[data-pairing-preview-styles="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = PAIRING_PREVIEW.stylesheet;
  link.dataset.pairingPreviewStyles = "true";
  document.head.append(link);
}

function createFallback(product) {
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

function createPairingBadge() {
  const badge = document.createElement("span");
  badge.className = "pairing-preview-badge";
  badge.dataset.pairingPreviewBadge = "true";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = pairingCopy().badge;
  return badge;
}

function createPairingCta() {
  const cta = document.createElement("span");
  cta.className = "pairing-preview-cta";
  cta.dataset.pairingPreviewCta = "true";
  cta.setAttribute("aria-hidden", "true");
  cta.textContent = pairingCopy().cta;
  return cta;
}

function trackPairing(action) {
  window.robysAnalytics?.track?.(action, {
    pairing: PAIRING_PREVIEW.pairingId,
    placement: "featured_gallery"
  });
}

function activatePairingPreview(event, card) {
  if (card.dataset.pairingPreviewActive === "true") {
    trackPairing("pairing_preview_menu_open");
    return;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();

  const frame = card.querySelector(".poster-card-frame");
  if (!frame) return;

  card.dataset.pairingPreviewActive = "true";
  card.href = PAIRING_PREVIEW.href;
  card.classList.add("is-pairing-preview");
  card.setAttribute("aria-label", pairingCopy().active);

  const video = document.createElement("video");
  video.className = "pairing-preview-video";
  video.src = PAIRING_PREVIEW.video;
  video.preload = "auto";
  video.playsInline = true;
  video.loop = false;
  video.controls = false;
  video.muted = false;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("aria-hidden", "true");

  const cta = createPairingCta();
  frame.append(video, cta);

  video.addEventListener("playing", () => {
    card.classList.add("pairing-preview-playing");
  }, { once: true });

  video.addEventListener("ended", () => {
    card.classList.add("pairing-preview-ended");
  }, { once: true });

  video.addEventListener("error", () => {
    card.classList.add("pairing-preview-error");
  }, { once: true });

  const playback = video.play();
  if (playback && typeof playback.catch === "function") {
    playback.catch(() => {
      video.muted = true;
      const mutedPlayback = video.play();
      mutedPlayback?.catch?.(() => card.classList.add("pairing-preview-error"));
    });
  }

  trackPairing("pairing_preview_play");
}

function createPosterCard(product, index) {
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

function updateGalleryLanguage(cards) {
  const language = currentGalleryLanguage();
  cards.forEach((card, index) => {
    const product = FEATURED_PRODUCTS[index];
    if (!product) return;

    if (card.dataset.pairingPreviewActive === "true" && product.id === PAIRING_PREVIEW.productId) {
      card.setAttribute("aria-label", pairingCopy(language).active);
    } else {
      card.setAttribute("aria-label", galleryLabel(product, language));
    }

    const image = card.querySelector("img");
    if (image) image.alt = product.title[language];

    const fallbackTitle = card.querySelector(`[data-gallery-title="${product.id}"]`);
    if (fallbackTitle) fallbackTitle.textContent = product.title[language];

    const badge = card.querySelector("[data-pairing-preview-badge]");
    if (badge) badge.textContent = pairingCopy(language).badge;

    const cta = card.querySelector("[data-pairing-preview-cta]");
    if (cta) cta.textContent = pairingCopy(language).cta;
  });
}

function setupGalleryDockBehavior(section) {
  let animationFrame = 0;
  let previousState = null;

  const checkPanel = () => {
    animationFrame = 0;
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportBottom = viewportTop + viewportHeight;
    const rect = section.getBoundingClientRect();
    const galleryVisible = rect.top < viewportBottom && rect.bottom > viewportTop;

    if (galleryVisible !== previousState) {
      previousState = galleryVisible;
      document.body.classList.toggle("featured-gallery-active", galleryVisible);
    }
  };

  const scheduleCheck = () => {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(checkPanel);
  };

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(scheduleCheck, {
      rootMargin: "0px",
      threshold: [0, 0.12, 0.35]
    }).observe(section);
  }

  window.addEventListener("scroll", scheduleCheck, { passive: true });
  window.addEventListener("resize", scheduleCheck, { passive: true });
  window.addEventListener("orientationchange", scheduleCheck, { passive: true });
  window.addEventListener("pageshow", scheduleCheck, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleCheck, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleCheck, { passive: true });
  scheduleCheck();
}

function initFeaturedGallery() {
  const track = document.querySelector(".featured-track");
  const section = document.querySelector(".featured-strip");
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

  new MutationObserver(() => updateGalleryLanguage(cards)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });

  setupGalleryDockBehavior(section);
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", initFeaturedGallery, { once: true })
  : initFeaturedGallery();
