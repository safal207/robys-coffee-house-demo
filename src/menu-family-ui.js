import { familyRecipes, quoteFamilySelection, stageFamilySelection } from "./src/menu-family.js";
import { createKidsMenuSection } from "./src/kids-menu.js";

const copy = {
  tr: {
    title: "Çocuklarla", lead: "Menüden üç başlangıç fikri. Nelerin uygun olduğuna ebeveyn karar verir.", ideas: "İçeriğini seçebileceğiniz fikirler",
    note: "Normal menü ürünleri ve fiyatları. Porsiyon, içerik ve alerjenleri kasada sorun.",
    choose: "İçeriği seç", edit: "İstemediklerinin işaretini kaldır. Ürünler siparişe ayrı ayrı eklenir.",
    add: "Seçilenleri ekle", total: "Seçilenlerin toplamı", empty: "En az bir ürün seçin.",
    limit: "Bu seçim için bir ürünün adedi dolu. Siparişini kontrol et veya o ürünün işaretini kaldır.",
    error: "Seçim eklenemedi. Tekrar deneyin.", cartError: "Ürünler eklendi. Siparişini üstteki düğmeden açabilirsin.",
    close: "Kapat", fewer: "Önerileri gizle", loading: "Açılıyor…", regular: "Menüden kendim seçeyim",
    boxSoon: "Yakında menüde", boxTitle: "Roby’s Kids Box + Kinder Sürpriz",
    boxDetails: "Kinder Sürprizli bir çocuk kombosu hazırlıyoruz. İçeriği ve fiyatı yakında paylaşacağız.",
    boxSeparate: "Kinder Sürpriz tek başına da yakında menüde.",
    boxSafety: "3 yaş altı için uygun değildir. Oyuncak küçük parçalar içerir; yetişkin gözetimi önerilir.",
    boxConcept: "Görsel konsepttir; kutu ve içerik değişebilir.",
    boxAlt: "Kinder Sürprizli Roby’s Kids Box çocuk kombosu konsepti"
  },
  en: {
    title: "With kids", lead: "Three starting ideas from the menu. Parents decide what is suitable.", ideas: "Ideas with editable contents",
    note: "Regular menu products and prices. Ask at the counter about portions, ingredients and allergens.",
    choose: "Choose contents", edit: "Uncheck anything you do not want. Products are added as separate order lines.",
    add: "Add selected items", total: "Selected total", empty: "Choose at least one item.",
    limit: "An item in this selection is at its quantity limit. Check your order or uncheck that item.",
    error: "Could not add this selection. Please try again.", cartError: "Items added. You can open your order using the button above.",
    close: "Close", fewer: "Hide suggestions", loading: "Opening…", regular: "Choose from the full menu",
    boxSoon: "Coming soon to the menu", boxTitle: "Roby’s Kids Box + Kinder Surprise",
    boxDetails: "We’re preparing a kids’ combo with Kinder Surprise. Contents and price will be shared later.",
    boxSeparate: "Kinder Surprise will also be available separately soon.",
    boxSafety: "Not suitable for children under 3. The toy contains small parts; adult supervision is recommended.",
    boxConcept: "Concept image; packaging and contents may change.",
    boxAlt: "Concept for a Roby’s Kids Box combo with Kinder Surprise"
  },
  ru: {
    title: "С ребёнком", lead: "Три идеи из обычного меню. Что подойдёт ребёнку, решает родитель.", ideas: "Идеи с выбором состава",
    note: "Обычные позиции и цены меню. Порции, состав и аллергены уточните на кассе.",
    choose: "Выбрать состав", edit: "Убери галочку у лишнего. Продукты добавятся отдельными строками — каждый можно убрать или изменить количество.",
    add: "Добавить выбранное", total: "Сумма выбранного", empty: "Выбери хотя бы одну позицию.",
    limit: "Для одной из позиций достигнут лимит количества. Проверь заказ или убери её из выбора.",
    error: "Не удалось добавить выбор. Попробуй ещё раз.", cartError: "Продукты добавлены. Открыть заказ можно кнопкой сверху.",
    close: "Закрыть", fewer: "Скрыть подборку", loading: "Открываем…", regular: "Выбрать из полного меню",
    boxSoon: "Скоро в меню", boxTitle: "Roby’s Kids Box + Kinder Surprise",
    boxDetails: "Готовим детское комбо с Kinder Surprise. Состав и цену сообщим позже.",
    boxSeparate: "Kinder Surprise отдельно — тоже скоро в меню.",
    boxSafety: "Не подходит детям младше 3 лет: игрушка содержит мелкие детали. Рекомендуется присмотр взрослых.",
    boxConcept: "Изображение концепта: упаковка и состав могут измениться.",
    boxAlt: "Концепт детского комбо Roby’s Kids Box с Kinder Surprise"
  }
};

export function createMenuFamilyUi({ root, productIndex, orderProductIds, initialLanguage,
  localized, formatPrice, readDraft, mutateDraft, onCartChange, openCart, onIntent, addKidsCombo, openProduct }) {
  let language = initialLanguage;
  let activeRecipe;
  let selectedIds = [];
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
  const photo = product => {
    const image = element("img");
    image.src = product.image;
    image.alt = "";
    image.width = image.height = 160;
    image.loading = "lazy";
    image.decoding = "async";
    return image;
  };
  const title = element("h2", "", text("title"));
  title.id = "menu-family-title";
  title.tabIndex = -1;
  root.setAttribute("aria-labelledby", title.id);
  const lead = element("p", "menu-family-lead", text("lead"));
  const note = element("p", "menu-family-note", text("note"));
  const hide = element("button", "menu-family-hide", text("fewer"));
  hide.type = "button";
  const heading = element("div", "menu-family-heading");
  heading.append(title, hide);
  const cards = element("div", "menu-family-cards");
  const ready = element("div", "menu-family-ready");
  const ideas = element("h3", "menu-family-ideas-title", text("ideas"));
  const kidsProducts = new Map(Array.from(productIndex, ([id, product]) => [id, {
    id, name: product.item.name, image: product.image, unitPriceMinor: Math.round(product.item.price * 100)
  }]));
  function renderReady() {
    const section = createKidsMenuSection({ language, products: kidsProducts, idPrefix: "kids-menu",
      onAdd: (combo, trigger) => addKidsCombo?.(combo, trigger) ?? false, onProduct: openProduct });
    ready.replaceChildren(...(section ? [section] : []));
  }
  const regular = element("a", "menu-family-regular", text("regular"));
  regular.href = "#brew-hot";
  const comingSoon = element("article", "menu-family-coming-soon");
  const boxFigure = element("figure", "menu-family-box-figure");
  const boxImage = element("img", "menu-family-box-image");
  boxImage.src = "src/products/family-sets-v1/kids-box-kinder-v1.webp";
  boxImage.alt = text("boxAlt");
  boxImage.width = boxImage.height = 900;
  boxImage.loading = "lazy";
  boxImage.decoding = "async";
  const boxCaption = element("figcaption", "menu-family-box-caption", text("boxConcept"));
  boxFigure.append(boxImage, boxCaption);
  const boxCopy = element("div", "menu-family-box-copy");
  const boxTitle = element("h3", "", text("boxTitle"));
  const boxStatus = element("p", "menu-family-box-status", text("boxSoon"));
  const boxDetails = element("p", "menu-family-box-details", text("boxDetails"));
  const boxSeparate = element("p", "menu-family-box-separate", text("boxSeparate"));
  const boxSafety = element("p", "menu-family-box-safety", text("boxSafety"));
  boxCopy.append(boxStatus, boxTitle, boxDetails, boxSeparate, boxSafety);
  comingSoon.append(boxFigure, boxCopy);
  root.replaceChildren(heading, lead, ready, comingSoon, ideas, cards, note, regular);
  renderReady();

  const dialog = element("dialog", "menu-family-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-labelledby", "menu-family-preview-title");
  dialog.setAttribute("aria-describedby", "menu-family-preview-help");
  const backdrop = element("div", "menu-family-backdrop");
  backdrop.hidden = true;
  const close = element("button", "menu-family-close", "×");
  close.type = "button";
  const dialogTitle = element("h2");
  dialogTitle.id = "menu-family-preview-title";
  dialogTitle.tabIndex = -1;
  const help = element("p", "menu-family-preview-help");
  help.id = "menu-family-preview-help";
  const options = element("div", "menu-family-options");
  const total = element("p", "menu-family-total");
  total.setAttribute("aria-live", "polite");
  const status = element("p", "menu-family-status");
  status.setAttribute("role", "status");
  status.hidden = true;
  const add = element("button", "button button-primary menu-family-add");
  add.type = "button";
  dialog.append(close, dialogTitle, help, options, total, status, add);
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
    document.body.classList.remove("menu-family-open");
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function updateQuote() {
    const quote = quoteFamilySelection(activeRecipe?.id, selectedIds, productIndex);
    total.textContent = `${text("total")}: ${formatPrice(quote.total)}`;
    add.disabled = confirming || !quote.valid;
    add.textContent = confirming ? text("loading") : `${text("add")} · ${formatPrice(quote.total)}`;
    if (!quote.valid && !confirming) setStatus("empty");
    else if (status.dataset.message === "empty") setStatus("");
  }
  function renderPreview() {
    dialogTitle.textContent = localized(activeRecipe.name);
    help.textContent = text("edit");
    close.setAttribute("aria-label", text("close"));
    options.replaceChildren();
    activeRecipe.productIds.forEach(id => {
      const product = productIndex.get(id);
      if (!product) return;
      const label = element("label", "menu-family-option");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.value = id;
      checkbox.checked = selectedIds.includes(id);
      const name = element("span", "menu-family-option-name", localized(product.item.name));
      const price = element("strong", "", formatPrice(product.item.price));
      checkbox.addEventListener("change", () => {
        selectedIds = Array.from(options.querySelectorAll("input:checked"), input => input.value);
        setStatus("");
        updateQuote();
      });
      label.append(checkbox, photo(product), name, price);
      options.append(label);
    });
    if (status.dataset.message) setStatus(status.dataset.message);
    updateQuote();
  }
  function showPreview(recipe, trigger) {
    onIntent?.();
    session += 1;
    activeRecipe = recipe;
    selectedIds = [...recipe.productIds];
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
    document.body.classList.add("menu-family-open");
    dialogTitle.focus({ preventScroll: true });
  }
  function renderCards() {
    const buttons = new Map(Array.from(cards.querySelectorAll("[data-family-recipe]"), card =>
      [card.dataset.familyRecipe, card.querySelector("button")]));
    cards.replaceChildren();
    familyRecipes.forEach(recipe => {
      const quote = quoteFamilySelection(recipe.id, recipe.productIds, productIndex);
      if (!quote.valid) return;
      const card = element("article", "menu-family-card");
      card.dataset.familyRecipe = recipe.id;
      const photos = element("div", "menu-family-photos");
      const image = photo({ image: recipe.image });
      image.alt = quote.products.map(product => localized(product.item.name)).join(" + ");
      image.width = image.height = 900;
      const ribbon = element("span", "menu-family-ribbon");
      ribbon.hidden = true;
      const heart = element("span", "", "❤");
      heart.setAttribute("aria-hidden", "true");
      ribbon.append(heart, document.createTextNode(text("title")));
      image.addEventListener("error", () => {
        photos.classList.add("is-fallback");
        ribbon.hidden = false;
        photos.replaceChildren(...quote.products.map(photo), ribbon);
      }, { once: true });
      photos.append(image, ribbon);
      const name = element("h3", "", localized(recipe.name));
      const composition = element("p", "menu-family-composition", quote.products.map(product => localized(product.item.name)).join(" + "));
      const price = element("strong", "menu-family-price", formatPrice(quote.total));
      const choose = buttons.get(recipe.id) ?? element("button", "button menu-family-choose");
      choose.textContent = text("choose");
      choose.type = "button";
      choose.setAttribute("aria-label", `${text("choose")}: ${localized(recipe.name)}`);
      if (!buttons.has(recipe.id)) choose.addEventListener("click", () => showPreview(recipe, choose));
      card.append(photos, name, composition, price, choose);
      cards.append(card);
    });
  }
  close.addEventListener("click", () => closePreview());
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
    const controls = Array.from(dialog.querySelectorAll("button:not(:disabled),input:not(:disabled)"));
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
    document.querySelector("#menu-family").hidden = true;
    const trigger = document.querySelector("#menu-family-trigger");
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.focus({ preventScroll: true });
  });
  add.addEventListener("click", async () => {
    if (confirming || add.disabled) return;
    const recipeId = activeRecipe.id;
    const ids = [...selectedIds];
    const isLatestIntent = onIntent?.() ?? (() => true);
    const previewSession = session;
    confirming = true;
    updateQuote();
    let result;
    try {
      result = await mutateDraft(current => stageFamilySelection(current, recipeId, ids, productIndex, orderProductIds));
      onCartChange();
    } catch {
      if (previewSession === session) { confirming = false; setStatus("error"); updateQuote(); }
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
      // The selection is already saved; retrying must not add it twice.
      if (currentSession !== session) return;
      trigger?.focus({ preventScroll: true });
      const notice = document.querySelector("#menu-cart-status");
      notice.textContent = text("cartError");
      notice.classList.add("is-visible");
    }
    finally { if (currentSession === session) confirming = false; }
  });
  function refresh(nextLanguage) {
    language = nextLanguage;
    title.textContent = text("title");
    lead.textContent = text("lead");
    ideas.textContent = text("ideas");
    note.textContent = text("note");
    hide.textContent = text("fewer");
    regular.textContent = text("regular");
    boxImage.alt = text("boxAlt");
    boxCaption.textContent = text("boxConcept");
    boxStatus.textContent = text("boxSoon");
    boxTitle.textContent = text("boxTitle");
    boxDetails.textContent = text("boxDetails");
    boxSeparate.textContent = text("boxSeparate");
    boxSafety.textContent = text("boxSafety");
    renderReady();
    renderCards();
    if (dialog.hasAttribute("open")) renderPreview();
  }
  renderCards();
  return { refresh, reveal() { root.hidden = false; title.focus({ preventScroll: true }); } };
}
