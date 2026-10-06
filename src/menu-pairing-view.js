import { getSweetProducts, isHotDrink } from "./menu-pairing.js";

const COPY = {
  tr: {
    legend: "İçeceğinin yanına tatlı",
    hint: "Bir tatlı seç veya sadece içeceğinle devam et.",
    drinkOnly: "Sadece içecek",
    pairPriceLabel: "Çift",
    total: "Bir içecek + bir tatlı"
  },
  en: {
    legend: "Sweet with your drink",
    hint: "Choose a dessert or keep just the drink.",
    drinkOnly: "Just the drink",
    pairPriceLabel: "Pair",
    total: "One drink + one dessert"
  },
  ru: {
    legend: "Сладкое к напитку",
    hint: "Выбери десерт или оставь только напиток.",
    drinkOnly: "Только напиток",
    pairPriceLabel: "Пара",
    total: "Один напиток + один десерт"
  }
};

export function createMenuPairingView({ root, preview, productIndex, onChange, localized, formatPrice }) {
  const document = root.ownerDocument;
  let activeId = "";
  let selectedId = "";
  let language = "tr";
  let summary = null;

  const validProduct = (product) => product && typeof product.image === "string"
    && Number.isFinite(product.item?.price) && product.item.price > 0;
  const activeProduct = () => {
    const product = productIndex.get(activeId);
    return validProduct(product) && isHotDrink(product) ? product : null;
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
  const photo = (product) => {
    const image = element("img");
    image.src = product.image;
    // The adjacent card name or figure caption supplies the same information.
    image.alt = "";
    image.width = 160;
    image.height = 160;
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  };

  function getSelectedProduct() {
    if (!activeProduct() || !selectedId) return null;
    return sweets().find((product) => product.id === selectedId) ?? null;
  }

  function updateSelection() {
    const drink = activeProduct();
    const dessert = getSelectedProduct();
    root.querySelectorAll('input[name="menu-dessert"]').forEach((input) => {
      input.checked = input.value === (dessert?.id ?? "");
      input.closest(".menu-pairing-option").classList.toggle("is-selected", input.checked);
    });
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
      figure.append(photo(product), caption);
      images.append(figure);
    }
    const quote = element("p", "menu-pairing-preview-quote");
    quote.append(element("span", "", COPY[language].total), element("strong", "menu-pairing-preview-total", total));
    preview.append(heading, images, quote);
    if (summary) summary.textContent = `${title} · ${total}`;
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
    return label;
  }

  function clear() {
    activeId = "";
    selectedId = "";
    summary = null;
    root.replaceChildren();
    preview.replaceChildren();
    root.hidden = true;
    preview.hidden = true;
    delete root.dataset.ready;
  }

  function render(product, nextLanguage, reset = false) {
    const current = productIndex.get(product?.id);
    if (!validProduct(current) || !isHotDrink(current)) {
      clear();
      return;
    }
    if (reset || activeId !== current.id) selectedId = "";
    activeId = current.id;
    language = ["tr", "en", "ru"].includes(nextLanguage) ? nextLanguage : "tr";
    if (!getSelectedProduct()) selectedId = "";
    const fieldset = element("fieldset", "menu-pairing-fieldset");
    const legend = element("legend", "", COPY[language].legend);
    const hint = element("p", "menu-pairing-hint", COPY[language].hint);
    const options = element("div", "menu-pairing-options");
    options.append(option(current), ...sweets().map((dessert) => option(current, dessert)));
    summary = element("output", "menu-pairing-summary");
    summary.setAttribute("aria-live", "polite");
    summary.setAttribute("aria-atomic", "true");
    fieldset.append(legend, hint, options, summary);
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
