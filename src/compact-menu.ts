/** Presentation only. Catalogue, quantities, storage and checkout belong to menu-app/order-store. */
const compactCopy = {
  tr: { title: 'Menü', lead: 'Kahveni seç. Yanına güzel bir şey ekle.', full: 'Tam menü', choose: 'Seç', preview: 'Seç → Kontrol et → Baristaya göster', draft: 'Ön seçim · Sipariş ve ödeme kasada.', skip: 'Menüye geç' },
  en: { title: 'Menu', lead: 'Choose your coffee. Find something to go with it.', full: 'Full menu', choose: 'Choose', preview: 'Choose → Review → Show the barista', draft: 'Local preview · Order and pay at the counter.', skip: 'Skip to menu' },
  ru: { title: 'Меню', lead: 'Выберите кофе. Найдите что-нибудь к нему.', full: 'Полное меню', choose: 'Выбрать', preview: 'Выбрать → Проверить → Показать бариста', draft: 'Предварительный выбор · Заказ и оплата на кассе.', skip: 'Перейти к меню' }
} as const;

type CompactKey = keyof typeof compactCopy.tr;
const compactRoot = document.querySelector<HTMLElement>('#menu-root');
const compactDock = document.querySelector<HTMLElement>('.compact-order-dock');

function updateCompactMenu(): void {
  const lang = document.documentElement.lang.split('-')[0];
  const copy = compactCopy[lang === 'en' || lang === 'ru' ? lang : 'tr'];
  document.querySelectorAll<HTMLElement>('[data-compact-copy]').forEach(node => {
    const key = node.dataset.compactCopy as CompactKey;
    if (Object.prototype.hasOwnProperty.call(copy, key) && node.textContent !== copy[key]) node.textContent = copy[key];
  });
  // Sets already have their own explicit action. Never add a second handler or cart.
  compactRoot?.querySelectorAll<HTMLElement>('.full-menu-item--product').forEach(card => {
    const media = card.querySelector<HTMLButtonElement>('.full-menu-item-media');
    const details = card.querySelector<HTMLElement>('.full-menu-item-details');
    const name = card.querySelector('.full-menu-item-copy strong')?.textContent?.trim();
    if (!media || !details || !name) return;
    let action = details.querySelector<HTMLButtonElement>('.compact-product-choice');
    if (!action) {
      action = document.createElement('button');
      action.type = 'button';
      action.className = 'compact-product-choice';
      action.setAttribute('aria-haspopup', 'dialog');
      action.setAttribute('aria-controls', 'menu-product-dialog');
      // The active button remains the existing dialog's return-focus target.
      action.addEventListener('click', () => media.click());
      details.append(action);
    }
    if (action.textContent !== copy.choose) action.textContent = copy.choose;
    action.setAttribute('aria-label', `${copy.choose}: ${name}`);
  });
  document.documentElement.dataset.compactReady = 'true';
}

if (compactRoot && compactDock) {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; updateCompactMenu(); });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(compactRoot, { childList: true, subtree: true });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  // Reserve the actual translated/zoomed dock height, not a guessed fixed height.
  const measureDock = () => {
    const value = `${Math.ceil(compactDock.getBoundingClientRect().height) + 16}px`;
    if (document.documentElement.style.getPropertyValue('--compact-dock-height') !== value) {
      document.documentElement.style.setProperty('--compact-dock-height', value);
    }
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(measureDock).observe(compactDock);
  window.addEventListener('resize', measureDock, { passive: true });
  document.fonts?.ready.then(measureDock);
  measureDock();
  schedule();
}
