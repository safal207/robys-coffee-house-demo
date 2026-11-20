// The cart stays on the existing eager path; optional personal suggestions load only on opening.
const dialog = document.querySelector("#menu-cart-dialog");
if (dialog) {
  let loaded = false, pending = false;
  async function load() {
    if (loaded || pending || !dialog.open) return;
    pending = true;
    try { await import("./taste-cart.js?v=1"); loaded = true; }
    catch { /* Another opening can retry after an offline module failure. */ }
    finally { pending = false; }
  }
  new MutationObserver(() => { if (dialog.open) void load(); })
    .observe(dialog, { attributes: true, attributeFilter: ["open"] });
  if (dialog.open) void load();
}
