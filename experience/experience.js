(() => {
  "use strict";

  const experience = document.querySelector("[data-cinematic-experience]");
  if (!(experience instanceof HTMLElement)) return;

  const scenes = Array.from(experience.querySelectorAll("[data-scene]"));
  const languageButtons = Array.from(document.querySelectorAll("[data-lang]"));
  const localizedNodes = Array.from(document.querySelectorAll("[data-tr][data-en][data-ru]"));
  const localizedAriaNodes = Array.from(document.querySelectorAll("[data-aria-tr][data-aria-en][data-aria-ru]"));
  const sceneNumber = experience.querySelector("[data-scene-number]");
  const languages = new Set(["tr", "en", "ru"]);
  const LANGUAGE_KEY = "robys-language";

  experience.dataset.enhanced = "true";

  let start = 0;
  let range = 1;
  let activeScene = -1;
  let activeMotionFrame = -1;
  let scheduled = false;

  const clamp = (value) => Math.min(1, Math.max(0, value));

  function preferredLanguage() {
    const browser = String(navigator.language || "").toLowerCase();
    if (browser.startsWith("ru")) return "ru";
    if (browser.startsWith("en")) return "en";
    return "tr";
  }

  function storedLanguage() {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved && languages.has(saved)) return saved;
    } catch {
      // Storage can be unavailable in hardened/private browsing contexts.
    }
    return preferredLanguage();
  }

  function applyLanguage(language, persist = true) {
    const next = languages.has(language) ? language : "tr";
    document.documentElement.lang = next;

    localizedNodes.forEach((node) => {
      const copy = node.getAttribute(`data-${next}`);
      if (copy !== null) node.textContent = copy;
    });

    localizedAriaNodes.forEach((node) => {
      const label = node.getAttribute(`data-aria-${next}`);
      if (label !== null) node.setAttribute("aria-label", label);
    });

    languageButtons.forEach((button) => {
      const selected = button.getAttribute("data-lang") === next;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    if (persist) {
      try {
        localStorage.setItem(LANGUAGE_KEY, next);
      } catch {
        // Language remains active for this page when storage is unavailable.
      }
    }
  }

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyLanguage(button.getAttribute("data-lang") || "tr");
    });
  });

  function measure() {
    start = experience.getBoundingClientRect().top + window.scrollY;
    range = Math.max(1, experience.offsetHeight - window.innerHeight);
    updateScene();
  }

  function currentProgress() {
    return clamp((window.scrollY - start) / range);
  }

  function activateScene(index) {
    if (index === activeScene) return;

    activeScene = index;
    experience.dataset.activeScene = String(index);

    scenes.forEach((scene, sceneIndex) => {
      const selected = sceneIndex === index;
      scene.classList.toggle("is-active", selected);

      if (selected) scene.setAttribute("aria-current", "step");
      else scene.removeAttribute("aria-current");

      scene.querySelectorAll("a").forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) return;
        if (selected) {
          link.removeAttribute("tabindex");
          link.removeAttribute("aria-hidden");
        } else {
          link.tabIndex = -1;
          link.setAttribute("aria-hidden", "true");
        }
      });
    });

    if (sceneNumber) sceneNumber.textContent = String(index + 1).padStart(2, "0");
  }

  function activateMotionFrame(progress) {
    const frame = Math.min(10, Math.floor(progress * 11));
    if (frame === activeMotionFrame) return;

    activeMotionFrame = frame;
    experience.dataset.motionFrame = String(frame);
  }

  function updateScene() {
    scheduled = false;
    const progress = currentProgress();
    const index = Math.min(scenes.length - 1, Math.floor(progress * scenes.length));
    activateMotionFrame(progress);
    activateScene(index);
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateScene);
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("orientationchange", measure, { passive: true });

  applyLanguage(storedLanguage());
  measure();
})();