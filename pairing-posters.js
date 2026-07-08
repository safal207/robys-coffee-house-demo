const priceMeta = {
  "cool-lime-macaron": {
    oldPrice: "340 ₺",
    chips: {
      tr: ["Fresh lime", "Fıstıklı makaron", "Perfect match"],
      en: ["Fresh lime", "Pistachio macaron", "Perfect match"],
      ru: ["Fresh lime", "Pistachio macaron", "Perfect match"]
    }
  },
  "iced-san-sebastian": {
    chips: {
      tr: ["Iced latte", "San Sebastian", "Creamy moment"],
      en: ["Iced latte", "San Sebastian", "Creamy moment"],
      ru: ["Iced latte", "San Sebastian", "Creamy moment"]
    }
  }
};

function currentLanguage() {
  const lang = document.documentElement.lang;
  return ["tr", "en", "ru"].includes(lang) ? lang : "tr";
}

function splitPairingTitle(title) {
  const parts = title.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [title, ""];
  return [parts[0], parts.slice(1).join(" + ")];
}

function posterKicker(lang) {
  return {
    tr: "PAIR OF THE DAY",
    en: "PAIR OF THE DAY",
    ru: "PAIR OF THE DAY"
  }[lang] ?? "PAIR OF THE DAY";
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
  document.querySelectorAll(".full-menu-panel--featured .full-menu-item--visual").forEach((card) => {
    const media = card.querySelector(".full-menu-item-media");
    const name = card.querySelector(".full-menu-item-copy strong")?.textContent?.trim() ?? "";
    const price = card.querySelector(".full-menu-price")?.textContent?.trim() ?? "";
    const pairingId = card.dataset.pairing ?? "";
    const renderKey = `${lang}|${name}|${price}|${pairingId}`;
    if (!media || !name || !price || card.dataset.posterReady === renderKey) return;

    card.classList.add("pairing-poster-card");
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
    if (meta.oldPrice) {
      const oldPrice = document.createElement("span");
      oldPrice.className = "pairing-poster-old-price";
      oldPrice.textContent = meta.oldPrice;
      priceBadge.append(oldPrice);
    }

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
}
