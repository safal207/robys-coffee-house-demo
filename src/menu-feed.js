import { menuCategories, menuCopy } from "./menu-catalog.js?v=05e7dac3c17b";
import { feedProducts, filterFeed, quoteFeedOrder } from "./src/menu-feed-model.js";

const copy = {
  tr: { title: "Kaydır.\nKeşfet.\nTadını seç.", lead: "Bir kahve, bir tatlı, belki de ikisi. Bir sonraki seçimin bu akışta.",
    classic: "Klasik menü", allMenu: "Tüm menüyü liste olarak gör ↗", feedTitle: "Menü akışı", skip: "Menüye geç",
    hint: "Kaydır, beğendiğini siparişine ekle.", guide: "Büyük fotoğraflar.\nKüçük bir mola.", search: "Kahve, tatlı…",
    searchLabel: "Menüde ara", clear: "Aramayı temizle", empty: "Aradığın burada yok.", reset: "Tümünü göster",
    more: "Daha fazla göster", end: "Menünün sonuna geldin. Seçim senin.", order: "Siparişim", total: "Toplam",
    draft: "Bu bir sipariş taslağıdır; kafeye otomatik gönderilmez. Ödeme kasada yapılır.", checkout: "Kasa için QR oluştur",
    continue: "Keşfetmeye devam et", close: "Kapat", all: "Tümü", add: "+ Siparişe ekle", added: "Siparişine eklendi",
    inOrder: "siparişinde", flavor: "Lezzet seç", choose: "Bir lezzet seçin", next: "Sonraki ürüne geç", results: "ürün",
    loading: "Sipariş okunuyor…", error: "İşlem tamamlanamadı. Tekrar dene; seçimini kontrol et.", limit: "Bu üründen en fazla 99 adet ekleyebilirsin.",
    cartEmpty: "Henüz bir seçim eklemedin.", remove: "Kaldır", decrease: "Adedi azalt", increase: "Adedi artır", updated: "Sipariş güncellendi", retry: "Sayfayı yenile" },
  en: { title: "Scroll.\nDiscover.\nFind your taste.", lead: "A coffee, a dessert, or a little of both. Your next choice is in this feed.",
    classic: "Classic menu", allMenu: "See the menu as a list ↗", feedTitle: "Menu feed", skip: "Skip to menu",
    hint: "Scroll and add what catches your eye.", guide: "Big pictures.\nA little break.", search: "Coffee, dessert…",
    searchLabel: "Search the menu", clear: "Clear search", empty: "Nothing matches this search.", reset: "Show everything",
    more: "Show more", end: "You've reached the end. The choice is yours.", order: "My order", total: "Total",
    draft: "This is an order draft; it is not sent to the café automatically. Pay at the counter.", checkout: "Get QR for the counter",
    continue: "Keep exploring", close: "Close", all: "All", add: "+ Add to order", added: "Added to your order",
    inOrder: "in your order", flavor: "Choose a flavor", choose: "Select a flavor", next: "Next item", results: "items",
    loading: "Reading your order…", error: "Could not complete this action. Try again and check your order.", limit: "You can add up to 99 of this item.",
    cartEmpty: "You haven't added anything yet.", remove: "Remove", decrease: "Decrease quantity", increase: "Increase quantity", updated: "Order updated", retry: "Reload the page" },
  ru: { title: "Листай.\nОткрывай.\nВыбирай вкус.", lead: "Кофе, десерт, а может, всё вместе. Твой следующий выбор — в этой ленте.",
    classic: "Меню списком", allMenu: "Открыть всё меню списком ↗", feedTitle: "Лента меню", skip: "Перейти к меню",
    hint: "Листай и добавляй понравившееся в заказ.", guide: "Большие фото.\nМаленькая пауза.", search: "Кофе, десерт…",
    searchLabel: "Поиск по меню", clear: "Очистить поиск", empty: "По этому запросу ничего не нашлось.", reset: "Показать всё",
    more: "Показать ещё", end: "Ты долистал меню. Выбор за тобой.", order: "Мой заказ", total: "Итого",
    draft: "Это черновик: заказ не отправляется в кафе автоматически. Оплата — на кассе.", checkout: "Получить QR для кассы",
    continue: "Выбрать ещё", close: "Закрыть", all: "Все", add: "+ В заказ", added: "Добавлено в заказ",
    inOrder: "в заказе", flavor: "Выбери вкус", choose: "Выберите вкус", next: "Следующая позиция", results: "позиций",
    loading: "Проверяем заказ…", error: "Не удалось завершить действие. Попробуй ещё раз и проверь заказ.", limit: "Можно добавить не больше 99 штук этого товара.",
    cartEmpty: "Ты пока ничего не добавил.", remove: "Убрать", decrease: "Уменьшить количество", increase: "Увеличить количество", updated: "Заказ обновлён", retry: "Обновить страницу" }
};

const $ = selector => document.querySelector(selector);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (className, text, action) => {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
};
const products = feedProducts(menuCategories);
const productIndex = new Map(products.map(product => [product.id, product]));
const validIds = new Set(productIndex.keys());
const selectedVariants = new Map();
const root = $("#feed"), dialog = $("#feed-cart"), searchInput = $("#feed-search");
let language = "tr";
try { const stored = localStorage.getItem("robys-language"); if (Object.hasOwn(copy, stored)) language = stored; } catch {}
const readCategory = () => menuCategories.some(category => category.id === location.hash.slice(1)) ? location.hash.slice(1) : "all";
let category = readCategory(), filtered = [], rendered = 0, currentIndex = 0;
let draft = { version: 1, groups: [], lines: [] }, storage, storagePromise, storageNotice;
let busy = false, checkoutBusy = false, statusTimer, readVersion = 0, cartSession = 0;
const text = () => copy[language];
const localized = value => value?.[language] ?? value?.tr ?? "";
const money = value => `${new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], { maximumFractionDigits: 0 }).format(value)} ₺`;
const say = message => { clearTimeout(statusTimer); $("#feed-status").textContent = message; statusTimer = setTimeout(() => { $("#feed-status").textContent = ""; }, 4500); };

async function loadStorage() {
  if (!storagePromise) storagePromise = import("./order-storage.js?v=6908555cd79b").then(module => {
    storage = module;
    storageNotice = module.createOrderStorageNotice({ owner: root, validIds, getLanguage: () => language,
      getProduct: id => productIndex.get(id)?.item, onResolved: refreshOrder });
    return module;
  }).catch(error => { storagePromise = null; throw error; });
  return storagePromise;
}

async function refreshOrder() {
  const version = ++readVersion;
  try {
    const module = await loadStorage();
    const latest = await module.readLatestStoredOrderDraft(validIds);
    if (version !== readVersion) return;
    draft = latest;
    updateBadges();
    if (dialog.open) renderCart();
  } catch { if (version === readVersion) say(text().error); }
}

async function mutate(updater) {
  if (busy) return;
  busy = true;
  updateBadges();
  try {
    const module = await loadStorage();
    ++readVersion;
    const result = await module.transactStoredOrderDraft(current => updater(module, current), validIds);
    draft = result.draft;
    say(result.applied ? text().updated : text().limit);
    return result;
  } catch { say(text().error); }
  finally { busy = false; updateBadges(); if (dialog.open) renderCart(); }
}

function updateCounter() { $("#feed-counter").textContent = filtered.length ? `${currentIndex + 1} / ${filtered.length}` : `0 / 0`; }

function updateBadges() {
  const quote = quoteFeedOrder(draft, productIndex);
  $("#feed-cart-count").textContent = quote.count;
  $("#feed-cart-total").textContent = money(quote.total);
  $("#feed-cart-open").setAttribute("aria-label", `${text().order}: ${quote.count}, ${money(quote.total)}`);
  $("#feed-cart-sum").textContent = money(quote.total);
  $("#feed-checkout").disabled = !quote.count || busy || checkoutBusy;
  const counts = new Map(draft.lines.map(line => [line.id, line.quantity]));
  root.querySelectorAll(".feed-card").forEach(card => {
    const count = counts.get(card.dataset.productId) ?? 0;
    card.querySelector(".feed-selected").textContent = count ? `${count} ${text().inOrder}` : "";
    const add = card.querySelector(".feed-add");
    add.disabled = busy || count >= 99;
    add.textContent = count >= 99 ? "99 / 99" : text().add;
  });
}

function renderCategories() {
  const nav = $("#feed-categories");
  nav.setAttribute("aria-label", menuCopy[language].categories);
  nav.replaceChildren();
  const entries = [{ id: "all", name: text().all }, ...menuCategories.map(entry => ({ id: entry.id, name: localized(entry.name),
    image: products.find(product => product.category.id === entry.id)?.image }))];
  entries.forEach(entry => {
    const node = button("feed-category", undefined, () => {
      category = entry.id;
      const url = new URL(location.href); url.hash = category === "all" ? "" : category;
      history.pushState(null, "", url);
      renderCategories(); renderFeed();
      [...nav.children].find(child => child.dataset.category === category)?.focus({ preventScroll: true });
    });
    node.dataset.category = entry.id;
    node.setAttribute("aria-pressed", String(category === entry.id));
    const portrait = element("span", "feed-category-portrait");
    if (entry.image) {
      const photo = element("img"); photo.src = entry.image; photo.alt = ""; photo.width = 50; photo.height = 50; photo.loading = "lazy"; portrait.append(photo);
    } else portrait.textContent = "✦";
    node.append(portrait, element("span", "feed-category-label", entry.name));
    nav.append(node);
  });
}

const cardObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) { currentIndex = Number(visible.target.dataset.index); updateCounter(); }
}, { threshold: [.3, .6] }) : null;

function renderCard(product, index) {
  const card = element("article", "feed-card"); card.dataset.productId = product.id; card.dataset.index = index;
  const titleId = `feed-product-${index}`; card.setAttribute("aria-labelledby", titleId);
  const header = element("header", "feed-card-header");
  const avatar = element("img", "feed-avatar"); avatar.src = "icon.svg"; avatar.alt = ""; avatar.width = 32; avatar.height = 32;
  const byline = element("div", "feed-card-byline"); byline.append(element("strong", "", "robyscoffeehouse"), element("span", "", "Gazipaşa · Coffee House"));
  header.append(avatar, byline, element("span", "feed-card-number", String(index + 1).padStart(2, "0")));
  const visual = element("div", "feed-photo");
  const photo = element("img"); photo.src = product.image; photo.alt = localized(product.item.imageAlt ?? product.item.name);
  photo.width = 1024; photo.height = 868; photo.loading = index === 0 ? "eager" : "lazy"; photo.decoding = "async";
  if (index === 0) photo.setAttribute("fetchpriority", "high");
  visual.append(photo, element("span", "feed-photo-tag", localized(product.category.name)));
  if (index < filtered.length - 1) {
    const next = button("feed-photo-next", "↓", () => {
      if (index + 1 >= rendered) appendPage();
      const target = [...root.children].find(node => Number(node.dataset.index) === index + 1);
      target?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      target?.querySelector(".feed-add")?.focus({ preventScroll: true });
    });
    next.setAttribute("aria-label", text().next); visual.append(next);
  }
  const content = element("div", "feed-card-content"), heading = element("div", "feed-product-heading");
  const title = element("h3", "", localized(product.item.name)); title.id = titleId;
  heading.append(title, element("span", "feed-price", money(product.item.price))); content.append(heading);
  if (product.item.description) content.append(element("p", "feed-description", localized(product.item.description)));
  let variantSelect;
  if (product.item.variants?.length) {
    const label = element("label", "feed-variant", text().flavor);
    variantSelect = element("select"); variantSelect.setAttribute("aria-label", `${text().flavor}: ${localized(product.item.name)}`);
    const placeholder = element("option", "", text().choose); placeholder.value = ""; variantSelect.append(placeholder);
    product.item.variants.forEach(variant => { const option = element("option", "", localized(variant.name)); option.value = variant.id; variantSelect.append(option); });
    variantSelect.value = selectedVariants.get(product.id) ?? "";
    variantSelect.addEventListener("change", () => { selectedVariants.set(product.id, variantSelect.value); });
    label.append(variantSelect); content.append(label);
  }
  const bottom = element("div", "feed-card-bottom");
  const add = button("feed-add", text().add, async () => {
    if (variantSelect && !variantSelect.value) { say(text().choose); variantSelect.focus(); return; }
    const variant = variantSelect?.value;
    const result = await mutate((module, current) => module.addOrderGroup(current,
      [{ id: product.id, ...(variant ? { variant } : {}) }], 1, validIds));
    if (result?.applied) say(`${text().added}: ${localized(product.item.name)}`);
  });
  add.setAttribute("aria-label", `${text().add}: ${localized(product.item.name)}, ${money(product.item.price)}`);
  bottom.append(element("span", "feed-selected"), add); content.append(bottom);
  card.append(header, visual, content); return card;
}

function appendPage() {
  const end = Math.min(rendered + 8, filtered.length);
  for (; rendered < end; rendered++) {
    const card = renderCard(filtered[rendered], rendered); root.append(card); cardObserver?.observe(card);
  }
  $("#feed-more").hidden = rendered >= filtered.length;
  $("#feed-end").hidden = !filtered.length || rendered < filtered.length;
  updateBadges();
}

function renderFeed() {
  cardObserver?.disconnect();
  filtered = filterFeed(products, category, searchInput.value); rendered = 0; currentIndex = 0;
  root.replaceChildren(); appendPage(); updateCounter();
  $("#feed-empty").hidden = !!filtered.length;
  $("#feed-search-clear").hidden = !searchInput.value;
  $("#feed-results").textContent = `${filtered.length} ${text().results}`;
}

function renderCart() {
  const active = dialog.contains(document.activeElement) ? document.activeElement?.dataset.cartAction : null;
  const lines = $("#feed-cart-lines"); lines.replaceChildren();
  if (!draft.groups.length) lines.append(element("p", "feed-draft-note", text().cartEmpty));
  draft.groups.forEach(group => {
    const line = element("div", "feed-cart-line");
    const first = productIndex.get(group.items[0]?.id);
    if (first) { const photo = element("img", "feed-cart-thumb"); photo.src = first.image; photo.alt = ""; photo.width = 56; photo.height = 56; lines.append(line); line.append(photo); }
    const item = element("div", "feed-cart-item");
    const names = group.items.map(entry => {
      const product = productIndex.get(entry.id);
      const variant = product?.item.variants?.find(value => value.id === entry.variant);
      return `${entry.quantity > 1 ? `${entry.quantity} × ` : ""}${localized(product?.item.name)}${variant ? ` · ${localized(variant.name)}` : ""}`;
    }).join(" + ");
    item.append(element("h3", "", names), element("p", "", money(group.items.reduce((sum, entry) => sum + (productIndex.get(entry.id)?.item.price ?? 0) * entry.quantity, 0) * group.quantity)));
    const controls = element("div", "feed-cart-controls");
    for (const [delta, symbol, label] of [[-1, "−", text().decrease], [1, "+", text().increase]]) {
      const control = button("", symbol, () => mutate((module, current) => {
        const latest = current.groups.find(entry => entry.id === group.id);
        return latest ? module.updateOrderGroupQuantity(current, group.id, Math.max(0, latest.quantity + delta), validIds)
          : { draft: current, applied: false };
      }));
      control.dataset.cartAction = `${group.id}:${delta}`; control.setAttribute("aria-label", `${label}: ${names}`);
      control.disabled = busy || delta > 0 && group.quantity >= 99;
      if (delta === 1) controls.append(element("output", "", String(group.quantity)));
      controls.append(control);
    }
    const remove = button("feed-remove", text().remove, () => mutate((module, current) => ({
      draft: module.removeOrderGroup(current, group.id, validIds), applied: current.groups.some(entry => entry.id === group.id)
    })));
    remove.dataset.cartAction = `${group.id}:remove`; remove.disabled = busy;
    remove.setAttribute("aria-label", `${text().remove}: ${names}`); controls.append(remove); item.append(controls); line.append(item);
    if (!line.isConnected) lines.append(line);
  });
  updateBadges();
  if (active) {
    const target = [...dialog.querySelectorAll("[data-cart-action]")].find(node => node.dataset.cartAction === active);
    (target ?? $("#feed-cart-close")).focus({ preventScroll: true });
  }
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.title = `${text().feedTitle} · Roby's Coffee House`;
  document.querySelectorAll("[data-copy]").forEach(node => { node.textContent = text()[node.dataset.copy] ?? menuCopy[language][node.dataset.copy] ?? ""; });
  document.querySelectorAll("[data-lang]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.lang === language)));
  searchInput.placeholder = text().search; $("#feed-search-clear").setAttribute("aria-label", text().clear);
  $("#feed-cart-close").setAttribute("aria-label", text().close);
  renderCategories(); renderFeed(); if (dialog.open) renderCart(); storageNotice?.refresh();
}

document.querySelectorAll("[data-lang]").forEach(node => node.addEventListener("click", () => {
  const anchor = filtered[currentIndex]?.id;
  language = node.dataset.lang;
  try { localStorage.setItem("robys-language", language); } catch {}
  applyLanguage();
  const index = filtered.findIndex(product => product.id === anchor);
  if (index >= 0) { while (rendered <= index) appendPage(); currentIndex = index; updateCounter(); }
}));
searchInput.addEventListener("input", renderFeed);
$("#feed-search-clear").addEventListener("click", () => { searchInput.value = ""; renderFeed(); searchInput.focus(); });
$("#feed-reset").addEventListener("click", () => { category = "all"; searchInput.value = ""; history.pushState(null, "", location.pathname + location.search); renderCategories(); renderFeed(); searchInput.focus(); });
$("#feed-more").addEventListener("click", () => { const nextIndex = rendered; appendPage(); root.children[nextIndex]?.querySelector(".feed-add")?.focus({ preventScroll: true }); });
if ("IntersectionObserver" in window) {
  const more = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && rendered < filtered.length) appendPage(); }, { rootMargin: "400px" });
  more.observe($("#feed-more-wrap"));
}
$("#feed-cart-open").addEventListener("click", async () => {
  renderCart(); dialog.showModal(); cartSession++; $("#feed-cart-error").textContent = ""; await refreshOrder();
});
const closeCart = () => { dialog.close(); $("#feed-cart-open").focus({ preventScroll: true }); };
$("#feed-cart-close").addEventListener("click", closeCart);
$("#feed-continue").addEventListener("click", closeCart);
dialog.addEventListener("close", () => { cartSession++; $("#feed-cart-open").focus({ preventScroll: true }); });
$("#feed-checkout").addEventListener("click", async () => {
  if (checkoutBusy || busy) return;
  checkoutBusy = true; updateBadges();
  const session = cartSession, lang = language;
  const shouldOpen = () => dialog.open && session === cartSession && lang === language;
  try {
    const module = await loadStorage();
    const current = await module.readLatestStoredOrderDraft(validIds);
    if (!shouldOpen()) return;
    const checkout = await import("./order-checkout.js?v=ede76ee31ffa");
    await checkout.openOrderCheckout({ draft: current, language: lang, returnFocus: $("#feed-checkout"), shouldOpen });
  } catch { if (shouldOpen()) $("#feed-cart-error").textContent = text().error; }
  finally { checkoutBusy = false; updateBadges(); }
});
const navigateCategory = () => { category = readCategory(); renderCategories(); renderFeed(); };
window.addEventListener("popstate", navigateCategory);
window.addEventListener("hashchange", navigateCategory);
window.addEventListener("robys:order-change", () => { if (!busy) void refreshOrder(); });
window.addEventListener("pageshow", () => { void refreshOrder(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refreshOrder(); });
window.addEventListener("storage", event => {
  if (event.key === null || event.key.startsWith("robys-menu-order")) void refreshOrder();
});
applyLanguage();
$("#feed-cart-open").hidden = false;
root.dataset.ready = "true";
void refreshOrder();
