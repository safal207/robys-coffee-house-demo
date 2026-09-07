/* Keep the catalogue's title, description and price outside the photograph. */
const pairingActionCopy = {
  tr: "Seti incele",
  en: "View this set",
  ru: "Посмотреть набор"
};

function enhancePairingCards() {
  const language = document.documentElement.lang.split("-")[0];
  const label = pairingActionCopy[language] ?? pairingActionCopy.tr;
  document.querySelectorAll("#pairing-offers .full-menu-item--visual").forEach(card => {
    const media = card.querySelector(".full-menu-item-media");
    const details = card.querySelector(".full-menu-item-details");
    const name = card.querySelector(".full-menu-item-copy strong")?.textContent?.trim();
    if (!media || !details || !name) return;
    const renderKey = `${language}|${name}`;
    if (card.dataset.posterReady === renderKey && details.querySelector(".pairing-view-set")) return;
    // Retain the class for existing selectors; remove obsolete duplicate labels.
    card.classList.add("pairing-poster-card");
    card.querySelector(".pairing-poster-overlay")?.remove();
    details.querySelector(".pairing-view-set")?.remove();
    const action = document.createElement("button");
    action.type = "button";
    action.className = "pairing-view-set";
    action.textContent = label;
    action.setAttribute("aria-label", `${label}: ${name}`);
    action.setAttribute("aria-haspopup", "dialog");
    action.setAttribute("aria-controls", "menu-product-dialog");
    // Reuse the existing product handler: no second price model or implicit add.
    action.addEventListener("click", () => media.click());
    details.append(action);
    card.dataset.posterReady = renderKey;
  });
}

const menuRoot = document.querySelector("#menu-root");
if (menuRoot) {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      enhancePairingCards();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(menuRoot, { childList: true, subtree: true });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  schedule();
}
