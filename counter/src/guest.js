import qrcode from "qrcode-generator";
import { decodeOrderTicket, ORDER_TICKET_STORAGE_KEY } from "../../src/order-ticket.js";

export const GUEST_STORAGE_PREFIX = "robys-counter-guest.v1:";
export const ORDER_STATUSES = ["awaiting_payment", "preparing", "ready", "issued"];
const LANGUAGES = ["tr", "en", "ru"];
const SITE_LANGUAGE_KEY = "robys-language";
const locales = { tr: "tr-TR", en: "en-GB", ru: "ru-RU" };
const API = "/api/counter";
const copy = {
  tr: {
    title: "Siparişin · Roby's", language: "Dil", heading: "Senin için hazırlanacak", number: "Sipariş numaran", loading: "Siparişin açılıyor…",
    loadingHelp: "Birazdan QR kodunu burada göreceksin.", items: "Siparişin", total: "Toplam", qr: "Kasiyere göster", qrLabel: "Kasiyerin siparişi açması için QR kod", qrHelp: "Kasiyer bu QR kodla siparişini açabilir.",
    paymentNote: "Ödeme kasada yapılır. Bu sayfa kartından para çekmez.", paid: "Ödeme kasiyer tarafından onaylandı.",
    steps: ["Kasada ödeme", "Hazırlanıyor", "Hazır", "Teslim edildi"],
    states: {
      awaiting_payment: ["Seçimin tamam. Sırada kasa var.", "QR kodu kasiyere göster ve ödemeyi kasada yap. Ardından ekip hazırlamaya başlayacak."],
      preparing: ["Siparişin hazırlanıyor.", "Kendine rahat bir yer bul. Hazır olduğunda bu ekran güncellenecek."],
      ready: ["Siparişin hazır!", "Numaranı göstererek siparişini teslim al. Afiyet olsun."],
      issued: ["Afiyet olsun!", "Siparişin teslim edildi. İstersen yeni bir seçimle devam edebilirsin."]
    },
    live: "Güncellemeler açık", updated: "Son kontrol", offline: "Bağlantı yok. Son bilinen durum gösteriliyor; QR kodun burada kalacak.",
    stale: "Şu an güncelleyemiyoruz. Son bilinen durum gösteriliyor; QR kodunu kasiyere gösterebilirsin.",
    reconnect: "Bağlantı kurulunca yeniden deneyeceğiz.", retry: "Tekrar dene", retrying: "Kontrol ediliyor…", newOrder: "Yeni sipariş oluştur", back: "Menüye dön",
    unavailable: "Sipariş henüz açılamadı. Bağlantını kontrol et; tekrar denemek ikinci bir sipariş oluşturmaz.",
    invalid: "Bu sipariş bağlantısı geçerli değil. Menüden siparişini yeniden aç.", denied: "Bu sipariş bu bağlantıyla açılamıyor. Siparişi oluşturduğun cihazdaki bağlantıyı kullan.",
    conflict: "Bu seçim için başka bir sipariş bağlantısı var. Siparişi oluşturduğun cihazdaki bağlantıyı kullan veya kasiyerden yardım iste.",
    catalog: "Menü güncellenmiş. Menüye dönüp seçimini kontrol et.", pageHelp: "Bu ekranı açık tutabilirsin. Durum, ekibin güncellemeleriyle otomatik değişir."
  },
  en: {
    title: "Your order · Roby's", language: "Language", heading: "A little moment for you", number: "Your order number", loading: "Opening your order…",
    loadingHelp: "Your QR code will appear here shortly.", items: "Your items", total: "Total", qr: "Show this to the cashier", qrLabel: "QR code for the cashier to open your order", qrHelp: "The cashier can open your order with this QR code.",
    paymentNote: "Pay at the counter. This page does not charge your card.", paid: "Payment confirmed by the cashier.",
    steps: ["Pay at counter", "Preparing", "Ready", "Collected"],
    states: {
      awaiting_payment: ["All chosen. Next, the counter.", "Show this QR to the cashier and pay at the counter. The team will then start preparing your order."],
      preparing: ["Your order is being prepared.", "Make yourself comfortable. This screen will update when your order is ready."],
      ready: ["Your order is ready!", "Show your order number to collect it. Enjoy your moment."],
      issued: ["Enjoy!", "Your order has been collected. You can start a new order whenever you like."]
    },
    live: "Updates are live", updated: "Last checked", offline: "You're offline. Showing the last known status; your QR is still here.",
    stale: "We can't refresh right now. Showing the last known status; you can still show your QR to the cashier.",
    reconnect: "We'll retry when you're connected.", retry: "Try again", retrying: "Checking…", newOrder: "Start a new order", back: "Back to menu",
    unavailable: "We couldn't open your order yet. Check your connection; retrying will not create a second order.",
    invalid: "This order link isn't valid. Open your order again from the menu.", denied: "This link can't open the order. Use the link on the device where you created it.",
    conflict: "There is another link for this selection. Use the device where you created the order or ask the cashier for help.",
    catalog: "The menu has changed. Return to the menu and check your selection.", pageHelp: "You can keep this screen open. It updates automatically when the team changes your order's status."
  },
  ru: {
    title: "Твой заказ · Roby's", language: "Язык", heading: "Немного времени для себя", number: "Номер твоего заказа", loading: "Открываем твой заказ…",
    loadingHelp: "Скоро здесь появится QR для кассира.", items: "Твой выбор", total: "Итого", qr: "Покажи кассиру", qrLabel: "QR-код для открытия заказа кассиром", qrHelp: "Кассир откроет твой заказ по этому QR-коду.",
    paymentNote: "Оплата на кассе. Эта страница не списывает деньги с карты.", paid: "Кассир подтвердил оплату.",
    steps: ["Оплата на кассе", "Готовим", "Готово", "Выдан"],
    states: {
      awaiting_payment: ["Выбор сделан. Осталось подойти к кассе.", "Покажи QR кассиру и оплати заказ. После оплаты команда начнёт готовить."],
      preparing: ["Готовим твой заказ.", "Можно устроиться поудобнее. Когда всё будет готово, этот экран обновится."],
      ready: ["Твой заказ готов!", "Покажи номер и забери заказ на выдаче. Приятного кофейного момента."],
      issued: ["Приятного аппетита!", "Заказ выдан. Если хочется ещё чего-нибудь, можно начать новый выбор."]
    },
    live: "Статус обновляется", updated: "Последняя проверка", offline: "Нет связи. Показываем последний известный статус; QR остаётся доступным.",
    stale: "Пока не можем обновить статус. Показываем последнее известное состояние; QR можно показать кассиру.",
    reconnect: "Повторим, когда появится связь.", retry: "Повторить", retrying: "Проверяем…", newOrder: "Собрать новый заказ", back: "Вернуться в меню",
    unavailable: "Пока не удалось открыть заказ. Проверь связь: повторная попытка не создаст второй заказ.",
    invalid: "Эта ссылка на заказ не подходит. Вернись в меню и открой заказ заново.", denied: "По этой ссылке заказ недоступен. Открой ссылку на устройстве, где создавался заказ.",
    conflict: "Для этого выбора уже есть другая ссылка на заказ. Открой её на устройстве, где создавался заказ, или обратись к кассиру.",
    catalog: "Меню обновилось. Вернись в меню и проверь свой выбор.", pageHelp: "Можно оставить этот экран открытым. Статус изменится автоматически, когда команда обновит заказ."
  }
};

const languageOf = value => LANGUAGES.includes(value) ? value : "tr";
function rememberSiteLanguage(language) {
  // Continue in the guest's chosen language without changing unrelated data.
  try { globalThis.localStorage?.setItem(SITE_LANGUAGE_KEY, languageOf(language)); }
  catch { /* Optional browser storage must not block language selection or navigation. */ }
}
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
const validKey = value => typeof value === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
const base64url = bytes => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createGuestKey(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.getRandomValues) throw new Error("secure_random_unavailable");
  return base64url(cryptoProvider.getRandomValues(new Uint8Array(32)));
}

function readRecord(stores, key) {
  for (const storage of stores) {
    try {
      const text = storage?.getItem(key);
      if (text && text.length < 100000) return JSON.parse(text);
    } catch { /* The private URL remains a reload-safe fallback. */ }
  }
  return null;
}

function saveRecord(stores, key, value) {
  for (const storage of stores) {
    try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Keep the private URL. */ }
  }
}

export function guestEntry(hash, stores = [], cryptoProvider = globalThis.crypto) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const id = params.get("id");
  const payload = params.get("ticket");
  if (id && !payload && validId(id) && validKey(params.get("key"))) {
    const receipt = readRecord(stores, `${GUEST_STORAGE_PREFIX}order:${id}`);
    return { id, key: params.get("key"), language: languageOf(params.get("lang")),
      ticketId: receipt?.key === params.get("key") ? receipt.ticketId : null,
      saved: receipt?.key === params.get("key") ? receipt : null };
  }
  if (!payload || id) throw new Error("invalid_link");
  const { ticket, language } = decodeOrderTicket(payload);
  const storageKey = `${GUEST_STORAGE_PREFIX}ticket:${ticket.id}`;
  const saved = readRecord(stores, storageKey);
  const key = validKey(params.get("key")) ? params.get("key") : validKey(saved?.key) ? saved.key : createGuestKey(cryptoProvider);
  saveRecord(stores, storageKey, { key, ticketId: ticket.id });
  return { payload, key, ticketId: ticket.id, language: languageOf(params.get("lang") ?? language) };
}

export function guestFragment(entry) {
  const params = new URLSearchParams(entry.id ? { id: entry.id } : { ticket: entry.payload });
  params.set("key", entry.key);
  params.set("lang", languageOf(entry.language));
  return `#${params}`;
}

export function staffOrderUrl(id, baseUrl) {
  if (!validId(id)) throw new Error("invalid_order");
  const url = new URL("/counter/staff.html", baseUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("invalid_origin");
  url.hash = new URLSearchParams({ order: id }).toString();
  return url.href;
}

export function clearCompletedTicket(stores, ticketId) {
  if (typeof ticketId !== "string") return;
  // A newer order may have been composed in another tab. Clear only this identity.
  for (const storage of stores) {
    for (const key of [ORDER_TICKET_STORAGE_KEY, `${ORDER_TICKET_STORAGE_KEY}.pending`]) {
      try {
        const record = JSON.parse(storage?.getItem(key) ?? "null");
        const ticket = key.endsWith(".pending") ? JSON.parse(record?.value ?? "null")?.ticket : record?.ticket;
        if (ticket?.id === ticketId) storage.removeItem(key);
      } catch { /* Unrelated or unavailable browser data must remain untouched. */ }
    }
  }
}

export function validOrder(order) {
  return !!order && validId(order.id) && typeof order.number === "string" && order.number.length <= 40
    && ORDER_STATUSES.includes(order.status) && Number.isSafeInteger(order.version) && order.version > 0
    && Number.isSafeInteger(order.totalMinor) && order.totalMinor >= 0 && order.currency === "TRY"
    && Number.isSafeInteger(order.createdAt) && Number.isSafeInteger(order.updatedAt)
    && Array.isArray(order.groups) && order.groups.length > 0 && order.groups.length <= 64
    && order.groups.every(group => Number.isSafeInteger(group.quantity) && group.quantity > 0
      && Number.isSafeInteger(group.lineTotalMinor) && group.lineTotalMinor >= 0
      && Array.isArray(group.items) && group.items.length > 0 && group.items.length <= 8
      && group.items.every(item => typeof item.name === "string" && item.name.length <= 300
        && (item.variantName === undefined || typeof item.variantName === "string" && item.variantName.length <= 300)
        && Number.isSafeInteger(item.quantity) && item.quantity > 0));
}

function createQr(url, label) {
  const code = qrcode(0, "M");
  code.addData(url, "Byte");
  code.make();
  const size = code.getModuleCount();
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", `0 0 ${size + 8} ${size + 8}`);
  svg.setAttribute("width", "264");
  svg.setAttribute("height", "264");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("shape-rendering", "crispEdges");
  const background = document.createElementNS(namespace, "rect");
  background.setAttribute("width", String(size + 8));
  background.setAttribute("height", String(size + 8));
  background.setAttribute("fill", "#fff");
  const dots = document.createElementNS(namespace, "path");
  dots.setAttribute("fill", "#000");
  const paths = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (code.isDark(row, column)) paths.push(`M${column + 4} ${row + 4}h1v1h-1z`);
    }
  }
  dots.setAttribute("d", paths.join(""));
  svg.append(background, dots);
  return svg;
}

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export async function startGuestPage() {
  const stores = [];
  try { stores.push(globalThis.localStorage); } catch { /* Private URL fallback. */ }
  try { stores.push(globalThis.sessionStorage); } catch { /* Private URL fallback. */ }
  const nodes = Object.fromEntries(Array.from(document.querySelectorAll("[data-guest]"), node => [node.dataset.guest, node]));
  let entry;
  let language = languageOf(new URLSearchParams(location.hash.slice(1)).get("lang"));
  let order = null;
  let checkedAt = null;
  let connection = "loading";
  let failure = null;
  let timer;
  let inFlight = false;
  let requestedAgain = false;
  let terminal = false;
  let rendered = "";
  let qrId;
  const money = amount => `${new Intl.NumberFormat(locales[language], { maximumFractionDigits: 2 }).format(amount / 100)} ₺`;
  const replaceFragment = () => history.replaceState(null, "", `${location.pathname}${guestFragment({ ...entry, language })}`);
  const failureText = () => {
    const t = copy[language];
    if (failure?.status === 401 || failure?.status === 403 || failure?.status === 404) return t.denied;
    if (failure?.status === 409) return t.conflict;
    if (failure?.code === "catalog_changed") return t.catalog;
    if (failure?.status === 400 || failure?.code === "invalid_link") return t.invalid;
    return order ? t.stale : t.unavailable;
  };
  const render = () => {
    const t = copy[language];
    document.documentElement.lang = language;
    document.title = t.title;
    nodes.languages.setAttribute("aria-label", t.language);
    for (const button of nodes.languages.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.language === language));
    for (const key of ["heading", "items", "total", "qr", "qrHelp", "pageHelp", "back", "newOrder"]) nodes[key].textContent = t[key];
    nodes.numberLabel.textContent = t.number;
    nodes.retry.textContent = inFlight ? t.retrying : t.retry;
    nodes.retry.disabled = inFlight;
    nodes.retry.hidden = connection !== "offline" && connection !== "stale" && connection !== "error";
    nodes.receipt.hidden = !order;
    nodes.progress.hidden = !order;
    nodes.newOrder.hidden = order?.status !== "issued";
    nodes.back.hidden = !!order;
    nodes.paymentNote.hidden = !order;
    nodes.paymentNote.textContent = order && order.status !== "awaiting_payment" ? t.paid : t.paymentNote;
    const title = order ? t.states[order.status][0] : failure ? failureText() : t.loading;
    const description = order ? t.states[order.status][1] : failure ? "" : t.loadingHelp;
    if (nodes.statusTitle.textContent !== title) nodes.statusTitle.textContent = title;
    if (nodes.statusHelp.textContent !== description) nodes.statusHelp.textContent = description;
    nodes.number.textContent = order?.number ?? "—";
    nodes.status.dataset.status = order?.status ?? "loading";
    const offline = navigator.onLine === false;
    nodes.connection.textContent = offline ? t.offline : connection === "live" ? t.live : failure ? failureText() : t.retrying;
    nodes.connection.dataset.connection = connection;
    nodes.reconnect.textContent = offline ? t.reconnect : "";
    nodes.updated.textContent = checkedAt ? `${t.updated}: ${new Intl.DateTimeFormat(locales[language], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(checkedAt)}` : "";
    nodes.updated.dateTime = checkedAt ? new Date(checkedAt).toISOString() : "";
    if (!order) return;
    // Localized quotes can change item/variant names without changing the order version.
    const view = JSON.stringify([language, order.id, order.version, order.groups, order.totalMinor]);
    if (rendered !== view) {
      rendered = view;
      nodes.progress.replaceChildren(...ORDER_STATUSES.map((status, index) => {
        const step = element("li", index <= ORDER_STATUSES.indexOf(order.status) ? "is-complete" : "", t.steps[index]);
        if (status === order.status) step.setAttribute("aria-current", "step");
        return step;
      }));
      nodes.composition.replaceChildren(...order.groups.map(group => {
        const row = element("li", "receipt-group");
        const lines = element("ul", "receipt-items");
        for (const item of group.items) {
          const line = element("li", "receipt-item");
          line.append(element("span", "item-quantity", `${group.quantity * item.quantity} ×`), element("span", "item-name", item.name));
          if (item.variantName) line.append(element("small", "item-variant", item.variantName));
          lines.append(line);
        }
        row.append(lines, element("span", "group-price", money(group.lineTotalMinor)));
        return row;
      }));
      nodes.amount.textContent = money(order.totalMinor);
    }
    if (qrId !== order.id) {
      nodes.qrCode.replaceChildren(createQr(staffOrderUrl(order.id, location.href), t.qrLabel));
      qrId = order.id;
    } else nodes.qrCode.querySelector("svg")?.setAttribute("aria-label", t.qrLabel);
  };
  const rememberOrder = () => saveRecord(stores, `${GUEST_STORAGE_PREFIX}order:${entry.id}`, {
    key: entry.key, ticketId: entry.ticketId, language, order, checkedAt
  });
  const refresh = async () => {
    clearTimeout(timer);
    if (!entry || document.hidden || navigator.onLine === false) {
      if (navigator.onLine === false) { connection = "offline"; render(); }
      return;
    }
    if (inFlight) { requestedAgain = true; return; }
    if (order && checkedAt && Date.now() - checkedAt > 6000) {
      connection = "stale";
      failure ??= new Error("stale_receipt");
    }
    inFlight = true;
    render();
    const requestLanguage = language;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
      const path = entry.id ? `/orders/${encodeURIComponent(entry.id)}` : "/orders";
      const response = await fetch(`${API}${path}?lang=${requestLanguage}`, {
        method: entry.id ? "GET" : "POST", credentials: "omit", cache: "no-store", signal: controller.signal,
        headers: entry.id ? { Authorization: `Bearer ${entry.key}` } : { "Content-Type": "application/json" },
        ...(entry.id ? {} : { body: JSON.stringify({ ticketPayload: entry.payload, guestKey: entry.key }) })
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error("counter_request_failed"), { status: response.status, code: data.error });
      if (!validOrder(data.order) || entry.id && data.order.id !== entry.id) throw new Error("invalid_response");
      entry.id = data.order.id;
      saveRecord(stores, `${GUEST_STORAGE_PREFIX}order:${entry.id}`, {
        key: entry.key, ticketId: entry.ticketId, language: requestLanguage, order: data.order, checkedAt: Date.now()
      });
      replaceFragment();
      // A language switch during a request must not display another language's items.
      if (requestLanguage !== language) { requestedAgain = true; return; }
      order = data.order;
      checkedAt = Date.now();
      connection = "live";
      failure = null;
      terminal = false;
      rememberOrder();
    } catch (error) {
      failure = error;
      connection = navigator.onLine === false ? "offline" : order ? "stale" : "error";
      terminal = [400, 401, 403, 404, 409].includes(error.status);
    } finally {
      clearTimeout(deadline);
      inFlight = false;
      render();
      if (requestedAgain) { requestedAgain = false; void refresh(); }
      else if (!terminal && !document.hidden && navigator.onLine !== false) timer = setTimeout(refresh, 2000);
    }
  };
  nodes.languages.addEventListener("click", event => {
    const button = event.target.closest("button[data-language]");
    if (!button || !LANGUAGES.includes(button.dataset.language) || language === button.dataset.language) return;
    language = button.dataset.language;
    rememberSiteLanguage(language);
    rendered = "";
    if (entry) replaceFragment();
    render();
    void refresh();
  });
  nodes.retry.addEventListener("click", () => { terminal = false; void refresh(); });
  nodes.newOrder.addEventListener("click", () => {
    if (order?.status !== "issued") return;
    clearCompletedTicket(stores, entry.ticketId);
    rememberSiteLanguage(language);
    location.assign("/smart-choice/#quick");
  });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(timer);
    if (!document.hidden) void refresh();
  });
  window.addEventListener("online", () => { terminal = false; void refresh(); });
  window.addEventListener("offline", () => { clearTimeout(timer); connection = "offline"; render(); });
  try {
    // Serialize shared ticket-key creation across tabs where Web Locks is available.
    const prepare = () => guestEntry(location.hash, stores);
    entry = navigator.locks ? await navigator.locks.request("robys-counter-guest-entry", prepare) : prepare();
    language = entry.language;
    replaceFragment();
    if (entry.saved?.language === language && validOrder(entry.saved.order) && entry.saved.order.id === entry.id) {
      order = entry.saved.order;
      checkedAt = Number.isSafeInteger(entry.saved.checkedAt) ? entry.saved.checkedAt : null;
      connection = navigator.onLine === false ? "offline" : "stale";
      failure = new Error("cached_receipt");
    }
    render();
    await refresh();
  } catch (error) {
    failure = Object.assign(error, { code: "invalid_link" });
    connection = "error";
    render();
    nodes.retry.hidden = true;
  }
}

if (typeof document !== "undefined") void startGuestPage();
