// Let the browser warm one document; never fetch or execute another view's assets.
export function canWarmMenu(connection, hidden = false, online = true) {
  return !hidden && online !== false && !connection?.saveData
    && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
}
export function initMenuViewPrefetch(view) {
  if (!['list', 'feed'].includes(view)) return;
  const hint = document.createElement('link');
  if (!hint.relList?.supports('prefetch')) return;
  const targetView = view === 'list' ? 'feed' : 'list';
  const selector = 'a[data-menu-view="' + targetView + '"]';
  let attempted = false, timer;
  function warm() {
    if (attempted || !canWarmMenu(navigator.connection, document.hidden, navigator.onLine)) return;
    const link = document.querySelector(selector);
    if (!link) return;
    const url = new URL(link.href, location.href);
    const expected = new URL(targetView === 'feed' ? 'menu-feed.html' : 'menu.html', location.href);
    if (url.origin !== location.origin || url.pathname !== expected.pathname || url.username || url.password) return;
    url.hash = '';
    attempted = true;
    hint.rel = 'prefetch';
    hint.as = 'document';
    hint.fetchPriority = 'low';
    hint.href = url.href;
    document.head.append(hint);
  }
  const intent = event => { if (event.target.closest?.(selector)) warm(); };
  for (const type of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(type, intent, { passive: true });
  const idle = () => { timer = setTimeout(warm, 250); };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  window.addEventListener('pagehide', () => { clearTimeout(timer); hint.remove(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); hint.remove(); }
  });
}
