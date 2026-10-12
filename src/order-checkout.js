import qrcode from "qrcode-generator";
import { buildCashierUrl, getOrCreateOrderTicket, quoteOrderTicket, ticketOrderNumber } from "./order-ticket.js";
import { createTicketStorage } from "./order-ticket-storage.js";

export const checkoutCopy = {
  tr: { title: "Sipariş numaran", cashierTitle: "Kasada sipariş", awaiting: "Kasada ödeme bekleniyor",
    instructions: "QR kodu kasiyere göster. Kasada ödeme yap. Ödemeden sonra ekip siparişini hazırlamaya başlayacak.",
    cashierInstructions: "İçeriği müşteriyle kontrol et. Ödemeyi kasada al; ardından hazırlığa geç.",
    total: "Toplam", composition: "Sipariş içeriği", close: "Kapat", change: "Siparişi düzenle", open: "Kasiyer görünümünü aç",
    qr: "Sipariş içeriğini kasada açan QR kod", created: "Oluşturuldu", print: "Yazdır", back: "Menüye dön",
    invalid: "Bu sipariş açılamadı. Menüdeki seçimini kontrol edip yeni bir QR oluştur.",
    empty: "Önce siparişine bir ürün ekle.", variant: "Lütfen tüm içeceklerin aromalarını seç.",
    large: "Bu sipariş tek QR koda sığmıyor. Siparişi kasiyere menüdeki sepetten göster.",
    changed: "Menü güncellendi. Müşteriden yeni bir sipariş QR kodu oluşturmasını iste.",
    note: "Bu QR ödeme onayı değildir. Ödeme kasada tamamlanır.", priceNote: "Tutar güncel menü fiyatlarıyla hesaplandı." },
  en: { title: "Your order number", cashierTitle: "Order at the counter", awaiting: "Awaiting payment at the counter",
    instructions: "Show this QR to the cashier. Pay at the counter. The team will start preparing your order after payment.",
    cashierInstructions: "Check the items with the customer. Take payment at the counter, then begin preparation.",
    total: "Total", composition: "Your items", close: "Close", change: "Edit order", open: "Open cashier view",
    qr: "QR code that opens these order items at the counter", created: "Created", print: "Print", back: "Back to menu",
    invalid: "This order could not be opened. Check your menu selection and create a new QR.",
    empty: "Add an item to your order first.", variant: "Choose a flavor for every flavored drink.",
    large: "This order is too large for one QR. Show the cashier your menu cart instead.",
    changed: "The menu has changed. Ask the customer to create a fresh order QR.",
    note: "This QR is not payment confirmation. Payment is completed at the counter.", priceNote: "Calculated using current menu prices." },
  ru: { title: "Номер твоего заказа", cashierTitle: "Заказ на кассе", awaiting: "Ожидает оплаты на кассе",
    instructions: "Покажи QR кассиру. Оплати на кассе. После оплаты сотрудник начнёт готовить заказ.",
    cashierInstructions: "Сверь состав с гостем. Прими оплату на кассе, затем передай заказ в приготовление.",
    total: "Итого", composition: "Состав заказа", close: "Закрыть", change: "Изменить заказ", open: "Открыть для кассира",
    qr: "QR-код с составом заказа для кассира", created: "Создан", print: "Распечатать", back: "Вернуться в меню",
    invalid: "Не удалось открыть заказ. Проверь выбор в меню и создай новый QR.",
    empty: "Сначала добавь товар в заказ.", variant: "Выбери вкус для каждого напитка со вкусом.",
    large: "Этот заказ не помещается в один QR. Покажи кассиру состав в корзине меню.",
    changed: "Меню обновилось. Попроси гостя создать новый QR заказа.",
    note: "QR не подтверждает оплату. Оплата проходит на кассе.", priceNote: "Сумма рассчитана по актуальным ценам меню." }
};

const locale = { tr: "tr-TR", en: "en-GB", ru: "ru-RU" };
const ticketStorage = createTicketStorage();
let activeDialog;
let activeDismiss;
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const money = (amount, language) => `${new Intl.NumberFormat(locale[language], { maximumFractionDigits: 2 }).format(amount / 100)} ₺`;

export function createOrderQr(url, language = "tr") {
  const code = qrcode(0, "M");
  code.addData(url, "Byte");
  code.make();
  const size = code.getModuleCount();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${size + 8} ${size + 8}`);
  // Dense orders need more pixels than a small pair. Keep at least three pixels
  // per module on desktop; max-width lets high-DPI mobile screens fit the code.
  const displaySize = (size + 8) * Math.max(3, Math.ceil(264 / (size + 8)));
  svg.setAttribute("width", String(displaySize));
  svg.setAttribute("height", String(displaySize));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", (checkoutCopy[language] ?? checkoutCopy.tr).qr);
  svg.setAttribute("class", "order-ticket-qr");
  svg.setAttribute("shape-rendering", "crispEdges");
  const background = document.createElementNS(svg.namespaceURI, "rect");
  background.setAttribute("width", String(size + 8));
  background.setAttribute("height", String(size + 8));
  background.setAttribute("fill", "#fff");
  const dots = document.createElementNS(svg.namespaceURI, "path");
  dots.setAttribute("fill", "#000");
  const paths = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!code.isDark(row, column)) continue;
      const start = column;
      while (column + 1 < size && code.isDark(row, column + 1)) column += 1;
      const width = column - start + 1;
      paths.push(`M${start + 4} ${row + 4}h${width}v1h-${width}z`);
    }
  }
  dots.setAttribute("d", paths.join(""));
  svg.append(background, dots);
  return svg;
}

export function checkoutErrorMessage(error, language = "tr") {
  const copy = checkoutCopy[language] ?? checkoutCopy.tr;
  if (error?.code === "empty-order") return copy.empty;
  if (error?.code === "invalid-variant") return copy.variant;
  if (error?.code === "order-too-large") return copy.large;
  if (error?.code === "catalog-changed") return copy.changed;
  return copy.invalid;
}

export function renderTicketContent(root, ticket, language = "tr", { cashier = false, cashierUrl } = {}) {
  const lang = Object.hasOwn(checkoutCopy, language) ? language : "tr";
  const copy = checkoutCopy[lang];
  const quote = quoteOrderTicket(ticket, lang);
  root.replaceChildren();
  root.lang = lang;
  const heading = element(cashier ? "h1" : "h2", "order-ticket-title", cashier ? copy.cashierTitle : copy.title);
  heading.id = "order-checkout-title";
  const number = element("strong", "order-ticket-number", ticketOrderNumber(ticket));
  const status = element("p", "order-ticket-status", copy.awaiting);
  status.setAttribute("role", "status");
  const instructions = element("p", "order-ticket-instructions", cashier ? copy.cashierInstructions : copy.instructions);
  root.append(heading, number, status, instructions);
  if (!cashier && cashierUrl) root.append(createOrderQr(cashierUrl, lang));
  root.append(element("h3", "order-ticket-section-title", copy.composition));
  const list = element("ul", "order-ticket-lines");
  for (const group of quote.groups) {
    const row = element("li", "order-ticket-line");
    const name = group.items.map((item) => `${item.quantity > 1 ? `${item.quantity} × ` : ""}${item.name}${item.variantName ? ` · ${item.variantName}` : ""}`).join(" + ");
    row.append(element("strong", "order-ticket-item-name", `${group.quantity} × ${name}`),
      element("span", "order-ticket-line-price", money(group.lineTotalMinor, lang)));
    list.append(row);
  }
  const total = element("p", "order-ticket-total");
  total.append(element("span", "", copy.total), element("strong", "", money(quote.totalMinor, lang)));
  const created = element("p", "order-ticket-created", `${copy.created}: ${new Intl.DateTimeFormat(locale[lang], { dateStyle: "short", timeStyle: "short" }).format(ticket.createdAt)}`);
  root.append(list, total, element("p", "order-ticket-note", copy.priceNote), created, element("p", "order-ticket-note", copy.note));
  return quote;
}

function siteRootUrl() {
  // This module is built at the site's root, independently of the caller page.
  return new URL("./", import.meta.url).href;
}

export async function openOrderCheckout({ draft, language = "tr", returnFocus = document.activeElement } = {}) {
  const lang = Object.hasOwn(checkoutCopy, language) ? language : "tr";
  const copy = checkoutCopy[lang];
  activeDismiss?.();
  const dialog = element("dialog", "order-checkout-dialog");
  dialog.setAttribute("aria-labelledby", "order-checkout-title");
  dialog.setAttribute("aria-modal", "true");
  const shell = element("div", "order-checkout-shell");
  const close = element("button", "order-checkout-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", copy.close);
  const content = element("div", "order-ticket-content");
  let ticket = null;
  let error;
  let url;
  try {
    ticket = getOrCreateOrderTicket(draft, { storage: ticketStorage });
    url = buildCashierUrl(ticket, lang, siteRootUrl());
    renderTicketContent(content, ticket, lang, { cashierUrl: url });
  } catch (caught) {
    error = caught;
    ticket = null;
    const heading = element("h2", "order-ticket-title", copy.title);
    heading.id = "order-checkout-title";
    const message = element("p", "order-ticket-error", checkoutErrorMessage(caught, lang));
    message.setAttribute("role", "alert");
    content.replaceChildren(heading, message);
  }
  const actions = element("div", "order-checkout-actions");
  if (ticket) {
    const open = element("a", "order-ticket-button order-ticket-button-primary", copy.open);
    open.href = url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    actions.append(open);
  }
  const edit = element("button", "order-ticket-button", copy.change);
  edit.type = "button";
  actions.append(edit);
  shell.append(close, content, actions);
  dialog.append(shell);
  document.body.append(dialog);
  activeDialog = dialog;
  const previouslyLocked = document.body.classList.contains("order-checkout-open");
  document.body.classList.add("order-checkout-open");
  let closed = false;
  const dismiss = () => {
    if (closed) return;
    closed = true;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    if (!previouslyLocked) document.body.classList.remove("order-checkout-open");
    if (returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true });
    if (activeDialog === dialog) { activeDialog = null; activeDismiss = null; }
    dialog.remove();
  };
  activeDismiss = dismiss;
  close.addEventListener("click", dismiss);
  edit.addEventListener("click", dismiss);
  dialog.addEventListener("close", dismiss);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); dismiss(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dismiss(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not(:disabled),a[href]")];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else { dialog.setAttribute("open", ""); dialog.setAttribute("role", "dialog"); dialog.classList.add("order-checkout-fallback"); }
  close.focus({ preventScroll: true });
  return { ticket, dialog, ...(error ? { error } : {}) };
}
