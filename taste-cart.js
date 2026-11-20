// Cross-view visual basket enhancement: no own basket, no price changes.
// Uses the existing serialised order transaction when an optional extra is added.
import { menuCategories } from "./menu-catalog.js?v=3132b4dc1273";
import { feedProducts } from "./src/menu-feed-model.js";
import { chooseTasteCartExtra } from "./taste-cart-policy.js";

const products = feedProducts(menuCategories);
const catalog = new Map(products.map(product => [product.id, product]));
const validIds = new Set(catalog.keys());
const root = document.querySelector("#menu-cart-lines");
const dialog = document.querySelector("#menu-cart-dialog");
const strings = {
  tr: { remembered: "Beğendiğin bir lezzet", paired: "Seçimine yakışır", intro: "Daha önce beğenmiştin. İstersen yanına ekleyebilirsin.", pairIntro: "Bu lezzet seçiminin yanında güzel olabilir.", add: "Siparişe ekle", dismiss: "Bu öneriyi gizle", error: "Eklenemedi. Siparişini kontrol edip yeniden dene.", changed: "Sipariş değişti, yeni seçimini kontrol et.", added: "Siparişine eklendi", note: "İsteğe bağlı · Menü fiyatı", price: "Fiyat" },
  en: { remembered: "A taste you liked", paired: "Pairs with your choice", intro: "You liked this before. Add it if it feels right.", pairIntro: "This could be a lovely match with your selection.", add: "Add to order", dismiss: "Hide this suggestion", error: "Couldn't add this. Check your order and try again.", changed: "Your order changed. Please check it.", added: "Added to your order", note: "Optional · Menu price", price: "Price" },
  ru: { remembered: "Ты это уже отметил", paired: "Подходит к твоему вкусу", intro: "Ты уже лайкал этот вкус. Можешь добавить к заказу.", pairIntro: "Это может хорошо дополнить твой выбор.", add: "Добавить в заказ", dismiss: "Скрыть рекомендацию", error: "Не удалось добавить. Проверь заказ и попробуй снова.", changed: "Заказ изменился. Проверь состав.", added: "Добавлено в заказ", note: "По желанию · Цена из меню", price: "Цена" }
};
const locale = () => ["tr", "en", "ru"].includes(document.documentElement.lang) ? document.documentElement.lang : "tr";
const copy = key => strings[locale()][key];
const name = product => product.item.name?.[locale()] || product.item.name?.tr || product.id;
const money = amount => new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[locale()], { maximumFractionDigits: 2 }).format(amount) + " ₺";
const make = (tag, cls, txt) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt !== undefined) node.textContent = txt;
  return node;
};
function likedIds() {
  const ids = new Set();
  try {
    for (const product of products) if (localStorage.getItem("robys-feed-like-v1:" + product.id) === "1") ids.add(product.id);
  } catch { /* Personalisation is optional when storage is disabled. */ }
  return ids;
}
const byPhoto = new Map(products.map(product => [new URL(product.image, document.baseURI).pathname, product.id]));
function selectedIds() {
  const chosen = new Set();
  for (const photo of root.querySelectorAll(".menu-cart-line .menu-cart-group-images img")) {
    const id = byPhoto.get(new URL(photo.src, document.baseURI).pathname);
    if (id) chosen.add(id);
  }
  return chosen;
}
if (root && dialog) {
  const styles = make("link");
  styles.rel = "stylesheet"; styles.href = "taste-cart.css";
  document.head.append(styles);
  const dismissed = new Set();
  let busy = false, lastKey = "";
  function render() {
    if (busy) return;
    const match = chooseTasteCartExtra({ selectedIds: selectedIds(), likedIds: likedIds(), catalog });
    const key = match ? match.sourceId + "|" + match.product.id + "|" + locale() : "";
    const bump = root.querySelector(".menu-cart-bump");
    let old = root.querySelector(".taste-cart-recommendation");
    if (!match || dismissed.has(match.product.id)) {
      if (old) old.remove();
      if (bump && !bump.hidden && old) bump.hidden = false;
      lastKey = "";
      return;
    }
    // The built-in anonymous bump is replaced by one personal offer, never stacked with it.
    if (bump) bump.hidden = true;
    if (key === lastKey && old?.dataset.key === key) return;
    old?.remove();
    lastKey = key;
    const product = match.product;
    const card = make("section", "taste-cart-recommendation");
    card.dataset.key = key;
    card.setAttribute("aria-label", match.reason === "remembered" ? copy("remembered") : copy("paired"));
    const portrait = make("img", "taste-cart-photo");
    portrait.src = product.image;
    portrait.alt = "";
    portrait.loading = "lazy";
    portrait.decoding = "async";
    portrait.width = 160; portrait.height = 160;
    const info = make("div", "taste-cart-info");
    const label = make("span", "taste-cart-kicker", copy(match.reason === "remembered" ? "remembered" : "paired"));
    const title = make("strong", "taste-cart-name", name(product));
    const lead = make("p", "taste-cart-lead", copy(match.reason === "remembered" ? "intro" : "pairIntro"));
    const price = make("p", "taste-cart-price", copy("price") + " · " + money(product.item.price));
    const status = make("p", "taste-cart-status", ""); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    info.append(label, title, lead, price, status);
    const actions = make("div", "taste-cart-actions");
    const add = make("button", "taste-cart-add", copy("add") + " · +" + money(product.item.price));
    add.type = "button";
    const dismiss = make("button", "taste-cart-dismiss", copy("dismiss"));
    dismiss.type = "button";
    dismiss.addEventListener("click", () => { dismissed.add(product.id); card.remove(); lastKey = ""; });
    add.addEventListener("click", async () => {
      if (busy || !dialog.open) return;
      busy = true; add.disabled = true; dismiss.disabled = true;
      add.setAttribute("aria-busy", "true");
      try {
        // Shared order-storage module owns IndexedDB and transaction conflicts.
        const storage = await import("./order-storage.js?v=6908555cd79b");
        const response = await storage.transactStoredOrderDraft(current => {
          const currentIds = new Set((current.lines || []).filter(line => line.quantity > 0).map(line => line.id));
          if (!currentIds.has(match.sourceId) || currentIds.has(product.id)) {
            return { draft: current, applied: false };
          }
          return storage.addOrderGroup(current, [{ id: product.id, quantity: 1 }], 1, validIds);
        }, validIds, { origin: "taste-cart" });
        if (response.applied) {
          status.textContent = copy("added");
          const notice = document.querySelector("#menu-cart-status");
          if (notice) notice.textContent = name(product) + " · " + copy("added");
        } else status.textContent = copy("changed");
      } catch {
        status.textContent = copy("error");
      } finally {
        busy = false; add.disabled = false; dismiss.disabled = false; add.removeAttribute("aria-busy");
        if (card.isConnected) render();
      }
    });
    actions.append(add, dismiss);
    card.append(portrait, info, actions);
    root.append(card);
  }
  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => Array.from(m.addedNodes).some(n => n.nodeType === 1 && (
      n.classList?.contains("menu-cart-line") || n.classList?.contains("menu-cart-bump"))) ||
      mutations.some(m => Array.from(m.removedNodes).some(n => n.nodeType === 1 && (
        n.classList?.contains("menu-cart-line") || n.classList?.contains("menu-cart-bump")))) render();
  });
  observer.observe(root, { childList: true });
  dialog.addEventListener("close", () => { dismissed.clear(); lastKey = ""; });
  document.querySelectorAll("[data-lang]").forEach(button => button.addEventListener("click", () => queueMicrotask(render)));
  window.addEventListener("storage", event => {
    if (event.key === null || event.key.startsWith("robys-feed-like-v1:")) render();
  });
  render();
}
