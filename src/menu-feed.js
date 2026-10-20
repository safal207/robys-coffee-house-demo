import { menuCategories, menuCopy } from "./menu-catalog.js?v=05e7dac3c17b";
import { feedProducts, filterFeed, quoteFeedOrder } from "./src/menu-feed-model.js";
import { createFeedEngagement } from "./src/menu-feed-engagement.js";
import { parseFeedEntry, feedProductUrl, selectActiveFeedIndex } from "./src/menu-feed-navigation.js";
import { createFeedOrder } from "./src/menu-feed-order.js";
import { initFeedCollections } from "./src/menu-feed-collections.js";

const copy = {
  tr: { title: "Gözünle seç.\nTadını çıkar.", lead: "Bir kahve, bir tatlı, belki de ikisi. Beğendiklerini kaydet, hazır olunca siparişine ekle.",
    classic: "Klasik menü", allMenu: "Tüm menüyü liste olarak gör ↗", feedTitle: "Fotoğraflı menü", skip: "Menüye geç",
    hint: "Seç, QR'ı kasaya göster, kafede öde.", guide: "Beğen.\nSonra karar ver.", search: "Kahve, tatlı…",
    listView: "Liste", photoView: "Akış", like: "Beğen", liked: "Beğendin", unlike: "Beğeniyi kaldır", likedFilter: "Beğendiklerim", seen: "Sen gördün", seenSummary: "Gördüklerin", personal: "Beğeniler ve görülenler bu cihazda saklanır.", memoryOnly: "Beğeniler ve görülenler yalnızca bu sayfa açıkken saklanır.", likedEmpty: "Burada henüz beğendiğin bir ürün yok. Kalbe dokunarak kaydet.",
    discover: "Ara", discoverTitle: "Ne istersin?", discoverDone: "Akışa dön", swipeHint: "Menüyü keşfetmek için kaydır", previous: "Önceki ürün",
    share: "Paylaş", shareTitle: "Bu seçimi paylaş", shareLink: "Ürün bağlantısı", copyLink: "Bağlantıyı kopyala", copyHelp: "Bu bağlantıyı kopyalayıp paylaşabilirsin.", copied: "Bağlantı kopyalandı", saved: "Beğendiklerine kaydedildi",
    searchLabel: "Menüde ara", clear: "Aramayı temizle", empty: "Aradığın burada yok.", reset: "Tümünü göster",
    more: "Daha fazla göster", end: "Menünün sonuna geldin. Seçim senin.", order: "Siparişim", total: "Toplam",
    draft: "Bu bir sipariş taslağıdır; kafeye otomatik gönderilmez. Ödeme kasada yapılır.", checkout: "Kasa için QR oluştur",
    continue: "Keşfetmeye devam et", close: "Kapat", all: "Tümü", add: "+ Siparişe ekle", added: "Siparişine eklendi",
    details: "İçerik ve seçenekler", inOrder: "siparişinde", flavor: "Lezzet seç", choose: "Bir lezzet seçin", next: "Sonraki ürüne geç", results: "ürün",
    loading: "Sipariş okunuyor…", error: "İşlem tamamlanamadı. Tekrar dene; seçimini kontrol et.", limit: "Bu üründen en fazla 99 adet ekleyebilirsin.",
    cartEmpty: "Henüz bir seçim eklemedin.", remove: "Kaldır", decrease: "Adedi azalt", increase: "Adedi artır", updated: "Sipariş güncellendi", retry: "Sayfayı yenile" },
  en: { title: "Find your taste.\nOne photo at a time.", lead: "A coffee, a dessert, or a little of both. Save what you like, then add it when you're ready.",
    classic: "Classic menu", allMenu: "See the menu as a list ↗", feedTitle: "Menu in photos", skip: "Skip to menu",
    hint: "Choose, show your QR at the counter, pay at the café.", guide: "Like it.\nCome back to it.", search: "Coffee, dessert…",
    listView: "List", photoView: "Feed", like: "Like", liked: "Liked", unlike: "Unlike", likedFilter: "Liked", seen: "Viewed by you", seenSummary: "Viewed by you", personal: "Likes and viewed items are saved on this device.", memoryOnly: "Likes and viewed items are saved on this page only.", likedEmpty: "No liked items here yet. Tap a heart to save a favorite.",
    discover: "Search", discoverTitle: "What sounds good?", discoverDone: "Back to the feed", swipeHint: "Scroll to explore the menu", previous: "Previous item",
    share: "Share", shareTitle: "Share this choice", shareLink: "Item link", copyLink: "Copy link", copyHelp: "Copy this link to share the item.", copied: "Link copied", saved: "Saved to your liked items",
    searchLabel: "Search the menu", clear: "Clear search", empty: "Nothing matches this search.", reset: "Show everything",
    more: "Show more", end: "You've reached the end. The choice is yours.", order: "My order", total: "Total",
    draft: "This is an order draft; it is not sent to the café automatically. Pay at the counter.", checkout: "Get QR for the counter",
    continue: "Keep exploring", close: "Close", all: "All", add: "+ Add to order", added: "Added to your order",
    details: "Details and options", inOrder: "in your order", flavor: "Choose a flavor", choose: "Select a flavor", next: "Next item", results: "items",
    loading: "Reading your order…", error: "Could not complete this action. Try again and check your order.", limit: "You can add up to 99 of this item.",
    cartEmpty: "You haven't added anything yet.", remove: "Remove", decrease: "Decrease quantity", increase: "Increase quantity", updated: "Order updated", retry: "Reload the page" },
  ru: { title: "Выбирай глазами.\nНаслаждайся вкусом.", lead: "Кофе, десерт, а может, всё вместе. Сохраняй понравившееся и добавляй в заказ, когда решишь.",
    classic: "Меню списком", allMenu: "Открыть всё меню списком ↗", feedTitle: "Меню по фото", skip: "Перейти к меню",
    hint: "Выбери, покажи QR на кассе и оплати в кафе.", guide: "Нравится?\nСохрани на потом.", search: "Кофе, десерт…",
    listView: "Список", photoView: "Лента", like: "Нравится", liked: "Тебе нравится", unlike: "Убрать лайк", likedFilter: "Понравилось", seen: "Ты посмотрел", seenSummary: "Просмотрено тобой", personal: "Лайки и просмотренное сохраняются на этом устройстве.", memoryOnly: "Лайки и просмотренное сохраняются только до закрытия страницы.", likedEmpty: "Здесь пока нет понравившихся позиций. Нажми на сердечко, чтобы сохранить.",
    discover: "Поиск", discoverTitle: "Чего хочется?", discoverDone: "Вернуться в ленту", swipeHint: "Листай и выбирай из меню", previous: "Предыдущая позиция",
    share: "Поделиться", shareTitle: "Поделиться выбором", shareLink: "Ссылка на позицию", copyLink: "Скопировать ссылку", copyHelp: "Скопируй эту ссылку и отправь её другу.", copied: "Ссылка скопирована", saved: "Сохранено в понравившемся",
    searchLabel: "Поиск по меню", clear: "Очистить поиск", empty: "По этому запросу ничего не нашлось.", reset: "Показать всё",
    more: "Показать ещё", end: "Ты долистал меню. Выбор за тобой.", order: "Мой заказ", total: "Итого",
    draft: "Это черновик: заказ не отправляется в кафе автоматически. Оплата — на кассе.", checkout: "Получить QR для кассы",
    continue: "Выбрать ещё", close: "Закрыть", all: "Все", add: "+ В заказ", added: "Добавлено в заказ",
    details: "Состав и варианты", inOrder: "в заказе", flavor: "Выбери вкус", choose: "Выберите вкус", next: "Следующая позиция", results: "позиций",
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
const root = $("#feed"), searchInput = $("#feed-search");
const discoverDialog = $("#feed-discover"), shareDialog = $("#feed-share");
let language = "tr";
try { const stored = localStorage.getItem("robys-language"); if (Object.hasOwn(copy, stored)) language = stored; } catch {}
const entry = parseFeedEntry(location.href, products);
if (entry.language) language = entry.language;
let category = entry.category, filtered = [], rendered = 0, currentIndex = 0;
let likedOnly = false;
let busy = false, statusTimer;
let layoutFrame = 0, activeFrame = 0, shareReturnFocus = null, discoveryChanged = false, sharing = false;
const text = () => copy[language];
const localized = value => value?.[language] ?? value?.tr ?? "";
const money = value => `${new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], { maximumFractionDigits: 0 }).format(value)} ₺`;
const say = message => { clearTimeout(statusTimer); $("#feed-status").textContent = message; statusTimer = setTimeout(() => { $("#feed-status").textContent = ""; }, 4500); };
const engagement = createFeedEngagement({ validIds, onChange: updateEngagement });
const order = createFeedOrder({ menuCopy, productIndex, orderProductIds: validIds, getLanguage: () => language,
  localized, formatPrice: money, onCartChange: updateBadges, say });
const collections = initFeedCollections({ productIndex, orderProductIds: validIds, getLanguage: () => language,
  localized, formatPrice: money, order, onCartChange: updateBadges, say });

function updateEngagement() {
  $("#feed-liked-label").textContent = `${text().likedFilter} · ${engagement.likes()}`;
  $("#feed-liked-count").textContent = engagement.likes();
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
function feedViewBounds() {
  return {
    top: Math.max(0, $(".feed-header").getBoundingClientRect().bottom, $(".feed-tools").getBoundingClientRect().bottom),
    bottom: Math.min(innerHeight, $("#menu-cart-trigger").getBoundingClientRect().top || innerHeight)
  };
}
function canView(photo) {
  if (document.hidden || sharing || document.querySelector("dialog[open]") || !photo.isConnected || !photo.complete || !photo.naturalWidth) return false;
  const rect = photo.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
  const bounds = feedViewBounds();
  const height = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
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

async function refreshOrder() {
  try { await order.refresh(); }
  catch { say(text().error); }
}

async function addProduct(product, variant, trigger) {
  if (product.category.id === "pairing-offers") {
    stopViews();
    await order.openProduct(product.id, trigger);
    return;
  }
  if (busy) return;
  busy = true;
  updateBadges();
  try {
    const result = await order.addProduct(product.id, variant, trigger);
    say(result.applied ? `${text().added}: ${localized(product.item.name)}` : text().limit);
  } catch { say(text().error); }
  finally { busy = false; updateBadges(); }
}

function updateCounter() { $("#feed-counter").textContent = filtered.length ? `${currentIndex + 1} / ${filtered.length}` : `0 / 0`; }

function updateActiveCard() {
  activeFrame = 0;
  for (const photo of viewCandidates) {
    if (canView(photo)) scheduleView(photo);
    else { clearTimeout(viewTimers.get(photo)); viewTimers.delete(photo); }
  }
  if (document.querySelector("dialog[open]")) return;
  const { top, bottom } = feedViewBounds();
  const index = selectActiveFeedIndex([...root.children].map(card => {
    const rect = card.getBoundingClientRect(); return { index: Number(card.dataset.index), top: rect.top, bottom: rect.bottom };
  }), top, bottom);
  if (index !== null && index !== currentIndex) { currentIndex = index; updateCounter(); }
}
function scheduleActiveCard() { if (!activeFrame) activeFrame = requestAnimationFrame(updateActiveCard); }
function updateFeedLayout() {
  layoutFrame = 0;
  const headerHeight = $(".feed-header").getBoundingClientRect().height;
  const toolsHeight = $(".feed-tools").getBoundingClientRect().height;
  const style = document.documentElement.style;
  style.setProperty("--feed-header-height", `${headerHeight}px`);
  style.setProperty("--feed-top-offset", `${headerHeight + toolsHeight}px`);
  scheduleActiveCard();
}
function scheduleLayout() { if (!layoutFrame) layoutFrame = requestAnimationFrame(updateFeedLayout); }
function moveToCard(index, { focus = false, instant = false } = {}) {
  if (index < 0 || index >= filtered.length) return;
  while (rendered <= index) appendPage();
  const card = root.children[index];
  card.scrollIntoView({ block: "start", behavior: instant || matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  if (focus) card.focus({ preventScroll: true });
  currentIndex = index; updateCounter();
}
function clearItemLink(nextCategory = category, replace = false) {
  const url = new URL(location.href); url.searchParams.delete("item");
  url.hash = nextCategory === "all" ? "" : nextCategory;
  history[replace ? "replaceState" : "pushState"](null, "", url);
}
function openShareFallback(product, trigger) {
  shareReturnFocus = trigger;
  $("#feed-share-url").value = feedProductUrl(location.href, product.id, language);
  $("#feed-share-help").textContent = text().copyHelp;
  shareDialog.showModal(); stopViews();
}
async function shareProduct(product, trigger) {
  if (sharing) return;
  order.cancelPending();
  sharing = true; trigger.disabled = true; stopViews();
  try {
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: `${localized(product.item.name)} · Roby's Coffee House`, url: feedProductUrl(location.href, product.id, language) }); }
      catch (error) { if (error?.name !== "AbortError") openShareFallback(product, trigger); }
    } else openShareFallback(product, trigger);
  } finally {
    sharing = false; trigger.disabled = false;
    if (!document.querySelector("dialog[open]") && trigger.isConnected) trigger.focus({ preventScroll: true });
    viewCandidates.forEach(scheduleView);
  }
}

function updateBadges() {
  const draft = order.readDraft();
  const quote = quoteFeedOrder(draft, productIndex);
  $("#menu-cart-count").textContent = draft.groups.reduce((sum, group) => sum + group.quantity, 0);
  $("#menu-cart-total").textContent = money(quote.total);
  $("#menu-cart-trigger").setAttribute("aria-label", `${text().order}: ${$("#menu-cart-count").textContent}, ${money(quote.total)}`);
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
      order.cancelPending();
      category = entry.id;
      clearItemLink(); discoveryChanged = true;
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
  document.dispatchEvent(new CustomEvent("robys:menu-view-change"));
}

const cardObserver = "IntersectionObserver" in window ? new IntersectionObserver(scheduleActiveCard, { threshold: [0, .3, .6, 1] }) : null;

function renderCard(product, index) {
  const card = element("article", "feed-card"); card.dataset.productId = product.id; card.dataset.index = index; card.tabIndex = -1;
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
  const burst = element("span", "feed-heart-burst", "♥"); burst.setAttribute("aria-hidden", "true"); visual.append(burst);
  photo.addEventListener("dblclick", () => {
    order.cancelPending();
    engagement.setLiked(product.id, true); say(text().saved);
    burst.dataset.active = "true";
    setTimeout(() => { delete burst.dataset.active; }, 650);
  });
  if (index > 0) {
    const previous = button("feed-photo-prev", "↑", () => { order.cancelPending(); moveToCard(index - 1, { focus: true }); });
    previous.setAttribute("aria-label", text().previous); visual.append(previous);
  }
  if (index < filtered.length - 1) {
    const next = button("feed-photo-next", "↓", () => { order.cancelPending(); moveToCard(index + 1, { focus: true }); });
    next.setAttribute("aria-label", text().next); visual.append(next);
  }
  const content = element("div", "feed-card-content"), heading = element("div", "feed-product-heading");
  const social = element("div", "feed-social");
  const like = button("feed-like", undefined, () => {
    order.cancelPending();
    engagement.setLiked(product.id, !engagement.hasLiked(product.id));
    if (likedOnly) reconcileLiked();
  });
  like.append(icon("M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"), element("span", "sr-only", text().like));
  const seen = element("span", "feed-seen"); seen.dataset.seen = "false";
  seen.append(element("span", "", text().seen));
  const share = button("feed-share", undefined, event => { void shareProduct(product, event.currentTarget); });
  share.setAttribute("aria-label", `${text().share}: ${localized(product.item.name)}`);
  share.append(icon("m22 2-7 20-4-9-9-4L22 2Zm0 0L11 13"), element("span", "sr-only", text().share));
  social.append(like, share, seen);
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
  const details = button("feed-details", text().details, event => {
    stopViews(); void order.openProduct(product.id, event.currentTarget);
  });
  details.setAttribute("aria-label", `${text().details}: ${localized(product.item.name)}`);
  content.append(details);
  const bottom = element("div", "feed-card-bottom");
  const add = button("feed-add", text().add, async event => {
    if (variantSelect && !variantSelect.value) { say(text().choose); variantSelect.focus(); return; }
    const variant = variantSelect?.value;
    await addProduct(product, variant, event.currentTarget);
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
  scheduleActiveCard();
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.title = `${text().feedTitle} · Roby's Coffee House`;
  document.querySelectorAll("[data-copy]").forEach(node => { node.textContent = text()[node.dataset.copy] ?? menuCopy[language][node.dataset.copy] ?? ""; });
  document.querySelectorAll("[data-lang]").forEach(node => node.setAttribute("aria-pressed", String(node.dataset.lang === language)));
  searchInput.placeholder = text().search; $("#feed-search-clear").setAttribute("aria-label", text().clear);
  for (const id of ["feed-discover-close", "feed-share-close"]) $(`#${id}`).setAttribute("aria-label", text().close);
  document.querySelectorAll("[data-menu-copy]").forEach(node => { node.textContent = menuCopy[language][node.dataset.menuCopy] ?? ""; });
  document.querySelectorAll("[data-localized]").forEach(node => { if (node.dataset[language]) node.textContent = node.dataset[language]; });
  renderCategories(); renderFeed(); order.refreshLanguage(); collections.refresh();
  scheduleLayout();
}

document.querySelectorAll("[data-lang]").forEach(node => node.addEventListener("click", () => {
  order.cancelPending();
  const anchor = filtered[currentIndex]?.id;
  language = node.dataset.lang;
  try { localStorage.setItem("robys-language", language); } catch {}
  const url = new URL(location.href);
  if (url.searchParams.has("lang")) { url.searchParams.set("lang", language); history.replaceState(null, "", url); }
  applyLanguage();
  const index = filtered.findIndex(product => product.id === anchor);
  if (index >= 0) requestAnimationFrame(() => moveToCard(index, { instant: true }));
}));
searchInput.addEventListener("input", () => { order.cancelPending(); clearItemLink(category, true); discoveryChanged = true; renderFeed(); });
$("#feed-search-clear").addEventListener("click", () => { order.cancelPending(); searchInput.value = ""; discoveryChanged = true; renderFeed(); searchInput.focus(); });
$("#feed-reset").addEventListener("click", () => { order.cancelPending(); likedOnly = false; category = "all"; searchInput.value = ""; clearItemLink(); renderCategories(); renderFeed(); moveToCard(0, { focus: true, instant: true }); });
$("#feed-liked-filter").addEventListener("click", () => {
  order.cancelPending();
  likedOnly = !likedOnly; category = "all"; searchInput.value = "";
  clearItemLink();
  renderCategories(); renderFeed();
  if (filtered.length) moveToCard(0, { instant: true });
});
$("#feed-discover-open").addEventListener("click", () => {
  order.cancelPending();
  discoveryChanged = false; discoverDialog.showModal(); stopViews(); searchInput.focus();
});
for (const id of ["feed-discover-close", "feed-discover-done"]) $(`#${id}`).addEventListener("click", () => discoverDialog.close());
discoverDialog.addEventListener("close", () => {
  $("#feed-discover-open").focus({ preventScroll: true });
  updateFeedLayout();
  if (discoveryChanged && filtered.length) moveToCard(0, { instant: true });
  scheduleActiveCard(); viewCandidates.forEach(scheduleView);
});
$("#feed-share-close").addEventListener("click", () => shareDialog.close());
shareDialog.addEventListener("close", () => {
  (shareReturnFocus?.isConnected ? shareReturnFocus : $("#feed-discover-open")).focus({ preventScroll: true });
  viewCandidates.forEach(scheduleView);
});
$("#feed-share-copy").addEventListener("click", async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText($("#feed-share-url").value);
    $("#feed-share-help").textContent = text().copied;
  } catch {
    $("#feed-share-help").textContent = text().copyHelp;
    if (shareDialog.open) { $("#feed-share-url").focus(); $("#feed-share-url").select(); }
  }
});
document.addEventListener("keydown", event => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || document.querySelector("dialog[open]")) return;
  const active = document.activeElement;
  if (active?.matches("input,textarea,select,[contenteditable=true]") || (active !== document.body && active !== root && !active?.closest(".feed-card"))) return;
  event.preventDefault();
  order.cancelPending();
  updateActiveCard(); moveToCard(currentIndex + (event.key === "ArrowDown" ? 1 : -1), { focus: true });
});
window.addEventListener("scroll", scheduleActiveCard, { passive: true });
window.addEventListener("resize", scheduleLayout);
if ("ResizeObserver" in window) {
  const layout = new ResizeObserver(scheduleLayout);
  for (const selector of [".feed-header", ".feed-tools", "#menu-cart-trigger"]) layout.observe($(selector));
}
void document.fonts?.ready.then(scheduleLayout);
$("#feed-more").addEventListener("click", () => { order.cancelPending(); const nextIndex = rendered; appendPage(); root.children[nextIndex]?.querySelector(".feed-add")?.focus({ preventScroll: true }); });
if ("IntersectionObserver" in window) {
  const more = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && rendered < filtered.length) appendPage(); }, { rootMargin: "400px" });
  more.observe($("#feed-more-wrap"));
}
$("#menu-cart-trigger").addEventListener("click", event => {
  stopViews(); void order.openCart(event.currentTarget);
});
for (const dialog of document.querySelectorAll(".menu-dialog")) dialog.addEventListener("close", () => {
  scheduleActiveCard(); viewCandidates.forEach(scheduleView);
});
function followEntry() {
  const next = parseFeedEntry(location.href, products);
  if (next.productId) {
    const index = filtered.findIndex(product => product.id === next.productId);
    if (index >= 0) requestAnimationFrame(() => moveToCard(index, { instant: true }));
  }
}
const navigateCategory = () => {
  // Collection hash handlers create their own intent before this listener.
  // Ordinary catalog navigation (including browser Back) cancels older loads.
  if (!/^#(?:menu-combos(?:-takeaway)?|menu-family|kids-menu|menu-combo-[a-z][a-z0-9-]{0,50})$/.test(location.hash)) order.cancelPending();
  const next = parseFeedEntry(location.href, products);
  category = next.category; likedOnly = false; searchInput.value = "";
  renderCategories(); renderFeed(); followEntry();
  if (!next.productId && menuCategories.some(entry => `#${entry.id}` === location.hash) && filtered.length) {
    requestAnimationFrame(() => moveToCard(0, { focus: true, instant: true }));
  }
};
window.addEventListener("popstate", navigateCategory);
window.addEventListener("hashchange", navigateCategory);
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
$("#menu-cart-trigger").hidden = false;
root.dataset.ready = "true";
updateFeedLayout(); followEntry();
void refreshOrder();
