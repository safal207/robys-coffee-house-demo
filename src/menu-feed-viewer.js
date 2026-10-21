// Photo Stories and Reels share the menu's products, likes and ordering flow.
// View totals describe this device; qualification belongs to the active viewer.
const STORY_DURATION = 6500;
const VIEW_DURATION = 1000;
const copy = {
  tr: { stories: "Hikâyeler", reels: "Reels", close: "Kapat", previous: "Önceki ürün", next: "Sonraki ürün", pause: "Hikâyeyi duraklat", play: "Hikâyeyi oynat", like: "Beğen", unlike: "Beğeniyi kaldır", share: "Paylaş", choose: "İçerik ve seçenekler", views: "Bu cihazda", viewsLabel: "Bu cihazdaki görüntülenme", loading: "Fotoğraf yükleniyor…", photoError: "Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.", retry: "Fotoğrafı tekrar yükle", actionError: "İşlem tamamlanamadı. Tekrar dene.", storyHelp: "İlerlemek için sağa, geri dönmek için sola dokun. Duraklatmak için basılı tut.", reelHelp: "Ürünler arasında geçmek için yukarı veya aşağı kaydır. Beğenmek için fotoğrafa çift dokun.", items: "ürün", empty: "Bu seçimde ürün yok." },
  en: { stories: "Stories", reels: "Reels", close: "Close", previous: "Previous item", next: "Next item", pause: "Pause story", play: "Play story", like: "Like", unlike: "Unlike", share: "Share", choose: "Ingredients and options", views: "On this device", viewsLabel: "Views on this device", loading: "Loading photo…", photoError: "The photo could not load. Check your connection and try again.", retry: "Retry photo", actionError: "That action could not be completed. Try again.", storyHelp: "Tap right to continue or left to go back. Hold to pause.", reelHelp: "Swipe up or down to browse. Double-tap the photo to like it.", items: "items", empty: "No items in this selection." },
  ru: { stories: "Истории", reels: "Рилс", close: "Закрыть", previous: "Предыдущая позиция", next: "Следующая позиция", pause: "Приостановить историю", play: "Продолжить историю", like: "Нравится", unlike: "Убрать лайк", share: "Поделиться", choose: "Состав и варианты", views: "На этом устройстве", viewsLabel: "Просмотры на этом устройстве", loading: "Загружаем фото…", photoError: "Не удалось загрузить фото. Проверь подключение и попробуй ещё раз.", retry: "Загрузить фото ещё раз", actionError: "Не удалось завершить действие. Попробуй ещё раз.", storyHelp: "Нажми справа, чтобы продолжить, или слева, чтобы вернуться. Удерживай фото для паузы.", reelHelp: "Листай вверх или вниз. Дважды нажми на фото, чтобы поставить лайк.", items: "позиций", empty: "В этой подборке пока нет позиций." }
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const paths = {
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    share: "m22 2-7 20-4-9-9-4 20-7Zm0 0L11 13",
    eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm13 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
    close: "m6 6 12 12M6 18 18 6",
    pause: "M8 5v14M16 5v14",
    play: "m8 4 12 8-12 8V4Z",
    prev: "m15 5-7 7 7 7",
    next: "m9 5 7 7-7 7"
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name]);
  svg.append(path);
  return svg;
}

export function createFeedViewer({ products, categories, engagement, getLanguage, formatPrice,
  getFiltered, getCurrentIndex, onShare, onChoose, onOpen = () => {}, onClose = () => {} }) {
  const storyRoot = document.querySelector("#feed-stories");
  const reelsTrigger = document.querySelector("#feed-reels-open");
  const productIndex = new Map(products.map(product => [product.id, product]));
  const groups = categories.map(category => ({ category, products: products.filter(product => product.category.id === category.id) }))
    .filter(group => group.products.length);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const text = () => copy[getLanguage()] ?? copy.tr;
  const localized = value => typeof value === "string" ? value : value?.[getLanguage()] ?? value?.tr ?? "";
  const dialog = element("dialog", "feed-viewer");
  dialog.id = "feed-viewer";
  dialog.setAttribute("aria-labelledby", "feed-viewer-title");
  dialog.setAttribute("aria-describedby", "feed-viewer-help");
  const shell = element("div", "feed-viewer-shell");
  const progress = element("div", "feed-viewer-progress");
  progress.setAttribute("aria-hidden", "true");
  const header = element("header", "feed-viewer-header");
  const avatar = element("img", "feed-viewer-avatar");
  avatar.src = "src/brand/robys-mark-master-v1.svg?v=20260917-approved-v4-restore";
  avatar.alt = ""; avatar.width = 36; avatar.height = 36;
  const identity = element("div", "feed-viewer-identity");
  const context = element("span"); context.id = "feed-viewer-context";
  identity.append(element("strong", "", "robyscoffeehouse"), context);
  function button(id, className, action, symbol) {
    const node = element("button", className); node.type = "button"; node.id = id;
    if (symbol) node.append(icon(symbol));
    node.addEventListener("click", action);
    return node;
  }
  const pause = button("feed-viewer-pause", "feed-viewer-icon", togglePause, "pause");
  const close = button("feed-viewer-close", "feed-viewer-icon", closeViewer, "close");
  close.autofocus = true;
  header.append(avatar, identity, pause, close);
  const stage = element("div", "feed-viewer-stage");
  let image = element("img"); image.id = "feed-viewer-image"; image.hidden = true;
  const tapPrevious = button("feed-viewer-tap-prev", "feed-viewer-tap-prev", () => tapNavigate(-1));
  const tapNext = button("feed-viewer-tap-next", "feed-viewer-tap-next", () => tapNavigate(1));
  const loading = element("span", "feed-viewer-loading");
  loading.setAttribute("role", "status");
  const retry = button("feed-viewer-retry", "feed-viewer-retry", () => renderProduct());
  retry.hidden = true;
  const burst = element("span", "feed-viewer-heart-burst"); burst.hidden = true; burst.append(icon("heart")); burst.setAttribute("aria-hidden", "true");
  stage.append(image, tapPrevious, tapNext, loading, retry, burst);
  const actions = element("aside", "feed-viewer-actions");
  const like = button("feed-viewer-like", "feed-viewer-like", () => setLike(!engagement.hasLiked(activeProduct()?.id)), "heart");
  const share = button("feed-viewer-share", "feed-viewer-share", shareActive, "share");
  const views = element("div", "feed-viewer-views");
  const viewCount = element("output"); viewCount.id = "feed-viewer-view-count"; viewCount.setAttribute("aria-live", "off");
  const viewLabel = element("span", "feed-viewer-view-label");
  views.append(icon("eye"), viewCount, viewLabel); actions.append(like, share, views);
  const footer = element("footer", "feed-viewer-footer");
  const title = element("h2"); title.id = "feed-viewer-title";
  const price = element("div", "feed-viewer-price");
  const description = element("p", "feed-viewer-description");
  const choose = button("feed-viewer-choose", "feed-viewer-choose", chooseActive);
  const navigation = element("div", "feed-viewer-nav");
  const previous = button("feed-viewer-prev", "feed-viewer-icon", () => navigate(-1), "prev");
  const counter = element("output"); counter.id = "feed-viewer-counter";
  const next = button("feed-viewer-next", "feed-viewer-icon", () => navigate(1), "next");
  const help = element("p", "feed-viewer-help"); help.id = "feed-viewer-help";
  const status = element("span", "feed-viewer-status sr-only"); status.setAttribute("role", "status");
  navigation.append(previous, counter, next); footer.append(title, price, description, choose, navigation, help);
  shell.append(progress, header, stage, actions, footer, status); dialog.append(shell); document.body.append(dialog);

  let mode = "stories", items = [], index = 0, opener = null, session = 0, active = false;
  let savedScroll = { x: 0, y: 0 }, mediaVersion = 0, mediaState = "loading", nextImage = null, imageInView = false;
  let autoPlay = false, userPaused = false, holdPaused = false, shareBusy = false;
  let elapsed = 0, lastTick = null, viewSince = null, frame = 0, segments = [];
  let gesture = null, ignoredClickUntil = 0, lastTap = null, wheelDelta = 0, lastWheel = 0, wheelLock = 0, burstTimer;
  const activeProduct = () => items[index];
  const covered = () => [...document.querySelectorAll("dialog[open]")].some(node => node !== dialog);
  const viewBlocked = () => !imageInView || shareBusy || document.hidden || covered();
  const paused = () => userPaused || holdPaused || viewBlocked();
  const imageObserver = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    const entry = entries.find(value => value.target === image);
    if (!entry || !active) return;
    imageInView = entry.isIntersecting && entry.intersectionRatio >= .5;
    wake(true);
  }, { root: shell, threshold: [0, .5] }) : null;

  function updateSeen() {
    if (!storyRoot) return;
    storyRoot.querySelectorAll(".feed-story").forEach(node => {
      const group = groups.find(value => value.category.id === node.dataset.storyCategory);
      node.dataset.seen = String(group.products.every(product => engagement.hasSeen(product.id)));
    });
  }

  function renderStories() {
    if (!storyRoot) return;
    storyRoot.setAttribute("aria-label", text().stories);
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const story = button("", "feed-story", () => openStories(group.category.id, story));
      story.removeAttribute("id"); story.dataset.storyCategory = group.category.id;
      story.setAttribute("aria-haspopup", "dialog"); story.setAttribute("aria-controls", dialog.id);
      story.setAttribute("aria-label", `${localized(group.category.name)} · ${group.products.length} ${text().items}`);
      const ring = element("span", "feed-story-ring"), cover = element("img");
      cover.src = group.products[0].image; cover.alt = ""; cover.width = 56; cover.height = 56;
      cover.loading = "lazy"; cover.decoding = "async"; cover.setAttribute("fetchpriority", "low");
      ring.append(cover); story.append(ring, element("span", "feed-story-label", localized(group.category.name)));
      fragment.append(story);
    }
    storyRoot.replaceChildren(fragment); updateSeen();
  }

  function refresh() {
    updateSeen();
    reelsTrigger?.setAttribute("aria-label", text().reels);
    if (!active) return;
    const product = activeProduct(), words = text();
    title.textContent = localized(product.item.name);
    image.alt = localized(product.item.imageAlt) || title.textContent;
    context.textContent = `${mode === "stories" ? words.stories : words.reels} · ${localized(product.category.name)}`;
    price.textContent = formatPrice(product.item.price);
    description.textContent = localized(product.item.description); description.hidden = !description.textContent;
    choose.textContent = words.choose;
    help.textContent = mode === "stories" ? words.storyHelp : words.reelHelp;
    close.setAttribute("aria-label", words.close);
    const liked = engagement.hasLiked(product.id);
    like.setAttribute("aria-pressed", String(liked)); like.setAttribute("aria-label", liked ? words.unlike : words.like);
    share.setAttribute("aria-label", words.share); share.disabled = shareBusy;
    viewCount.textContent = String(engagement.viewCount(product.id));
    views.setAttribute("aria-label", `${words.viewsLabel}: ${viewCount.textContent}`); viewLabel.textContent = words.views;
    previous.setAttribute("aria-label", words.previous); previous.disabled = index === 0;
    const atEnd = index === items.length - 1;
    next.setAttribute("aria-label", mode === "stories" && atEnd ? words.close : words.next);
    next.disabled = mode === "reels" && atEnd;
    tapPrevious.setAttribute("aria-label", words.previous); tapPrevious.setAttribute("aria-disabled", String(index === 0));
    tapNext.setAttribute("aria-label", mode === "stories" && atEnd ? words.close : words.next);
    tapPrevious.hidden = tapNext.hidden = mode !== "stories";
    pause.hidden = progress.hidden = mode !== "stories";
    counter.textContent = `${index + 1} / ${items.length}`;
    retry.textContent = words.retry;
    loading.textContent = mediaState === "error" ? words.photoError : words.loading;
    if (mode === "stories") pause.setAttribute("aria-label", autoPlay && !userPaused ? words.pause : words.play);
    pause.replaceChildren(icon(autoPlay && !userPaused ? "pause" : "play"));
    updatePause();
    wake();
  }

  function updatePause() {
    dialog.dataset.paused = String(paused());
    dialog.dataset.autoplay = String(mode === "stories" && autoPlay && !userPaused);
  }

  function wake(reset = false) {
    if (!active) return;
    if (reset || paused() || mediaState !== "ready") lastTick = null;
    if (viewBlocked() || mediaState !== "ready") viewSince = null;
    updatePause();
    if (!frame && mediaState === "ready" && !viewBlocked() &&
      ((mode === "stories" && autoPlay && !paused()) || !engagement.hasViewedThisVisit(activeProduct().id))) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = 0;
    if (!active || mediaState !== "ready" || viewBlocked()) { lastTick = null; viewSince = null; updatePause(); return; }
    const delta = lastTick === null ? 0 : Math.min(100, now - lastTick); lastTick = now;
    const product = activeProduct();
    if (!engagement.hasViewedThisVisit(product.id)) {
      if (viewSince === null) viewSince = now;
      if (now - viewSince >= VIEW_DURATION) { engagement.recordView(product.id); refresh(); }
    }
    if (mode === "stories" && autoPlay && !paused()) {
      elapsed = Math.min(STORY_DURATION, elapsed + delta);
      if (segments[index]) segments[index].value = elapsed;
      if (elapsed >= STORY_DURATION) { navigate(1); return; }
    }
    wake();
  }

  function resetTiming() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; elapsed = 0; lastTick = null; viewSince = null;
  }

  function renderProgress() {
    segments = mode === "stories" ? items.map((product, position) => {
      const segment = element("progress", "feed-viewer-segment"); segment.max = STORY_DURATION;
      segment.value = position < index ? STORY_DURATION : position === index ? elapsed : 0;
      return segment;
    }) : [];
    progress.replaceChildren(...segments);
  }

  function preloadNext() {
    nextImage?.removeAttribute("src"); nextImage = null;
    if (!active || document.hidden || navigator.connection?.saveData || !items[index + 1]) return;
    nextImage = new Image(); nextImage.decoding = "async"; nextImage.setAttribute("fetchpriority", "low");
    nextImage.src = items[index + 1].image;
  }

  function renderProduct() {
    if (!active) return;
    resetTiming(); imageInView = !imageObserver; imageObserver?.disconnect();
    mediaState = "loading"; dialog.dataset.state = mediaState;
    dialog.dataset.productId = activeProduct().id; dialog.dataset.index = String(index);
    const version = ++mediaVersion, product = activeProduct();
    const fresh = element("img"); fresh.id = "feed-viewer-image"; fresh.width = fresh.height = 1024;
    fresh.decoding = "async"; fresh.draggable = false; fresh.hidden = true;
    image.replaceWith(fresh); image = fresh; imageObserver?.observe(fresh);
    nextImage?.removeAttribute("src"); nextImage = null;
    retry.hidden = true; loading.hidden = false; renderProgress(); refresh();
    fresh.addEventListener("load", async () => {
      try { await fresh.decode(); } catch { /* A successfully loaded image can remain usable without decode(). */ }
      if (!active || version !== mediaVersion || !fresh.naturalWidth) return;
      mediaState = "ready"; dialog.dataset.state = mediaState; fresh.hidden = false; loading.hidden = retry.hidden = true;
      wake(true); preloadNext();
    }, { once: true });
    fresh.addEventListener("error", () => {
      if (!active || version !== mediaVersion) return;
      mediaState = "error"; dialog.dataset.state = mediaState; fresh.hidden = true; retry.hidden = false;
      loading.hidden = false; loading.textContent = text().photoError; wake(true);
    }, { once: true });
    fresh.src = product.image;
  }

  function openViewer(nextMode, nextItems, nextIndex, trigger) {
    if (!nextItems.length || covered()) return false;
    if (active) closeViewer();
    mode = nextMode; items = nextItems; index = nextIndex; opener = trigger ?? document.activeElement;
    savedScroll = { x: window.scrollX, y: window.scrollY }; session += 1; active = true;
    userPaused = holdPaused = shareBusy = false; autoPlay = mode === "stories" && !reducedMotion.matches;
    wheelDelta = lastWheel = wheelLock = 0; lastTap = null; ignoredClickUntil = 0;
    dialog.dataset.mode = mode; dialog.showModal(); document.documentElement.classList.add("feed-viewer-open");
    onOpen(); renderProduct(); close.focus({ preventScroll: true });
    return true;
  }

  function openStories(categoryId, trigger) {
    const group = groups.find(value => value.category.id === categoryId);
    return group ? openViewer("stories", group.products, 0, trigger) : false;
  }

  function openReels({ trigger = reelsTrigger, productId } = {}) {
    const filtered = (getFiltered() ?? []).map(product => productIndex.get(product.id)).filter(Boolean);
    const requestedIndex = productId ? filtered.findIndex(product => product.id === productId) : getCurrentIndex();
    return openViewer("reels", filtered, Math.max(0, Math.min(filtered.length - 1, requestedIndex ?? 0)), trigger);
  }

  function finishClose() {
    if (!active) return;
    active = false; session += 1; mediaVersion += 1; resetTiming(); clearGesture();
    clearTimeout(burstTimer); burst.dataset.active = "false"; burst.hidden = true; image.removeAttribute("src"); image.hidden = true;
    imageObserver?.disconnect(); imageInView = false;
    nextImage?.removeAttribute("src"); nextImage = null; shareBusy = false; share.disabled = false;
    document.documentElement.classList.remove("feed-viewer-open");
    window.scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: "instant" });
    const target = opener?.isConnected ? opener : reelsTrigger;
    target?.focus({ preventScroll: true });
    onClose();
  }

  function closeViewer() { if (dialog.open) dialog.close(); finishClose(); }

  function navigate(direction) {
    if (!active) return;
    if (index + direction >= items.length) { if (mode === "stories") closeViewer(); return; }
    if (index + direction < 0) return;
    clearGesture(); index += direction; renderProduct();
  }

  function tapNavigate(direction) {
    if (performance.now() >= ignoredClickUntil) navigate(direction);
  }

  function togglePause() {
    if (autoPlay && !userPaused) { userPaused = true; autoPlay = false; }
    else { userPaused = false; autoPlay = true; }
    wake(true); refresh();
  }

  function setLike(selected, animate = false) {
    const product = activeProduct(); if (!active || !product) return;
    engagement.setLiked(product.id, selected); refresh();
    if (animate) {
      clearTimeout(burstTimer); burst.dataset.active = "true"; burst.hidden = false;
      burstTimer = setTimeout(() => { burst.dataset.active = "false"; burst.hidden = true; }, 650);
    }
  }

  async function shareActive() {
    if (!active || shareBusy) return;
    const shareSession = session;
    shareBusy = true; share.disabled = true; wake(true);
    try { await onShare(activeProduct(), share); }
    catch { if (active && session === shareSession) status.textContent = text().actionError; }
    finally {
      if (session === shareSession) { shareBusy = false; share.disabled = false; wake(true); }
    }
  }

  function chooseActive() {
    if (!active) return;
    const product = activeProduct(), returnTarget = opener?.isConnected ? opener : reelsTrigger;
    closeViewer();
    Promise.resolve().then(() => onChoose(product, returnTarget)).catch(() => { status.textContent = text().actionError; });
  }

  function clearGesture() {
    const previousGesture = gesture;
    gesture = null; holdPaused = false;
    if (previousGesture && stage.hasPointerCapture?.(previousGesture.id)) stage.releasePointerCapture(previousGesture.id);
  }

  stage.addEventListener("pointerdown", event => {
    if (!active || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    const control = event.target.closest("button, a, input, select, textarea, [contenteditable]");
    if (control && control !== tapPrevious && control !== tapNext) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), pointerType: event.pointerType };
    if (mode === "stories") holdPaused = true;
    else stage.setPointerCapture(event.pointerId);
    wake(true);
  });

  function pointerEnd(event, cancelled = false) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const start = gesture, dx = event.clientX - start.x, dy = event.clientY - start.y;
    const duration = performance.now() - start.time;
    clearGesture(); wake(true);
    if (cancelled) { ignoredClickUntil = performance.now() + 400; return; }
    if (mode === "reels" && Math.abs(dy) >= 48 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      ignoredClickUntil = performance.now() + 400; lastTap = null; navigate(dy < 0 ? 1 : -1); return;
    }
    if (mode === "stories") {
      if (duration >= 250 || Math.abs(dx) > 16 || Math.abs(dy) > 16) ignoredClickUntil = performance.now() + 400;
      return;
    }
    if (start.pointerType !== "mouse" && duration < 250 && Math.abs(dx) < 16 && Math.abs(dy) < 16) {
      const now = performance.now();
      if (lastTap && now - lastTap.time < 320 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 32) {
        setLike(true, true); lastTap = null;
      } else lastTap = { time: now, x: event.clientX, y: event.clientY };
    }
  }
  window.addEventListener("pointerup", event => pointerEnd(event));
  window.addEventListener("pointercancel", event => pointerEnd(event, true));
  stage.addEventListener("lostpointercapture", () => { if (gesture) { clearGesture(); wake(true); } });
  stage.addEventListener("dblclick", event => {
    if (active && mode === "reels" && !event.target.closest("button, a") && performance.now() >= ignoredClickUntil) {
      event.preventDefault(); setLike(true, true);
    }
  });
  stage.addEventListener("dragstart", event => event.preventDefault());
  dialog.addEventListener("wheel", event => {
    // The footer remains ordinarily scrollable at short heights and enlarged
    // text. Only an unobstructed, fully fitting Reels stage consumes a wheel.
    if (!active || mode !== "reels" || event.ctrlKey || covered() || !stage.contains(event.target)
      || shell.scrollHeight > shell.clientHeight + 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    const now = performance.now();
    if (now < wheelLock) return;
    if (now - lastWheel > 200 || Math.sign(event.deltaY) !== Math.sign(wheelDelta)) wheelDelta = 0;
    lastWheel = now; wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    if (Math.abs(wheelDelta) >= 60) { const direction = Math.sign(wheelDelta); wheelDelta = 0; wheelLock = now + 500; navigate(direction); }
  }, { passive: false });
  dialog.addEventListener("keydown", event => {
    if (!active || covered() || event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (mode === "reels" && shell.scrollHeight > shell.clientHeight + 1 && ["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const direction = mode === "stories" ? { ArrowLeft: -1, ArrowRight: 1 }[event.key] : { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (direction) { event.preventDefault(); navigate(direction); }
    else if (mode === "stories" && event.code === "Space" && !event.target.closest("button, a")) { event.preventDefault(); togglePause(); }
  });
  dialog.addEventListener("close", () => { if (!dialog.open) finishClose(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearGesture(); wake(true); });
  window.addEventListener("blur", () => { if (gesture) { clearGesture(); wake(true); } });
  window.addEventListener("pagehide", closeViewer);
  new MutationObserver(() => { if (active) wake(true); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  reelsTrigger?.addEventListener("click", () => openReels());
  return { renderStories, refresh, isOpen: () => active && dialog.open, openReels, openStories };
}
