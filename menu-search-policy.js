const input = document.querySelector("#menu-search");
const navigation = document.querySelector("#menu-category-nav");

function track(action) {
  const payload = {
    event: "robys_action",
    action,
    language: document.documentElement.lang || "tr",
    path: window.location.pathname,
    placement: "menu_search"
  };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  document.dispatchEvent(new CustomEvent("robys:analytics", { detail: payload }));
}

if (input && navigation) {
  navigation.addEventListener("click", (event) => {
    const chip = event.target.closest(".menu-category-chip");
    const allChip = navigation.querySelector(".menu-category-chip");
    if (!chip || chip === allChip || !input.value.trim()) return;

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    track("menu_search_cleared_for_category");
  }, { capture: true });
}
