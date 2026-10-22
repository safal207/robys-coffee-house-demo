// Render discovery entries immediately; download the full viewer on first use.
const copy = {
  tr: { stories: "Hikâyeler", items: "ürün", loading: "Hikâyeler yükleniyor…", error: "Görüntüleyici yüklenemedi. Tekrar açmayı dene." },
  en: { stories: "Stories", items: "items", loading: "Loading viewer…", error: "The viewer could not load. Try opening it again." },
  ru: { stories: "Истории", items: "позиций", loading: "Загружаем просмотр…", error: "Не удалось загрузить просмотр. Попробуй открыть ещё раз." }
};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function loadViewer(attempt) {
  if (!attempt) return import("./menu-feed-viewer.js?v=2c8582b8c3fa");
  const url = new URL("./menu-feed-viewer.js?v=2c8582b8c3fa", import.meta.url);
  url.searchParams.set("retry", String(attempt));
  return import(url.href);
}
export function createLazyFeedViewer(config, { loadModule = loadViewer } = {}) {
  const { products, categories, engagement, getLanguage, getFiltered } = config;
  const storyRoot = document.querySelector("#feed-stories"), reelsTrigger = document.querySelector("#feed-reels-open");
  const groups = categories.map(category => ({ category, products: products.filter(product => product.category.id === category.id) }))
    .filter(group => group.products.length);
  const text = () => copy[getLanguage()] ?? copy.tr;
  const localized = value => typeof value === "string" ? value : value?.[getLanguage()] ?? value?.tr ?? "";
  let controller, loading, attempt = 0, pending, generation = 0;
  const status = () => document.querySelector("#feed-status");
  function clearPending() {
    generation++;
    if (pending) {
      pending.trigger?.removeAttribute("aria-busy");
      if (status()?.textContent === pending.message) status().textContent = "";
    }
    pending = null;
  }
  const covered = () => [...document.querySelectorAll("dialog[open]")].some(node => node.id !== "feed-viewer");
  function load() {
    if (controller) return Promise.resolve(controller);
    if (!loading) loading = Promise.resolve().then(() => loadModule(attempt++)).then(module => {
      controller = module.createFeedViewer({ ...config, manageEntries: false });
      return controller;
    }).finally(() => { loading = null; });
    return loading;
  }
  async function open(mode, argument, trigger) {
    clearPending();
    if (document.hidden || covered() || trigger?.disabled) return false;
    // This newer intent owns the UI even while its optional code downloads.
    config.onOpen?.();
    if (controller) return mode === "stories" ? controller.openStories(argument, trigger)
      : controller.openReels({ ...argument, trigger });
    const request = pending = { token: generation, language: getLanguage(), filtered: getFiltered(), trigger, message: text().loading };
    trigger?.setAttribute("aria-busy", "true");
    if (status()) status().textContent = request.message;
    try {
      const viewer = await load();
      if (pending !== request || generation !== request.token || document.hidden || covered()
        || getLanguage() !== request.language || getFiltered() !== request.filtered || trigger?.isConnected === false) return false;
      clearPending();
      return mode === "stories" ? viewer.openStories(argument, trigger) : viewer.openReels({ ...argument, trigger });
    } catch {
      if (pending === request) {
        clearPending();
        if (status()) status().textContent = text().error;
      }
      return false;
    } finally { if (pending === request) clearPending(); }
  }
  const openStories = (categoryId, trigger) => open("stories", categoryId, trigger);
  const openReels = ({ trigger = reelsTrigger, ...options } = {}) => open("reels", options, trigger);
  function updateSeen() {
    storyRoot?.querySelectorAll(".feed-story").forEach(node => {
      const group = groups.find(value => value.category.id === node.dataset.storyCategory);
      node.dataset.seen = String(group.products.every(product => engagement.hasSeen(product.id)));
    });
  }
  function renderStories() {
    clearPending();
    if (!storyRoot) return;
    storyRoot.setAttribute("aria-label", text().stories);
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const story = element("button", "feed-story"); story.type = "button"; story.dataset.storyCategory = group.category.id;
      story.setAttribute("aria-haspopup", "dialog"); story.setAttribute("aria-controls", "feed-viewer");
      story.setAttribute("aria-label", `${localized(group.category.name)} · ${group.products.length} ${text().items}`);
      story.addEventListener("click", () => { void openStories(group.category.id, story); });
      const ring = element("span", "feed-story-ring"), cover = element("img");
      const source = group.products[0].image;
      const coverSource = source.includes("/products/") ? source.replace("/products/", "/products/quick-v1/").replace(/\.webp$/, "-256.webp") : source;
      const lead = document.querySelector(".feed-photo>img");
      // The large visible photograph owns the first network slot. Story covers
      // have fixed dimensions and can fill in after it without moving controls.
      if (lead && !lead.complete) {
        const reveal = () => { if (cover.isConnected) cover.src = coverSource; };
        lead.addEventListener("load", reveal, { once: true });
        lead.addEventListener("error", reveal, { once: true });
      } else cover.src = coverSource;
      cover.alt = ""; cover.width = 56; cover.height = 56;
      cover.loading = "lazy"; cover.decoding = "async"; cover.setAttribute("fetchpriority", "low");
      ring.append(cover); story.append(ring, element("span", "feed-story-label", localized(group.category.name))); fragment.append(story);
    }
    storyRoot.replaceChildren(fragment); updateSeen();
  }
  function refresh() {
    if (pending && (getLanguage() !== pending.language || getFiltered() !== pending.filtered)) clearPending();
    updateSeen(); controller?.refresh();
  }
  reelsTrigger?.addEventListener("click", () => { void openReels(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") clearPending(); });
  document.addEventListener("input", clearPending, { capture: true });
  document.addEventListener("click", event => {
    if (pending && !event.target.closest?.(".feed-story, #feed-reels-open")) clearPending();
  }, { capture: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearPending(); });
  window.addEventListener("pagehide", clearPending);
  if (typeof MutationObserver === "function") new MutationObserver(() => { if (pending && covered()) clearPending(); })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  return { renderStories, refresh, isOpen: () => Boolean(controller?.isOpen()), openStories, openReels, cancelPending: clearPending };
}
