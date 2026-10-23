// One quiet offer per tab session. A manual entry remains available afterwards.
const SESSION_KEY = "robys-choice-help.v1";
const LANGUAGE_KEY = "robys-language";
const OFFER_AFTER_MS = 45_000;
const IDLE_AFTER_MS = 8_000;
const copy = {
  tr: {
    entry: "Bir fikir ister misiniz?", title: "Seçmenize yardımcı olalım",
    body: "Hazır kombinlere göz atın veya size uygun bir seçim yapalım.",
    smartBody: "Hazır kombinlere göz atın; aradığınız seçenek orada olabilir.",
    combos: "Kombinleri keşfet", smart: "Akıllı seçim", close: "Öneriyi kapat",
    view: "Seti incele", total: "Menü toplamı", guests: { 1: "1 kişilik", 2: "2 kişilik", 4: "4 kişilik" }
  },
  en: {
    entry: "Need an idea?", title: "A little help choosing",
    body: "Explore our combos or find a selection that suits you.",
    smartBody: "Explore our combos. You might find just what you’re looking for.",
    combos: "Explore combos", smart: "Smart Choice", close: "Close suggestion",
    view: "View selection", total: "Menu total", guests: { 1: "Serves 1", 2: "Serves 2", 4: "Serves 4" }
  },
  ru: {
    entry: "Помочь с выбором?", title: "Подскажем, что выбрать",
    body: "Посмотрите готовые комбо или подберите что-нибудь под себя.",
    smartBody: "Возможно, подходящий вариант уже есть в наших комбо.",
    combos: "Посмотреть комбо", smart: "Умный подбор", close: "Закрыть подсказку",
    view: "Посмотреть набор", total: "Сумма по меню", guests: { 1: "Для 1 гостя", 2: "Для 2 гостей", 4: "Для 4 гостей" }
  }
};

function supportedLanguage(value) {
  return Object.hasOwn(copy, value) ? value : "tr";
}

// Kept separate so the time and interruption boundaries can be checked directly.
export function canOfferChoiceHelp(state) {
  return !state.seen && state.visible && state.elapsed >= OFFER_AFTER_MS
    && state.idle >= IDLE_AFTER_MS && !state.editing && !state.overlay
    && !state.hasOrder && !state.checking && state.width >= 280 && state.height >= 500;
}

function hasDraftItems(draft) {
  return Array.isArray(draft?.lines) && draft.lines.some(line => Number.isInteger(line?.quantity) && line.quantity > 0);
}

// Only the menu section/filter the visitor has explicitly opened is relevant.
// These are editorial suggestions, not inferred personal characteristics.
export function choiceHelpRecipeId({ family = false, filter = "", category = "" } = {}) {
  if (family || filter === "family") return "family";
  if (category === "desserts") return "sweet";
  if (category === "food") return "hearty";
  if (filter === "together") return "together";
  return "sweet";
}

// A suggestion opened from the feed stays in that view, including clean Sites
// routes. Other entry pages keep their existing canonical list destination.
export function choiceHelpMenuUrl(currentHref, fallbackHref, recipeId = "") {
  const current = new URL(currentHref);
  const target = /\/menu-feed(?:\.html)?\/?$/.test(current.pathname) ? current : new URL(fallbackHref);
  target.searchParams.delete("item");
  target.hash = recipeId ? `menu-combo-${recipeId}` : "menu-combos";
  return target.href;
}

const productSlug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function quoteChoiceHelpSuggestion(categories, recipes, quoteSelection, context) {
  const recipe = recipes.find(entry => entry.id === choiceHelpRecipeId(context));
  if (!recipe) return null;
  const products = new Map(categories.flatMap(category =>
    (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => {
      const id = `${category.id}:${item.id ?? productSlug(item.name.en)}`;
      return [id, { id, category, item }];
    })));
  const quote = quoteSelection(recipe.id, recipe.items, products);
  return quote.valid ? { recipe, total: quote.total } : null;
}

let suggestionData;
async function canonicalSuggestion(context) {
  // The entry driver remains tiny; recipes/catalog are initialized only on an
  // eligible offer or an explicit request. Recipe import is bundled for offline.
  suggestionData ??= Promise.all([import("./menu-catalog.js?v=05e7dac3c17b"), import("./src/menu-combos.js")])
    .catch(error => { suggestionData = undefined; throw error; });
  const [catalog, combos] = await suggestionData;
  return quoteChoiceHelpSuggestion(catalog.menuCategories, combos.comboRecipes, combos.quoteComboSelection, context);
}

let cartReader;
async function canonicalDraft() {
  cartReader ??= Promise.all([import("./order-storage.js?v=6908555cd79b"), import("./menu-catalog.js?v=05e7dac3c17b")]).then(([storage, catalog]) => {
    const validIds = new Set(catalog.menuCategories.flatMap(category =>
      (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => `${category.id}:${item.id ?? productSlug(item.name.en)}`)));
    return () => storage.readLatestStoredOrderDraft(validIds);
  }).catch(error => { cartReader = undefined; throw error; });
  return (await cartReader)();
}

export function initChoiceHelp(host = document.querySelector("[data-choice-help]"), options = {}) {
  if (!host || host.dataset.choiceHelpMounted === "true") return null;
  host.dataset.choiceHelpMounted = "true";
  const readDraft = options.readDraft ?? canonicalDraft;
  const readSuggestion = options.readSuggestion ?? canonicalSuggestion;
  const now = options.now ?? (() => performance.now());
  let session;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null"); } catch {}
  // Memory is the fallback when storage is blocked. No cookie or tracking ID.
  const memoryKey = Symbol.for("robys.choice-help.session.v1");
  const memory = window[memoryKey] ??= { seen: false, elapsed: 0 };
  let seen = session?.seen === true || memory.seen;
  let elapsed = Math.max(0, Math.min(OFFER_AFTER_MS,
    Math.max(Number(session?.elapsed) || 0, memory.elapsed, Number(options.initialElapsed) || 0)));
  let lastTick = now();
  let lastActivity = lastTick - Math.max(0, Number(options.initialIdle) || 0);
  let checking = 0;
  let generation = 0;
  let pendingManualToken = null;
  let destroyed = false;
  let cartKnownBusy = false;
  let manuallyOpened = false;
  let suggestion = null;
  let timer;

  const entry = options.entry ?? document.createElement("button");
  entry.type = "button";
  entry.className = "choice-help-entry";
  entry.setAttribute("aria-expanded", "false");
  const panel = document.createElement("section");
  panel.className = "choice-help-panel";
  panel.id = `choice-help-panel-${document.querySelectorAll(".choice-help-panel").length + 1}`;
  panel.hidden = true;
  entry.setAttribute("aria-controls", panel.id);
  const status = document.createElement("div");
  status.className = "choice-help-message";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const title = document.createElement("h2");
  const body = document.createElement("p");
  const audience = document.createElement("p");
  audience.className = "choice-help-audience";
  const price = document.createElement("p");
  price.className = "choice-help-price";
  const photo = document.createElement("div");
  photo.className = "choice-help-photo";
  photo.hidden = true;
  const image = document.createElement("img");
  image.width = image.height = 80;
  image.alt = "";
  image.decoding = "async";
  photo.append(image);
  const content = document.createElement("div");
  content.className = "choice-help-content";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "choice-help-close";
  close.textContent = "×";
  const actions = document.createElement("div");
  actions.className = "choice-help-actions";
  const combos = document.createElement("a");
  const smart = document.createElement("a");
  const menuFallback = new URL("./menu.html", import.meta.url).href;
  combos.href = choiceHelpMenuUrl(window.location.href, menuFallback);
  smart.href = new URL("./smart-choice/", import.meta.url).href;
  const smartPath = new URL(smart.href).pathname;
  const onSmartChoice = window.location.pathname === smartPath || window.location.pathname === `${smartPath}index.html`;
  smart.hidden = onSmartChoice;
  actions.append(combos, smart);
  status.append(title, body, audience, price);
  content.append(photo, status);
  panel.append(close, content, actions);
  if (entry.parentNode !== host) host.append(entry);
  document.body.append(panel);

  function language() {
    // Existing views update html.lang synchronously when the visitor switches.
    const fromHtml = document.documentElement.lang.split("-")[0];
    if (Object.hasOwn(copy, fromHtml)) return fromHtml;
    try { return supportedLanguage(localStorage.getItem(LANGUAGE_KEY)); } catch { return "tr"; }
  }

  function translate() {
    const locale = language();
    const text = copy[locale];
    const recipe = suggestion?.recipe;
    const localized = value => value?.[locale] ?? value?.tr ?? "";
    entry.textContent = text.entry;
    title.textContent = recipe ? localized(recipe.name) : text.title;
    body.textContent = onSmartChoice ? text.smartBody : text.body;
    body.hidden = Boolean(recipe);
    audience.hidden = price.hidden = !recipe;
    photo.hidden = !recipe;
    panel.classList.toggle("choice-help-is-combo", Boolean(recipe));
    if (recipe) {
      panel.dataset.comboRecipe = recipe.id;
      audience.textContent = recipe.id === "family" ? localized(recipe.eyebrow) : text.guests[recipe.guests];
      price.textContent = `${text.total}: ${new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[locale],
        { maximumFractionDigits: 0 }).format(suggestion.total)} ₺`;
      image.src = new URL(`./${recipe.image}`, import.meta.url).href;
    } else {
      delete panel.dataset.comboRecipe;
      image.removeAttribute("src");
    }
    combos.href = choiceHelpMenuUrl(window.location.href, menuFallback, recipe?.id);
    combos.textContent = recipe ? text.view : text.combos;
    smart.hidden = Boolean(recipe) || onSmartChoice;
    smart.textContent = text.smart;
    close.setAttribute("aria-label", text.close);
    panel.setAttribute("aria-label", text.title);
  }

  function persist() {
    memory.seen = seen;
    memory.elapsed = elapsed;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ seen, elapsed })); } catch {}
  }

  function accountTime() {
    const current = now();
    if (!document.hidden) elapsed = Math.min(OFFER_AFTER_MS, elapsed + Math.max(0, current - lastTick));
    lastTick = current;
  }

  function editing() {
    const active = document.activeElement;
    return active instanceof Element && Boolean(active.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='searchbox']"));
  }

  function overlay() {
    return document.body.classList.contains("menu-open")
      || Array.from(document.querySelectorAll("dialog[open], [aria-modal='true']:not([hidden]), [data-checkout-complete]"))
      .some(node => node.tagName === "DIALOG" ? node.hasAttribute("open") : node.getClientRects().length > 0);
  }

  function hasOrder() {
    return cartKnownBusy || Boolean(document.querySelector("#menu-cart-trigger.has-items"));
  }

  function snapshot() {
    return { seen, elapsed, idle: Math.max(0, now() - lastActivity), visible: !document.hidden,
      editing: editing(), overlay: overlay(), hasOrder: hasOrder(), checking: checking > 0,
      width: window.innerWidth, height: window.innerHeight };
  }

  function menuContext() {
    if (!/\/menu(?:-feed)?(?:\.html)?\/?$/.test(window.location.pathname)) return {};
    const inView = selector => {
      const node = document.querySelector(selector);
      if (!node || node.hidden || !node.getClientRects().length) return false;
      const bounds = node.getBoundingClientRect();
      return bounds.bottom > 0 && bounds.top < window.innerHeight;
    };
    return {
      category: document.querySelector('#menu-category-nav [data-category][aria-pressed="true"], #feed-categories [data-category][aria-pressed="true"]')?.dataset.category,
      filter: inView("#menu-combos")
        ? document.querySelector('#menu-combos [data-combo-filter][aria-pressed="true"]')?.dataset.comboFilter : "",
      family: window.location.hash === "#menu-family" || inView("#menu-family")
    };
  }

  function stopTimer() {
    window.clearInterval(timer);
    timer = undefined;
  }

  function hide(returnFocus = false) {
    generation += 1;
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = true;
    entry.setAttribute("aria-expanded", "false");
    if (returnFocus && hadFocus && entry.isConnected) entry.focus({ preventScroll: true });
  }

  function consume() {
    seen = true;
    persist();
    stopTimer();
  }

  async function offer(manual = false) {
    if (destroyed || (!manual && checking) || !panel.hidden) return;
    const state = snapshot();
    if (manual ? !state.visible || state.editing || state.overlay : !canOfferChoiceHelp(state)) return;
    const token = ++generation;
    if (manual) pendingManualToken = token;
    let draft;
    checking += 1;
    try {
      if (!manual) {
        try { draft = await readDraft(); }
        catch {
          if (token === generation) cartKnownBusy = true;
          return; // An uncertain basket is not a reason to interrupt.
        }
      }
      if (destroyed || token !== generation) return;
      if (!manual) cartKnownBusy = hasDraftItems(draft);
      const afterCart = { ...snapshot(), checking: false };
      if (manual ? !afterCart.visible || afterCart.editing || afterCart.overlay : !canOfferChoiceHelp(afterCart)) return;
      let nextSuggestion;
      try { nextSuggestion = await readSuggestion(menuContext()); }
      catch { nextSuggestion = null; } // Generic menu help remains a working fallback.
      if (destroyed || token !== generation) return;
      const latest = { ...snapshot(), checking: false };
      if (manual ? !latest.visible || latest.editing || latest.overlay : !canOfferChoiceHelp(latest)) return;
      suggestion = nextSuggestion;
      translate();
      consume();
      manuallyOpened = manual;
      panel.hidden = false;
      entry.setAttribute("aria-expanded", "true");
      // Deliberately do not focus: reading and keyboard navigation continue.
    } finally {
      checking -= 1;
      if (pendingManualToken === token) pendingManualToken = null;
    }
  }

  function activity(event) {
    lastActivity = now();
    // Focusing the entry or its settling scroll must not undo an explicit
    // request while suggestion data loads. New intent still cancels it.
    const settlingManual = pendingManualToken === generation
      && (event?.type === "scroll" || event?.type === "focusin" && event.target === entry)
      && !document.hidden && !editing() && !overlay();
    if (!settlingManual) generation += 1;
    if (!panel.hidden && editing()) hide();
  }

  function tick() {
    accountTime();
    if (!panel.hidden && (document.hidden || editing() || overlay() || (!manuallyOpened && (hasOrder() || window.innerHeight < 500)))) hide();
    if (!seen) void offer();
  }

  function visibility() {
    // visibilitychange fires after the state changes. Count only time that was
    // visible, and restart the idle window when the visitor returns.
    const current = now();
    if (document.hidden) {
      elapsed = Math.min(OFFER_AFTER_MS, elapsed + Math.max(0, current - lastTick));
      hide();
    } else lastActivity = current;
    lastTick = current;
    persist();
  }

  function dismiss() { consume(); hide(true); }
  function entryClick() {
    // Safari pointer activation does not focus buttons automatically.
    entry.focus({ preventScroll: true });
    if (panel.hidden) void offer(true);
    else dismiss();
  }
  function keydown(event) {
    activity(event);
    if (event.key === "Escape" && !panel.hidden) {
      const inside = panel.contains(event.target);
      dismiss();
      if (inside) event.preventDefault();
    }
  }
  function orderChange() {
    hide();
    // Projection/focus notifications are not ordering intent. Invalidate the
    // cached answer without downloading the authoritative store. The next
    // eligible automatic offer reads the latest committed draft before showing.
    cartKnownBusy = false;
  }
  function storage(event) {
    if (event.key === LANGUAGE_KEY || event.key === null) translate();
    if (event.key?.startsWith("robys-menu-order") || event.key === null) orderChange();
  }
  function navigate() { consume(); hide(); }
  function pagehide() { accountTime(); persist(); hide(); stopTimer(); }
  function pageshow() {
    lastTick = now();
    lastActivity = lastTick;
    if (!seen && !timer) timer = window.setInterval(tick, 1000);
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => record.attributeName === "lang")) translate();
    if ((!panel.hidden || pendingManualToken === generation) && overlay()) hide();
  });
  // Observe open/aria-modal directly, so an order dialog never waits for a tick
  // to cover a helper that was already on screen.
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  // Home and the Russian landing use a fullscreen navigation overlay rather
  // than a dialog. Observe its body state even after the offer timer stops.
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const overlays = new MutationObserver(() => {
    if ((!panel.hidden || pendingManualToken === generation) && overlay()) hide();
  });
  overlays.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["open", "aria-modal", "hidden", "data-checkout-complete"] });
  entry.addEventListener("click", entryClick);
  close.addEventListener("click", dismiss);
  combos.addEventListener("click", navigate);
  smart.addEventListener("click", navigate);
  document.addEventListener("pointerdown", activity, { passive: true });
  document.addEventListener("keydown", keydown);
  document.addEventListener("input", activity, { passive: true });
  document.addEventListener("scroll", activity, { passive: true, capture: true });
  document.addEventListener("focusin", activity);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("robys:order-change", orderChange);
  window.addEventListener("storage", storage);
  window.addEventListener("resize", tick, { passive: true });
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);
  translate();
  if (!seen) timer = window.setInterval(tick, 1000);

  return {
    show: () => offer(true),
    offerAutomatic: () => offer(),
    dismiss,
    destroy() {
      if (destroyed) return;
      pagehide();
      destroyed = true;
      observer.disconnect();
      overlays.disconnect();
      entry.removeEventListener("click", entryClick);
      close.removeEventListener("click", dismiss);
      combos.removeEventListener("click", navigate);
      smart.removeEventListener("click", navigate);
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("input", activity);
      document.removeEventListener("scroll", activity, true);
      document.removeEventListener("focusin", activity);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("robys:order-change", orderChange);
      window.removeEventListener("storage", storage);
      window.removeEventListener("resize", tick);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      entry.remove();
      panel.remove();
      delete host.dataset.choiceHelpMounted;
    }
  };
}
