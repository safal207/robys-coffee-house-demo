import { menuCategories } from "./menu-catalog.js?v=20260904-premium-order-v1";
import { journeys } from "./discover-journeys-v2.js";

const TARGETS = Object.freeze({
  "iced-san-sebastian": Object.freeze({
    productId: "desserts:san-sebastian-cheesecake",
    category: "desserts",
    cta: "dessert"
  }),
  "cool-lime-macaron": Object.freeze({
    productId: "pairing-offers:cool-lime-macaron-pairing",
    category: "pairing-offers",
    cta: "pairing"
  })
});

const COPY = Object.freeze({
  tr: Object.freeze({
    eyebrow: "İKİ YOL",
    title: "Menüden iki eşleşme",
    lead: "Birini seç, sonra ayrıntıya in.",
    dessert: "Tatlıyı keşfet",
    pairing: "Eşleşmeyi aç"
  }),
  en: Object.freeze({
    eyebrow: "TWO PATHS",
    title: "Two pairings from the menu",
    lead: "Choose one, then go deeper.",
    dessert: "Explore the dessert",
    pairing: "Open the pairing"
  }),
  ru: Object.freeze({
    eyebrow: "ДВА ПУТИ",
    title: "Два сочетания из меню",
    lead: "Выберите одно и разберите его подробнее.",
    dessert: "Разобрать десерт",
    pairing: "Открыть сочетание"
  })
});

const supportedLanguages = new Set(["tr", "en", "ru"]);
const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
const pairingByJourney = new Map(
  (pairingCategory?.items ?? [])
    .filter((item) => item.journeyId && item.image)
    .map((item) => [item.journeyId, item])
);

function language() {
  const value = document.documentElement.lang;
  return supportedLanguages.has(value) ? value : "tr";
}

function local(value) {
  const lang = language();
  return value?.[lang] ?? value?.tr ?? value?.en ?? "";
}

function orderedJourneys() {
  const currentId = document.querySelector("#pairing-products")?.dataset.pairingId ?? "";
  const active = journeys.filter((journey) => TARGETS[journey.id] && pairingByJourney.has(journey.id));
  if (!currentId) return active;
  return [...active].sort((left, right) => {
    if (left.id === currentId) return -1;
    if (right.id === currentId) return 1;
    return 0;
  });
}

function destinationUrl(target) {
  const params = new URLSearchParams({ product: target.productId });
  return `menu.html?${params.toString()}#${target.category}`;
}

function createCard(journey, index) {
  const pairing = pairingByJourney.get(journey.id);
  const target = TARGETS[journey.id];
  if (!pairing || !target) return null;

  const card = document.createElement("article");
  card.className = "journey-deck-card";
  card.dataset.journeyId = journey.id;
  card.setAttribute("aria-labelledby", `journey-deck-title-${journey.id}`);

  const media = document.createElement("div");
  media.className = "journey-deck-media";
  const image = document.createElement("img");
  image.src = pairing.image;
  image.alt = local(pairing.imageAlt ?? pairing.name);
  image.loading = index === 0 ? "eager" : "lazy";
  image.decoding = "async";
  image.width = 1024;
  image.height = 1024;
  media.append(image);

  const story = document.createElement("div");
  story.className = "journey-deck-story";
  const number = document.createElement("span");
  number.className = "journey-deck-number";
  number.setAttribute("aria-hidden", "true");
  number.textContent = String(index + 1).padStart(2, "0");
  const title = document.createElement("h3");
  title.id = `journey-deck-title-${journey.id}`;
  title.textContent = local(journey.title);
  const reason = document.createElement("p");
  reason.textContent = local(journey.reason);
  const link = document.createElement("a");
  link.className = "button button-primary journey-deck-cta";
  link.href = destinationUrl(target);
  link.dataset.journeyTarget = target.productId;
  link.textContent = COPY[language()][target.cta];
  story.append(number, title, reason, link);

  card.append(media, story);
  return card;
}

function installDeck() {
  const anchor = document.querySelector(".discover-pairing");
  if (!anchor || document.querySelector("#journey-deck")) return;

  const section = document.createElement("section");
  section.className = "journey-deck-section";
  section.setAttribute("aria-labelledby", "journey-deck-heading");

  const container = document.createElement("div");
  container.className = "container journey-deck-container";

  const heading = document.createElement("div");
  heading.className = "journey-deck-heading";
  const eyebrow = document.createElement("p");
  eyebrow.className = "discover-eyebrow";
  const title = document.createElement("h2");
  title.id = "journey-deck-heading";
  const lead = document.createElement("p");
  lead.className = "journey-deck-lead";
  heading.append(eyebrow, title, lead);

  const deck = document.createElement("div");
  deck.className = "journey-deck";
  deck.id = "journey-deck";
  container.append(heading, deck);
  section.append(container);
  anchor.before(section);

  const render = () => {
    const copy = COPY[language()];
    eyebrow.textContent = copy.eyebrow;
    title.textContent = copy.title;
    lead.textContent = copy.lead;
    const cards = orderedJourneys()
      .map((journey, index) => createCard(journey, index))
      .filter(Boolean);
    deck.replaceChildren(...cards);
    deck.dataset.ready = "true";
  };

  new MutationObserver(render).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
  const pairingRoot = document.querySelector("#pairing-products");
  if (pairingRoot) {
    new MutationObserver(render).observe(pairingRoot, {
      attributes: true,
      attributeFilter: ["data-pairing-id"]
    });
  }
  render();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", installDeck, { once: true })
  : installDeck();
