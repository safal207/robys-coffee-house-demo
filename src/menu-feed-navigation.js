// Entry links identify catalog products, never arbitrary content or redirects.
export function parseFeedEntry(href, products) {
  const url = new URL(href);
  const requestedLanguage = url.searchParams.get("lang");
  const language = ["tr", "en", "ru"].includes(requestedLanguage) ? requestedLanguage : null;
  const product = products.find(item => item.id === url.searchParams.get("item"));
  const hash = url.hash.slice(1);
  return { language, category: product?.category.id ?? (products.some(item => item.category.id === hash) ? hash : "all"),
    productId: product?.id ?? null };
}

export function feedProductUrl(href, id, language) {
  const current = new URL(href);
  const url = /\/menu-feed(?:\.html)?\/?$/.test(current.pathname) ? current : new URL("menu-feed.html", current);
  url.search = "";
  url.hash = "";
  url.searchParams.set("item", id);
  if (["tr", "en", "ru"].includes(language)) url.searchParams.set("lang", language);
  return url.href;
}

// Compare the complete near-viewport candidate set against the usable viewport.
// IntersectionObserver callbacks contain only changed entries: the caller must
// retain still-visible candidates between callbacks, not just the latest batch.
export function selectActiveFeedIndex(rects, top, bottom) {
  if (!(bottom > top)) return null;
  let best = null, bestScore = 0, bestDistance = Infinity;
  for (const rect of rects) {
    if (!(rect.bottom > rect.top)) continue;
    const visible = Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top));
    const score = visible / Math.min(rect.bottom - rect.top, bottom - top);
    const distance = Math.abs((rect.top + rect.bottom - top - bottom) / 2);
    if (score > bestScore || (score > 0 && score === bestScore && distance < bestDistance)) {
      best = rect.index; bestScore = score; bestDistance = distance;
    }
  }
  return best;
}
