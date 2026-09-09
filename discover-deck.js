import { menuCategories } from "./menu-catalog.js?v=20260904-premium-order-v1";
import { journeys } from "./discover-journeys-v2.js";

const DECK_COPY = Object.freeze({
  tr: Object.freeze({ next: "Sıradaki eşleşme", open: "Bu eşleşmeye geç" }),
  en: Object.freeze({ next: "Next pairing", open: "Switch to this pairing" }),
  ru: Object.freeze({ next: "Следующее сочетание", open: "Показать это сочетание" })
});

function language() {
  const value = typeof document === "undefined" ? "tr" : document.documentElement.lang;
  return value === "en" || value === "ru" ? value : "tr";
}

export function localized(value, locale = "tr") {
  return value?.[locale] ?? value?.tr ?? value?.en ?? "";
}

export function pairingForJourney(journeyId) {
  const category = menuCategories.find((candidate) => candidate.id === "pairing-offers");
  return category?.items?.find((item) => item.journeyId === journeyId) ?? null;
}

export function alternativeJourney(currentId) {
  if (!currentId) return null;
  return journeys.find((journey) => journey.id !== currentId) ?? null;
}

function formatPrice(value) {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value)} ₺`;
}

function createPreview() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "discover-deck-preview";
  button.hidden = true;

  const image = document.createElement("img");
  image.className = "discover-deck-preview-image";
  image.width = 180;
  image.height = 180;
  image.loading = "lazy";
  image.decoding = "async";

  const copy = document.createElement("span");
  copy.className = "discover-deck-preview-copy";

  const kicker = document.createElement("span");
  kicker.className = "discover-deck-preview-kicker";

  const name = document.createElement("strong");
  name.className = "discover-deck-preview-name";

  copy.append(kicker, name);

  const price = document.createElement("strong");
  price.className = "discover-deck-preview-price";

  button.append(image, copy, price);
  return { button, image, kicker, name, price };
}

function initializeDeck() {
  const card = document.querySelector("#pairing-card");
  const products = document.querySelector("#pairing-products");
  const next = document.querySelector("#next-pairing");
  if (!card || !products || !next || card.closest(".discover-deck-shell")) return;

  const shell = document.createElement("div");
  shell.className = "discover-deck-shell";
  card.parentNode?.insertBefore(shell, card);
  shell.append(card);

  const preview = createPreview();
  shell.append(preview.button);

  const renderPreview = () => {
    const currentId = products.dataset.pairingId?.trim() ?? "";
    const journey = alternativeJourney(currentId);
    const item = journey ? pairingForJourney(journey.id) : null;
    if (!journey || !item?.image || !Number.isFinite(item.price)) {
      preview.button.hidden = true;
      preview.button.removeAttribute("data-journey-id");
      return;
    }

    const locale = language();
    const copy = DECK_COPY[locale];
    const name = localized(item.name, locale);
    const price = formatPrice(item.price);

    preview.button.hidden = false;
    preview.button.dataset.journeyId = journey.id;
    preview.image.src = item.image;
    preview.image.alt = localized(item.imageAlt ?? item.name, locale);
    preview.kicker.textContent = copy.next;
    preview.name.textContent = name;
    preview.price.textContent = price;
    preview.button.setAttribute("aria-label", `${copy.open}: ${name}, ${price}`);
  };

  preview.button.addEventListener("click", () => next.click());

  new MutationObserver(renderPreview).observe(products, {
    attributes: true,
    attributeFilter: ["data-pairing-id"]
  });
  new MutationObserver(renderPreview).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });

  renderPreview();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeDeck, { once: true });
  } else {
    initializeDeck();
  }
}
