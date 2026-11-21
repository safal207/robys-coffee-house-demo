// The personal deck is below the first photo. Its CSS can load without
// blocking the feed's initial frame, but must activate on a cache hit or load.
const personalStyle = document.querySelector('link[data-personal-feed-style="deferred"]');
if (personalStyle) {
  const activatePersonalStyle = () => { personalStyle.media = "all"; };
  if (personalStyle.sheet) activatePersonalStyle();
  else personalStyle.addEventListener("load", activatePersonalStyle, { once: true });
}

// Only an intentional tap fetches the larger personal-deck/catalog module.
const trigger = document.querySelector("#my-feed-toggle");
if (trigger) {
  let experience, loading, retry = 0;
  const failed = {
    tr: "Açılamadı. Tekrar dene.",
    en: "Could not open. Tap to retry.",
    ru: "Не удалось открыть. Нажми ещё раз."
  };
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
      const hint = trigger.querySelector(".my-feed-toggle-sub");
      if (hint) {
        const language = document.documentElement.lang;
        hint.textContent = failed[language] ?? failed.tr;
        hint.setAttribute("role", "status");
      }
    } finally {
      loading = null;
      trigger.disabled = false;
      trigger.removeAttribute("aria-busy");
    }
  });
}


// Keep the personal-history control visible, but do not compete with the
// first product photograph for bandwidth on slow mobile connections.
// A direct tap always loads it immediately, even if the photograph fails.
const memoryTrigger = document.querySelector(".taste-memory-trigger");
const feedRoot = document.querySelector("#feed");
if (memoryTrigger && feedRoot) {
  let memoryLoad = null, memoryReady = false, clickQueued = false;
  function loadMemory() {
    if (!memoryLoad) {
      memoryLoad = import("./taste-memory.js?v=2c971696743e").then(() => {
        memoryReady = true;
        memoryTrigger.removeEventListener("click", openMemory);
      }).catch(() => { memoryLoad = null; });
    }
    return memoryLoad;
  }
  function openMemory(event) {
    if (memoryReady) return;
    event.stopImmediatePropagation();
    if (clickQueued) return;
    clickQueued = true;
    void loadMemory().then(() => {
      if (memoryReady && memoryTrigger.isConnected) memoryTrigger.click();
    }).finally(() => { clickQueued = false; });
  }
  memoryTrigger.addEventListener("click", openMemory);
  function afterFirstPhoto(photo) {
    void photo.decode().catch(() => {}).then(() => {
      const start = () => { void loadMemory(); };
      if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1500 });
      else setTimeout(start, 0);
    });
  }
  const first = feedRoot.querySelector(".feed-photo>img");
  if (first) afterFirstPhoto(first);
  else {
    const observer = new MutationObserver(() => {
      const photo = feedRoot.querySelector(".feed-photo>img");
      if (!photo) return;
      observer.disconnect();
      afterFirstPhoto(photo);
    });
    observer.observe(feedRoot, { subtree: true, childList: true });
  }
}
