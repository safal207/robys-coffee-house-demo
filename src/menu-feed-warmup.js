import { canWarmMenu } from './menu-view-prefetch.js';

// Updated by the build; this fixed same-origin URL is never user supplied.
export const feedRuntimeUrl = './menu-feed.js?v=7370a20b4c4a';

export function warmFeedOnIntent(environment = globalThis) {
  const { document, navigator } = environment;
  const types = ['pointerdown', 'focusin', 'wheel'];
  function onIntent(event) {
    if (!event.isTrusted || !event.target?.closest?.('#menu-root, #menu-search, #menu-category-nav, .menu-view-switch')
      || !canWarmMenu(navigator.connection, document.hidden, navigator.onLine)) return;
    const hint = document.createElement('link');
    if (!hint.relList?.supports?.('modulepreload')) return;
    hint.rel = 'modulepreload'; hint.fetchPriority = 'low'; hint.href = feedRuntimeUrl;
    document.head.append(hint);
    for (const type of types) document.removeEventListener(type, onIntent);
  }
  for (const type of types) document.addEventListener(type, onIntent, { passive: true });
}
