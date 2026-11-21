// Taste Memory enhances the feed without changing ordering or claiming public engagement.
// All preferences and verified link-copy counts stay on this device.
import { menuCategories } from "./menu-catalog.js?v=3132b4dc1273";
import { feedProducts } from "./src/menu-feed-model.js";
import { choosePersonalPair, chooseRememberedProduct, productIdFromShareUrl } from "./taste-memory-policy.js";

const products = feedProducts(menuCategories);
const byId = new Map(products.map(product => [product.id, product]));
const LIKE = "robys-feed-like-v1:";
const SEEN = "robys-feed-seen-v1:";
const VIEWS = "robys-feed-views-v1:";
const KEY = "robys-taste-memory-v1";
const MAX_COUNT = 999999999;
const translations = {
  tr: { open: "Benim lezzetim", title: "Lezzet geçmişim", views: "Görüntüleme", likes: "Beğendiğin", shares: "Kopyalanan bağlantı", note: "Sayılar yalnızca bu cihazı gösterir. Bağlantı kopyalama sayılır; başka uygulamada gönderim doğrulanamaz.", reminder: "Sessiz hatırlatmalar", clear: "Bu cihazdaki geçmişi sil", question: "Beğenileri, görüntülemeleri ve paylaşım geçmişini bu cihazdan silmek istiyor musun?", pair: "Beğendiğine yakışır", pairAction: "Ürünü keşfet", fromYou: "Bunu daha önce beğenmiştin", remember: "Hâlâ burada. Yeniden bakmak ister misin?", return: "Yeniden keşfet", dismiss: "Hatırlatmayı kapat", close: "Kapat", off: "Hatırlatmalar kapalı", on: "Hatırlatmalar açık" },
  en: { open: "My taste", title: "Your taste history", views: "Views", likes: "Liked", shares: "Links copied", note: "These are this-device totals only. Copying a link counts; sending it in another app cannot be verified.", reminder: "Quiet reminders", clear: "Clear this device's history", question: "Delete likes, views and sharing history on this device?", pair: "Pairs with your favorite", pairAction: "Explore pairing", fromYou: "You liked this before", remember: "Still here, if you want another look.", return: "Rediscover", dismiss: "Dismiss reminder", close: "Close", off: "Reminders off", on: "Reminders on" },
  ru: { open: "Мой вкус", title: "Твоя история вкуса", views: "Просмотры", likes: "Понравилось", shares: "Ссылок скопировано", note: "Статистика только этого устройства. Считаем копирование ссылки, но не можем подтвердить отправку в другое приложение.", reminder: "Тихие напоминания", clear: "Очистить историю на устройстве", question: "Удалить лайки, просмотры и историю ссылок на этом устройстве?", pair: "Сочетается с твоим вкусом", pairAction: "Посмотреть сочетание", fromYou: "Ты уже отмечал это", remember: "Я всё ещё здесь. Хочешь взглянуть ещё раз?", return: "Вспомнить вкус", dismiss: "Скрыть напоминание", close: "Закрыть", off: "Напоминания выключены", on: "Напоминания включены" }
};
const local = key => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
const erase = key => { try { localStorage.removeItem(key); } catch {} };
const validCount = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT ? value : 0;
const cleanRecord = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function loadPreferences() {
  let raw = {};
  try { raw = JSON.parse(local(KEY) || "{}"); } catch {}
  const value = cleanRecord(raw);
  const copies = {};
  for (const [id, count] of Object.entries(cleanRecord(value.copies))) if (byId.has(id) && validCount(count)) copies[id] = count;
  const shown = {};
  for (const [id, time] of Object.entries(cleanRecord(value.shown))) {
    if (byId.has(id) && Number.isSafeInteger(time) && time > 0 && time <= Date.now()) shown[id] = time;
  }
  return { enabled: value.enabled !== false, copies, shown, lastShown: Number.isSafeInteger(value.lastShown) && value.lastShown <= Date.now() ? value.lastShown : 0 };
}
let preferences = loadPreferences();
const save = () => store(KEY, JSON.stringify(preferences));
const oldLikes = new Set(products.filter(product => local(LIKE + product.id) === "1").map(product => product.id));
let sessionStarted = Date.now();
let interacted = false, prompted = false, reminderNode = null;
const root = document.querySelector("#feed"), toolActions = document.querySelector(".feed-tool-actions"), formats = document.querySelector(".feed-formats");
const lang = () => ["tr", "en", "ru"].includes(document.documentElement.lang) ? document.documentElement.lang : "tr";
const t = key => translations[lang()][key];
const name = product => product.item.name?.[lang()] || product.item.name?.tr || product.id;
const make = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
};
function navigationLink(id) {
  const url = new URL(location.href);
  url.searchParams.delete("q");
  url.searchParams.set("item", id);
  url.searchParams.set("lang", lang());
  url.hash = "";
  return url.pathname + url.search;
}
function liked() { return products.filter(product => local(LIKE + product.id) === "1"); }
function stats() {
  let views = 0, seen = 0;
  for (const product of products) {
    const stored = Number(local(VIEWS + product.id) || "0");
    const count = Number.isSafeInteger(stored) && stored > 0 && stored <= MAX_COUNT ? stored : local(SEEN + product.id) === "1" ? 1 : 0;
    views += count;
    if (count > 0) seen++;
  }
  return { views, seen, likes: liked().length, shares: Object.values(preferences.copies).reduce((n, v) => n + v, 0) };
}
function selectedPair() {
  return choosePersonalPair(new Set(liked().map(product => product.id)), byId);
}
function stat(label) {
  const wrap = make("div", "taste-memory-stat");
  const number = make("strong", "", "0");
  const title = make("span", "", label);
  wrap.append(number, title);
  return { wrap, number, title };
}
if (root && toolActions && formats) {
  const css = make("link");
  css.rel = "stylesheet";
  css.href = "taste-memory.css";
  document.head.append(css);
  const trigger = toolActions.querySelector(".taste-memory-trigger") ?? make("button", "taste-memory-trigger", t("open"));
  trigger.type = "button";
  trigger.textContent = t("open");
  trigger.setAttribute("aria-controls", "taste-memory-panel");
  trigger.setAttribute("aria-expanded", "false");
  const panel = make("section", "taste-memory-panel");
  panel.id = "taste-memory-panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "taste-memory-heading");
  panel.tabIndex = -1;
  const heading = make("h3", "", t("title")); heading.id = "taste-memory-heading";
  const numbers = make("div", "taste-memory-numbers");
  const viewed = stat(t("views")), likes = stat(t("likes")), shared = stat(t("shares"));
  numbers.append(viewed.wrap, likes.wrap, shared.wrap);
  const description = make("p", "taste-memory-note", t("note"));
  const controls = make("div", "taste-memory-controls");
  const toggleLabel = make("label", "taste-memory-toggle");
  const enabled = make("input"); enabled.type = "checkbox"; enabled.checked = preferences.enabled;
  const enabledText = make("span", "", t("reminder"));
  toggleLabel.append(enabled, enabledText);
  const clear = make("button", "taste-memory-clear", t("clear")); clear.type = "button";
  controls.append(toggleLabel, clear);
  const suggestion = make("div", "taste-memory-pair"); suggestion.hidden = true;
  panel.append(heading, numbers, description, controls, suggestion);
  if (!trigger.isConnected) toolActions.prepend(trigger);
  formats.after(panel);
  const formatNumber = n => new Intl.NumberFormat(lang() === "tr" ? "tr-TR" : lang() === "ru" ? "ru-RU" : "en-US").format(n);
  let renderedPairKey = "";
  function render() {
    const total = stats();
    trigger.textContent = t("open");
    heading.textContent = t("title");
    viewed.title.textContent = t("views"); viewed.number.textContent = formatNumber(total.views);
    likes.title.textContent = t("likes"); likes.number.textContent = formatNumber(total.likes);
    shared.title.textContent = t("shares"); shared.number.textContent = formatNumber(total.shares);
    description.textContent = t("note");
    enabledText.textContent = t("reminder");
    enabled.checked = preferences.enabled;
    enabled.setAttribute("aria-label", preferences.enabled ? t("on") : t("off"));
    clear.textContent = t("clear");
    const pair = selectedPair();
    const key = pair ? pair.source.id + "|" + pair.target.id + "|" + lang() : "";
    suggestion.hidden = !pair;
    if (key !== renderedPairKey) {
      renderedPairKey = key;
      suggestion.replaceChildren();
    if (pair) {
      const photo = make("img");
      photo.src = pair.target.image;
      photo.alt = "";
      photo.width = 80; photo.height = 80; photo.loading = "lazy";
      const details = make("div", "");
      details.append(make("span", "taste-memory-pair-kicker", t("pair") + ": " + name(pair.source)),
        make("strong", "", name(pair.target)));
      const link = make("a", "taste-memory-pair-link", t("pairAction"));
      link.href = navigationLink(pair.target.id);
      details.append(link);
      suggestion.append(photo, details);
    }
    }
    if (reminderNode) {
      reminderNode.querySelector(".taste-memory-reminder-kicker").textContent = t("fromYou");
      reminderNode.querySelector(".taste-memory-reminder-content strong").textContent = name(byId.get(reminderNode.dataset.productId));
      reminderNode.querySelector(".taste-memory-reminder-copy").textContent = t("remember");
      reminderNode.querySelector(".taste-memory-reminder-link").textContent = t("return");
      reminderNode.querySelector(".taste-memory-reminder-close").setAttribute("aria-label", t("dismiss"));
    }
  }
  trigger.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    trigger.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) { render(); panel.focus({ preventScroll: true }); }
  });
  document.addEventListener("click", event => {
    if (panel.hidden || panel.contains(event.target) || trigger.contains(event.target)) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  });
  enabled.addEventListener("change", () => {
    preferences.enabled = enabled.checked; save();
    if (!preferences.enabled) hideReminder();
    render();
  });
  clear.addEventListener("click", () => {
    if (!window.confirm(t("question"))) return;
    for (const product of products) {
      erase(LIKE + product.id); erase(SEEN + product.id); erase(VIEWS + product.id);
    }
    erase(KEY);
    window.location.reload(); // Sync the existing feed's in-memory like state.
  });
  let reminderTimeout;
  function hideReminder() {
    clearTimeout(reminderTimeout);
    reminderNode?.remove(); reminderNode = null;
  }
  function showReminder(product) {
    const card = make("aside", "taste-memory-reminder");
    card.setAttribute("aria-label", t("fromYou"));
    card.dataset.productId = product.id;
    const photo = make("img"); photo.src = product.image; photo.alt = ""; photo.width = 88; photo.height = 88;
    const content = make("div", "taste-memory-reminder-content");
    const kicker = make("span", "taste-memory-reminder-kicker", t("fromYou"));
    const title = make("strong", "", name(product));
    const info = make("p", "taste-memory-reminder-copy", t("remember"));
    const link = make("a", "taste-memory-reminder-link", t("return")); link.href = navigationLink(product.id);
    content.append(kicker, title, info, link);
    const close = make("button", "taste-memory-reminder-close", "×");
    close.type = "button"; close.setAttribute("aria-label", t("dismiss"));
    close.addEventListener("click", hideReminder);
    card.append(photo, content, close);
    document.body.append(card);
    reminderNode = card;
    reminderTimeout = window.setTimeout(hideReminder, 11000);
  }
  function maybeRemember() {
    const candidate = chooseRememberedProduct({
      products, priorLiked: oldLikes, currentLiked: new Set(liked().map(product => product.id)),
      shown: preferences.shown, lastShown: preferences.lastShown, now: Date.now(),
      sessionStarted, interacted, enabled: preferences.enabled, prompted,
      busy: document.hidden || !document.hasFocus() || !panel.hidden ||
        Boolean(document.querySelector("dialog[open]")) ||
        Number(document.querySelector("#menu-cart-count")?.textContent || "0") > 0
    });
    if (!candidate) return;
    prompted = true;
    preferences.lastShown = Date.now();
    preferences.shown[candidate.id] = preferences.lastShown;
    save();
    showReminder(candidate);
  }
  const touch = event => {
    if (event.isTrusted && !event.target.closest(".taste-memory-panel, .taste-memory-reminder")) interacted = true;
  };
  document.addEventListener("click", touch, { passive: true });
  document.addEventListener("pointerdown", touch, { passive: true });
  document.addEventListener("keydown", event => { if (event.isTrusted) interacted = true; });
  document.addEventListener("wheel", event => { if (event.isTrusted) interacted = true; }, { passive: true });
  document.addEventListener("touchstart", event => { if (event.isTrusted) interacted = true; }, { passive: true });
  function resetForegroundWindow() {
    sessionStarted = Date.now();
    interacted = false;
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) hideReminder(); else resetForegroundWindow(); });
  window.addEventListener("focus", resetForegroundWindow);
  window.addEventListener("pageshow", event => { if (event.persisted) resetForegroundWindow(); });
  window.setInterval(() => {
    if (!panel.hidden) render();
    maybeRemember();
  }, 12000);
  // Count successful fallback link copies, not mere share-button taps.
  const copyButton = document.querySelector("#feed-share-copy");
  const copyHelp = document.querySelector("#feed-share-help");
  const shareUrl = document.querySelector("#feed-share-url");
  if (copyButton && copyHelp && shareUrl && typeof MutationObserver !== "undefined") {
    let pending = null;
    copyButton.addEventListener("click", () => {
      const id = productIdFromShareUrl(shareUrl.value, byId);
      pending = id ? { id, expires: Date.now() + 8000 } : null;
    }, true);
    const observer = new MutationObserver(() => {
      if (!pending || Date.now() > pending.expires) { pending = null; return; }
      if (!["Bağlantı kopyalandı", "Link copied", "Ссылка скопирована"].includes(copyHelp.textContent.trim())) return;
      preferences.copies[pending.id] = Math.min(MAX_COUNT, (preferences.copies[pending.id] || 0) + 1);
      pending = null;
      save();
      if (!panel.hidden) render();
    });
    observer.observe(copyHelp, { childList: true, characterData: true, subtree: true });
  }
  document.querySelectorAll("[data-lang]").forEach(button => button.addEventListener("click", () => queueMicrotask(render)));
  window.addEventListener("storage", event => {
    if (event.key === KEY || event.key === null) preferences = loadPreferences();
    if (event.key === null || event.key === KEY || event.key?.startsWith("robys-feed-")) {
      if (!panel.hidden) render();
      if (!preferences.enabled) hideReminder();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus({ preventScroll: true });
    }
  });
  document.querySelector("#menu-cart-trigger")?.addEventListener("click", hideReminder);
  const dialogGuard = new MutationObserver(() => {
    if (reminderNode && document.querySelector("dialog[open]")) hideReminder();
  });
  dialogGuard.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  window.addEventListener("pagehide", hideReminder);
  render();
}
