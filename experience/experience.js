(() => {
  "use strict";

  const experience = document.querySelector("[data-cinematic-experience]");
  if (!(experience instanceof HTMLElement)) return;

  const scenes = Array.from(experience.querySelectorAll("[data-scene]"));
  const languageButtons = Array.from(document.querySelectorAll("[data-lang]"));
  const localizedNodes = Array.from(document.querySelectorAll("[data-tr][data-en][data-ru]"));
  const sceneNumber = experience.querySelector("[data-scene-number]");
  const languages = new Set(["tr", "en", "ru"]);

  let start = 0;
  let range = 1;
  let activeScene = -1;
  let scheduled = false;

  const clamp = (value) => Math.min(1, Math.max(0, value));

  function preferredLanguage() {
    const browser = String(navigator.language || "").toLowerCase();
    if (browser.startsWith("ru")) return "ru";
    if (browser.startsWith("en")) return "en";
    return "tr";
  }

  function applyLanguage(language) {
    const next = languages.has(language) ? language : "tr";
    document.documentElement.lang = next;

    localizedNodes.forEach((node) => {
      const copy = node.getAttribute(`data-${next}`);
      if (copy !== null) node.textContent = copy;
    });

    languageButtons.forEach((button) => {
      const selected = button.getAttribute("data-lang") === next;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
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
      scene.setAttribute("aria-hidden", String(!selected));
    });

    if (sceneNumber) sceneNumber.textContent = String(index + 1).padStart(2, "0");
  }

  function updateScene() {
    scheduled = false;
    const progress = currentProgress();
    const index = Math.min(scenes.length - 1, Math.floor(progress * scenes.length));
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

  applyLanguage(preferredLanguage());
  measure();
})();
