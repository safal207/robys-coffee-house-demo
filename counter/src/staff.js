import jsQR from "jsqr";
import { parseOrderInput, visibleForRole, newestOrder, queueSections, nextOrderAction, paymentStillCurrent, formatMoney } from "./staff-model.mjs";

const copy = {
  ru: {
    language: "Язык", logout: "Выйти", team: "ДЛЯ КОМАНДЫ ROBY’S", loginTitle: "Каждый заказ — на своём месте.", loginIntro: "Войдите в рабочее место кассира или бариста.", username: "Логин", password: "Пароль", login: "Войти", private: "Заказы доступны только сотрудникам после входа.", queueTitle: "Заказы в работе", retry: "Обновить", findTitle: "Открыть заказ", scanHint: "Сканируйте QR гостя или вставьте ссылку из QR.", orderInput: "Ссылка из QR или ID заказа", open: "Открыть", scan: "Сканировать QR", stopCamera: "Остановить камеру", paymentEyebrow: "ПРОВЕРКА ОПЛАТЫ", paymentTitle: "Оплата уже получена?", paymentExplanation: "Сначала примите оплату на кассе. Эта кнопка фиксирует полученную оплату и передаёт заказ в приготовление — деньги с карты не списываются.", paymentCheck: "Я проверил(а): полная сумма получена на кассе.", paymentConfirm: "Оплата получена · готовить", cancel: "Отмена", logoutRetry: "Повторить выход",
    cashier: "Кассир", barista: "Бариста", unpaid: "Ждут оплаты", active: "Оплачены · в работе", issuedSection: "Недавно выданы", awaiting_payment: "Ждёт оплаты", preparing: "Готовится", ready: "Готов", issued: "Выдан", emptyUnpaid: "Заказов для оплаты пока нет.", emptyActive: "Всё спокойно. Оплаченные заказы появятся здесь.", selectTitle: "Выберите заказ", selectHint: "Откройте карточку в очереди или QR гостя — здесь появятся состав и следующий шаг.", order: "Заказ", group: "Набор", total: "Итого", created: "Создан", paid: "Оплата подтверждена", payAction: "Подтвердить оплату на кассе", readyAction: "Заказ готов", issuedAction: "Выдать заказ", unpaidNote: "Сначала примите оплату. После подтверждения заказ увидит бариста.", preparingNote: "Когда все позиции готовы, отметьте заказ готовым. Гость увидит обновление.", readyNote: "Проверьте номер и передайте гостю весь заказ.", issuedNote: "Заказ выдан. Хорошего дня гостю!", updated: "Обновлено", connecting: "Подключаемся…", stale: "Нет связи · показаны последние данные", refreshBeforeAction: "Обновите очередь перед действием.", invalidInput: "Вставьте ID заказа или QR-ссылку этого кафе. QR с других сайтов не подходит.", notFound: "Заказ недоступен. Проверьте QR и права вашей роли.", loginError: "Не удалось войти. Проверьте логин и пароль.", expired: "Сеанс завершён. Войдите снова.", networkError: "Не удалось связаться с кассой. Последние данные сохранены на экране; попробуйте обновить.", actionUnknown: "Ответ не получен. Обновите заказ, чтобы проверить его статус, прежде чем повторять действие.", conflict: "Заказ уже изменился на другом рабочем месте. Показаны актуальные данные — проверьте их ещё раз.", forbidden: "Это действие недоступно вашей роли.", rateLimit: "Слишком много попыток. Немного подождите и попробуйте снова.", saved: "Статус заказа обновлён.", paymentSaved: "Оплата подтверждена. Заказ передан в приготовление.", working: "Сохраняем…", logoutFailed: "Сервер не подтвердил выход. Данные скрыты; восстановите связь и повторите выход.", loggedOut: "Вы вышли из рабочего места.", cameraHint: "Наведите камеру на QR гостя. В кадре должен быть один QR.", cameraDenied: "Камера недоступна. Разрешите доступ в браузере или вставьте QR-ссылку вручную.", cameraUnsupported: "В этом браузере камера недоступна. Откройте QR камерой телефона или вставьте ссылку ниже.", cameraInvalid: "Это не QR заказа этого кафе. Наведите камеру на QR гостя.", cameraStarting: "Запрашиваем доступ к камере…", queueLabel: "Очередь заказов", detailLabel: "Состав заказа", cameraLabel: "Камера для QR"
  },
  en: {
    language: "Language", logout: "Sign out", team: "ROBY’S TEAM", loginTitle: "Every order, in its place.", loginIntro: "Sign in to the cashier or barista workspace.", username: "Username", password: "Password", login: "Sign in", private: "Order details are available to signed-in staff only.", queueTitle: "Orders in progress", retry: "Refresh", findTitle: "Open an order", scanHint: "Scan the guest’s QR or paste its link.", orderInput: "QR link or order ID", open: "Open", scan: "Scan QR", stopCamera: "Stop camera", paymentEyebrow: "CHECK PAYMENT", paymentTitle: "Payment already received?", paymentExplanation: "Take payment at the counter first. This button records payment received and sends the order to preparation. It does not charge a card.", paymentCheck: "I have checked: the full amount was received at the counter.", paymentConfirm: "Payment received · prepare", cancel: "Cancel", logoutRetry: "Retry sign out",
    cashier: "Cashier", barista: "Barista", unpaid: "Awaiting payment", active: "Paid · in progress", issuedSection: "Recently collected", awaiting_payment: "Awaiting payment", preparing: "Preparing", ready: "Ready", issued: "Collected", emptyUnpaid: "No orders awaiting payment.", emptyActive: "All clear. Paid orders will appear here.", selectTitle: "Choose an order", selectHint: "Open a card in the queue or scan the guest’s QR to see the items and the next step.", order: "Order", group: "Set", total: "Total", created: "Created", paid: "Payment confirmed", payAction: "Confirm counter payment", readyAction: "Mark ready", issuedAction: "Hand over order", unpaidNote: "Take payment first. After confirmation, the order appears for the barista.", preparingNote: "When every item is ready, mark the order ready. The guest will see the update.", readyNote: "Check the number and hand the complete order to the guest.", issuedNote: "Order collected. Have a lovely day!", updated: "Updated", connecting: "Connecting…", stale: "Disconnected · showing last known details", refreshBeforeAction: "Refresh the queue before taking action.", invalidInput: "Paste an order ID or this café’s QR link. Links from other sites are not accepted.", notFound: "Order unavailable. Check the QR and your role’s access.", loginError: "Could not sign in. Check your username and password.", expired: "Your session has ended. Please sign in again.", networkError: "Could not reach the counter service. Last known details remain visible; try refreshing.", actionUnknown: "No response received. Refresh the order to check its status before repeating the action.", conflict: "This order changed at another workstation. Check the refreshed details before continuing.", forbidden: "This action is not available to your role.", rateLimit: "Too many attempts. Wait a moment and try again.", saved: "Order status updated.", paymentSaved: "Payment confirmed. The order is now being prepared.", working: "Saving…", logoutFailed: "The server did not confirm sign out. Details are hidden; reconnect and retry sign out.", loggedOut: "You are signed out.", cameraHint: "Point the camera at the guest’s QR. Keep one QR in the frame.", cameraDenied: "Camera unavailable. Allow camera access in your browser or paste the QR link.", cameraUnsupported: "Camera is unavailable in this browser. Open the QR with your phone camera or paste the link below.", cameraInvalid: "This is not an order QR for this café. Point at the guest’s QR.", cameraStarting: "Requesting camera access…", queueLabel: "Order queue", detailLabel: "Order items", cameraLabel: "QR camera"
  },
  tr: {
    language: "Dil", logout: "Çıkış", team: "ROBY’S EKİBİ", loginTitle: "Her sipariş yerli yerinde.", loginIntro: "Kasiyer veya barista çalışma alanına giriş yapın.", username: "Kullanıcı adı", password: "Şifre", login: "Giriş yap", private: "Sipariş bilgileri yalnızca giriş yapan personele açıktır.", queueTitle: "Aktif siparişler", retry: "Yenile", findTitle: "Sipariş aç", scanHint: "Misafirin QR kodunu tarayın veya bağlantısını yapıştırın.", orderInput: "QR bağlantısı veya sipariş kimliği", open: "Aç", scan: "QR tara", stopCamera: "Kamerayı durdur", paymentEyebrow: "ÖDEME KONTROLÜ", paymentTitle: "Ödeme alındı mı?", paymentExplanation: "Önce kasada ödemeyi alın. Bu düğme alınan ödemeyi kaydeder ve siparişi hazırlığa gönderir. Karttan para çekmez.", paymentCheck: "Kontrol ettim: tutarın tamamı kasada alındı.", paymentConfirm: "Ödeme alındı · hazırla", cancel: "Vazgeç", logoutRetry: "Çıkışı tekrar dene",
    cashier: "Kasiyer", barista: "Barista", unpaid: "Ödeme bekleyen", active: "Ödendi · hazırlanıyor", issuedSection: "Son teslim edilenler", awaiting_payment: "Ödeme bekliyor", preparing: "Hazırlanıyor", ready: "Hazır", issued: "Teslim edildi", emptyUnpaid: "Ödeme bekleyen sipariş yok.", emptyActive: "Her şey yolunda. Ödenen siparişler burada görünecek.", selectTitle: "Bir sipariş seçin", selectHint: "İçeriği ve sonraki adımı görmek için kuyruktaki kartı açın veya misafirin QR kodunu tarayın.", order: "Sipariş", group: "Set", total: "Toplam", created: "Oluşturuldu", paid: "Ödeme onaylandı", payAction: "Kasadaki ödemeyi onayla", readyAction: "Hazır olarak işaretle", issuedAction: "Siparişi teslim et", unpaidNote: "Önce ödemeyi alın. Onaydan sonra sipariş baristaya görünür.", preparingNote: "Tüm ürünler hazır olduğunda siparişi hazır olarak işaretleyin. Misafir güncellemeyi görecek.", readyNote: "Numarayı kontrol edin ve siparişin tamamını misafire teslim edin.", issuedNote: "Sipariş teslim edildi. İyi günler!", updated: "Güncellendi", connecting: "Bağlanıyor…", stale: "Bağlantı yok · son bilgiler gösteriliyor", refreshBeforeAction: "İşlemden önce kuyruğu yenileyin.", invalidInput: "Sipariş kimliğini veya bu kafenin QR bağlantısını yapıştırın. Başka sitelerin bağlantıları kabul edilmez.", notFound: "Sipariş bulunamadı. QR kodunu ve rolünüzün erişimini kontrol edin.", loginError: "Giriş yapılamadı. Kullanıcı adı ve şifrenizi kontrol edin.", expired: "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.", networkError: "Kasa hizmetine ulaşılamadı. Son bilgiler ekranda; yenilemeyi deneyin.", actionUnknown: "Yanıt alınamadı. İşlemi tekrarlamadan önce siparişi yenileyip durumunu kontrol edin.", conflict: "Sipariş başka bir çalışma alanında değişti. Devam etmeden önce güncel bilgileri kontrol edin.", forbidden: "Bu işlem rolünüz için uygun değil.", rateLimit: "Çok fazla deneme. Biraz bekleyip tekrar deneyin.", saved: "Sipariş durumu güncellendi.", paymentSaved: "Ödeme onaylandı. Sipariş hazırlanıyor.", working: "Kaydediliyor…", logoutFailed: "Sunucu çıkışı onaylamadı. Bilgiler gizlendi; bağlantıyı kurup çıkışı tekrar deneyin.", loggedOut: "Çıkış yaptınız.", cameraHint: "Kamerayı misafirin QR koduna tutun. Kadrajda tek QR olsun.", cameraDenied: "Kamera kullanılamıyor. Tarayıcıdan izin verin veya QR bağlantısını yapıştırın.", cameraUnsupported: "Bu tarayıcıda kamera kullanılamıyor. Telefon kamerasıyla QR kodunu açın veya bağlantıyı aşağıya yapıştırın.", cameraInvalid: "Bu kafenin sipariş QR kodu değil. Misafirin QR koduna yöneltin.", cameraStarting: "Kamera izni isteniyor…", queueLabel: "Sipariş kuyruğu", detailLabel: "Sipariş içeriği", cameraLabel: "QR kamerası"
  }
};
const $ = id => document.getElementById(id);
let language = ["ru", "tr", "en"].includes(document.documentElement.lang) ? document.documentElement.lang : "ru";
let session = null, orders = [], selected = null, online = false, lastUpdated = 0;
let generation = 0, selectionGeneration = 0, pollTimer = 0, pollPromise = null, actionPending = false;
let paymentIntent = null, messageKey = "", messageTone = "", queueSignature = "", detailSignature = "";
let cameraRun = 0, cameraStream = null, cameraFrame = 0, lastScan = 0, logoutUnconfirmed = false, logoutPending = false;
const requests = new Set();
// Retain the highest server version even when an order leaves this role's queue.
// A delayed read cannot resurrect a collected order or an unpaid old version.
const knownOrders = new Map();
const t = key => copy[language][key] ?? key;
const money = value => formatMoney(value, language);
const time = value => new Intl.DateTimeFormat({ ru: "ru-RU", tr: "tr-TR", en: "en-GB" }[language], { hour: "2-digit", minute: "2-digit" }).format(value);
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function showMessage(key = "", tone = "") {
  messageKey = key; messageTone = tone;
  $("message").textContent = key ? t(key) : "";
  $("message").hidden = !key;
  $("message").dataset.tone = tone;
}
async function request(path, { body, token = session?.csrfToken, method = body === undefined ? "GET" : "POST" } = {}) {
  const controller = new AbortController(); requests.add(controller);
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`/api/counter${path}`, {
      method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json", ...(token ? { "X-CSRF-Token": token } : {}) } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) {
      const error = new Error("counter_request_failed"); error.status = response.status;
      try { error.code = (await response.json()).error; } catch { /* An unavailable service may return a non-JSON error. */ }
      throw error;
    }
    return response.status === 204 ? null : await response.json();
  } finally { clearTimeout(timeout); requests.delete(controller); }
}
function authExpired() { clearSession(); showMessage("expired", "error"); $("username").focus(); }
function clearSession() {
  generation++; selectionGeneration++; clearTimeout(pollTimer); pollPromise = null;
  requests.forEach(controller => controller.abort()); requests.clear();
  stopCamera(); closePayment(); session = null; orders = []; selected = null; knownOrders.clear(); online = false; lastUpdated = 0; actionPending = false; logoutPending = false;
  $("username").value = ""; $("password").value = ""; $("order-input").value = ""; $("queue").replaceChildren(); $("detail").replaceChildren(); $("identity").textContent = "";
  $("language").disabled = false;
  $("workspace").hidden = true; $("login-panel").hidden = false; $("logout").hidden = true;
  queueSignature = ""; detailSignature = "";
}
function renderConnection() {
  $("connection").textContent = online ? `${t("updated")} ${time(lastUpdated)}` : lastUpdated ? t("stale") : t("connecting");
  $("connection-dot").dataset.online = String(online);
  $("retry").disabled = !session || Boolean(pollPromise);
}
function renderQueue() {
  if (!session) return;
  const signature = JSON.stringify([language, session.user.role, orders, selected?.id]);
  if (signature === queueSignature) return;
  queueSignature = signature;
  const focusId = $("queue").contains(document.activeElement) ? document.activeElement.dataset.orderId : null;
  const sections = queueSections(orders, session.user.role);
  const fragment = document.createDocumentFragment();
  for (const [key, label, empty] of [["unpaid", "unpaid", "emptyUnpaid"], ["active", "active", "emptyActive"], ["issued", "issuedSection", null]]) {
    if (key === "unpaid" && session.user.role !== "cashier" || key === "issued" && !sections.issued.length) continue;
    const section = node("section", "queue-section");
    const heading = node("div", "section-heading"); heading.append(node("h2", "", t(label)), node("span", "section-count", sections[key].length)); section.append(heading);
    const cards = node("div", "queue-cards");
    for (const order of sections[key]) {
      const button = node("button", "order-card"); button.type = "button"; button.dataset.orderId = order.id;
      button.setAttribute("aria-current", String(selected?.id === order.id));
      const top = node("div", "order-card-top"); const badge = node("span", "badge", t(order.status)); badge.dataset.status = order.status;
      top.append(node("span", "order-number", `№ ${order.number}`), badge);
      const preview = order.groups.flatMap(group => group.items.map(item => `${item.quantity * group.quantity} × ${item.name}`)).join(" · ");
      const bottom = node("div", "order-card-bottom"); bottom.append(node("span", "time", `${t("created")} ${time(order.createdAt)}`), node("strong", "", money(order.totalMinor)));
      button.append(top, node("span", "order-preview", preview), bottom);
      button.addEventListener("click", () => chooseOrder(order)); cards.append(button);
    }
    section.append(sections[key].length ? cards : node("p", "empty-queue", t(empty))); fragment.append(section);
  }
  $("queue").replaceChildren(fragment);
  if (focusId) Array.from($("queue").querySelectorAll("[data-order-id]")).find(button => button.dataset.orderId === focusId)?.focus({ preventScroll: true });
}
function renderDetail() {
  if (!session) return;
  const signature = JSON.stringify([language, selected, online, actionPending]);
  if (signature === detailSignature) return;
  detailSignature = signature;
  const actionFocused = $("detail").contains(document.activeElement) && document.activeElement.tagName === "BUTTON";
  $("detail").replaceChildren();
  if (!selected) {
    const empty = node("div", "detail-empty");
    const mark = node("img", "detail-empty-mark");
    mark.src = "../src/brand/robys-mark-master-v1.svg?v=20260917-approved-v4-restore";
    mark.alt = ""; mark.width = 52; mark.height = 60;
    empty.append(mark, node("h2", "", t("selectTitle")), node("p", "muted small", t("selectHint"))); $("detail").append(empty); return;
  }
  const top = node("div", "detail-top"); const badge = node("span", "badge", t(selected.status)); badge.dataset.status = selected.status;
  top.append(node("h2", "", `${t("order")} № ${selected.number}`), badge);
  $("detail").append(top, node("p", "detail-meta", `${t("created")} ${time(selected.createdAt)}${selected.paidAt ? ` · ${t("paid")} ${time(selected.paidAt)}` : ""}`));
  const groups = node("ol", "groups");
  selected.groups.forEach((group, index) => {
    const entry = node("li", "group"); const heading = node("div", "group-heading");
    heading.append(node("strong", "", `${t("group")} ${index + 1} · ×${group.quantity}`), node("span", "", money(group.lineTotalMinor)));
    const items = node("ul", "group-items");
    group.items.forEach(item => { const row = node("li", "", `${item.quantity * group.quantity} × ${item.name}`); if (item.variantName) row.append(node("span", "variant", item.variantName)); items.append(row); });
    entry.append(heading, items); groups.append(entry);
  });
  const total = node("div", "total-row"); total.append(node("span", "", t("total")), node("strong", "", money(selected.totalMinor)));
  const actions = node("div", "order-action"); const next = nextOrderAction(selected, session.user.role);
  if (next) {
    const button = node("button", "primary", actionPending ? t("working") : t({ pay: "payAction", ready: "readyAction", issued: "issuedAction" }[next]));
    button.type = "button"; button.disabled = actionPending || !online;
    button.addEventListener("click", () => next === "pay" ? openPayment() : changeStatus(next));
    actions.append(button, node("p", "", t(!online ? "refreshBeforeAction" : { pay: "unpaidNote", ready: "preparingNote", issued: "readyNote" }[next])));
  } else actions.append(node("p", "issued-note", t("issuedNote")));
  $("detail").append(groups, total, actions);
  if (actionFocused) (actions.querySelector("button:not(:disabled)") ?? $("detail")).focus({ preventScroll: true });
}
function render() { $("language").disabled = actionPending || logoutPending; renderConnection(); renderQueue(); renderDetail(); renderPayment(); }
function rememberOrder(incoming) {
  const known = knownOrders.get(incoming.id) ?? orders.find(order => order.id === incoming.id) ?? (selected?.id === incoming.id ? selected : null);
  const order = newestOrder(known, incoming);
  knownOrders.set(order.id, order);
  return order;
}
function chooseOrder(incoming, { focus = true, writeHash = true } = {}) {
  if (!session) return;
  const order = rememberOrder(incoming);
  if (!visibleForRole(order, session.user.role)) return;
  orders = orders.filter(item => item.id !== order.id); orders.push(order);
  selectionGeneration++; selected = order; closePayment(); render();
  if (writeHash) history.replaceState(null, "", `#order=${encodeURIComponent(order.id)}`);
  if (focus) { $("detail").focus({ preventScroll: true }); if (matchMedia("(max-width:700px)").matches) $("detail").scrollIntoView({ block: "start", behavior: "instant" }); }
}
async function openOrder(id) {
  if (!session) return;
  const current = generation, selection = ++selectionGeneration;
  try {
    const result = await request(`/orders/${encodeURIComponent(id)}?lang=${language}`);
    if (current !== generation || selection !== selectionGeneration) return;
    const order = rememberOrder(result.order);
    if (!visibleForRole(order, session.user.role)) { showMessage("notFound", "error"); return; }
    showMessage(); chooseOrder(order);
  } catch (error) {
    if (current !== generation || selection !== selectionGeneration) return;
    if (error.status === 401) authExpired();
    else if (error.status === 404 || error.status === 403) showMessage("notFound", "error");
    else {
      online = false;
      showMessage(error.status === 429 ? "rateLimit" : "networkError", "error");
      render();
    }
  }
}
function schedulePoll() { clearTimeout(pollTimer); if (session && !document.hidden) pollTimer = setTimeout(refreshQueue, 3000); }
async function refreshQueue() {
  if (!session || pollPromise || actionPending) return pollPromise;
  const current = generation;
  pollPromise = (async () => {
    try {
      const result = await request(`/queue?lang=${language}`);
      if (current !== generation) return;
      orders = result.orders.map(rememberOrder).filter(order => visibleForRole(order, session.user.role)); online = true; lastUpdated = Date.now();
      if (selected) {
        const updated = orders.find(order => order.id === selected.id);
        if (updated) selected = updated;
        else if (session.user.role === "barista") { selected = null; closePayment(); }
        else {
          const selection = selectionGeneration, id = selected.id;
          try { const detail = await request(`/orders/${encodeURIComponent(id)}?lang=${language}`); if (current === generation && selection === selectionGeneration) selected = rememberOrder(detail.order); }
          catch (error) {
            if (error.status !== 403 && error.status !== 404) throw error;
            if (current === generation && selection === selectionGeneration) { selected = null; closePayment(); }
          }
        }
      }
      if (["networkError", "actionUnknown"].includes(messageKey)) showMessage();
    } catch (error) {
      if (current !== generation) return;
      if (error.status === 401) { authExpired(); return; }
      online = false; showMessage(error.status === 429 ? "rateLimit" : "networkError", "error");
    } finally {
      if (current === generation) { pollPromise = null; render(); schedulePoll(); }
    }
  })();
  renderConnection(); return pollPromise;
}
function closePayment() {
  paymentIntent = null; $("payment-confirmed").checked = false; $("payment-error").hidden = true;
  $("payment-order").textContent = ""; $("payment-error").textContent = "";
  if ($("payment-dialog").open) $("payment-dialog").close();
}
function openPayment() {
  if (!selected || actionPending || !online || nextOrderAction(selected, session?.user.role) !== "pay") return;
  paymentIntent = { id: selected.id, version: selected.version, totalMinor: selected.totalMinor, number: selected.number };
  $("payment-confirmed").checked = false; renderPayment(); $("payment-dialog").showModal(); $("payment-cancel").focus();
}
function renderPayment() {
  if (!paymentIntent) return;
  $("payment-order").textContent = `№ ${paymentIntent.number} · ${money(paymentIntent.totalMinor)}`;
  const current = paymentStillCurrent(selected, paymentIntent);
  $("payment-submit").disabled = !current || !online || actionPending || !$("payment-confirmed").checked;
  $("payment-submit").textContent = t(actionPending ? "working" : "paymentConfirm");
  $("payment-confirmed").disabled = actionPending || !current;
  $("payment-cancel").disabled = actionPending;
  $("payment-error").hidden = current && online;
  $("payment-error").textContent = t(current ? "refreshBeforeAction" : "conflict");
}
async function submitAction(order, action) {
  if (!session || actionPending || !online) return;
  const restoreDetailFocus = $("payment-dialog").open;
  // An older in-flight queue response must not overwrite this write's result.
  generation++; selectionGeneration++; clearTimeout(pollTimer);
  requests.forEach(controller => controller.abort()); pollPromise = null;
  const current = generation; actionPending = true; render();
  try {
    const result = await request(`/orders/${encodeURIComponent(order.id)}/${action === "pay" ? "pay" : "status"}?lang=${language}`, { body: action === "pay" ? { version: order.version } : { version: order.version, status: action } });
    if (current !== generation) return;
    const confirmed = rememberOrder(result.order);
    closePayment();
    if (selected?.id === confirmed.id) selected = visibleForRole(confirmed, session.user.role) ? confirmed : null;
    orders = orders.filter(item => item.id !== confirmed.id); if (visibleForRole(confirmed, session.user.role)) orders.push(confirmed);
    showMessage(action === "pay" ? "paymentSaved" : "saved");
  } catch (error) {
    if (current !== generation) return;
    closePayment();
    if (error.status === 401 || error.code === "invalid_csrf") { authExpired(); return; }
    if (error.status === 409) showMessage("conflict", "error");
    else if (error.status === 403) showMessage("forbidden", "error");
    else if (error.status === 429) showMessage("rateLimit", "error");
    else { online = false; showMessage("actionUnknown", "error"); }
  } finally {
    if (current === generation) {
      actionPending = false; render();
      if (restoreDetailFocus) $("detail").focus({ preventScroll: true });
      await refreshQueue();
    }
  }
}
function changeStatus(status) { if (selected && nextOrderAction(selected, session?.user.role) === status) void submitAction({ ...selected }, status); }
function setSession(value) {
  if (!value?.csrfToken || !["cashier", "barista"].includes(value.user?.role)) throw new Error("invalid_session");
  knownOrders.clear(); orders = []; selected = null;
  generation++; session = value; logoutUnconfirmed = false; $("logout-retry").hidden = true;
  $("login-panel").hidden = true; $("workspace").hidden = false; $("logout").hidden = false;
  $("password").value = ""; $("identity").textContent = `${t(session.user.role)} · ${session.user.username}`; render();
  void refreshQueue(); const id = parseOrderInput(location.href, location.href); if (id) void openOrder(id);
}
async function logout() {
  const token = session?.csrfToken; clearSession(); logoutPending = true;
  $("login-submit").disabled = true; $("logout-retry").disabled = true; $("language").disabled = true;
  const current = generation;
  try {
    const csrf = token ?? (await request("/session"))?.csrfToken;
    await request("/logout", { body: {}, token: csrf });
    if (current !== generation) return;
    logoutUnconfirmed = false; history.replaceState(null, "", location.pathname); showMessage("loggedOut");
  } catch (error) {
    if (current !== generation) return;
    logoutUnconfirmed = error.status !== 401; showMessage(logoutUnconfirmed ? "logoutFailed" : "loggedOut", logoutUnconfirmed ? "error" : "");
  } finally { if (current === generation) { logoutPending = false; $("login-submit").disabled = false; $("logout-retry").disabled = false; $("logout-retry").hidden = !logoutUnconfirmed; $("language").disabled = false; } }
}
function localize() {
  document.documentElement.lang = language; document.title = `ROBY’S · ${t("team")}`;
  document.querySelectorAll("[data-copy]").forEach(element => { element.textContent = t(element.dataset.copy); });
  $("language").value = language; $("language").setAttribute("aria-label", t("language")); $("order-input").placeholder = t("orderInput");
  $("queue-panel").setAttribute("aria-label", t("queueLabel")); $("detail").setAttribute("aria-label", t("detailLabel")); $("camera-video").setAttribute("aria-label", t("cameraLabel"));
  if (session) $("identity").textContent = `${t(session.user.role)} · ${session.user.username}`;
  showMessage(messageKey, messageTone); render();
}
function stopCamera() {
  cameraRun++; cancelAnimationFrame(cameraFrame); cameraStream?.getTracks().forEach(track => track.stop()); cameraStream = null;
  $("camera-video").srcObject = null; $("camera-panel").hidden = true; $("camera-start").disabled = false;
  $("camera-canvas").width = 0; $("camera-canvas").height = 0;
}
async function startCamera() {
  if (!session) return;
  stopCamera();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { showMessage("cameraUnsupported", "error"); $("order-input").focus(); return; }
  const run = cameraRun; $("camera-start").disabled = true; $("camera-panel").hidden = false; $("camera-message").textContent = t("cameraStarting");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 960 }, height: { ideal: 720 } } });
    if (run !== cameraRun || !session) { stream.getTracks().forEach(track => track.stop()); return; }
    cameraStream = stream; const video = $("camera-video"); video.srcObject = stream; await video.play();
    if (run !== cameraRun) return;
    let detector = null;
    if (window.BarcodeDetector) { try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch { /* jsQR supports browsers without the native detector. */ } }
    $("camera-message").textContent = t("cameraHint");
    const scan = async timestamp => {
      if (run !== cameraRun) return;
      if (timestamp - lastScan > 240 && video.readyState >= 2) {
        lastScan = timestamp; let value = null;
        try {
          if (detector) { try { value = (await detector.detect(video))[0]?.rawValue; } catch { detector = null; } }
          if (!detector) {
            const canvas = $("camera-canvas"), scale = Math.min(1, 800 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
            const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height); value = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" })?.data;
          }
        } catch { /* A changing video frame can be retried without changing order state. */ }
        if (run !== cameraRun) return;
        if (value) {
          const id = parseOrderInput(value, location.href);
          if (id) { stopCamera(); void openOrder(id); return; }
          $("camera-message").textContent = t("cameraInvalid");
        }
      }
      cameraFrame = requestAnimationFrame(scan);
    };
    cameraFrame = requestAnimationFrame(scan);
  } catch { if (run === cameraRun) { stopCamera(); showMessage("cameraDenied", "error"); $("order-input").focus(); } }
}
$("login-form").addEventListener("submit", async event => {
  event.preventDefault(); const current = generation; $("login-submit").disabled = true; showMessage();
  const credentials = { username: $("username").value.trim(), password: $("password").value };
  try { const value = await request("/login", { body: credentials, token: null }); if (current === generation) setSession(value); }
  catch (error) { if (current === generation) showMessage(error.status === 429 ? "rateLimit" : error.status ? "loginError" : "networkError", "error"); }
  finally { credentials.password = ""; $("password").value = ""; $("login-submit").disabled = false; }
});
$("find-form").addEventListener("submit", event => { event.preventDefault(); const id = parseOrderInput($("order-input").value, location.href); if (!id) showMessage("invalidInput", "error"); else { stopCamera(); void openOrder(id); } });
$("language").addEventListener("change", () => {
  if (actionPending || logoutPending) { $("language").value = language; return; }
  language = $("language").value; generation++; selectionGeneration++; requests.forEach(controller => controller.abort()); pollPromise = null; online = false; closePayment(); stopCamera(); localize(); if (session) void refreshQueue();
});
$("payment-form").addEventListener("submit", event => { event.preventDefault(); if ($("payment-confirmed").checked && paymentStillCurrent(selected, paymentIntent) && session?.user.role === "cashier") void submitAction({ ...paymentIntent }, "pay"); });
$("payment-confirmed").addEventListener("change", renderPayment);
$("payment-cancel").addEventListener("click", closePayment);
$("payment-dialog").addEventListener("cancel", event => { if (actionPending) event.preventDefault(); else closePayment(); });
$("logout").addEventListener("click", logout); $("logout-retry").addEventListener("click", logout);
$("retry").addEventListener("click", refreshQueue); $("camera-start").addEventListener("click", startCamera); $("camera-stop").addEventListener("click", stopCamera);
window.addEventListener("hashchange", () => { const id = parseOrderInput(location.href, location.href); if (id && session) void openOrder(id); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { clearTimeout(pollTimer); stopCamera(); } else if (session) void refreshQueue(); });
window.addEventListener("pagehide", clearSession);
window.addEventListener("pageshow", event => { if (event.persisted) void restoreSession(); });
async function restoreSession() {
  const current = generation; $("login-submit").disabled = true;
  try { const value = await request("/session"); if (current === generation) setSession(value); }
  catch (error) { if (current === generation && error.status !== 401) showMessage("networkError", "error"); }
  finally { $("login-submit").disabled = false; }
}
localize(); void restoreSession();
