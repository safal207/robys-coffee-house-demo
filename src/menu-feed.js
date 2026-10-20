import { menuCategories, menuCopy } from "./menu-catalog.js?v=05e7dac3c17b";
import { feedProducts, filterFeed, quoteFeedOrder } from "./src/menu-feed-model.js";
import { createFeedEngagement } from "./src/menu-feed-engagement.js";

const copy = {
  tr: { title: "Gözünle seç.\nTadını çıkar.", lead: "Bir kahve, bir tatlı, belki de ikisi. Beğendiklerini kaydet, hazır olunca siparişine ekle.",
    classic: "Klasik menü", allMenu: "Tüm menüyü liste olarak gör ↗", feedTitle: "Fotoğraflı menü", skip: "Menüye geç",
    hint: "Seç, QR'ı kasaya göster, kafede öde.", guide: "Beğen.\nSonra karar ver.", search: "Kahve, tatlı…",
    listView: "Liste", photoView: "Fotoğraflar", like: "Beğen", liked: "Beğendin", unlike: "Beğeniyi kaldır", likedFilter: "Beğendiklerim", seen: "Sen gördün", seenSummary: "Gördüklerin", personal: "Beğeniler ve görülenler bu cihazda saklanır.", memoryOnly: "Beğeniler ve görülenler yalnızca bu sayfa açıkken saklanır.", likedEmpty: "Burada henüz beğendiğin bir ürün yok. Kalbe dokunarak kaydet.",
    searchLabel: "Menüde ara", clear: "Aramayı temizle", empty: "Aradığın burada yok.", reset: "Tümünü göster",
    more: "Daha fazla göster", end: "Menünün sonuna geldin. Seçim senin.", order: "Siparişim", total: "Toplam",
    draft: "Bu bir sipariş taslağıdır; kafeye otomatik gönderilmez. Ödeme kasada yapılır.", checkout: "Kasa için QR oluştur",
    continue: "Keşfetmeye devam et", close: "Kapat", all: "Tümü", add: "+ Siparişe ekle", added: "Siparişine eklendi",
    inOrder: "siparişinde", flavor: "Lezzet seç", choose: "Bir lezzet seçin", next: "Sonraki ürüne geç", results: "ürün",
    loading: "Sipariş okunuyor…", error: "İşlem tamamlanamadı. Tekrar dene; seçimini kontrol et.", limit: "Bu üründen en fazla 99 adet ekleyebilirsin.",
    cartEmpty: "Henüz bir seçim eklemedin.", remove: "Kaldır", decrease: "Adedi azalt", increase: "Adedi artır", updated: "Sipariş güncellendi", retry: "Sayfayı yenile" },
  en: { title: "Find your taste.\nOne photo at a time.", lead: "A coffee, a dessert, or a little of both. Save what you like, then add it when you're ready.",
    classic: "Classic menu", allMenu: "See the menu as a list ↗", feedTitle: "Menu in photos", skip: "Skip to menu",
    hint: "Choose, show your QR at the counter, pay at the café.", guide: "Like it.\nCome back to it.", search: "Coffee, dessert…",
    listView: "List", photoView: "Photos", like: "Like", liked: "Liked", unlike: "Unlike", likedFilter: "Liked", seen: "Viewed by you", seenSummary: "Viewed by you", personal: "Likes and viewed items are saved on this device.", memoryOnly: "Likes and viewed items are saved on this page only.", likedEmpty: "No liked items here yet. Tap a heart to save a favorite.",
    searchLabel: "Search the menu", clear: "Clear search", empty: "Nothing matches this search.", reset: "Show everything",
    more: "Show more", end: "You've reached the end. The choice is yours.", order: "My order", total: "Total",
    draft: "This is an order draft; it is not sent to the café automatically. Pay at the counter.", checkout: "Get QR for the counter",
    continue: "Keep exploring", close: "Close", all: "All", add: "+ Add to order", added: "Added to your order",
    inOrder: "in your order", flavor: "Choose a flavor", choose: "Select a flavor", next: "Next item", results: "items",
    loading: "Reading your order…", error: "Could not complete this action. Try again and check your order.", limit: "You can add up to 99 of this item.",
    cartEmpty: "You haven't added anything yet.", remove: "Remove", decrease: "Decrease quantity", increase: "Increase quantity", updated: "Order updated", retry: "Reload the page" },
  ru: { title: "Выбирай глазами.\nНаслаждайся вкусом.", lead: "Кофе, десерт, а может, всё вместе. Сохраняй понравившееся и добавляй в заказ, когда решишь.",
    classic: "Меню списком", allMenu: "Открыть всё меню списком ↗", feedTitle: "Меню по фото", skip: "Перейти к меню",
    hint: "Выбери, покажи QR на кассе и оплати в кафе.", guide: "Нравится?\nСохрани на потом.", search: "Кофе, десерт…",
    listView: "Список", photoView: "Фото", like: "Нравится", liked: "Тебе нравится", unlike: "Убрать лайк", likedFilter: "Понравилось", seen: "Ты посмотрел", seenSummary: "Просмотрено тобой", personal: "Лайки и просмотренное сохраняются на этом устройстве.", memoryOnly: "Лайки и просмотренное сохраняются только до закрытия страницы.", likedEmpty: "Здесь пока нет понравившихся позиций. Нажми на сердечко, чтобы сохранить.",
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
let likedOnly = false;
let draft = { version: 1, groups: [], lines: [] }, storage, storagePromise, storageNotice;
let storageRetry = 0, checkoutPromise, checkoutRetry = 0;
let busy = false, checkoutBusy = false, statusTimer, readVersion = 0, cartSession = 0;
const text = () => copy[language];
const localized = value => value?.[language] ?? value?.tr ?? "";
const money = value => `${new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], { maximumFractionDigits: 0 }).format(value)} ₺`;
const say = message => { clearTimeout(statusTimer); $("#feed-status").textContent = message; statusTimer = setTimeout(() => { $("#feed-status").textContent = ""; }, 4500); };
const engagement = createFeedEngagement({ validIds, onChange: updateEngagement });

function updateEngagement() {
  $("#feed-liked-label").textContent = `${text().likedFilter} · ${engagement.likes()}`;
  $("#feed-liked-filter").setAttribute("aria-pressed", String(likedOnly));
  $("#feed-seen-summary").textContent = `${text().seenSummary}: ${engagement.seen()} / ${products.length}`;
  $("#feed-personal-note").textContent = engagement.persistent ? text().personal : text().memoryOnly;
  root.querySelectorAll(".feed-card").forEach(card => {
    const product = productIndex.get(card.dataset.productId), liked = engagement.hasLiked(product.id);
    const like = card.querySelector(".feed-like");
    like.setAttribute("aria-pressed", String(liked));
    like.setAttribute("aria-label", `${liked ? text().unlike : text().like}: ${localized(product.item.name)}`);
    like.querySelector("span").textContent = liked ? text().liked : text().like;
    const seen = card.querySelector(".feed-seen");
    seen.dataset.seen = String(engagement.hasSeen(product.id));
    seen.querySelector("span").textContent = text().seen;
  });
}

function icon(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(svg.namespaceURI, "path"); shape.setAttribute("d", path); svg.append(shape);
  return svg;
}

// A photo must be loaded and at least half visible for one continuous second.
// Rendering, prefetching, a hidden tab, or a dialog covering the feed isn't a view.
const viewTimers = new Map();
const viewCandidates = new Set();
function stopViews() {
  for (const timer of viewTimers.values()) clearTimeout(timer);
  viewTimers.clear();
}
function canView(photo) {
  if (document.hidden || document.querySelector("dialog[open]") || !photo.isConnected || !photo.complete || !photo.naturalWidth) return false;
  const rect = photo.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
  return rect.width > 0 && rect.height > 0 && width * height >= rect.width * rect.height * .5;
}
function scheduleView(photo) {
  const id = photo.closest(".feed-card")?.dataset.productId;
  if (!id || engagement.hasSeen(id) || viewTimers.has(photo) || !viewCandidates.has(photo) || !canView(photo)) return;
  viewTimers.set(photo, setTimeout(() => {
    viewTimers.delete(photo);
    if (viewCandidates.has(photo) && canView(photo)) engagement.markSeen(id);
  }, 1000));
}
const viewObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting && entry.intersectionRatio >= .5) { viewCandidates.add(entry.target); scheduleView(entry.target); }
    else { viewCandidates.delete(entry.target); clearTimeout(viewTimers.get(entry.target)); viewTimers.delete(entry.target); }
  }
}, { threshold: [0, .5] }) : null;

async function loadStorage() {
  if (!storagePromise) {
    let loading;
    if (storageRetry) {
      const retryUrl = new URL("./order-storage.js", import.meta.url);
      retryUrl.searchParams.set("retry", String(storageRetry));
      loading = import(retryUrl.href);
    } else loading = import("./order-storage.js?v=6908555cd79b");
    storagePromise = loading.then(module => {
      storage = module;
      storageNotice = module.createOrderStorageNotice({ owner: root, validIds, getLanguage: () => language,
        getProduct: id => productIndex.get(id)?.item, onResolved: refreshOrder });
      return module;
    }).catch(error => { storagePromise = null; storageRetry += 1; throw error; });
  }
  return storagePromise;
}

function loadCheckout() {
  if (!checkoutPromise) {
    let loading;
    if (checkoutRetry) {
      const retryUrl = new URL("./order-checkout.js", import.meta.url);
      retryUrl.searchParams.set("retry", String(checkoutRetry));
      loading = import(retryUrl.href);
    } else loading = import("./order-checkout.js?v=ede76ee31ffa");
    checkoutPromise = loading.catch(error => { checkoutPromise = null; checkoutRetry += 1; throw error; });
  }
  return checkoutPromise;
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
  document.querySelectorAll('.feed-classic, .feed-intro-link, .feed-view-switch a:not([aria-current])')
    .forEach(link => { link.href = `menu.html${category === "all" ? "" : `#${category}`}`; });
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
  const avatar = element("img", "feed-avatar"); avatar.src = "src/brand/robys-mark-master-v1.svg?v=20260917-approved-v4-restore"; avatar.alt = ""; avatar.width = 32; avatar.height = 32;
  const byline = element("div", "feed-card-byline"); byline.append(element("strong", "", "robyscoffeehouse"), element("span", "", "Gazipaşa · Coffee House"));
  header.append(avatar, byline, element("span", "feed-card-number", String(index + 1).padStart(2, "0")));
  const visual = element("div", "feed-photo");
  const photo = element("img"); photo.src = product.image; photo.alt = localized(product.item.imageAlt ?? product.item.name);
  photo.width = 1024; photo.height = 1024; photo.loading = index === 0 ? "eager" : "lazy"; photo.decoding = "async";
  photo.addEventListener("load", () => scheduleView(photo));
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
  const social = element("div", "feed-social");
  const like = button("feed-like", undefined, () => {
    engagement.setLiked(product.id, !engagement.hasLiked(product.id));
    if (likedOnly) reconcileLiked();
  });
  like.append(icon("M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"), element("span", "", text().like));
  const seen = element("span", "feed-seen"); seen.dataset.seen = "false";
  seen.append(icon("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"), element("span", "", text().seen));
  social.append(like, seen);
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
  card.append(header, visual, social, content); return card;
}

function appendPage() {
  const end = Math.min(rendered + 8, filtered.length);
  for (; rendered < end; rendered++) {
    const card = renderCard(filtered[rendered], rendered); root.append(card); cardObserver?.observe(card);
    viewObserver?.observe(card.querySelector(".feed-photo>img"));
  }
  $("#feed-more").hidden = rendered >= filtered.length;
  $("#feed-end").hidden = !filtered.length || rendered < filtered.length;
  updateBadges();
  updateEngagement();
}

function renderFeed() {
  cardObserver?.disconnect();
  stopViews(); viewCandidates.clear(); viewObserver?.disconnect();
  filtered = filterFeed(products, category, searchInput.value).filter(product => !likedOnly || engagement.hasLiked(product.id)); rendered = 0; currentIndex = 0;
  root.replaceChildren(); appendPage(); updateCounter();
  $("#feed-empty").hidden = !!filtered.length;
  $("#feed-empty p").textContent = likedOnly && !searchInput.value ? text().likedEmpty : text().empty;
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
$("#feed-reset").addEventListener("click", () => { likedOnly = false; category = "all"; searchInput.value = ""; history.pushState(null, "", location.pathname + location.search); renderCategories(); renderFeed(); searchInput.focus(); });
$("#feed-liked-filter").addEventListener("click", () => {
  likedOnly = !likedOnly; category = "all"; searchInput.value = "";
  history.pushState(null, "", location.pathname + location.search);
  renderCategories(); renderFeed();
});
$("#feed-more").addEventListener("click", () => { const nextIndex = rendered; appendPage(); root.children[nextIndex]?.querySelector(".feed-add")?.focus({ preventScroll: true }); });
if ("IntersectionObserver" in window) {
  const more = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && rendered < filtered.length) appendPage(); }, { rootMargin: "400px" });
  more.observe($("#feed-more-wrap"));
}
$("#feed-cart-open").addEventListener("click", async () => {
  renderCart(); dialog.showModal(); stopViews(); cartSession++; $("#feed-cart-error").textContent = ""; await refreshOrder();
});
const closeCart = () => { dialog.close(); $("#feed-cart-open").focus({ preventScroll: true }); };
$("#feed-cart-close").addEventListener("click", closeCart);
$("#feed-continue").addEventListener("click", closeCart);
dialog.addEventListener("close", () => { cartSession++; $("#feed-cart-open").focus({ preventScroll: true }); viewCandidates.forEach(scheduleView); });
$("#feed-checkout").addEventListener("click", async () => {
  if (checkoutBusy || busy) return;
  checkoutBusy = true; updateBadges();
  const session = cartSession, lang = language;
  const shouldOpen = () => dialog.open && session === cartSession && lang === language;
  try {
    const module = await loadStorage();
    const current = await module.readLatestStoredOrderDraft(validIds);
    if (!shouldOpen()) return;
    const checkout = await loadCheckout();
    await checkout.openOrderCheckout({ draft: current, language: lang, returnFocus: $("#feed-checkout"), shouldOpen });
  } catch { if (shouldOpen()) $("#feed-cart-error").textContent = text().error; }
  finally { checkoutBusy = false; updateBadges(); }
});
const navigateCategory = () => { category = readCategory(); renderCategories(); renderFeed(); };
window.addEventListener("popstate", navigateCategory);
window.addEventListener("hashchange", navigateCategory);
window.addEventListener("robys:order-change", () => { if (!busy) void refreshOrder(); });
function reconcileLiked() {
  const active = document.activeElement, activeCard = active?.closest(".feed-card");
  const activeId = activeCard?.dataset.productId, oldIndex = Number(activeCard?.dataset.index ?? 0);
  const selector = active?.matches("select") ? "select" : active?.matches(".feed-add") ? ".feed-add" : ".feed-like";
  const previousRendered = rendered;
  renderFeed();
  while (rendered < Math.min(previousRendered, filtered.length)) appendPage();
  if (activeId) {
    const cards = [...root.children];
    const next = cards.find(card => card.dataset.productId === activeId) ?? cards[Math.min(oldIndex, cards.length - 1)];
    (next?.querySelector(selector) ?? next?.querySelector(".feed-like") ?? $("#feed-liked-filter")).focus({ preventScroll: true });
  }
}
const syncEngagement = key => {
  const before = products.filter(product => engagement.hasLiked(product.id)).map(product => product.id).join("|");
  engagement.sync(key);
  const after = products.filter(product => engagement.hasLiked(product.id)).map(product => product.id).join("|");
  if (likedOnly && before !== after) reconcileLiked();
};
window.addEventListener("pageshow", () => { syncEngagement(null); viewCandidates.forEach(scheduleView); void refreshOrder(); });
window.addEventListener("pagehide", stopViews);
document.addEventListener("visibilitychange", () => {
  stopViews();
  if (!document.hidden) { syncEngagement(null); viewCandidates.forEach(scheduleView); void refreshOrder(); }
});
window.addEventListener("storage", event => {
  if (event.key === null || event.key.startsWith("robys-menu-order")) void refreshOrder();
  if (event.key === null || event.key.startsWith("robys-feed-")) syncEngagement(event.key);
});
applyLanguage();
$("#feed-cart-open").hidden = false;
root.dataset.ready = "true";
void refreshOrder();
