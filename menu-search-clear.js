const clearLabels = {
  tr: "Aramayı temizle",
  en: "Clear search",
  ru: "Очистить поиск"
};

const searchInput = document.querySelector("#menu-search");

if (searchInput) {
  const style = document.createElement("style");
  style.textContent = `
    .menu-search input{padding-right:58px}
    .menu-search-clear{position:absolute;top:50%;right:9px;display:grid;width:34px;height:34px;place-items:center;padding:0;color:var(--muted);background:transparent;border:0;border-radius:50%;cursor:pointer;font:500 1.35rem/1 var(--sans);transform:translateY(-50%);transition:color .18s,background .18s,transform .18s}
    .menu-search-clear:hover{color:var(--ink);background:rgba(47,39,37,.08)}
    .menu-search-clear:active{transform:translateY(-50%) scale(.94)}
    .menu-search-clear:focus-visible{outline:3px solid rgba(184,77,88,.3);outline-offset:1px}
    .menu-search-clear[hidden]{display:none}
    @media(max-width:680px){.menu-search input{padding-right:54px}.menu-search-clear{right:7px;width:32px;height:32px}}
    @media(prefers-reduced-motion:reduce){.menu-search-clear{transition:none}}
  `;
  document.head.append(style);

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
