import { canWarmMenu } from './menu-view-prefetch.js';

// The hint is optional: it never changes navigation or executes the feed.
export function warmFeedRuntime(target, environment = globalThis) {
  const { document, navigator, location } = environment;
  if (!document?.head || !location?.href || !location?.origin
    || !canWarmMenu(navigator?.connection, document.hidden, navigator?.onLine)) return false;
  const hint = document.createElement('link');
  if (!hint.relList?.supports?.('modulepreload')) return false;
  let url, expected;
  try { url = new URL(target, location.href); expected = new URL('menu-feed.js', location.href); }
  catch { return false; }
  if (url.origin !== location.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash
    || [...url.searchParams.keys()].join(',') !== 'v' || !/^[a-f0-9]{12}$/.test(url.searchParams.get('v') ?? '')) return false;
  hint.rel = 'modulepreload';
  hint.fetchPriority = 'low';
  hint.href = url.href;
  document.head.append(hint);
  return true;
}

// Wait for genuine menu browsing or intent to switch views. This avoids
// competing with the first render and spending bytes on an untouched menu.
export function warmFeedOnIntent(target, environment = globalThis) {
  const { document } = environment;
  if (!document?.addEventListener) return;
  const types = ['pointerover', 'pointerdown', 'focusin', 'wheel'];
  function onIntent(event) {
    if (!event.isTrusted) return;
    const switchIntent = event.target?.closest?.('a[data-menu-view="feed"]');
    const browsing = ['pointerdown', 'wheel'].includes(event.type)
      && event.target?.closest?.('#menu-root, #menu-search, #menu-category-nav, .menu-view-switch');
    if (!(switchIntent || browsing) || !warmFeedRuntime(target, environment)) return;
    for (const type of types) document.removeEventListener(type, onIntent);
  }
  for (const type of types) document.addEventListener(type, onIntent, { passive: true });
}
