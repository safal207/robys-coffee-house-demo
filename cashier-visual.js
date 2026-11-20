// Cashier companion: always show approved Turkish names and compact visual cards.
// The existing cashier renderer remains the source of totals, QR status and errors.
import { decodeOrderTicket, quoteOrderTicket } from "./src/order-ticket.js";
import { menuCategories } from "./menu-catalog.js?v=3132b4dc1273";
import { feedProducts } from "./src/menu-feed-model.js";

const products = feedProducts(menuCategories);
const photos = new Map(products.map(product => [product.id, product.image]));
const root = document.querySelector("#cashier-ticket");
const trButton = document.querySelector('[data-cashier-language="tr"]');
if (root && trButton) {
  const note = document.createElement("p");
  note.className = "cashier-turkish-note";
  note.lang = "tr";
  note.textContent = "Kasiyer görünümü · Türkçe sipariş özeti";
  document.querySelector(".cashier-header")?.append(note);
  function showTurkish() {
    // An old customer QR may encode RU/EN. It must not set the staff language.
    if (trButton.getAttribute("aria-pressed") !== "true") {
      trButton.click();
      return;
    }
    let quote;
    try {
      const decoded = decodeOrderTicket(location.hash.slice(1));
      quote = quoteOrderTicket(decoded.ticket, "tr");
    } catch { return; }
    const rows = Array.from(root.querySelectorAll(".order-ticket-line"));
    if (rows.length !== quote.groups.length) return;
    for (const [index, group] of quote.groups.entries()) {
      const row = rows[index];
      if (row.querySelector(".cashier-order-thumbs")) continue;
      const thumbs = document.createElement("div");
      thumbs.className = "cashier-order-thumbs";
      const included = new Set();
      for (const item of group.items) {
        if (included.has(item.id) || !photos.has(item.id)) continue;
        included.add(item.id);
        const photo = document.createElement("img");
        photo.src = photos.get(item.id);
        photo.alt = "";
        photo.decoding = "async";
        photo.loading = "lazy";
        photo.width = 80;
        photo.height = 80;
        thumbs.append(photo);
      }
      if (thumbs.childElementCount) row.prepend(thumbs);
    }
  }
  // Re-rendering on a new QR/hash must preserve TR and remove stale photographs.
  const observer = new MutationObserver(() => showTurkish());
  observer.observe(root, { childList: true });
  window.addEventListener("hashchange", () => queueMicrotask(showTurkish));
  showTurkish();
}
