const clearLabels = {
  tr: "Aramayı temizle",
  en: "Clear search",
  ru: "Очистить поиск"
};

const searchInput = document.querySelector("#menu-search");

if (searchInput) {
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "menu-search-clear";
  clearButton.textContent = "×";
  clearButton.hidden = true;
  searchInput.insertAdjacentElement("afterend", clearButton);

  const updateLabel = () => {
    const language = document.documentElement.lang;
    clearButton.setAttribute("aria-label", clearLabels[language] ?? clearLabels.tr);
  };

  const updateVisibility = () => {
    clearButton.hidden = searchInput.value.length === 0;
  };

  const clearSearch = () => {
    if (!searchInput.value) return;
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    updateVisibility();
    searchInput.focus();
  };

  clearButton.addEventListener("click", clearSearch);
  searchInput.addEventListener("input", updateVisibility);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !searchInput.value) return;
    event.preventDefault();
    clearSearch();
  });

  new MutationObserver(updateLabel).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });

  updateLabel();
  updateVisibility();
}
