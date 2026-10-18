import qrcode from "qrcode-generator";
import { buildCashierUrl, getOrCreateOrderTicket, quoteOrderTicket, ticketOrderNumber, validateTicketDraft } from "./order-ticket.js";
import { createTicketStorage } from "./order-ticket-storage.js";
import { ORDER_DRAFT_KEY, readLatestStoredOrderDraft, getOrderStorageState, OrderLegacyConflictError } from "./order-draft.js";
import { menuCategories } from "../menu-catalog.js";

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
    draftChanged: "Sipariş değişti", draftChangedNote: "Bu QR önceki ürünleri içeriyor. Güncel sepetin için yeni bir QR oluştur.",
    regenerate: "Güncel sepetten yeni QR oluştur", draftEmpty: "Sepetin artık boş. Yeni bir QR oluşturmak için menüden ürün ekle.",
    draftCheck: "Siparişini kontrol et", draftUnavailable: "Güncel sepet okunamadı. Tekrar dene veya siparişini menüde kontrol et.",
    loading: "Güncel sepetin okunuyor…", ready: "Güncel sepetin için bir QR oluştur.", legacyConflict: "Sepetinin iki farklı sürümü var. Yeni bir QR oluşturmadan önce hangisini saklayacağını seç.",
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
    draftChanged: "Order changed", draftChangedNote: "This QR still contains the previous items. Create a new QR for your current cart.",
    regenerate: "Create a new QR from current cart", draftEmpty: "Your cart is now empty. Add an item in the menu to create a new QR.",
    draftCheck: "Check your order", draftUnavailable: "Your current cart could not be read. Try again or check your order in the menu.",
    loading: "Reading your current order…", ready: "Create a QR for your current cart.", legacyConflict: "There are two versions of your cart. Choose which one to keep before creating a new QR.",
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
    draftChanged: "Заказ изменился", draftChangedNote: "В этом QR остался прежний состав. Создай новый QR для актуальной корзины.",
    regenerate: "Создать новый QR из корзины", draftEmpty: "Корзина теперь пуста. Добавь товар в меню, чтобы создать новый QR.",
    draftCheck: "Проверь заказ", draftUnavailable: "Не удалось прочитать актуальную корзину. Попробуй ещё раз или проверь заказ в меню.",
    loading: "Проверяем актуальную корзину…", ready: "Создай QR для актуальной корзины.", legacyConflict: "Найдены два варианта корзины. Выбери, какой сохранить, чтобы создать новый QR.",
    note: "QR не подтверждает оплату. Оплата проходит на кассе.", priceNote: "Сумма рассчитана по актуальным ценам меню." }
};

const locale = { tr: "tr-TR", en: "en-GB", ru: "ru-RU" };
const ticketStorage = createTicketStorage();
const productSlug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const orderProductIds = new Set(menuCategories.flatMap(category =>
  (category.items ?? category.groups?.flatMap(group => group.items) ?? [])
    .map(item => `${category.id}:${item.id ?? productSlug(item.name.en)}`)));
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
  if (error?.name === "OrderLegacyConflictError") return copy.legacyConflict;
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
  const heading = element("h2", "order-ticket-title", copy.title);
  heading.id = "order-checkout-title";
  const loading = element("p", "order-ticket-instructions", copy.loading);
  loading.setAttribute("role", "status");
  content.append(heading, loading);
  const actions = element("div", "order-checkout-actions");
  let open;
  const edit = element("button", "order-ticket-button", copy.change);
  edit.type = "button";
  actions.append(edit);
  const update = element("section", "order-ticket-update");
  update.hidden = true;
  const updateStatus = element("div", "order-ticket-update-status");
  updateStatus.setAttribute("role", "status");
  updateStatus.setAttribute("aria-live", "polite");
  const updateTitle = element("strong", "", copy.draftChanged);
  const updateNote = element("p");
  updateStatus.append(updateTitle, updateNote);
  const regenerate = element("button", "order-ticket-button order-ticket-button-primary", copy.regenerate);
  regenerate.type = "button";
  const updateError = element("p", "order-ticket-update-error");
  updateError.setAttribute("role", "alert");
  updateError.hidden = true;
  update.append(updateStatus, regenerate, updateError);
  shell.append(close, update, content, actions);
  dialog.append(shell);
  document.body.append(dialog);
  activeDialog = dialog;
  const previouslyLocked = document.body.classList.contains("order-checkout-open");
  document.body.classList.add("order-checkout-open");
  let closed = false;
  let initialized = false;
  let regenerating = false;
  let checkGeneration = 0;
  let refreshGeneration = 0;
  let draftGeneration = 0;
  // The ticket remains an immutable snapshot. Only an explicit action replaces
  // the displayed ticket; cart notifications never rewrite an existing QR.
  const assertNoLegacyConflict = () => {
    if (getOrderStorageState().legacyConflict) throw new OrderLegacyConflictError();
  };
  const readCurrentDraft = async () => {
    const current = await readLatestStoredOrderDraft(orderProductIds);
    assertNoLegacyConflict();
    return current;
  };
  const replaceTicket = next => {
    const nextUrl = buildCashierUrl(next, lang, siteRootUrl());
    const nextContent = element("div", "order-ticket-content");
    renderTicketContent(nextContent, next, lang, { cashierUrl: nextUrl });
    content.replaceChildren(...nextContent.childNodes);
    content.lang = lang;
    ticket = next;
    url = nextUrl;
    if (!open) {
      open = element("a", "order-ticket-button order-ticket-button-primary", copy.open);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      actions.prepend(open);
    }
    open.href = nextUrl;
  };
  const checkDraft = async () => {
    if (closed || !initialized) return;
    const generation = ++checkGeneration;
    const checkedTicket = ticket;
    let changed = true;
    let empty = false;
    let conflicted = false;
    let valid = false;
    let note = ticket ? copy.draftChangedNote : copy.ready;
    let title = ticket ? copy.draftChanged : copy.draftCheck;
    try {
      const current = await readCurrentDraft();
      const groups = validateTicketDraft(current);
      valid = true;
      changed = !ticket || JSON.stringify(groups) !== JSON.stringify(ticket.groups);
    } catch (caught) {
      empty = caught?.code === "empty-order";
      conflicted = caught?.name === "OrderLegacyConflictError";
      note = conflicted ? copy.legacyConflict : empty ? copy.draftEmpty : copy.draftUnavailable;
      if (!empty) title = copy.draftCheck;
    }
    // An older read must not hide a newer warning, touch a closed/replaced
    // dialog, or compare its snapshot with a ticket generated after it began.
    if (closed || generation !== checkGeneration || checkedTicket !== ticket) return;
    if (!ticket && valid && content.querySelector(".order-ticket-error")) {
      content.replaceChildren(heading, element("p", "order-ticket-instructions", copy.ready));
    }
    if (!changed && update.contains(document.activeElement)) close.focus({ preventScroll: true });
    update.hidden = !changed;
    updateTitle.textContent = title;
    updateNote.textContent = note;
    regenerate.disabled = empty || conflicted || regenerating;
  };
  const onDraftChange = () => { draftGeneration += 1; void checkDraft(); };
  const onStorage = event => {
    if (event.key === ORDER_DRAFT_KEY || event.key === null) onDraftChange();
  };
  const onVisible = () => { if (document.visibilityState !== "hidden") checkDraft(); };
  regenerate.addEventListener("click", async () => {
    if (closed || regenerating || regenerate.disabled) return;
    regenerating = true;
    const generation = ++refreshGeneration;
    let changedAt = draftGeneration;
    checkGeneration += 1;
    regenerate.disabled = true;
    update.setAttribute("aria-busy", "true");
    updateError.hidden = true;
    try {
      let current = await readCurrentDraft();
      if (closed || generation !== refreshGeneration) return;
      // A commit notified while this read was waiting gets one fresh read. If
      // changes keep arriving, retain the old QR and leave an explicit retry.
      if (changedAt !== draftGeneration) {
        changedAt = draftGeneration;
        current = await readCurrentDraft();
        if (closed || generation !== refreshGeneration) return;
        if (changedAt !== draftGeneration) return;
      }
      assertNoLegacyConflict();
      const next = getOrCreateOrderTicket(current, { storage: ticketStorage });
      // Build offscreen first so an encoding/rendering error retains every byte
      // of the old visible ticket and its cashier link.
      replaceTicket(next);
      close.focus({ preventScroll: true });
    } catch (caught) {
      if (closed || generation !== refreshGeneration) return;
      updateError.textContent = caught?.name === "OrderLegacyConflictError" || typeof caught?.code === "string"
        ? checkoutErrorMessage(caught, lang) : copy.draftUnavailable;
      updateError.hidden = false;
    } finally {
      if (!closed && generation === refreshGeneration) {
        regenerating = false;
        update.removeAttribute("aria-busy");
        void checkDraft();
      }
    }
  });
  window.addEventListener("storage", onStorage);
  window.addEventListener("robys:order-change", onDraftChange);
  window.addEventListener("robys:order-storage-state", onDraftChange);
  window.addEventListener("focus", checkDraft);
  window.addEventListener("pageshow", checkDraft);
  document.addEventListener("visibilitychange", onVisible);
  const dismiss = () => {
    if (closed) return;
    closed = true;
    checkGeneration += 1;
    refreshGeneration += 1;
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("robys:order-change", onDraftChange);
    window.removeEventListener("robys:order-storage-state", onDraftChange);
    window.removeEventListener("focus", checkDraft);
    window.removeEventListener("pageshow", checkDraft);
    document.removeEventListener("visibilitychange", onVisible);
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
    const controls = [...dialog.querySelectorAll("button:not(:disabled),a[href]")]
      .filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    const outsideControls = !controls.includes(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || outsideControls)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || outsideControls)) { event.preventDefault(); first?.focus(); }
  });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else { dialog.setAttribute("open", ""); dialog.setAttribute("role", "dialog"); dialog.classList.add("order-checkout-fallback"); }
  close.focus({ preventScroll: true });
  // The caller's rendered draft is only a preview. Read the current authority
  // (shared or per-tab fallback) and fence an unresolved legacy fork before
  // creating even the first ticket.
  const initialGeneration = ++refreshGeneration;
  try {
    let changedAt = draftGeneration;
    let current = await readCurrentDraft();
    if (!closed && initialGeneration === refreshGeneration && changedAt !== draftGeneration) {
      changedAt = draftGeneration;
      current = await readCurrentDraft();
      if (changedAt !== draftGeneration) throw new Error("order-changed-during-checkout");
    }
    if (!closed && initialGeneration === refreshGeneration) {
      assertNoLegacyConflict();
      replaceTicket(getOrCreateOrderTicket(current, { storage: ticketStorage }));
    }
  } catch (caught) {
    if (!closed && initialGeneration === refreshGeneration) {
      error = caught;
      const message = element("p", "order-ticket-error", caught?.name === "OrderLegacyConflictError" || typeof caught?.code === "string"
        ? checkoutErrorMessage(caught, lang) : copy.draftUnavailable);
      message.setAttribute("role", "alert");
      content.replaceChildren(heading, message);
    }
  }
  initialized = true;
  void checkDraft();
  return { get ticket() { return ticket; }, dialog, ...(error ? { error } : {}) };
}
