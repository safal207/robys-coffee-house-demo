import { comboRecipes, MAX_COMBO_QUANTITY, quoteComboSelection, stageComboSelection } from "./src/menu-combos.js";

const copy = {
  tr: {
    title: "Menüden seçmeler", lead: "Anına uygun bir başlangıç seç. İçeriği ve adetleri dilediğin gibi değiştir.",
    note: "Normal menü ürünleri ve fiyatları. Porsiyon, içerik ve alerjenleri kasada sorun. Çocuklar için uygunluğuna ebeveyn karar verir.",
    all: "Tümü", pause: "Bir mola", together: "Birlikte", family: "Çocuklarla", takeaway: "Al götür",
    filters: "Anına göre seç", choose: "İçeriği düzenle", total: "Menü fiyatları toplamı", guests: { 1: "1 kişilik", 2: "2 kişilik", 4: "4 kişilik" },
    edit: "Adetleri değiştir, istemediğini kaldır veya başka bir ürün ekle. Ürünler siparişine ayrı ayrı eklenir.",
    quantity: "Adet", decrease: "Adedi azalt", increase: "Adedi artır", remove: "Kaldır", addProduct: "Başka bir ürün ekle",
    selectProduct: "Menüden ürün seç", add: "Seçilenleri ekle", empty: "En az bir ürün seçin.",
    limit: "Bir ürün sipariş limitine ulaştı. Siparişini kontrol et veya seçilen adedi azalt.",
    error: "Seçim eklenemedi. Tekrar deneyin.", cartError: "Ürünler eklendi. Siparişini üstteki düğmeden açabilirsin.",
    close: "Kapat", fewer: "Önerileri gizle", loading: "Ekleniyor…", regular: "Menüden kendim seçeyim", kids: "Çocuklar için diğer fikirler ve Kids Box",
    maximum: "Bu seçimde ürün başına en fazla 20 adet."
  },
  en: {
    title: "Menu selections", lead: "Find a starting point for your moment. Change the contents and quantities to suit you.",
    note: "Regular menu products and prices. Ask at the counter about portions, ingredients and allergens. Parents decide what is suitable for children.",
    all: "All", pause: "Take a break", together: "Together", family: "With kids", takeaway: "To go",
    filters: "Choose your moment", choose: "Edit contents", total: "Menu total", guests: { 1: "Serves 1", 2: "Serves 2", 4: "Serves 4" },
    edit: "Change quantities, remove anything or add another item. Products are added as separate order lines.",
    quantity: "Quantity", decrease: "Decrease quantity", increase: "Increase quantity", remove: "Remove", addProduct: "Add another item",
    selectProduct: "Choose an item from the menu", add: "Add selected items", empty: "Choose at least one item.",
    limit: "An item has reached the order limit. Check your order or reduce its selected quantity.",
    error: "Could not add this selection. Please try again.", cartError: "Items added. Open your order using the button above.",
    close: "Close", fewer: "Hide suggestions", loading: "Adding…", regular: "Choose from the full menu", kids: "More ideas for kids and Kids Box",
    maximum: "Up to 20 of each item in this selection."
  },
  ru: {
    title: "Подборки из меню", lead: "Выбери идею под свой момент. Состав и количество можно изменить под себя.",
    note: "Обычные позиции и цены меню. Порции, состав и аллергены уточните на кассе. Что подойдёт ребёнку, решает родитель.",
    all: "Все", pause: "На паузу", together: "Вместе", family: "С детьми", takeaway: "С собой",
    filters: "Выбрать по ситуации", choose: "Изменить состав", total: "Сумма по меню", guests: { 1: "1 гость", 2: "2 гостя", 4: "4 гостя" },
    edit: "Измени количество, убери лишнее или добавь другую позицию. Продукты добавятся отдельными строками в заказ.",
    quantity: "Количество", decrease: "Уменьшить количество", increase: "Увеличить количество", remove: "Убрать", addProduct: "Добавить другую позицию",
    selectProduct: "Выбрать позицию из меню", add: "Добавить выбранное", empty: "Выбери хотя бы одну позицию.",
    limit: "Для одной из позиций достигнут лимит заказа. Проверь заказ или уменьши выбранное количество.",
    error: "Не удалось добавить выбор. Попробуй ещё раз.", cartError: "Продукты добавлены. Открыть заказ можно кнопкой сверху.",
    close: "Закрыть", fewer: "Скрыть подборки", loading: "Добавляем…", regular: "Выбрать из полного меню", kids: "Ещё идеи для детей и Kids Box",
    maximum: "До 20 штук каждой позиции в этой подборке."
  }
};
const filters = ["all", "pause", "together", "family", "takeaway"];

export function createMenuCombosUi({ root, productIndex, orderProductIds, initialLanguage,
  localized, formatPrice, mutateDraft, onCartChange, openCart, onIntent }) {
  let language = copy[initialLanguage] ? initialLanguage : "tr";
  let activeFilter = "all";
  let activeRecipe;
  let selectedItems = [];
  let returnFocus;
  let confirming = false;
  let session = 0;
  const text = key => copy[language][key];
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const button = (className, content) => {
    const node = element("button", className, content);
    node.type = "button";
    return node;
  };
  const photo = (source, size = 96) => {
    const image = element("img");
    image.src = source;
    image.alt = "";
    image.width = image.height = size;
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  };
  const title = element("h2");
  title.id = "menu-combos-title";
  title.tabIndex = -1;
  root.setAttribute("aria-labelledby", title.id);
  const hide = button("menu-combos-hide");
  const heading = element("div", "menu-combos-heading");
  heading.append(title, hide);
  const lead = element("p", "menu-combos-lead");
  const filterNav = element("div", "menu-combos-filters");
  filterNav.setAttribute("role", "group");
  const cards = element("div", "menu-combos-cards");
  const note = element("p", "menu-combos-note");
  const links = element("div", "menu-combos-links");
  const regular = element("a");
  regular.href = "#brew-hot";
  const kids = element("a");
  kids.href = "#menu-family";
  links.append(regular, kids);
  root.replaceChildren(heading, lead, filterNav, cards, note, links);

  const dialog = element("dialog", "menu-combos-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-labelledby", "menu-combos-preview-title");
  dialog.setAttribute("aria-describedby", "menu-combos-preview-help");
  const backdrop = element("div", "menu-combos-backdrop");
  backdrop.hidden = true;
  const closeButton = button("menu-combos-close", "×");
  const dialogTitle = element("h2");
  dialogTitle.id = "menu-combos-preview-title";
  dialogTitle.tabIndex = -1;
  const help = element("p", "menu-combos-preview-help");
  help.id = "menu-combos-preview-help";
  const options = element("div", "menu-combos-options");
  const addLabel = element("label", "menu-combos-add-label");
  addLabel.htmlFor = "menu-combos-add-product";
  const addProduct = element("select", "menu-combos-add-product");
  addProduct.id = "menu-combos-add-product";
  const maximum = element("p", "menu-combos-maximum");
  const total = element("p", "menu-combos-total");
  total.setAttribute("aria-live", "polite");
  total.setAttribute("aria-atomic", "true");
  const status = element("p", "menu-combos-status");
  status.setAttribute("role", "status");
  status.hidden = true;
  const add = button("menu-combos-add");
  dialog.append(closeButton, dialogTitle, help, options, addLabel, addProduct, maximum, total, status, add);
  document.body.append(backdrop, dialog);

  function setStatus(key) {
    status.dataset.message = key;
    status.hidden = !key;
    status.textContent = key ? text(key) : "";
  }
  function closePreview(restore = true, preserveIntent = false) {
    if (!preserveIntent) onIntent?.();
    session += 1;
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    dialog.removeAttribute("open");
    dialog.classList.remove("is-fallback");
    backdrop.hidden = true;
    document.body.classList.remove("menu-combos-open");
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function updateQuote() {
    const quote = quoteComboSelection(activeRecipe?.id, selectedItems, productIndex);
    const invalidQuantity = Boolean(options.querySelector("input[aria-invalid=true]"));
    total.textContent = `${text("total")}: ${formatPrice(quote.total)}`;
    add.disabled = confirming || !quote.valid || invalidQuantity;
    add.textContent = confirming ? text("loading") : `${text("add")} · ${formatPrice(quote.total)}`;
    addProduct.disabled = confirming || addProduct.options.length === 1;
    options.querySelectorAll("button,input").forEach(control => { control.disabled = confirming; });
    options.querySelectorAll("[data-combo-increase]").forEach(control => {
      const quantity = selectedItems.find(item => item.id === control.dataset.comboIncrease)?.quantity ?? 0;
      control.disabled = confirming || quantity >= MAX_COMBO_QUANTITY;
    });
    if (!quote.valid && !confirming) setStatus("empty");
    else if (status.dataset.message === "empty") setStatus("");
  }
  function renderProductSelect() {
    const placeholder = element("option", "", text("selectProduct"));
    placeholder.value = "";
    addProduct.replaceChildren(placeholder);
    const current = new Set(selectedItems.map(item => item.id));
    Array.from(productIndex.values()).filter(product => product.category.id !== "pairing-offers" &&
      !product.item.variants?.length && !current.has(product.id))
      .sort((a, b) => localized(a.item.name).localeCompare(localized(b.item.name), language))
      .forEach(product => {
        const option = element("option", "", `${localized(product.item.name)} · ${formatPrice(product.item.price)}`);
        option.value = product.id;
        addProduct.append(option);
      });
    addProduct.disabled = confirming || addProduct.options.length === 1;
  }
  function changeQuantity(id, value, source) {
    if (confirming || !Number.isInteger(value) || value < 0 || value > MAX_COMBO_QUANTITY) return;
    const selected = selectedItems.find(item => item.id === id);
    if (!selected) return;
    selected.quantity = value;
    setStatus("");
    if (!value) {
      selectedItems = selectedItems.filter(item => item.id !== id);
      const row = source.closest(".menu-combos-option");
      const nextFocus = row?.nextElementSibling?.querySelector("input") ?? row?.previousElementSibling?.querySelector("input") ?? addProduct;
      renderOptions();
      renderProductSelect();
      // Rows were recreated; keep a useful focus target after removing an item.
      const nextId = nextFocus?.dataset.comboQuantity;
      (Array.from(options.querySelectorAll("input")).find(input => input.dataset.comboQuantity === nextId) ?? addProduct).focus();
    } else {
      const row = source.closest(".menu-combos-option");
      row.querySelector("input").value = String(value);
      row.querySelector("input").removeAttribute("aria-invalid");
      row.querySelector(".menu-combos-line-price").textContent = formatPrice(productIndex.get(id).item.price * value);
    }
    updateQuote();
  }
  function renderOptions() {
    options.replaceChildren();
    selectedItems.forEach(selected => {
      const product = productIndex.get(selected.id);
      if (!product) return;
      const name = localized(product.item.name);
      const row = element("div", "menu-combos-option");
      row.dataset.comboProduct = product.id;
      const detail = element("div", "menu-combos-option-detail");
      const nameLabel = element("label", "menu-combos-option-name", name);
      const quantityId = `menu-combos-qty-${product.id.replace(/[^a-z0-9-]/g, "-")}`;
      nameLabel.htmlFor = quantityId;
      const linePrice = element("strong", "menu-combos-line-price", formatPrice(product.item.price * selected.quantity));
      detail.append(nameLabel, linePrice);
      const controls = element("div", "menu-combos-quantity");
      const decrease = button("", "−");
      decrease.setAttribute("aria-label", `${text("decrease")}: ${name}`);
      const quantity = element("input");
      quantity.id = quantityId;
      quantity.type = "number";
      quantity.inputMode = "numeric";
      quantity.min = "0";
      quantity.max = String(MAX_COMBO_QUANTITY);
      quantity.step = "1";
      quantity.value = String(selected.quantity);
      quantity.dataset.comboQuantity = product.id;
      quantity.setAttribute("aria-label", `${text("quantity")}: ${name}`);
      const increase = button("", "+");
      increase.dataset.comboIncrease = product.id;
      increase.setAttribute("aria-label", `${text("increase")}: ${name}`);
      const remove = button("menu-combos-remove", text("remove"));
      remove.setAttribute("aria-label", `${text("remove")}: ${name}`);
      decrease.addEventListener("click", () => changeQuantity(product.id, selected.quantity - 1, decrease));
      increase.addEventListener("click", () => changeQuantity(product.id, selected.quantity + 1, increase));
      remove.addEventListener("click", () => changeQuantity(product.id, 0, remove));
      quantity.addEventListener("change", () => {
        const value = quantity.valueAsNumber;
        if (!Number.isInteger(value) || value < 0 || value > MAX_COMBO_QUANTITY) {
          quantity.setAttribute("aria-invalid", "true");
          setStatus("maximum");
          updateQuote();
          return;
        }
        quantity.removeAttribute("aria-invalid");
        changeQuantity(product.id, value, quantity);
      });
      quantity.addEventListener("input", () => {
        const value = quantity.valueAsNumber;
        const invalid = !Number.isInteger(value) || value < 0 || value > MAX_COMBO_QUANTITY;
        if (invalid) { quantity.setAttribute("aria-invalid", "true"); setStatus("maximum"); }
        else { quantity.removeAttribute("aria-invalid"); if (status.dataset.message === "maximum") setStatus(""); }
        updateQuote();
      });
      controls.append(decrease, quantity, increase, remove);
      row.append(photo(product.image), detail, controls);
      options.append(row);
    });
  }
  function renderPreview() {
    dialogTitle.textContent = localized(activeRecipe.name);
    help.textContent = text("edit");
    closeButton.setAttribute("aria-label", text("close"));
    addLabel.textContent = text("addProduct");
    maximum.textContent = text("maximum");
    renderOptions();
    renderProductSelect();
    if (status.dataset.message) setStatus(status.dataset.message);
    updateQuote();
  }
  function showPreview(recipe, trigger) {
    onIntent?.();
    session += 1;
    activeRecipe = recipe;
    selectedItems = recipe.items.map(item => ({ ...item }));
    returnFocus = trigger;
    confirming = false;
    setStatus("");
    renderPreview();
    try {
      if (typeof dialog.showModal !== "function") throw new Error("Dialog fallback");
      dialog.showModal();
    } catch {
      dialog.classList.add("is-fallback");
      dialog.setAttribute("open", "");
      backdrop.hidden = false;
    }
    dialog.setAttribute("aria-modal", "true");
    document.body.classList.add("menu-combos-open");
    dialogTitle.focus({ preventScroll: true });
  }
  function renderCards() {
    const buttons = new Map(Array.from(cards.querySelectorAll("[data-combo-recipe]"), card =>
      [card.dataset.comboRecipe, card.querySelector(".menu-combos-choose")]));
    cards.replaceChildren();
    comboRecipes.filter(recipe => activeFilter === "all" || recipe.filters.includes(activeFilter)).forEach(recipe => {
      const quote = quoteComboSelection(recipe.id, recipe.items, productIndex);
      if (!quote.valid) return;
      const card = element("article", "menu-combos-card");
      card.dataset.comboRecipe = recipe.id;
      const top = element("div", "menu-combos-card-top");
      const logo = photo("src/brand/robys-compact-master-v1.svg", 100);
      logo.className = "menu-combos-logo";
      logo.width = 100;
      logo.height = 32;
      const guests = element("span", "menu-combos-guests", text("guests")[recipe.guests]);
      top.append(logo, guests);
      const figure = element("div", "menu-combos-photo");
      const image = photo(recipe.image, 640);
      image.addEventListener("error", () => {
        const ribbon = figure.querySelector(".menu-combos-ribbon");
        figure.classList.add("is-fallback");
        figure.replaceChildren(...quote.products.map(product => photo(product.image)));
        if (ribbon) figure.append(ribbon);
      }, { once: true });
      figure.append(image);
      if (recipe.id === "family") {
        const ribbon = element("span", "menu-combos-ribbon");
        const heart = element("span", "", "❤");
        heart.setAttribute("aria-hidden", "true");
        ribbon.append(heart, document.createTextNode(text("family")));
        figure.append(ribbon);
      }
      const eyebrow = element("p", "menu-combos-eyebrow", localized(recipe.eyebrow));
      const name = element("h3", "", localized(recipe.name));
      const composition = element("p", "menu-combos-composition", quote.products.map(product =>
        `${product.quantity} × ${localized(product.item.name)}`).join(" · "));
      const price = element("p", "menu-combos-price");
      price.append(element("span", "", text("total")), element("strong", "", formatPrice(quote.total)));
      const choose = buttons.get(recipe.id) ?? button("menu-combos-choose");
      choose.textContent = text("choose");
      choose.setAttribute("aria-label", `${text("choose")}: ${localized(recipe.name)}`);
      if (!buttons.has(recipe.id)) choose.addEventListener("click", () => showPreview(recipe, choose));
      card.append(top, figure, eyebrow, name, composition, price, choose);
      cards.append(card);
    });
  }
  function renderFilters() {
    filterNav.setAttribute("aria-label", text("filters"));
    filterNav.replaceChildren();
    filters.forEach(filter => {
      const control = button("menu-combos-filter", text(filter));
      control.dataset.comboFilter = filter;
      control.setAttribute("aria-pressed", String(filter === activeFilter));
      control.addEventListener("click", () => {
        onIntent?.();
        activeFilter = filter;
        Array.from(filterNav.children).forEach(item => item.setAttribute("aria-pressed", String(item === control)));
        renderCards();
      });
      filterNav.append(control);
    });
  }
  addProduct.addEventListener("change", () => {
    const id = addProduct.value;
    if (confirming || !id || selectedItems.some(item => item.id === id)) return;
    selectedItems.push({ id, quantity: 1 });
    setStatus("");
    renderOptions();
    renderProductSelect();
    updateQuote();
    Array.from(options.querySelectorAll("input")).find(input => input.dataset.comboQuantity === id)?.focus();
  });
  closeButton.addEventListener("click", () => closePreview());
  backdrop.addEventListener("click", () => closePreview());
  dialog.addEventListener("cancel", event => { event.preventDefault(); closePreview(); });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closePreview();
  });
  document.addEventListener("keydown", event => {
    if (!dialog.hasAttribute("open")) return;
    if (event.key === "Escape") { event.preventDefault(); closePreview(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]"));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  hide.addEventListener("click", () => {
    onIntent?.();
    root.hidden = true;
    const section = root.closest(".menu-combos-section");
    if (section) section.hidden = true;
    const trigger = document.querySelector("#menu-combos-trigger");
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.focus({ preventScroll: true });
  });
  add.addEventListener("click", async () => {
    if (confirming || add.disabled) return;
    const recipeId = activeRecipe.id;
    const items = selectedItems.map(item => ({ ...item }));
    const isLatestIntent = onIntent?.() ?? (() => true);
    const previewSession = session;
    confirming = true;
    updateQuote();
    let result;
    try {
      result = await mutateDraft(current => stageComboSelection(current, recipeId, items, productIndex, orderProductIds));
      onCartChange();
    } catch {
      if (previewSession === session && isLatestIntent()) { confirming = false; setStatus("error"); updateQuote(); }
      return;
    }
    if (previewSession !== session) return;
    if (!isLatestIntent()) { confirming = false; updateQuote(); return; }
    if (!result.applied) { confirming = false; setStatus("limit"); updateQuote(); return; }
    const trigger = returnFocus;
    closePreview(false, true);
    const currentSession = session;
    try { await openCart(trigger, () => currentSession === session && isLatestIntent()); }
    catch {
      if (currentSession !== session || !isLatestIntent()) return;
      trigger?.focus({ preventScroll: true });
      const notice = document.querySelector("#menu-cart-status");
      if (notice) { notice.textContent = text("cartError"); notice.classList.add("is-visible"); }
    }
    finally { if (currentSession === session) confirming = false; }
  });
  function refresh(nextLanguage) {
    language = copy[nextLanguage] ? nextLanguage : "tr";
    title.textContent = text("title");
    lead.textContent = text("lead");
    note.textContent = text("note");
    hide.textContent = text("fewer");
    regular.textContent = text("regular");
    kids.textContent = text("kids");
    renderFilters();
    renderCards();
    if (dialog.hasAttribute("open")) renderPreview();
  }
  refresh(language);
  return {
    refresh,
    reveal(filter = "all") {
      root.hidden = false;
      const section = root.closest(".menu-combos-section");
      if (section) section.hidden = false;
      if (filters.includes(filter) && activeFilter !== filter) { activeFilter = filter; renderFilters(); renderCards(); }
      title.focus({ preventScroll: true });
    },
    close() { closePreview(false, true); },
    focusHeading() { title.focus({ preventScroll: true }); },
    isOpen() { return dialog.hasAttribute("open"); }
  };
}
