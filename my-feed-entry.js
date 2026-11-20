// Only an intentional tap fetches the larger personal-deck/catalog module.
const trigger = document.querySelector("#my-feed-toggle");
if (trigger) {
  let experience, loading, retry = 0;
  trigger.addEventListener("click", async () => {
    if (experience) { experience.toggle(); return; }
    if (loading) return;
    trigger.setAttribute("aria-busy", "true");
    trigger.disabled = true;
    try {
      const url = new URL("./my-feed.js?v=1", import.meta.url);
      if (retry) url.searchParams.set("retry", String(retry));
      loading = import(url.href);
      const { mountMyFeed } = await loading;
      experience = mountMyFeed();
      experience?.toggle();
    } catch {
      retry += 1; // A failed module URL is cached by browsers; a later tap may retry.
    } finally {
      loading = null;
      trigger.disabled = false;
      trigger.removeAttribute("aria-busy");
    }
  });
}
