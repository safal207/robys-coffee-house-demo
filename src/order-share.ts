/**
 * A read-only sharing projection of the canonical order, not an order transport.
 * The receiver chooses a chat and can edit the message in Telegram. Nothing here
 * marks an order submitted, accepted or paid, writes storage, or imports a cart.
 */
export type ShareLanguage = 'tr' | 'en' | 'ru';
export interface ShareLine { id: string; quantity: number }
export interface ShareSnapshot { revision: number; lines: readonly ShareLine[] }
export interface ShareSummary { quantity: number; totalMinor: number }
export interface ShareProduct { item: { name: Record<ShareLanguage, string>; price: number } }
export interface ShareInput {
  snapshot: ShareSnapshot;
  summary: ShareSummary;
  language: ShareLanguage;
  menuUrl: string;
  resolveProduct: (id: string) => ShareProduct | undefined;
}
export interface SharePreview {
  text: string;
  menuUrl: string;
  telegramUrl: string | null;
  revision: number;
}

// An application safeguard, NOT a claimed Telegram API limit. Long orders remain
// available in full through the visible preview and copy action; never truncate.
export const TELEGRAM_LINK_BUDGET = 7000;
const locale = { tr: 'tr-TR', en: 'en-US', ru: 'ru-RU' } as const;
export const shareCopy = {
  tr: {
    title: "Roby's Coffee House · Seçim listesi", total: 'Toplam',
    disclaimer: 'Bu bir seçim listesidir. Kafeye sipariş gönderilmedi ve ödeme yapılmadı. Fiyat ve müsaitlik kasada onaylanır.',
    toggle: 'Seçimimi paylaş', preview: 'Paylaşılacak seçim listesi',
    hint: 'Telegram’da alıcıyı siz seçersiniz. Menü bağlantısı sepeti başka bir cihazda geri yüklemez.',
    telegram: 'Telegram’da paylaş', copy: 'Listeyi kopyala',
    copied: 'Liste kopyalandı. Kafeye sipariş gönderilmedi.',
    manual: 'Otomatik kopyalama kullanılamıyor. Metni seçip kopyalayın.',
    changed: 'Seçim değişti. Güncel listeyi yeniden kopyalayın.',
    invalid: 'Liste hazırlanamadı. Sipariş içeriğini ve toplamını kontrol edin.',
    long: 'Bu liste bağlantı için uzun. Tam listeyi kopyalayıp Telegram’a yapıştırın.',
    choose: 'Telegram’da alıcıyı seçip mesajı kontrol edin. Kafenin aldığı doğrulanmış değildir.'
  },
  en: {
    title: "Roby's Coffee House · Selection list", total: 'Total',
    disclaimer: 'This is a selection list. No order has been sent to the cafe and no payment has been made. Confirm prices and availability at the counter.',
    toggle: 'Share my selection', preview: 'Selection list to share',
    hint: 'You choose the recipient in Telegram. The menu link does not restore this basket on another device.',
    telegram: 'Share in Telegram', copy: 'Copy the list',
    copied: 'List copied. No order has been sent to the cafe.',
    manual: 'Automatic copying is unavailable. Select and copy the text instead.',
    changed: 'The selection changed. Copy the updated list again.',
    invalid: 'Could not prepare the list. Check the order contents and total.',
    long: 'This list is too long for the share link. Copy the full list and paste it into Telegram.',
    choose: 'Choose a recipient and review the message in Telegram. Receipt by the cafe is not confirmed.'
  },
  ru: {
    title: "Roby's Coffee House · Список выбора", total: 'Итого',
    disclaimer: 'Это список выбора. Заказ в кафе не отправлен, оплата не произведена. Цены и наличие подтвердит бариста.',
    toggle: 'Поделиться составом', preview: 'Состав для передачи',
    hint: 'Получателя в Telegram выбираете вы. Ссылка на меню не восстанавливает эту корзину на другом устройстве.',
    telegram: 'Поделиться в Telegram', copy: 'Скопировать список',
    copied: 'Список скопирован. Заказ в кафе не отправлен.',
    manual: 'Автоматическое копирование недоступно. Выделите и скопируйте текст.',
    changed: 'Состав изменился. Скопируйте обновлённый список ещё раз.',
    invalid: 'Не удалось подготовить список. Проверьте состав и сумму заказа.',
    long: 'Список слишком длинный для ссылки. Скопируйте полный текст и вставьте его в Telegram.',
    choose: 'Выберите получателя и проверьте сообщение в Telegram. Получение кафе не подтверждено.'
  }
} as const;

function checkedName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1500) throw new Error('Invalid product name');
  // Keep a line a line. Display and Telegram receive plain text, never HTML.
  // Direction overrides/control characters must not disguise the price/notice.
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
  if (!clean) throw new Error('Invalid product name');
  return clean;
}
function cleanMenuUrl(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid menu URL');
  // No Telegram initData, order IDs, client state, fragment or tracking query.
  url.search = '';
  url.hash = '';
  return url.href;
}
function money(minor: number, language: ShareLanguage): string {
  return new Intl.NumberFormat(locale[language], {
    style: 'currency', currency: 'TRY', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0, maximumFractionDigits: 2
  }).format(minor / 100);
}
export function buildOrderShare(input: ShareInput): SharePreview {
  const { snapshot, summary, language, resolveProduct } = input;
  if (!Object.prototype.hasOwnProperty.call(shareCopy, language)) throw new Error('Unsupported language');
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
      !Array.isArray(snapshot.lines) || !snapshot.lines.length || snapshot.lines.length > 250) {
    throw new Error('Invalid order snapshot');
  }
  const seen = new Set<string>();
  let total = 0, quantity = 0;
  const rows = snapshot.lines.map(line => {
    if (!line || typeof line.id !== 'string' || !line.id || line.id.length > 500 || seen.has(line.id) ||
        !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw new Error('Invalid order line');
    seen.add(line.id);
    const product = resolveProduct(line.id);
    if (!product || !Number.isFinite(product.item.price) || product.item.price <= 0) throw new Error('Unresolved order product');
    // Identical conversion to order-store.ts; do not trust a DOM/client line price.
    const unitMinor = Math.round(product.item.price * 100);
    const lineMinor = unitMinor * line.quantity;
    if (!Number.isSafeInteger(unitMinor) || unitMinor <= 0 || !Number.isSafeInteger(lineMinor)) throw new Error('Invalid price');
    total += lineMinor;
    quantity += line.quantity;
    if (!Number.isSafeInteger(total)) throw new Error('Order total overflow');
    const name = checkedName(product.item.name[language]);
    return `${line.quantity} × ${name} — ${money(unitMinor, language)} × ${line.quantity} = ${money(lineMinor, language)}`;
  });
  // A projection that disagrees with the canonical total is not a shareable order.
  if (total !== summary.totalMinor || quantity !== summary.quantity) throw new Error('Order summary mismatch');
  const copy = shareCopy[language];
  const menuUrl = cleanMenuUrl(input.menuUrl);
  const text = [copy.title, '', ...rows, '', `${copy.total}: ${money(total, language)}`, '', copy.disclaimer].join('\n');
  const url = new URL('https://t.me/share/url');
  url.searchParams.set('url', menuUrl);
  url.searchParams.set('text', text);
  return Object.freeze({ text, menuUrl, telegramUrl: url.href.length <= TELEGRAM_LINK_BUDGET ? url.href : null, revision: snapshot.revision });
}

export interface SharePanelOptions {
  language: () => ShareLanguage;
  snapshot: () => ShareSnapshot;
  summary: () => ShareSummary;
  resolveProduct: ShareInput['resolveProduct'];
  menuUrl: string;
  canShare: () => boolean;
}
/** Lazy disclosure in the existing drawer. No network/clipboard call on render. */
export function createOrderSharePanel(options: SharePanelOptions): {
  element: HTMLDetailsElement;
  update: (visible: boolean) => void;
} {
  const panel = document.createElement('details');
  panel.className = 'order-sharing';
  panel.id = 'robys-order-sharing';
  const toggle = document.createElement('summary');
  const hint = document.createElement('p'); hint.className = 'order-note';
  const text = document.createElement('textarea'); text.readOnly = true; text.rows = 7;
  text.className = 'order-share-preview'; text.spellcheck = false;
  const actions = document.createElement('div'); actions.className = 'order-share-actions';
  const telegram = document.createElement('a'); telegram.className = 'order-button';
  telegram.target = '_blank'; telegram.rel = 'noopener noreferrer'; telegram.referrerPolicy = 'no-referrer';
  const copy = document.createElement('button'); copy.className = 'order-button'; copy.type = 'button';
  const status = document.createElement('p'); status.className = 'order-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
  const longNote = document.createElement('p'); longNote.className = 'order-note';
  actions.append(telegram, copy);
  panel.append(toggle, hint, text, actions, longNote, status);
  let preview: SharePreview | null = null;
  let identity = '', busy = false, visible = false;
  function refresh(): SharePreview | null {
    const language = options.language(), words = shareCopy[language];
    toggle.textContent = words.toggle; hint.textContent = words.hint;
    text.setAttribute('aria-label', words.preview);
    telegram.textContent = words.telegram; copy.textContent = words.copy; longNote.textContent = words.long;
    panel.hidden = !visible || !options.canShare();
    if (panel.hidden) {
      panel.open = false; preview = null; identity = '';
      text.value = ''; telegram.removeAttribute('href'); status.textContent = '';
      return null;
    }
    try {
      const next = buildOrderShare({ snapshot: options.snapshot(), summary: options.summary(),
        language, menuUrl: options.menuUrl, resolveProduct: options.resolveProduct });
      const nextIdentity = JSON.stringify([language, next.revision, next.text, next.menuUrl]);
      if (nextIdentity !== identity) status.textContent = '';
      identity = nextIdentity; preview = next;
      const displayedText = `${next.text}\n\n${next.menuUrl}`;
      if (text.value !== displayedText) text.value = displayedText;
      text.hidden = false; actions.hidden = false;
      telegram.hidden = !next.telegramUrl;
      if (next.telegramUrl) telegram.href = next.telegramUrl; else telegram.removeAttribute('href');
      longNote.hidden = Boolean(next.telegramUrl);
      copy.disabled = busy;
      return next;
    } catch {
      preview = null; identity = '';
      text.value = ''; text.hidden = true; actions.hidden = true; longNote.hidden = true;
      telegram.removeAttribute('href'); status.textContent = words.invalid;
      return null;
    }
  }
  // Also refresh on intent, so a stale rendered link cannot silently share an old
  // basket even if a separate view subscriber failed after the order was committed.
  telegram.addEventListener('click', event => {
    const current = refresh();
    if (!current?.telegramUrl || panel.hidden) { event.preventDefault(); return; }
    status.textContent = shareCopy[options.language()].choose;
  });
  panel.addEventListener('toggle', () => { if (panel.open) refresh(); });
  copy.addEventListener('click', () => {
    if (busy) return;
    const current = refresh();
    if (!current || panel.hidden) return;
    const capturedIdentity = identity;
    const words = shareCopy[options.language()];
    const fallback = () => {
      refresh();
      if (panel.hidden || !preview) return;
      text.focus(); text.select(); status.textContent = shareCopy[options.language()].manual;
    };
    if (typeof navigator.clipboard?.writeText !== 'function') { fallback(); return; }
    busy = true; copy.disabled = true; copy.setAttribute('aria-busy', 'true');
    try {
      // Keep the clipboard call synchronous with the trusted click/activation.
      Promise.resolve(navigator.clipboard.writeText(`${current.text}\n\n${current.menuUrl}`))
        .then(() => {
          refresh();
          if (!panel.hidden && preview) status.textContent = identity === capturedIdentity ? words.copied : shareCopy[options.language()].changed;
        }, fallback)
        .finally(() => { busy = false; copy.disabled = false; copy.removeAttribute('aria-busy'); });
    } catch {
      busy = false; copy.disabled = false; copy.removeAttribute('aria-busy'); fallback();
    }
  });
  return { element: panel, update(nextVisible) { visible = nextVisible; refresh(); } };
}
