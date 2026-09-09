import { menuCategories } from "./menu-catalog.js?v=20260904-premium-order-v1";
import { journeys } from "./discover-journeys-v2.js";

const COPY = Object.freeze({
  tr: Object.freeze({ eyebrow: "ŞU ANKİ İSTEĞİN", openDessert: "Tatlıyı aç", openPairing: "Eşleşmeyi aç" }),
  en: Object.freeze({ eyebrow: "WHAT FITS NOW", openDessert: "Open dessert", openPairing: "Open pairing" }),
  ru: Object.freeze({ eyebrow: "ЧТО ХОЧЕТСЯ СЕЙЧАС", openDessert: "Открыть десерт", openPairing: "Открыть сочетание" })
});

function language() {
  const value = document.documentElement.lang;
  return value === "en" || value === "ru" ? value : "tr";
}

function local(value) {
  const lang = language();
  return value?.[lang] ?? value?.tr ?? value?.en ?? "";
}

function formatPrice(value) {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(value)} ₺`;
}

function pairingModels() {
  const category = menuCategories.find((candidate) => candidate.id === "pairing-offers");
  if (!category?.items) return [];
  return journeys.flatMap((journey) => {
    const item = category.items.find((candidate) => candidate.journeyId === journey.id);
    return item?.image ? [{ journey, item }] : [];
  });
}

function targetFor(model) {
  if (model.journey.id === "iced-san-sebastian") {
    return { href: "menu.html#desserts", copyKey: "openDessert" };
  }
  return { href: "menu.html#pairing-offers", copyKey: "openPairing" };
}

function createCard(model, index) {
  const lang = language();
  const target = targetFor(model);
  const link = document.createElement("a");
  link.className = "discover-desire-card";
  link.href = target.href;
  link.dataset.journeyId = model.journey.id;
  link.style.setProperty("--deck-index", String(index));
  link.setAttribute("role", "listitem");
  link.setAttribute("aria-label", `${COPY[lang][target.copyKey]}: ${local(model.item.name)}`);

  const image = document.createElement("img");
  image.className = "discover-desire-card-image";
  image.src = model.item.image;
  image.alt = local(model.item.imageAlt ?? model.item.name);
  image.loading = index === 0 ? "eager" : "lazy";
  image.decoding = "async";
  image.width = 1024;
  image.height = 1024;

  const body = document.createElement("div");
  body.className = "discover-desire-card-body";

  const eyebrow = document.createElement("p");
  eyebrow.className = "discover-desire-card-eyebrow";
  eyebrow.textContent = `${String(index + 1).padStart(2, "0")} · ${COPY[lang].eyebrow}`;

  const title = document.createElement("h3");
  title.textContent = local(model.item.name);

  const reason = document.createElement("p");
  reason.className = "discover-desire-card-reason";
  reason.textContent = local(model.journey.reason);

  const footer = document.createElement("div");
  footer.className = "discover-desire-card-footer";
  const price = document.createElement("strong");
  price.textContent = formatPrice(model.item.price);
  const action = document.createElement("span");
  action.textContent = `${COPY[lang][target.copyKey]} →`;
  footer.append(price, action);

  body.append(eyebrow, title, reason, footer);
  link.append(image, body);
  return link;
}

function initializeDeck() {
  const legacyProducts = document.querySelector("#pairing-products");
  const heading = document.querySelector(".discover-pairing .discover-section-heading");
  if (!legacyProducts || !heading) return;

  const models = pairingModels();
  if (models.length < 2) return;

  const deck = document.createElement("div");
  deck.className = "discover-desire-deck";
  deck.id = "discover-desire-deck";
  deck.setAttribute("role", "list");
  heading.insertAdjacentElement("afterend", deck);

  const render = () => {
    const recommended = legacyProducts.dataset.pairingId ?? "";
    const ordered = [...models].sort((left, right) => {
      if (left.journey.id === recommended) return -1;
      if (right.journey.id === recommended) return 1;
      return 0;
    });
    deck.replaceChildren(...ordered.map(createCard));
    document.documentElement.dataset.discoverDesireDeck = "ready";
  };

  new MutationObserver(render).observe(legacyProducts, {
    attributes: true,
    attributeFilter: ["data-pairing-id"]
  });
  new MutationObserver(render).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
  render();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", initializeDeck, { once: true })
  : initializeDeck();
