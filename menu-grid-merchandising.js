/* Photo-grid pairing conversion enhancement. No standalone checkout or payment. */
const root = document.getElementById("menu-root");

if (root) {
  const labels = {
    tr: { choose: "Bu ikiliyi seç", aria: "Ürün seçeneklerini aç" },
    en: { choose: "Choose this pairing", aria: "Open pairing options" },
    ru: { choose: "Выбрать пару", aria: "Открыть выбор пары" }
  };

  function currentCopy() {
    return labels[document.documentElement.lang] ?? labels.tr;
  }

  function enhance() {
    const copy = currentCopy();
    root.querySelectorAll(".full-menu-panel--featured .full-menu-item--visual[data-pairing]").forEach((card) => {
      const media = card.querySelector(".full-menu-item-media");
      const details = card.querySelector(".full-menu-item-details");
      if (!media || !details) return;
      let button = details.querySelector(".pairing-merch-choose");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "pairing-merch-choose";
        button.dataset.pairingMerchChoose = "true";
        details.append(button);
      }
      if (button.textContent !== copy.choose) button.textContent = copy.choose;
      const name = card.querySelector(".full-menu-item-copy strong")?.textContent?.trim() ?? "";
      const label = name ? `${copy.aria}: ${name}` : copy.aria;
      if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    });
  }

  let queued = false;
  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enhance(); });
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest?.(".pairing-merch-choose");
    if (!button || !root.contains(button)) return;
    const card = button.closest(".full-menu-item--visual[data-pairing]");
    const media = card?.querySelector(".full-menu-item-media");
    if (!media) return;
    window.robysAnalytics?.track?.("pairing_merch_choose", {
      pairing: card.dataset.pairing,
      placement: "menu_grid"
    });
    // Existing pairing click listener normally opens the story.
    // This intentional bypass opens the existing product dialog instead.
    media.dataset.inlineChoiceBypass = "true";
    media.click();
    delete media.dataset.inlineChoiceBypass;
  });

  new MutationObserver(scheduleEnhance).observe(root, { childList: true, subtree: true });
  new MutationObserver(scheduleEnhance).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
  scheduleEnhance();
}
