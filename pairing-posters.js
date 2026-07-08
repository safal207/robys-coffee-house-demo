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

function enhancePairingCards() {
  const lang = currentLanguage();
  document.querySelectorAll(".full-menu-panel--featured .full-menu-item--visual").forEach((card) => {
    const media = card.querySelector(".full-menu-item-media");
    const name = card.querySelector(".full-menu-item-copy strong")?.textContent?.trim() ?? "";
    const price = card.querySelector(".full-menu-price")?.textContent?.trim() ?? "";
    const pairingId = card.dataset.pairing ?? "";
    if (!media || !name || !price) return;

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

    const title = document.createElement("div");
    title.className = "pairing-poster-title";
    title.innerHTML = `
      <span class="pairing-poster-title-main"></span>
      <span class="pairing-poster-title-plus">+</span>
      <span class="pairing-poster-title-accent"></span>
    `;
    title.querySelector(".pairing-poster-title-main").textContent = main;
    title.querySelector(".pairing-poster-title-accent").textContent = accent;

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

    overlay.append(kicker, title, priceBadge, bottom);
    media.append(overlay);
  });
}

const menuRoot = document.querySelector("#menu-root");
if (menuRoot) {
  const observer = new MutationObserver(() => enhancePairingCards());
  observer.observe(menuRoot, { childList: true, subtree: true });
  enhancePairingCards();
}
