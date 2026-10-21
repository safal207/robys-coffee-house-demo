// Prepare only the other menu presentation. This does not execute its scripts,
// intercept native navigation or preload the photo catalog.
const warmAssets = new Set([
  'menu-feed.js', 'menu-feed.css', 'menu-view-mode.js', 'menu-app.js',
  'bootstrap-v2.js', 'menu-product-reveal.js', 'pairing-posters.js'
]);
export function canWarmMenuView(connection) {
  return !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType);
}
export function menuWarmAsset(href, base) {
  try {
    const url = new URL(href, base), current = new URL(base);
    const directory = current.pathname.slice(0, current.pathname.lastIndexOf('/') + 1);
    const name = url.pathname.slice(directory.length);
    if (url.origin !== current.origin || url.username || url.password
        || !url.pathname.startsWith(directory) || !warmAssets.has(name)) return null;
    url.hash = '';
    return { href: url.href, as: name.endsWith('.css') ? 'style' : 'script' };
  } catch { return null; }
}
export function initMenuViewWarmup(view) {
  const other = view === 'list' ? 'feed' : 'list';
  const expectedPath = new URL(other === 'feed' ? 'menu-feed.html' : 'menu.html', location.href).pathname;
  const assets = new Set();
  let delay, idle;
  const permitted = () => !document.hidden && canWarmMenuView(navigator.connection);
  const warmBytes = href => {
    // A normal same-origin HTTP-cache read avoids replacing an already cached
    // module with a separate speculative-prefetch response. Never execute it.
    void fetch(href, { cache: 'force-cache', credentials: 'same-origin', priority: 'low' })
      .then(response => response.ok ? response.arrayBuffer() : undefined)
      .catch(() => { /* Native navigation remains the fallback. */ });
  };
  function warm() {
    if (!permitted()) return;
    const target = document.querySelector(`a[data-menu-view="${other}"]`);
    if (!target) return;
    const url = new URL(target.href);
    if (url.origin !== location.origin || url.pathname !== expectedPath) return;
    // Do not fetch documents or photos: only the bounded, revisioned assets.
    const manifest = document.querySelector('meta[name="robys-menu-warm-assets"]')?.content ?? '';
    for (const entry of manifest.split('|').slice(0, 4)) {
      const resource = menuWarmAsset(entry, location.href);
      if (!resource || assets.has(resource.href)) continue;
      assets.add(resource.href); warmBytes(resource.href);
    }
  }
  const queue = () => {
    clearTimeout(delay);
    delay = setTimeout(() => {
      if ('requestIdleCallback' in window) idle = requestIdleCallback(warm, { timeout: 1200 });
      else warm();
    }, 250);
  };
  const intent = event => {
    if (event.target.closest?.(`a[data-menu-view="${other}"]`)) warm();
  };
  for (const type of ['pointerover', 'pointerdown', 'focusin']) document.addEventListener(type, intent, { passive: true });
  document.addEventListener('click', event => {
    // The selected presentation is already open; don't rebuild it on a second tap.
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        && event.target.closest?.(`a[data-menu-view="${view}"][aria-current="page"]`)) event.preventDefault();
  }, true);
  window.addEventListener('pagehide', () => {
    clearTimeout(delay);
    if (idle !== undefined && 'cancelIdleCallback' in window) cancelIdleCallback(idle);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) queue(); });
  queue();
}
