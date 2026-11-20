// The cart stays on the existing eager path; optional personal suggestions load only on opening.
const dialog = document.querySelector("#menu-cart-dialog");
if (dialog) {
  let loaded = false, pending = false, retry = 0;
  async function load() {
    if (loaded || pending || !dialog.open) return;
    pending = true;
    try {
      const url = new URL("./taste-cart.js?v=1", import.meta.url);
      if (retry) url.searchParams.set("retry", String(retry));
      await import(url.href);
      loaded = true;
    } catch { retry += 1; /* Another opening retries a new URL after an offline failure. */ }
    finally { pending = false; }
  }
  new MutationObserver(() => { if (dialog.open) void load(); })
    .observe(dialog, { attributes: true, attributeFilter: ["open"] });
  if (dialog.open) void load();
}
