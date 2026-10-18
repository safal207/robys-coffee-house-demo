// One quiet offer per tab session. A manual entry remains available afterwards.
const SESSION_KEY = "robys-choice-help.v1";
const LANGUAGE_KEY = "robys-language";
const OFFER_AFTER_MS = 35_000;
const IDLE_AFTER_MS = 8_000;
const copy = {
  tr: {
    entry: "Bir fikir ister misiniz?", title: "Seçmenize yardımcı olalım",
    body: "Hazır kombinlere göz atın veya size uygun bir seçim yapalım.",
    smartBody: "Hazır kombinlere göz atın; aradığınız seçenek orada olabilir.",
    combos: "Kombinleri keşfet", smart: "Akıllı seçim", close: "Öneriyi kapat"
  },
  en: {
    entry: "Need an idea?", title: "A little help choosing",
    body: "Explore our combos or find a selection that suits you.",
    smartBody: "Explore our combos. You might find just what you’re looking for.",
    combos: "Explore combos", smart: "Smart Choice", close: "Close suggestion"
  },
  ru: {
    entry: "Помочь с выбором?", title: "Подскажем, что выбрать",
    body: "Посмотрите готовые комбо или подберите что-нибудь под себя.",
    smartBody: "Возможно, подходящий вариант уже есть в наших комбо.",
    combos: "Посмотреть комбо", smart: "Умный подбор", close: "Закрыть подсказку"
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

let cartReader;
async function canonicalDraft() {
  cartReader ??= Promise.all([import("./order-storage.js?v=6908555cd79b"), import("./menu-catalog.js?v=05e7dac3c17b")]).then(([storage, catalog]) => {
    const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const validIds = new Set(catalog.menuCategories.flatMap(category =>
      (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => `${category.id}:${item.id ?? slug(item.name.en)}`)));
    return () => storage.readLatestStoredOrderDraft(validIds);
  }).catch(error => { cartReader = undefined; throw error; });
  return (await cartReader)();
}

export function initChoiceHelp(host = document.querySelector("[data-choice-help]"), options = {}) {
  if (!host || host.dataset.choiceHelpMounted === "true") return null;
  host.dataset.choiceHelpMounted = "true";
  const readDraft = options.readDraft ?? canonicalDraft;
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
  let checking = false;
  let generation = 0;
  let destroyed = false;
  let cartKnownBusy = false;
  let manuallyOpened = false;
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
  const close = document.createElement("button");
  close.type = "button";
  close.className = "choice-help-close";
  close.textContent = "×";
  const actions = document.createElement("div");
  actions.className = "choice-help-actions";
  const combos = document.createElement("a");
  const smart = document.createElement("a");
  combos.href = new URL("./menu.html#menu-combos", import.meta.url).href;
  smart.href = new URL("./smart-choice/", import.meta.url).href;
  const smartPath = new URL(smart.href).pathname;
  const onSmartChoice = window.location.pathname === smartPath || window.location.pathname === `${smartPath}index.html`;
  smart.hidden = onSmartChoice;
  actions.append(combos, smart);
  status.append(title, body);
  panel.append(close, status, actions);
  if (entry.parentNode !== host) host.append(entry);
  document.body.append(panel);

  function language() {
    // Existing views update html.lang synchronously when the visitor switches.
    const fromHtml = document.documentElement.lang.split("-")[0];
    if (Object.hasOwn(copy, fromHtml)) return fromHtml;
    try { return supportedLanguage(localStorage.getItem(LANGUAGE_KEY)); } catch { return "tr"; }
  }

  function translate() {
    const text = copy[language()];
    entry.textContent = text.entry;
    title.textContent = text.title;
    body.textContent = onSmartChoice ? text.smartBody : text.body;
    combos.textContent = text.combos;
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
      editing: editing(), overlay: overlay(), hasOrder: hasOrder(), checking,
      width: window.innerWidth, height: window.innerHeight };
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
    let draft;
    if (!manual) {
      checking = true;
      try { draft = await readDraft(); }
      catch {
        if (token === generation) cartKnownBusy = true;
        return; // An uncertain basket is not a reason to interrupt.
      }
      finally { checking = false; }
    }
    if (destroyed || token !== generation) return;
    if (!manual) cartKnownBusy = hasDraftItems(draft);
    const latest = snapshot();
    if (manual ? !latest.visible || latest.editing || latest.overlay : !canOfferChoiceHelp(latest)) return;
    translate();
    consume();
    manuallyOpened = manual;
    panel.hidden = false;
    entry.setAttribute("aria-expanded", "true");
    // Deliberately do not focus: reading and keyboard navigation continue.
  }

  function activity() {
    lastActivity = now();
    generation += 1;
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
    if (panel.hidden) void offer(true);
    else dismiss();
  }
  function keydown(event) {
    activity();
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
    if (!panel.hidden && overlay()) hide();
  });
  // Observe open/aria-modal directly, so an order dialog never waits for a tick
  // to cover a helper that was already on screen.
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  // Home and the Russian landing use a fullscreen navigation overlay rather
  // than a dialog. Observe its body state even after the offer timer stops.
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  const overlays = new MutationObserver(() => { if (!panel.hidden && overlay()) hide(); });
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
