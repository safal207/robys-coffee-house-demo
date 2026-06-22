function markReady(selector) {
  const element = document.querySelector(selector);
  if (!element) return;

  const commit = () => {
    if (!element.children.length) return false;
    element.dataset.ready = "true";
    return true;
  };

  if (commit()) return;

  const observer = new MutationObserver(() => {
    if (!commit()) return;
    observer.disconnect();
  });
  observer.observe(element, { childList: true });
}

markReady("#menu-category-nav");
markReady("#menu-root");
