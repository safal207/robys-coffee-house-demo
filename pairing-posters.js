const priceMeta = {
  "cool-lime-macaron": {
    chips: {
      tr: ["Taze lime", "Fıstıklı makaron", "Uyumlu ikili"],
      en: ["Fresh lime", "Pistachio macaron", "Perfect match"],
      ru: ["Лайм", "Фисташковый макарон", "Лёгкая пара"]
    },
    reason: {
      tr: "Canlı lime ferahlığı önce gelir; fıstıklı makaron tatlılığı yumuşatır. Birlikte hafif, parlak ve kolay içilen bir Roby's anı verir.",
      en: "Bright lime freshness arrives first; the pistachio macaron softens it with a gentle sweetness. Together they make a light, vivid Roby's moment.",
      ru: "Сначала приходит яркая свежесть лайма, а фисташковый макарон мягко добавляет сладость. Вместе получается лёгкий и свежий вкус Roby's."
    },
    notes: {
      tr: ["Ferah", "Narenciye", "Fıstık"],
      en: ["Refreshing", "Citrus", "Pistachio"],
      ru: ["Свежий", "Цитрус", "Фисташка"]
    }
  },
  "iced-san-sebastian": {
    chips: {
      tr: ["Buzlu latte", "San Sebastian", "Kremamsı uyum"],
      en: ["Iced latte", "San Sebastian", "Creamy moment"],
      ru: ["Айс-латте", "San Sebastian", "Сливочная пара"]
    },
    reason: {
      tr: "Serin latte damağı tazeler; yoğun ve kremamsı San Sebastian kahvenin yumuşaklığını uzatır. Sonuç daha sakin, derin ve tatlı bir eşleşmedir.",
      en: "The chilled latte refreshes the palate while the dense, creamy San Sebastian extends the coffee's softness. The result is a calmer, richer pairing.",
      ru: "Холодный латте освежает, а плотный сливочный San Sebastian продолжает мягкость кофе. Получается спокойное, насыщенное и десертное сочетание."
    },
    notes: {
      tr: ["Serin kahve", "Kremamsı", "Karamelize"],
      en: ["Chilled coffee", "Creamy", "Caramelized"],
      ru: ["Холодный кофе", "Сливочный", "Карамельный"]
    }
  }
};

const experienceCopy = {
  tr: {
    eyebrow: "LEZZETLE TANIŞ",
    kicker: "LEZZET YOLCULUĞU",
    label: "Seçtiğin eşleşme",
    why: "Neden birlikte güzel?",
    notes: "Tatta ne var?",
    choose: "Bu eşleşmeyi seç",
    mark: "Bunu tanıdım",
    marked: "Tanıştık ✓",
    close: "Kapat",
    open: "Lezzeti tanı"
  },
  en: {
    eyebrow: "DISCOVER THE TASTE",
    kicker: "TASTE JOURNEY",
    label: "Your pairing",
    why: "Why does it work?",
    notes: "What will you taste?",
    choose: "Choose this pairing",
    mark: "I've met this taste",
    marked: "Discovered ✓",
    close: "Close",
    open: "Discover the taste"
  },
  ru: {
    eyebrow: "ЗНАКОМСТВО СО ВКУСОМ",
    kicker: "ПУТЕШЕСТВИЕ ВКУСА",
    label: "Твоя пара",
    why: "Почему они вместе?",
    notes: "Что почувствуешь?",
    choose: "Выбрать эту пару",
    mark: "Я познакомился со вкусом",
    marked: "Уже знакомы ✓",
    close: "Закрыть",
    open: "Познакомиться со вкусом"
  }
};

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

function splitPairingTitle(title) {
  const parts = title.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [title, ""];
  return [parts[0], parts.slice(1).join(" + ")];
}

function posterKicker(lang) {
  return (experienceCopy[lang] ?? experienceCopy.tr).kicker;
}

function createTitle(main, accent) {
  const title = document.createElement("div");
  title.className = "pairing-poster-title";

  const titleMain = document.createElement("span");
  titleMain.className = "pairing-poster-title-main";
  titleMain.textContent = main;

  const plus = document.createElement("span");
  plus.className = "pairing-poster-title-plus";
  plus.textContent = "+";

  const titleAccent = document.createElement("span");
  titleAccent.className = "pairing-poster-title-accent";
  titleAccent.textContent = accent;

  title.append(titleMain, plus, titleAccent);
  return title;
}

function enhancePairingCards() {
  const lang = currentLanguage();
  const copy = experienceCopy[lang] ?? experienceCopy.tr;

  document.querySelectorAll(".full-menu-panel--featured .full-menu-item--visual").forEach((card) => {
    const media = card.querySelector(".full-menu-item-media");
    const name = card.querySelector(".full-menu-item-copy strong")?.textContent?.trim() ?? "";
    const price = card.querySelector(".full-menu-price")?.textContent?.trim() ?? "";
    const pairingId = card.dataset.pairing ?? "";
    const renderKey = `${lang}|${name}|${price}|${pairingId}`;
    if (!media || !name || !price || card.dataset.posterReady === renderKey) return;

    card.classList.add("pairing-poster-card");
    media.dataset.discoverPairing = pairingId;
    media.setAttribute("aria-label", `${copy.open}: ${name}`);
    media.setAttribute("aria-expanded", "false");
    media.setAttribute("title", copy.open);
    media.querySelector(".pairing-poster-overlay")?.remove();

    const [main, accent] = splitPairingTitle(name);
    const meta = priceMeta[pairingId] ?? {};
    const chips = meta.chips?.[lang] ?? meta.chips?.tr ?? ["Roby's", "Coffee", "Perfect match"];

    const overlay = document.createElement("div");
    overlay.className = "pairing-poster-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const kicker = document.createElement("span");
    kicker.className = "pairing-poster-kicker";
    kicker.textContent = posterKicker(lang);

    const priceBadge = document.createElement("div");
    priceBadge.className = "pairing-poster-price";
    const priceValue = document.createElement("strong");
    priceValue.textContent = price;
    priceBadge.append(priceValue);

    const bottom = document.createElement("div");
    bottom.className = "pairing-poster-bottom";
    chips.forEach((chip) => {
      const item = document.createElement("span");
      item.textContent = chip;
      bottom.append(item);
    });

    overlay.append(kicker, createTitle(main, accent), priceBadge, bottom);
    media.append(overlay);
    card.dataset.posterReady = renderKey;
  });
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

function renderExperience(card, media) {
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

const menuRoot = document.querySelector("#menu-root");
if (menuRoot) {
  let scheduled = false;
  const scheduleEnhance = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      enhancePairingCards();
    });
  };

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(menuRoot, { childList: true, subtree: true });
  scheduleEnhance();

  menuRoot.addEventListener("click", (event) => {
    const trigger = event.target?.closest?.(".full-menu-panel--featured .full-menu-item-media[data-discover-pairing]");
    if (!trigger) return;

    if (trigger.dataset.inlineChoiceBypass === "true") {
      delete trigger.dataset.inlineChoiceBypass;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const card = trigger.closest(".pairing-poster-card");
    if (card) renderExperience(card, trigger);
  }, true);
}
