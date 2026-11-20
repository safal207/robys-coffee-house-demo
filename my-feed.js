// Optional personal discovery rail. The original vertical feed retains its order,
// viewability accounting, navigation, lazy pages, product details and checkout.
import { menuCategories } from "./menu-catalog.js?v=3132b4dc1273";
import { feedProducts } from "./src/menu-feed-model.js";
import { makeMyFeedPlan } from "./src/my-feed-policy.js";

const products = feedProducts(menuCategories);
const catalog = new Map(products.map(product => [product.id, product]));
const LIKE = "robys-feed-like-v1:", SEEN = "robys-feed-seen-v1:", VIEWS = "robys-feed-views-v1:";
const copy = {
  tr: { open: "Benim akışım", sub: "Sevdiklerin · Yeni tatlar", close: "Akışı kapat", heading: "Senin için seçtiklerin", intro: "Beğendiklerin, henüz bakmadıkların ve gerçek menü eşleşmeleri. Yalnızca bu cihazda.", next: "Başka tatlar", all: "Tüm akışa dön", favorites: "Favorin", discover: "Henüz bakmadın", explore: "Tekrar keşfet", pair: "Birlikte güzel olur", view: "Ürünü aç", idea: "Beğendiklerin burada yerini bulur. Kalbe dokun, sonra yeni fikirler için yenile.", count: n => n + " seçenek", suggestion: "Şunun yanında: " },
  en: { open: "My feed", sub: "Favorites · New tastes", close: "Close my feed", heading: "Your own taste discoveries", intro: "Your saved favorites, unseen menu items and actual pairings. Only on this device.", next: "More ideas", all: "Back to the full feed", favorites: "Your favorite", discover: "Not yet viewed", explore: "Rediscover", pair: "A natural pairing", view: "See this item", idea: "Saved favorites appear here. Tap a heart in the feed, then refresh ideas.", count: n => n + " ideas", suggestion: "With " },
  ru: { open: "Моя лента", sub: "Любимое · Открытия", close: "Скрыть подборку", heading: "Твоя лента вкусов", intro: "Любимчики, ещё не просмотренные позиции и сочетания из настоящего меню. Только на этом устройстве.", next: "Другие идеи", all: "В общую ленту", favorites: "Любимое", discover: "Ещё не смотрел", explore: "Вспомнить вкус", pair: "Вкусная пара", view: "Посмотреть товар", idea: "Лайкай товары в общей ленте — они появятся здесь после обновления подборки.", count: n => n + " вариантов", suggestion: "Хорошо с: " }
};
const lang = () => ["tr", "en", "ru"].includes(document.documentElement.lang) ? document.documentElement.lang : "tr";
const phrase = value => copy[lang()][value];
const localized = object => object?.[lang()] ?? object?.tr ?? "";
const button = document.querySelector("#my-feed-toggle");
const stage = document.querySelector("#my-feed-stage");
const track = document.querySelector("#my-feed-track");
const next = document.querySelector("#my-feed-refresh");
const all = document.querySelector("#my-feed-all");
const label = document.querySelector("#my-feed-label");
const intro = document.querySelector("#my-feed-intro");
const heading = document.querySelector("#my-feed-title");
const status = document.querySelector("#my-feed-status");
const note = document.querySelector("#my-feed-hint");
const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
function tasteSnapshot() {
  const likedIds = new Set(), viewedIds = new Set(), views = new Map();
  for (const product of products) {
    if (stored(LIKE + product.id) === "1") likedIds.add(product.id);
    const raw = stored(VIEWS + product.id);
    const count = raw && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : stored(SEEN + product.id) === "1" ? 1 : 0;
    if (count) { viewedIds.add(product.id); views.set(product.id, count); }
  }
  return { products, likedIds, viewedIds, views };
}
function productLink(id) {
  const url = new URL(location.href);
  url.searchParams.delete("q");
  url.searchParams.set("item", id);
  url.searchParams.set("lang", lang());
  url.hash = "";
  return url;
}
function viewProduct(event, id) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = productLink(id);
  if (typeof history.pushState !== "function" || typeof PopStateEvent !== "function") return;
  // This intentionally follows the existing feed's own popstate handler.
  // It performs one explicit navigation, never live-reorders while swiping.
  event.preventDefault();
  history.pushState(null, "", url.pathname + url.search);
  dispatchEvent(new PopStateEvent("popstate"));
}
let mountedExperience;
export function mountMyFeed() {
if (mountedExperience) return mountedExperience;
if (button && stage && track && next && all && label && intro && heading && status && note) {
  let plan = null, refreshes = 0;
  const showText = kind => ({ favorite: phrase("favorites"), discover: phrase("discover"),
    explore: phrase("explore"), pair: phrase("pair") })[kind];
  const money = price => new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[lang()],
    { maximumFractionDigits: 0 }).format(price) + " ₺";
  function translate() {
    button.querySelector(".my-feed-toggle-title").textContent = stage.hidden ? phrase("open") : phrase("close");
    button.querySelector(".my-feed-toggle-sub").textContent = phrase("sub");
    label.textContent = phrase("open");
    heading.textContent = phrase("heading");
    intro.textContent = phrase("intro");
    next.textContent = phrase("next");
    all.textContent = phrase("all");
    note.textContent = phrase("idea");
    status.textContent = plan ? phrase("count")(plan.length) : "";
    track.querySelectorAll(".my-feed-card").forEach((card, i) => {
      const entry = plan?.[i], product = catalog.get(entry?.id);
      if (!product) return;
      card.querySelector(".my-feed-kind").textContent = showText(entry.kind);
      card.querySelector(".my-feed-name").textContent = localized(product.item.name);
      card.querySelector(".my-feed-price").textContent = money(product.item.price);
      card.querySelector(".my-feed-open").textContent = phrase("view");
      card.querySelector(".my-feed-open").href = productLink(product.id).href;
      const contextual = card.querySelector(".my-feed-context");
      contextual.textContent = entry.sourceId
        ? phrase("suggestion") + localized(catalog.get(entry.sourceId)?.item.name)
        : "";
      contextual.hidden = !entry.sourceId;
    });
  }
  function rebuild() {
    const snapshot = tasteSnapshot();
    const seed = Math.floor(Date.now() / 86400000) + refreshes * 137;
    plan = makeMyFeedPlan({ ...snapshot, seed });
    const fragment = document.createDocumentFragment();
    for (const entry of plan) {
      const product = catalog.get(entry.id);
      if (!product) continue;
      const card = make("article", "my-feed-card");
      card.dataset.productId = entry.id;
      const image = make("img", "my-feed-image");
      image.src = product.image; image.alt = ""; image.width = 320; image.height = 320;
      image.loading = "lazy"; image.decoding = "async";
      const details = make("div", "my-feed-details");
      const kind = make("span", "my-feed-kind");
      const name = make("strong", "my-feed-name");
      const context = make("span", "my-feed-context");
      const price = make("strong", "my-feed-price");
      const link = make("a", "my-feed-open");
      link.href = productLink(entry.id).href;
      link.addEventListener("click", event => viewProduct(event, entry.id));
      details.append(kind, name, context, price, link);
      card.append(image, details); fragment.append(card);
    }
    track.replaceChildren(fragment);
    track.scrollLeft = 0;
    translate();
  }
  function toggle() {
    const opened = stage.hidden;
    stage.hidden = !opened;
    button.setAttribute("aria-expanded", String(opened));
    button.setAttribute("aria-pressed", String(opened));
    if (opened && !plan) rebuild();
    translate();
  }
  next.addEventListener("click", () => {
    refreshes += 1;
    rebuild(); // An explicit request is the only in-session reranking action.
  });
  all.addEventListener("click", () => {
    stage.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-pressed", "false");
    translate();
    button.focus({ preventScroll: true });
  });
  // Language is presentation only. Preserve the six SKUs, DOM and scroll position.
  document.querySelectorAll("[data-lang]").forEach(language => language.addEventListener("click", () => queueMicrotask(translate)));
  window.addEventListener("pageshow", event => { if (event.persisted) translate(); });
  translate();
  mountedExperience = { toggle };
}
return mountedExperience;
}
