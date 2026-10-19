// Curated sets reference real menu products. They are not new priced SKUs.
export const kidsCombos = [
  {
    id: "kids-mini",
    name: { tr: "Mini Kombo", en: "Mini Combo", ru: "Мини-комбо" },
    lead: { tr: "Süt ve yanında bir kurabiye.", en: "Milk with a cookie on the side.", ru: "Молоко и печенье к нему." },
    items: [{ id: "brew-hot:milk", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }]
  },
  {
    id: "kids-big",
    name: { tr: "Büyük Kombo", en: "Big Combo", ru: "Большое комбо" },
    lead: { tr: "Süt, üç peynirli kruvasan ve kurabiye.", en: "Milk, a three-cheese croissant and a cookie.", ru: "Молоко, круассан с тремя сырами и печенье." },
    items: [{ id: "brew-hot:milk", quantity: 1 }, { id: "food:three-cheese-croissant", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }]
  }
];

export const kidsMenuCopy = {
  tr: {
    title: "Çocuk Menüsü", eyebrow: "ROBY'S · AİLE ZAMANI",
    lead: "İki hazır seçenek. Çocuğunuza ve iştahına uygun olanı siz seçin.",
    portions: "Her üründe menüdeki normal porsiyon sunulur. Fiyat, seçilen ürünlerin toplamıdır.",
    allergy: "Alerji varsa içerikleri lütfen kasada sorun.",
    add: "Ekle", individual: "Tek tek de seçebilirsiniz", choose: "Seç", items: "ürün",
    failed: "Kombo eklenemedi. Sepetteki adetleri kontrol edip yeniden deneyin."
  },
  en: {
    title: "Kids' Menu", eyebrow: "ROBY'S · FAMILY TIME",
    lead: "Two ready-made choices. Pick what suits your child and their appetite.",
    portions: "Each item is a regular menu portion. The price is the sum of the selected items.",
    allergy: "For allergies, please check ingredients with the cashier.",
    add: "Add", individual: "You can choose items separately", choose: "Choose", items: "items",
    failed: "The combo could not be added. Check the quantities in your order and try again."
  },
  ru: {
    title: "Детское меню", eyebrow: "ROBY'S · СЕМЕЙНОЕ ВРЕМЯ",
    lead: "Два готовых варианта. Родитель выбирает по вкусу и аппетиту ребёнка.",
    portions: "В каждом наборе — обычные порции меню. Цена складывается из выбранных позиций.",
    allergy: "Если есть аллергия, уточните состав у кассира.",
    add: "Добавить", individual: "Можно выбрать отдельно", choose: "Выбрать", items: "позиции",
    failed: "Не удалось добавить комбо. Проверь количество в заказе и попробуй ещё раз."
  }
};

function signature(items) {
  if (!Array.isArray(items)) return "";
  return items.map(item => `${item.id}:${item.quantity ?? 1}:${item.variant ?? ""}`).sort().join("|");
}

export function kidsComboForItems(items) {
  const key = signature(items);
  return kidsCombos.find(combo => signature(combo.items) === key);
}

function normalized(value) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/ё/g, "е");
}

export function createKidsMenuSection({ language, products, onAdd, onProduct, photo, query = "", actionLabel, idPrefix = "kids-menu", quantity = 1 }) {
  const copy = kidsMenuCopy[language];
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  const matches = values => terms.every(term => normalized(values.join(" ")).includes(term));
  const combos = kidsCombos.filter(combo => combo.items.every(item => products.has(item.id)) && matches([
    ...Object.values(kidsMenuCopy).map(value => value.title),
    ...Object.values(combo.name), ...Object.values(combo.lead),
    ...combo.items.flatMap(item => Object.values(products.get(item.id).name))
  ]));
  if (!combos.length) return null;
  const price = new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], {
    style: "currency", currency: "TRY", maximumFractionDigits: 0
  });
  const amount = minor => price.format(minor / 100);
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const section = node("section", "kids-menu");
  section.id = idPrefix;
  section.dataset.kidsMenu = "true";
  const title = node("h2", "kids-menu-title", copy.title);
  title.id = `${idPrefix}-title`;
  section.setAttribute("aria-labelledby", title.id);
  const header = node("header", "kids-menu-header");
  header.append(node("p", "kids-menu-eyebrow", copy.eyebrow), title, node("p", "kids-menu-lead", copy.lead));
  const grid = node("div", "kids-combo-grid");
  const status = node("p", "kids-menu-status");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  for (const combo of combos) {
    const card = node("article", `kids-combo kids-combo--${combo.id === "kids-big" ? "big" : "mini"}`);
    card.dataset.kidsCombo = combo.id;
    const heading = node("div", "kids-combo-heading");
    heading.append(node("h3", "", combo.name[language]), node("span", "kids-combo-count", `${combo.items.length} ${copy.items}`));
    const photos = node("div", "kids-combo-photos");
    let total = 0;
    for (const item of combo.items) {
      const product = products.get(item.id);
      total += product.unitPriceMinor * item.quantity;
      const figure = node("figure", "kids-combo-product");
      let visual;
      if (photo) visual = photo(product, `${combo.id}:${item.id}`);
      else {
        visual = node("img", "kids-product-image");
        visual.src = product.image; visual.alt = "";
        visual.width = 320; visual.height = 320; visual.loading = "lazy"; visual.decoding = "async";
      }
      const caption = node("figcaption", "");
      caption.append(node("span", "", product.name[language]), node("strong", "", amount(product.unitPriceMinor * item.quantity)));
      figure.append(visual, caption); photos.append(figure);
    }
    const footer = node("div", "kids-combo-footer");
    const selectionTotal = total * quantity;
    const button = node("button", "kids-combo-add", `${actionLabel ?? copy.add} ${quantity > 1 ? `${quantity} × ` : ""}${combo.name[language]} · ${amount(selectionTotal)}`);
    button.type = "button";
    let busy = false;
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true; button.disabled = true; button.setAttribute("aria-busy", "true"); status.textContent = "";
      try {
        if (await onAdd(combo, button) === false) status.textContent = copy.failed;
      } catch { status.textContent = copy.failed; }
      finally { busy = false; button.disabled = false; button.removeAttribute("aria-busy"); }
    });
    footer.append(node("strong", "kids-combo-total", amount(selectionTotal)), button);
    card.append(heading, node("p", "kids-combo-lead", combo.lead[language]), photos, footer);
    grid.append(card);
  }
  section.append(header, grid);
  if (onProduct) {
    const individual = node("div", "kids-menu-individual");
    individual.append(node("h3", "", copy.individual));
    const actions = node("div", "kids-menu-products");
    for (const id of ["brew-hot:milk", "desserts:cookie", "food:three-cheese-croissant"]) {
      const product = products.get(id);
      if (!product || !matches([...Object.values(product.name), ...Object.values(kidsMenuCopy).map(value => value.title)])) continue;
      const button = node("button", "kids-menu-product", `${product.name[language]} · ${amount(product.unitPriceMinor)}`);
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-label", `${copy.choose}: ${product.name[language]}, ${amount(product.unitPriceMinor)}`);
      button.addEventListener("click", () => onProduct(id, button));
      actions.append(button);
    }
    individual.append(actions); section.append(individual);
  }
  section.append(status, node("p", "kids-menu-note", copy.portions), node("p", "kids-menu-note", copy.allergy));
  return section;
}
