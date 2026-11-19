"use strict";

// Keep error pages usable without JavaScript (Turkish is the default).
// The same file handles both GitHub Pages' 404 route and offline fallback.
(() => {
  const supported = new Set(["tr", "en", "ru"]);
  let preference = new URLSearchParams(window.location.search).get("lang");
  if (!supported.has(preference)) {
    try { preference = localStorage.getItem("robys-language"); } catch { preference = null; }
  }
  const language = supported.has(preference) ? preference : "tr";
  document.documentElement.lang = language;
  document.querySelectorAll("[data-error-lang]").forEach((node) => {
    node.hidden = node.dataset.errorLang !== language;
  });
  document.querySelectorAll("[data-error-menu]").forEach((node) => {
    const url = new URL(node.href);
    url.searchParams.set("lang", language);
    node.href = url.href;
  });
  const retry = document.querySelector("[data-error-retry]");
  if (retry) retry.href = window.location.href;
})();
