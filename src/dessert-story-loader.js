// Import the optional cake experience only after its card enters the viewport.
const selector = '.feed-card[data-product-id="desserts:chocolate-cake"],.full-menu-item[data-product-id="desserts:chocolate-cake"]';
const seen = new WeakSet();
let requested = false;
const visible = new IntersectionObserver(entries => {
  if (requested || !entries.some(entry => entry.isIntersecting)) return;
  requested = true;
  visible.disconnect();
  changes.disconnect();
  import("./dessert-story.js").catch(error => console.error("Dessert story failed to load", error));
});
function scan() {
  for (const card of document.querySelectorAll(selector)) {
    if (seen.has(card)) continue;
    seen.add(card);
    visible.observe(card);
  }
}
const changes = new MutationObserver(scan);
changes.observe(document.body, { childList: true, subtree: true });
scan();
