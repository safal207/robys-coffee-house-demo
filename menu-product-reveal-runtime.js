import { menuCategories } from "./menu-catalog.js?v=20260904-premium-order-v1";

const REVEAL_PRODUCTS = Object.freeze([
  Object.freeze({
    id: "desserts:san-sebastian-cheesecake",
    primaryPath: "/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp",
    revealImage: "src/products/san-sebastian.webp"
  })
]);

const PAIRING_CATEGORY_ID = "pairing-offers";
const PAIRING_ITEM_ID = "iced-san-sebastian-pairing";
const PAIRING_PRODUCT_ID = `${PAIRING_CATEGORY_ID}:${PAIRING_ITEM_ID}`;
const PAIRING_REVEAL_THRESHOLD = 50;

const REVEAL_COPY = Object.freeze({
  tr: Object.freeze({
    label: "San Sebastian'ın alternatif görünümünü göster",
    hint: "Sola kaydır · diğer görünümü gör",
    revealed: "San Sebastian · diğer görünüm",
    value: "Alternatif görünüm %{percent}"
  }),
  en: Object.freeze({
    label: "Reveal an alternate view of the San Sebastian cheesecake",
    hint: "Swipe left · alternate view",
    revealed: "San Sebastian · alternate view",
    value: "Alternate view %{percent}"
  }),
  ru: Object.freeze({
    label: "Показать другой ракурс чизкейка Сан-Себастьян",
    hint: "Свайп влево · другой ракурс",
    revealed: "Сан-Себастьян · другой ракурс",
    value: "Другой ракурс %{percent}"
  })
});

const PAIRING_COPY = Object.freeze({
  tr: Object.freeze({ eyebrow: "Menü eşleşmesi", action: "Eşleşmeyi gör" }),
  en: Object.freeze({ eyebrow: "Menu pairing", action: "View pairing" }),
  ru: Object.freeze({ eyebrow: "Сочетание в меню", action: "Посмотреть сочетание" })
});

function pathnameFor(source) {
  if (!source) return "";
  try {
    return new URL(source, "https://robys.invalid/").pathname;
  } catch {
    return String(source).split(/[?#]/, 1)[0];
  }
}

export function resolveRevealConfig(source) {
  const pathname = pathnameFor(source);
  return REVEAL_PRODUCTS.find((candidate) => pathname.endsWith(candidate.primaryPath)) ?? null;
}

export function revealCopy(language) {
  return REVEAL_COPY[language] ?? REVEAL_COPY.tr;
}

export function pairingOffer() {
  const category = menuCategories.find((candidate) => candidate.id === PAIRING_CATEGORY_ID);
  const item = category?.items?.find((candidate) => candidate.id === PAIRING_ITEM_ID);
  return item ? { category, item, productId: PAIRING_PRODUCT_ID } : null;
}

function localized(value, language) {
  return value?.[language] ?? value?.tr ?? "";
}

function bootReveal() {
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("clip-path", "inset(0 0 0 50%)")) {
    return;
  }

  const sourceImage = document.querySelector("#menu-product-image");
  const visual = sourceImage?.closest(".menu-product-visual");
  const productContent = document.querySelector(".menu-product-content");
  const productPrice = document.querySelector("#menu-product-price");
  if (!sourceImage || !visual || !productContent || !productPrice || visual.dataset.menuRevealBooted === "true") return;
  visual.dataset.menuRevealBooted = "true";

  const revealImage = document.createElement("img");
  revealImage.className = "menu-product-reveal-image";
  revealImage.alt = "";
  revealImage.width = 1024;
  revealImage.height = 1024;
  revealImage.decoding = "async";
  revealImage.draggable = false;
  revealImage.hidden = true;

  const control = document.createElement("input");
  control.className = "menu-product-reveal-control";
  control.type = "range";
  control.min = "0";
  control.max = "100";
  control.step = "1";
  control.value = "88";
  control.hidden = true;

  const divider = document.createElement("span");
  divider.className = "menu-product-reveal-divider";
  divider.setAttribute("aria-hidden", "true");
  divider.hidden = true;

  const cue = document.createElement("span");
  cue.className = "menu-product-reveal-cue";
  cue.setAttribute("aria-hidden", "true");
  cue.hidden = true;

  sourceImage.insertAdjacentElement("afterend", revealImage);
  revealImage.insertAdjacentElement("afterend", control);
  control.insertAdjacentElement("afterend", divider);
  divider.insertAdjacentElement("afterend", cue);

  const pairingBridge = document.createElement("div");
  pairingBridge.className = "menu-product-pairing-bridge";
  pairingBridge.hidden = true;

  const pairingCopyRoot = document.createElement("div");
  pairingCopyRoot.className = "menu-product-pairing-copy";

  const pairingEyebrow = document.createElement("span");
  pairingEyebrow.className = "menu-product-pairing-eyebrow";

  const pairingName = document.createElement("strong");
  pairingName.className = "menu-product-pairing-name";

  const pairingPrice = document.createElement("span");
  pairingPrice.className = "menu-product-pairing-price";

  const pairingAction = document.createElement("button");
  pairingAction.type = "button";
  pairingAction.className = "menu-product-pairing-action";

  pairingCopyRoot.append(pairingEyebrow, pairingName, pairingPrice);
  pairingBridge.append(pairingCopyRoot, pairingAction);
  productPrice.insertAdjacentElement("afterend", pairingBridge);

  let activeConfig = null;
  let revealGeneration = 0;

  const currentLanguage = () => document.documentElement.lang || "tr";

  const updatePairingBridge = (revealed = 0) => {
    const offer = pairingOffer();
    if (!activeConfig || !offer || revealed < PAIRING_REVEAL_THRESHOLD) {
      pairingBridge.hidden = true;
      return;
    }
    const language = currentLanguage();
    const copy = PAIRING_COPY[language] ?? PAIRING_COPY.tr;
    pairingEyebrow.textContent = copy.eyebrow;
    pairingName.textContent = localized(offer.item.name, language);
    pairingPrice.textContent = `${offer.item.price} ₺`;
    pairingAction.textContent = copy.action;
    pairingAction.setAttribute(
      "aria-label",
      `${copy.action}: ${localized(offer.item.name, language)}, ${offer.item.price} ₺`
    );
    pairingBridge.hidden = false;
  };

  const updatePosition = () => {
    if (!activeConfig) return;
    const position = Math.max(0, Math.min(100, Number(control.value)));
    const revealed = 100 - position;
    const copy = revealCopy(currentLanguage());
    visual.style.setProperty("--menu-reveal-position", `${position}%`);
    control.setAttribute("aria-label", copy.label);
    control.setAttribute("aria-valuetext", copy.value.replace("%{percent}", `${revealed}%`));
    cue.textContent = position <= 18 ? copy.revealed : copy.hint;
    updatePairingBridge(revealed);
  };

  const hideReveal = () => {
    activeConfig = null;
    revealGeneration += 1;
    visual.removeAttribute("data-menu-reveal-active");
    visual.style.removeProperty("--menu-reveal-position");
    revealImage.hidden = true;
    control.hidden = true;
    divider.hidden = true;
    cue.hidden = true;
    pairingBridge.hidden = true;
  };

  const showReveal = (generation) => {
    if (!activeConfig || generation !== revealGeneration || !revealImage.naturalWidth) return;
    visual.dataset.menuRevealActive = "true";
    revealImage.hidden = false;
    control.hidden = false;
    divider.hidden = false;
    cue.hidden = false;
    updatePosition();
  };

  const activateReveal = (config) => {
    activeConfig = config;
    const generation = ++revealGeneration;
    control.value = "88";
    revealImage.hidden = true;
    control.hidden = true;
    divider.hidden = true;
    cue.hidden = true;
    pairingBridge.hidden = true;
    visual.removeAttribute("data-menu-reveal-active");
    updatePosition();

    revealImage.onload = () => showReveal(generation);
    revealImage.onerror = () => {
      if (generation !== revealGeneration) return;
      hideReveal();
    };

    const target = new URL(config.revealImage, document.baseURI).href;
    if (revealImage.src !== target) revealImage.src = target;
    if (revealImage.complete && revealImage.naturalWidth > 0) {
      queueMicrotask(() => showReveal(generation));
    }
  };

  const syncProduct = () => {
    const config = resolveRevealConfig(
      sourceImage.getAttribute("src") || sourceImage.src || sourceImage.currentSrc
    );
    if (!config) {
      hideReveal();
      return;
    }
    activateReveal(config);
  };

  const openExistingPairing = () => {
    const offer = pairingOffer();
    if (!offer) return;

    document.querySelector('[data-menu-dialog-close="product"]')?.click();

    const searchInput = document.querySelector("#menu-search");
    if (searchInput?.value) {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const categoryButton = document.querySelector(`[data-category="${PAIRING_CATEGORY_ID}"]`);
    categoryButton?.click();

    window.requestAnimationFrame(() => {
      const pairingMedia = document.querySelector(
        `[data-product-id="${offer.productId}"] .full-menu-item-media`
      );
      if (pairingMedia instanceof HTMLElement) pairingMedia.click();
    });
  };

  control.addEventListener("input", updatePosition);
  control.addEventListener("change", updatePosition);
  pairingAction.addEventListener("click", openExistingPairing);

  new MutationObserver(syncProduct).observe(sourceImage, {
    attributes: true,
    attributeFilter: ["src"]
  });

  new MutationObserver(() => {
    updatePosition();
    const position = Math.max(0, Math.min(100, Number(control.value)));
    updatePairingBridge(100 - position);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });

  syncProduct();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootReveal, { once: true });
  } else {
    bootReveal();
  }
}
