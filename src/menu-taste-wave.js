// Curated suggestions reference the existing catalog and shared order flow.
export const tasteWaveThemes = [
  { id: "morning", items: ["hot-coffee:espresso", "hot-coffee:cappuccino", "brew-hot:filter-coffee", "food:sesame-simit"] },
  { id: "sweet", items: ["desserts:san-sebastian-cheesecake", "desserts:brownie", "desserts:chocolate-cake", "hot-coffee:caffe-latte"] },
  { id: "refresh", items: ["refreshers:cool-lime", "refreshers:berry-lemonade", "refreshers:mango-passionfruit", "cold-coffee:iced-caffe-latte"] },
  { id: "takeaway", items: ["food:three-cheese-croissant", "cold-coffee:iced-caffe-latte", "hot-coffee:americano", "food:nutella-croissant"] }
];

const copy = {
  tr: { entry: "Lezzet dalgası", title: "Lezzet dalgası", intro: "Şu anda canın ne istiyor?", themes: "Durumuna göre seç", morning: "Güne başla", sweet: "Tatlı bir mola", refresh: "Serinle", takeaway: "Yanına al", add: "+ Siparişe ekle", next: "Başka bir öneri", details: "Seçenekleri gör", close: "Kapat", added: "Siparişine eklendi.", unavailable: "Bu öneri şu anda açılamıyor." },
  en: { entry: "Taste wave", title: "Your taste wave", intro: "What sounds good right now?", themes: "Choose for your moment", morning: "Morning start", sweet: "Sweet break", refresh: "Cool refreshment", takeaway: "To go", add: "+ Add to order", next: "Show another", details: "Choose options", close: "Close", added: "Added to your order.", unavailable: "This suggestion is unavailable right now." },
  ru: { entry: "Волна вкуса", title: "Волна вкуса", intro: "Чего хочется прямо сейчас?", themes: "Выбери настроение", morning: "Бодрый старт", sweet: "Сладкая пауза", refresh: "Освежиться", takeaway: "С собой", add: "+ В заказ", next: "Показать другое", details: "Выбрать вкус", close: "Закрыть", added: "Добавлено в заказ.", unavailable: "Не удалось открыть эту подборку." }
};

export function initTasteWave({ productIndex, getLanguage, localized, formatPrice, addProduct, openProduct, onOpen, onClose }) {
  const dialog = document.querySelector("#taste-wave-dialog"), trigger = document.querySelector("#taste-wave-open");
  const themesRoot = document.querySelector("#taste-wave-themes"), feature = document.querySelector("#taste-wave-feature");
  const image = document.querySelector("#taste-wave-image"), name = document.querySelector("#taste-wave-name");
  const price = document.querySelector("#taste-wave-price"), category = document.querySelector("#taste-wave-theme-label");
  const status = document.querySelector("#taste-wave-status"), add = document.querySelector("#taste-wave-add");
  const next = document.querySelector("#taste-wave-next"), closeButton = document.querySelector("#taste-wave-close");
  const buttons = new Map();
  let currentTheme = null, currentIndex = 0, fallback = false, adding = false, generation = 0, pendingProduct = null;
  const text = () => copy[getLanguage()] ?? copy.tr;
  const available = theme => theme.items.map(id => productIndex.get(id)).filter(Boolean);
  const selectedProduct = () => currentTheme ? available(currentTheme)[currentIndex] : null;

  for (const theme of tasteWaveThemes) {
    const cover = available(theme)[0];
    if (!cover) continue;
    const button = document.createElement("button"), photo = document.createElement("img"), label = document.createElement("span");
    button.type = "button"; button.className = "taste-wave-theme"; button.dataset.waveTheme = theme.id;
    button.setAttribute("aria-pressed", "false");
    photo.alt = ""; photo.width = photo.height = 96; photo.loading = "lazy";
    photo.dataset.waveSrc = cover.image.replace("/products/", "/products/quick-v1/").replace(/\.webp$/, "-256.webp");
    photo.addEventListener("error", () => { if (photo.dataset.waveSrc) { delete photo.dataset.waveSrc; photo.src = cover.image; } }, { once: true });
    label.dataset.waveThemeLabel = theme.id; button.append(photo, label);
    button.addEventListener("click", () => { currentTheme = theme; currentIndex = 0; status.textContent = ""; refresh(); feature.scrollIntoView({ block: "nearest" }); });
    buttons.set(theme.id, button); themesRoot.append(button);
  }

  function refresh() {
    const words = text();
    document.querySelectorAll("[data-wave-copy]").forEach(node => { node.textContent = words[node.dataset.waveCopy] ?? ""; });
    closeButton.setAttribute("aria-label", words.close); themesRoot.setAttribute("aria-label", words.themes);
    for (const [id, button] of buttons) {
      button.setAttribute("aria-pressed", String(currentTheme?.id === id));
      button.querySelector("[data-wave-theme-label]").textContent = words[id];
    }
    const product = selectedProduct();
    feature.hidden = !product;
    if (!product) return;
    image.src = product.image; image.alt = ""; name.textContent = localized(product.item.name);
    price.textContent = formatPrice(product.item.price); category.textContent = words[currentTheme.id];
    add.textContent = product.item.variants?.length ? words.details : words.add;
    next.disabled = available(currentTheme).length < 2;
  }
  function finished() {
    generation += 1; fallback = false; dialog.classList.remove("taste-wave--fallback");
    dialog.removeAttribute("aria-modal"); document.documentElement.classList.remove("taste-wave-open");
    trigger.focus({ preventScroll: true }); onClose();
    if (pendingProduct) { const id = pendingProduct; pendingProduct = null; void openProduct(id, trigger); }
  }
  function close() {
    if (!dialog.hasAttribute("open")) return;
    if (!fallback && typeof dialog.close === "function") dialog.close();
    else { dialog.removeAttribute("open"); finished(); }
  }
  function open() {
    if (dialog.hasAttribute("open")) return;
    generation += 1; onOpen(); currentTheme = null; currentIndex = 0; status.textContent = ""; refresh();
    for (const photo of themesRoot.querySelectorAll("img[data-wave-src]")) if (!photo.getAttribute("src")) photo.src = photo.dataset.waveSrc;
    try { if (typeof dialog.showModal !== "function") throw new Error("Modal unavailable"); dialog.showModal(); }
    catch { fallback = true; dialog.classList.add("taste-wave--fallback"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("open", ""); }
    document.documentElement.classList.add("taste-wave-open");
    (buttons.values().next().value ?? closeButton).focus({ preventScroll: true });
  }
  trigger.addEventListener("click", open); closeButton.addEventListener("click", close); dialog.addEventListener("close", finished);
  dialog.addEventListener("keydown", event => {
    if (!fallback) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]),a[href]")].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  for (const type of ["pointerdown", "click"]) document.addEventListener(type, event => {
    if (fallback && dialog.hasAttribute("open") && !dialog.contains(event.target)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  next.addEventListener("click", () => {
    if (!currentTheme) return;
    currentIndex = (currentIndex + 1) % available(currentTheme).length; status.textContent = ""; refresh();
  });
  add.addEventListener("click", async () => {
    const product = selectedProduct();
    if (!product || adding) return;
    if (product.item.variants?.length) { pendingProduct = product.id; close(); return; }
    const token = generation; adding = true; add.disabled = true;
    try { const added = await addProduct(product, add); if (token === generation && dialog.hasAttribute("open")) status.textContent = added ? text().added : text().unavailable; }
    finally { adding = false; add.disabled = false; }
  });
  refresh();
  return { refresh };
}
