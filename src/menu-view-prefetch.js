// Warm bytes, never execute another menu or take over its native navigation.
const assets = new Set(['bootstrap-v2.js', 'menu-runtime.css', 'menu-feed.css',
  'menu-app.js', 'menu-feed.js', 'menu-view-mode.js', 'menu-product-reveal.js', 'pairing-posters.js']);
export function canWarmMenu(connection, hidden = false, online = true) {
  return !hidden && online !== false && !connection?.saveData
    && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
}
export function menuWarmAssets(html, target) {
  if (typeof html !== 'string' || html.length > 262144) return [];
  const base = new URL(target), directory = new URL('.', base).pathname;
  const found = new Set();
  // Read only quoted URLs from authored tags. No DOM injection or execution.
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const value = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag[0])?.[1];
    if (!value) continue;
    try {
      const url = new URL(value.replace(/&amp;/g, '&'), base);
      if (url.origin !== base.origin || url.username || url.password) continue;
      if (url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) !== directory) continue;
      if (!assets.has(url.pathname.slice(directory.length))) continue;
      url.hash = '';
      found.add(url.href);
      if (found.size === 6) break;
    } catch { /* Malformed optional hints cannot affect navigation. */ }
  }
  return [...found];
}
export function initMenuViewPrefetch(view) {
  if (!['list', 'feed'].includes(view) || typeof fetch !== 'function') return;
  const targetView = view === 'list' ? 'feed' : 'list';
  const selector = 'a[data-menu-view="' + targetView + '"]';
  let attempted = false, controller, timer;
  const allowed = () => canWarmMenu(navigator.connection, document.hidden, navigator.onLine);
  async function warm() {
    if (attempted || !allowed()) return;
    const link = document.querySelector(selector);
    if (!link) return;
    const url = new URL(link.href, location.href), expected = new URL(targetView === 'feed' ? 'menu-feed.html' : 'menu.html', location.href);
    if (url.origin !== location.origin || url.pathname !== expected.pathname || url.username || url.password) return;
    url.hash = '';
    attempted = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const options = { signal: controller.signal, priority: 'low', credentials: 'same-origin', redirect: 'error' };
    try {
      const response = await fetch(url.href, options);
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
      if (Number(response.headers.get('content-length')) > 262144) return;
      const html = await response.text();
      if (!allowed()) return;
      // One document and at most six local assets. No images, videos, order
      // APIs, executed modules or updates to view/like counters.
      await Promise.all(menuWarmAssets(html, url.href).map(async href => {
        const asset = await fetch(href, options);
        if (asset.ok) await asset.arrayBuffer();
      }));
    } catch { /* Native links never wait for successful prefetch. */ }
    finally { clearTimeout(timeout); }
  }
  const intent = event => { if (event.target.closest?.(selector)) void warm(); };
  for (const type of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(type, intent, { passive: true });
  const idle = () => { timer = setTimeout(() => { void warm(); }, 250); };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  window.addEventListener('pagehide', () => { clearTimeout(timer); controller?.abort(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.abort(); });
}
