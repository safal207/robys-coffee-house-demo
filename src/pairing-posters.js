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
  const lang = document.documentElement.lang;
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

let discoveryPromise;
function loadDiscovery() {
  if (!discoveryPromise) {
    discoveryPromise = import("./pairing-discovery.js").catch(() => {
      discoveryPromise = null;
      return null;
    });
  }
  return discoveryPromise;
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

  const warmOnIntent = (event) => {
    if (event.target?.closest?.(".full-menu-panel--featured .full-menu-item-media[data-discover-pairing]"))
      void loadDiscovery();
  };
  menuRoot.addEventListener("pointerover", warmOnIntent, { passive: true });
  menuRoot.addEventListener("focusin", warmOnIntent);

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
    if (!card || trigger.getAttribute("aria-busy") === "true") return;
    trigger.setAttribute("aria-busy", "true");
    void loadDiscovery().then((module) => {
      trigger.removeAttribute("aria-busy");
      if (!trigger.isConnected) return;
      if (module) module.renderExperience(card, trigger, { currentLanguage: () => document.documentElement.lang, experienceCopy, priceMeta });
      else {
        // A failed optional story must still let guests choose the product.
        trigger.dataset.inlineChoiceBypass = "true";
        trigger.click();
      }
    });
  }, true);
}
