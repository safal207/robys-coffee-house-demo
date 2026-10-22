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

// Static hosts return the same HTML for every query string. Share a real
// document per product/language so crawlers can read its photo without JS.
export function feedSharePath(id, language) {
  if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(id)) throw new TypeError("Invalid menu product ID");
  const lang = ["tr", "en", "ru"].includes(language) ? language : "tr";
  return `share/${lang}/${id.replace(":", "--")}.html`;
}

export function feedShareUrl(href, id, language) {
  const url = new URL(feedProductUrl(href, id, language));
  url.pathname = url.pathname.replace(/\/menu-feed(?:\.html)?\/?$/, "/") + feedSharePath(id, language);
  url.search = "";
  return url.href;
}

// Rank complete visible candidates, not just changed IntersectionObserver entries.
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

// Actual single-column geometry: O(log N + visible cards), with no height
// estimates, cached offsets or DOM removal that could cause scrolling jumps.
export function visibleFeedCardBounds(cards, top, bottom) {
  if (!(bottom > top) || !cards.length) return [];
  const measured = new Map();
  const rectAt = index => {
    if (!measured.has(index)) {
      const rect = cards[index].getBoundingClientRect();
      measured.set(index, { index: Number(cards[index].dataset.index), top: rect.top, bottom: rect.bottom });
    }
    return measured.get(index);
  };
  let low = 0, high = cards.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rectAt(middle).bottom <= top) low = middle + 1;
    else high = middle;
  }
  const visible = [];
  for (let index = low; index < cards.length; index++) {
    const rect = rectAt(index);
    if (rect.top >= bottom) break;
    if (rect.bottom > top) visible.push(rect);
  }
  return visible;
}
