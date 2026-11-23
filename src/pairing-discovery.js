// Loaded only when a guest opens a featured pairing story. Poster cards remain eager.
const DISCOVERED_KEY = "robys-inline-discovered-pairings";

function currentLanguage() {
  const lang = document.documentElement.lang;
  return ["tr", "en", "ru"].includes(lang) ? lang : "tr";
}

function readDiscovered() {
  try {
    const value = JSON.parse(localStorage.getItem(DISCOVERED_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDiscovered(set) {
  try {
    localStorage.setItem(DISCOVERED_KEY, JSON.stringify([...set]));
  } catch {}
}


function removeExperiencePanel({ restoreFocus = false } = {}) {
  const selectedCard = document.querySelector(".pairing-poster-card.is-selected");
  const trigger = selectedCard?.querySelector(".full-menu-item-media[data-discover-pairing]") ?? null;

  document.querySelector(".pairing-discovery-panel")?.remove();
  document.querySelectorAll(".pairing-poster-card.is-selected").forEach((card) => {
    card.classList.remove("is-selected");
    const cardTrigger = card.querySelector(".full-menu-item-media[data-discover-pairing]");
    cardTrigger?.setAttribute("aria-expanded", "false");
    cardTrigger?.removeAttribute("aria-controls");
  });

  if (restoreFocus && trigger instanceof HTMLElement) {
    trigger.focus({ preventScroll: true });
  }
}

const narrowPairingLayout = window.matchMedia("(max-width: 900px)");

function placeExperiencePanel(panel, card) {
  const list = card.closest(".full-menu-list");
  if (!list) return;
  // In the single-column layout, details must follow the pair that opened them.
  // Wide screens keep both posters together above the full-width details.
  const focused = panel.contains(document.activeElement) ? document.activeElement : null;
  if (narrowPairingLayout.matches) card.after(panel);
  else list.append(panel);
  focused?.focus({ preventScroll: true });
}

function handlePairingLayoutChange() {
  const panel = document.querySelector(".pairing-discovery-panel");
  const card = document.querySelector(".pairing-poster-card.is-selected");
  if (panel && card) placeExperiencePanel(panel, card);
}

if (typeof narrowPairingLayout.addEventListener === "function") {
  narrowPairingLayout.addEventListener("change", handlePairingLayoutChange);
} else if (typeof narrowPairingLayout.addListener === "function") {
  narrowPairingLayout.addListener(handlePairingLayoutChange);
}

export function renderExperience(card, media, { currentLanguage, experienceCopy, priceMeta }) {
  const lang = currentLanguage();
  const copy = experienceCopy[lang] ?? experienceCopy.tr;
  const pairingId = card.dataset.pairing ?? "";
  const meta = priceMeta[pairingId] ?? {};
  const name = card.querySelector(".full-menu-item-copy strong")?.textContent?.trim() ?? "";
  const price = card.querySelector(".full-menu-price")?.textContent?.trim() ?? "";
  const reason = meta.reason?.[lang] ?? meta.reason?.tr ?? "";
  const notes = meta.notes?.[lang] ?? meta.notes?.tr ?? [];
  const discovered = readDiscovered();

  removeExperiencePanel();
  card.classList.add("is-selected");

  const panel = document.createElement("section");
  panel.className = "pairing-discovery-panel";
  panel.id = `pairing-discovery-${pairingId}`;
  panel.dataset.pairingId = pairingId;
  panel.setAttribute("aria-live", "polite");
  media.setAttribute("aria-expanded", "true");
  media.setAttribute("aria-controls", panel.id);

  const top = document.createElement("div");
  top.className = "pairing-discovery-top";

  const heading = document.createElement("div");
  heading.className = "pairing-discovery-heading";

  const eyebrow = document.createElement("p");
  eyebrow.className = "pairing-discovery-eyebrow";
  eyebrow.textContent = copy.eyebrow;

  const label = document.createElement("span");
  label.className = "pairing-discovery-label";
  label.textContent = copy.label;

  const title = document.createElement("h3");
  title.textContent = name;

  const priceEl = document.createElement("strong");
  priceEl.className = "pairing-discovery-price";
  priceEl.textContent = price;

  heading.append(eyebrow, label, title);
  top.append(heading, priceEl);

  const story = document.createElement("div");
  story.className = "pairing-discovery-story";

  const why = document.createElement("div");
  const whyTitle = document.createElement("strong");
  whyTitle.textContent = copy.why;
  const whyText = document.createElement("p");
  whyText.textContent = reason;
  why.append(whyTitle, whyText);

  const tasting = document.createElement("div");
  const tastingTitle = document.createElement("strong");
  tastingTitle.textContent = copy.notes;
  const noteList = document.createElement("div");
  noteList.className = "pairing-discovery-notes";
  notes.forEach((note) => {
    const chip = document.createElement("span");
    chip.textContent = note;
    noteList.append(chip, document.createTextNode(" "));
  });
  tasting.append(tastingTitle, noteList);
  story.append(why, tasting);

  const actions = document.createElement("div");
  actions.className = "pairing-discovery-actions";

  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "button button-primary pairing-discovery-choose";
  choose.textContent = copy.choose;
  choose.addEventListener("click", () => {
    media.dataset.inlineChoiceBypass = "true";
    media.click();
  });

  const mark = document.createElement("button");
  mark.type = "button";
  mark.className = "button button-light pairing-discovery-mark";
  const renderMark = () => {
    const done = discovered.has(pairingId);
    mark.textContent = done ? copy.marked : copy.mark;
    mark.classList.toggle("is-done", done);
    mark.disabled = done;
  };
  renderMark();
  mark.addEventListener("click", () => {
    discovered.add(pairingId);
    writeDiscovered(discovered);
    renderMark();
  });

  const close = document.createElement("button");
  close.type = "button";
  close.className = "button button-light pairing-discovery-close";
  close.textContent = copy.close;
  close.addEventListener("click", () => removeExperiencePanel({ restoreFocus: true }));

  actions.append(choose, mark, close);
  panel.append(top, story, actions);

  placeExperiencePanel(panel, card);

  if (window.matchMedia("(max-width: 680px)").matches) {
    window.requestAnimationFrame(() => {
      panel.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "nearest"
      });
    });
  }
}

