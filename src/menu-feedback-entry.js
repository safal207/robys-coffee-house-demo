// Keep optional audio off the startup path; preserve the last tap while loading.
const button = document.querySelector(".menu-sound-toggle");
if (button) {
  let enabled = false, pending = false, loading = false, retry = 0;
  try { enabled = localStorage.getItem("robys-menu-sound") === "on"; } catch { /* Optional persistence. */ }
  const refresh = () => button.setAttribute("aria-pressed", String(enabled));
  refresh();
  document.addEventListener("click", async event => {
    const activate = event.target.closest?.(".menu-sound-toggle") === button;
    if (!event.isTrusted || button.dataset.soundReady || (!activate && !enabled)
      || !event.target.closest?.("button:not(:disabled), a[href]")) return;
    if (activate) { enabled = !enabled; pending = !pending; refresh(); }
    if (loading) return;
    loading = true;
    try {
      const url = new URL("./menu-feedback.js?v=57d1a0c670f6", import.meta.url);
      url.searchParams.set("retry", String(retry));
      const sound = (await (retry ? import(url.href) : import("./menu-feedback.js?v=57d1a0c670f6"))).initializeMenuFeedback(button, pending);
      if (!pending) sound?.play();
    } catch { retry++; /* Escape a cached failure; retain the latest tap. */ }
    finally { loading = false; }
  }, { capture: true });
}
