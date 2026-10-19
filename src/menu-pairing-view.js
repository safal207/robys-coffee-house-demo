import { getSweetProducts } from "./menu-pairing.js";
import { isEditablePairDrink } from "./menu-promo-pair.js";

const COPY = {
  tr: {
    legend: "İçeceğinin yanına tatlı",
    hint: "Bir tatlı seç veya sadece içeceğinle devam et.",
    drinkOnly: "Sadece içecek",
    pairPriceLabel: "Çift",
    total: "Bir çiftin fiyatı · bir içecek + bir tatlı",
    more: "Tüm tatlıları göster", less: "Daha az seçenek göster", extra: "Ekle"
  },
  en: {
    legend: "Sweet with your drink",
    hint: "Choose a dessert or keep just the drink.",
    drinkOnly: "Just the drink",
    pairPriceLabel: "Pair",
    total: "Price per pair · one drink + one dessert",
    more: "See all desserts", less: "Show fewer choices", extra: "Add"
  },
  ru: {
    legend: "Сладкое к напитку",
    hint: "Выбери десерт или оставь только напиток.",
    drinkOnly: "Только напиток",
    pairPriceLabel: "Пара",
    total: "Цена за одну пару · один напиток + один десерт",
    more: "Все десерты", less: "Свернуть выбор", extra: "Добавка"
  }
};

export function createMenuPairingView({ root, preview, productIndex, onChange, localized, formatPrice }) {
  const document = root.ownerDocument;
  let activeId = "";
  let selectedId = "";
  let language = "tr";
  let summary = null;
  let expanded = false;
  let expandButton = null;
  // Editorial starting points at different prices, not popularity claims.
  const startingIds = ["desserts:san-sebastian-cheesecake", "desserts:brownie", "desserts:cookie"];

  const validProduct = (product) => product && typeof product.image === "string"
    && Number.isFinite(product.item?.price) && product.item.price > 0;
  const activeProduct = () => {
    const product = productIndex.get(activeId);
    return validProduct(product) && isEditablePairDrink(product) ? product : null;
  };
  const sweets = () => getSweetProducts(productIndex).filter(validProduct);
  const name = (product) => localized(product.item.name, language);
  const price = (amount) => formatPrice(amount, language);
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const photo = (product, selected = false) => {
    const image = element("img");
    image.src = product.image;
    // The adjacent card name or figure caption supplies the same information.
    image.alt = "";
    image.width = 160;
    image.height = 160;
    image.loading = selected ? "eager" : "lazy";
    image.decoding = "async";
    return image;
  };

  function getSelectedProduct() {
    if (!activeProduct() || !selectedId) return null;
    return sweets().find((product) => product.id === selectedId) ?? null;
  }

  function updateChoices() {
    const available = sweets();
    const starters = startingIds.map(id => available.find(product => product.id === id)).filter(Boolean);
    for (const product of available) {
      if (starters.length >= 3) break;
      if (!starters.includes(product)) starters.push(product);
    }
    // A remembered or expanded choice must stay visible when the list collapses.
    const selected = getSelectedProduct();
    if (selected && !starters.includes(selected)) starters.splice(2, 1, selected);
    const shown = new Set(starters.map(product => product.id));
    root.querySelectorAll('input[name="menu-dessert"]').forEach(input => {
      input.closest(".menu-pairing-option").hidden = Boolean(input.value) && !expanded && !shown.has(input.value);
    });
    if (expandButton) {
      expandButton.hidden = available.length <= 3;
      expandButton.textContent = expanded ? COPY[language].less : COPY[language].more;
      expandButton.setAttribute("aria-expanded", String(expanded));
    }
  }

  function updateSelection() {
    const drink = activeProduct();
    const dessert = getSelectedProduct();
    root.querySelectorAll('input[name="menu-dessert"]').forEach((input) => {
      input.checked = input.value === (dessert?.id ?? "");
      input.closest(".menu-pairing-option").classList.toggle("is-selected", input.checked);
    });
    updateChoices();
    preview.replaceChildren();
    preview.hidden = !dessert;
    if (!drink) return;
    if (!dessert) {
      if (summary) summary.textContent = `${COPY[language].drinkOnly} · ${price(drink.item.price)}`;
      return;
    }

    const title = `${name(drink)} + ${name(dessert)}`;
    const total = price(drink.item.price + dessert.item.price);
    const heading = element("h3", "menu-pairing-preview-title", title);
    const images = element("div", "menu-pairing-preview-images");
    for (const product of [drink, dessert]) {
      const figure = element("figure");
      const caption = element("figcaption");
      caption.append(element("span", "menu-pairing-figure-name", name(product)),
        element("span", "menu-pairing-unit-price", price(product.item.price)));
      figure.append(photo(product, true), caption);
      images.append(figure);
    }
    const quote = element("p", "menu-pairing-preview-quote");
    quote.append(element("span", "", COPY[language].total), element("strong", "menu-pairing-preview-total", total));
    preview.append(heading, images, quote);
    if (summary) summary.textContent = `${COPY[language].total}: ${total}`;
  }

  function option(drink, dessert = null) {
    const label = element("label", "menu-pairing-option");
    const input = element("input");
    input.type = "radio";
    input.name = "menu-dessert";
    input.value = dessert?.id ?? "";
    const images = element("span", "menu-pairing-images");
    images.append(photo(drink));
    if (dessert) images.append(photo(dessert));
    const total = drink.item.price + (dessert?.item.price ?? 0);
    label.append(input, images,
      element("span", "menu-pairing-name", dessert ? name(dessert) : COPY[language].drinkOnly),
      element("span", "menu-pairing-price", dessert
        ? `${COPY[language].pairPriceLabel} · ${price(total)}` : price(total)));
    if (dessert) label.append(element("span", "menu-pairing-extra", `${COPY[language].extra} +${price(dessert.item.price)}`));
    return label;
  }

  function clear() {
    activeId = "";
    selectedId = "";
    summary = null;
    expanded = false;
    expandButton = null;
    root.replaceChildren();
    preview.replaceChildren();
    root.hidden = true;
    preview.hidden = true;
    delete root.dataset.ready;
  }

  function render(product, nextLanguage, reset = false, preferredId = "") {
    const current = productIndex.get(product?.id);
    if (!validProduct(current) || !isEditablePairDrink(current)) {
      clear();
      return;
    }
    if (reset || activeId !== current.id) { selectedId = preferredId; expanded = false; }
    activeId = current.id;
    language = ["tr", "en", "ru"].includes(nextLanguage) ? nextLanguage : "tr";
    if (!getSelectedProduct()) selectedId = "";
    const fieldset = element("fieldset", "menu-pairing-fieldset");
    const legend = element("legend", "", COPY[language].legend);
    const hint = element("p", "menu-pairing-hint", COPY[language].hint);
    const options = element("div", "menu-pairing-options");
    options.id = "menu-dessert-options";
    options.append(option(current), ...sweets().map((dessert) => option(current, dessert)));
    expandButton = element("button", "menu-pairing-expand");
    expandButton.type = "button";
    expandButton.setAttribute("aria-controls", options.id);
    expandButton.addEventListener("click", () => {
      expanded = !expanded;
      updateChoices();
    });
    summary = element("output", "menu-pairing-summary");
    summary.setAttribute("aria-live", "polite");
    summary.setAttribute("aria-atomic", "true");
    fieldset.append(legend, hint, options, expandButton, summary);
    root.replaceChildren(fieldset);
    root.hidden = false;
    root.lang = language;
    preview.lang = language;
    updateSelection();
    root.dataset.ready = "true";
  }

  root.addEventListener("change", (event) => {
    const input = event.target;
    if (input?.type !== "radio" || input.name !== "menu-dessert" || !input.checked || !activeProduct()) return;
    selectedId = sweets().some((product) => product.id === input.value) ? input.value : "";
    updateSelection();
    onChange?.(getSelectedProduct());
  });

  return { render, getSelectedProduct, clear };
}
