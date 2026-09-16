from pathlib import Path

app_path = Path("src/menu-app.js")
app = app_path.read_text()

anchor = "\nfunction createItem(item, { priority = false, categoryId } = {}) {"
assert anchor in app, "createItem anchor changed"
assert "PAIRING_VIDEO_SRC" not in app, "pairing feature already applied"

helper = r'''
const PAIRING_VIDEO_SRC = "src/products/sets-v1/iced-san-sebastian-pairing-card.mp4";
let pairingMotionActivated = false;
const pairingVideoObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting, intersectionRatio }) => {
        if (!pairingMotionActivated || document.hidden || !isIntersecting || intersectionRatio < 0.35) {
          target.pause();
          return;
        }
        if (!target.getAttribute("src")) target.src = target.dataset.src ?? "";
        if (target.getAttribute("src")) target.play().catch(() => {});
      });
    }, { rootMargin: "120px 0px", threshold: [0, 0.35] })
  : null;

function pairingMotionAllowed() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !navigator.connection?.saveData;
}

function connectPairingVideo(video) {
  if (!pairingMotionActivated) return;
  if (pairingVideoObserver) {
    pairingVideoObserver.observe(video);
    return;
  }
  if (!video.getAttribute("src")) video.src = video.dataset.src ?? "";
}

function activatePairingMotion() {
  if (pairingMotionActivated || !pairingMotionAllowed()) return;
  pairingMotionActivated = true;
  document.querySelectorAll(".menu-pairing-video").forEach(connectPairingVideo);
}

window.addEventListener("pointerdown", activatePairingMotion, { once: true, passive: true });
window.addEventListener("keydown", activatePairingMotion, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) document.querySelectorAll(".menu-pairing-video").forEach((video) => video.pause());
});

function addProductDirectly(id) {
  const product = productIndex.get(id);
  if (!product) return;
  const currentQuantity = cart.get(id) ?? 0;
  const copy = menuCopy[language];
  if (currentQuantity >= MAX_ITEM_QUANTITY) {
    announceCart(`${copy.maxQuantity}: ${localized(product.item.name)}`);
    return;
  }
  setCartQuantity(id, currentQuantity + 1);
  announceCart(`${copy.added}: ${localized(product.item.name)} × 1`);
  cartTrigger.classList.add("is-emphasized");
  window.setTimeout(() => cartTrigger.classList.remove("is-emphasized"), 620);
}
'''

app = app.replace(anchor, "\n" + helper + anchor, 1)

old_media = '''    const image = document.createElement("img");
    image.src = productImage(categoryId, item);
    image.alt = pairing ? localized(item.imageAlt ?? item.name) : "";
    image.loading = priority ? "eager" : "lazy";
    image.decoding = "async";
    if (priority) image.fetchPriority = "high";
    image.width = 1024;
    image.height = 1024;
    media.append(image);'''
assert old_media in app, "media image block changed"
new_media = '''    if (pairing && item.journeyId === "iced-san-sebastian") {
      const video = document.createElement("video");
      video.className = "menu-pairing-video";
      video.poster = productImage(categoryId, item);
      video.dataset.src = PAIRING_VIDEO_SRC;
      video.preload = "none";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.width = 288;
      video.height = 429;
      video.setAttribute("aria-hidden", "true");
      media.append(video);
      connectPairingVideo(video);
    } else {
      const image = document.createElement("img");
      image.src = productImage(categoryId, item);
      image.alt = pairing ? localized(item.imageAlt ?? item.name) : "";
      image.loading = priority ? "eager" : "lazy";
      image.decoding = "async";
      if (priority) image.fetchPriority = "high";
      image.width = 1024;
      image.height = 1024;
      media.append(image);
    }'''
app = app.replace(old_media, new_media, 1)

old_details = '''    const details = document.createElement("div");
    details.className = "full-menu-item-details";
    details.append(copy, price);
    row.append(media, details);'''
assert old_details in app, "details block changed"
new_details = '''    const details = document.createElement("div");
    details.className = "full-menu-item-details";
    if (pairing) {
      const directAdd = createButton("menu-pairing-add", menuCopy[language].addToCart, (event) => {
        event.stopPropagation();
        addProductDirectly(id);
      });
      directAdd.setAttribute("aria-label", `${menuCopy[language].addToCart}: ${localized(item.name)}`);
      details.append(copy, price, directAdd);
    } else {
      details.append(copy, price);
    }
    row.append(media, details);'''
app = app.replace(old_details, new_details, 1)
app_path.write_text(app)

css_path = Path("menu-premium.css")
css = css_path.read_text()
marker = "/* PAIRING-CARD-MOTION-V1 */"
assert marker not in css, "pairing feature CSS already applied"
css += r'''

/* PAIRING-CARD-MOTION-V1 */
.full-menu-item--visual[data-pairing="iced-san-sebastian"] .full-menu-item-media .menu-pairing-video{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:50% 60%;transform:scale(1.08) translate3d(-2%,2.5%,0);transform-origin:center center;background:#e8ded1;pointer-events:none}
.menu-pairing-add{display:inline-flex;width:100%;min-height:44px;align-items:center;justify-content:center;padding:11px 16px;color:#fff;background:var(--ruby);border:1px solid var(--ruby);border-radius:999px;font:800 .78rem/1 var(--sans);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}
.menu-pairing-add:hover{transform:translateY(-1px);box-shadow:0 9px 20px rgba(211,38,54,.16)}
.menu-pairing-add:active{transform:translateY(1px) scale(.98)}
.menu-pairing-add:focus-visible{outline:3px solid rgba(226,27,35,.28);outline-offset:3px}
@media(max-width:680px){.full-menu-item--visual[data-pairing="iced-san-sebastian"] .full-menu-item-media .menu-pairing-video{object-position:50% 61%;transform:scale(1.15) translate3d(-4%,5%,0)}}
@media(prefers-reduced-motion:reduce){.menu-pairing-add{transition:none}}
'''
css_path.write_text(css)
