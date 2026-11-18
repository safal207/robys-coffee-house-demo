"use strict";
(() => {
  const supported = new Set(["tr", "en", "ru"]);
  let language = new URLSearchParams(location.search).get("lang");
  if (!supported.has(language)) {
    try { language = localStorage.getItem("robys-language"); } catch { /* Storage is optional. */ }
  }
  if (!supported.has(language)) language = "tr";
  document.documentElement.lang = language;
  document.querySelectorAll("[data-error-tr]").forEach((element) => {
    const translated = element.getAttribute(`data-error-${language}`);
    if (translated !== null) element.textContent = translated;
  });
})();
