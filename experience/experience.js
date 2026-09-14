(() => {
  "use strict";

  const experience = document.querySelector("[data-cinematic-experience]");
  if (!experience) return;

  const scenes = [...experience.querySelectorAll("[data-scene]")];
  const products = [...experience.querySelectorAll("[data-product]")];
  const languageButtons = [...document.querySelectorAll("[data-lang]")];
  const localizedNodes = [...document.querySelectorAll("[data-tr][data-en][data-ru]")];
  const sceneNumber = experience.querySelector("[data-scene-number]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const languages = new Set(["tr", "en", "ru"]);

  let start = 0;
  let range = 1;
  let target = 0;
  let rendered = -1;
  let activeScene = -1;
  let frame = 0;

  const clamp = (value) => Math.min(1, Math.max(0, value));

  function preferredLanguage() {
    const browser = (navigator.language || "").toLowerCase();
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
    button.addEventListener("click", () => applyLanguage(button.getAttribute("data-lang")));
  });

  function measure() {
    start = experience.getBoundingClientRect().top + window.scrollY;
    range = Math.max(1, experience.offsetHeight - window.innerHeight);
    updateTarget();
  }

  function scrollProgress() {
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

    const iced = index === 4 || index === 5;
    products.forEach((image) => {
      image.classList.toggle(
        "is-visible",
        iced ? image.dataset.product === "iced" : image.dataset.product === "latte"
      );
    });
  }

  function render(progress) {
    const value = clamp(progress);
    rendered = value;
    const index = Math.min(scenes.length - 1, Math.floor(value * scenes.length));
    const route = clamp((value - 0.47) / 0.34);
    const phase = value * Math.PI * 2;
    const x = Math.sin(phase * 0.72) * 16;
    const y = Math.cos(phase * 0.56) * 10 - value * 5;
    const scale = 0.94 + Math.sin(value * Math.PI) * 0.08 + value * 0.035;
    const rotation = -3.5 + value * 7;

    experience.style.setProperty("--scroll", value.toFixed(4));
    experience.style.setProperty("--route-progress", route.toFixed(4));
    experience.style.setProperty("--world-x", `${x.toFixed(2)}px`);
    experience.style.setProperty("--world-y", `${y.toFixed(2)}px`);
    experience.style.setProperty("--world-scale", scale.toFixed(4));
    experience.style.setProperty("--world-rotate", `${rotation.toFixed(2)}deg`);
    experience.style.setProperty("--product-counter-rotate", `${(-rotation * 0.25).toFixed(2)}deg`);
    experience.style.setProperty("--ambient-x", `${(x * 0.24).toFixed(2)}px`);
    experience.style.setProperty("--ambient-y", `${(y * 0.18).toFixed(2)}px`);
    experience.style.setProperty("--ambient-scale", (0.9 + value * 0.18).toFixed(4));
    experience.style.setProperty("--light-x", `${(-18 + value * 95).toFixed(2)}%`);
    experience.style.setProperty("--glow-scale", (1 + value * 0.16).toFixed(4));
    experience.style.setProperty("--cue-opacity", (1 - Math.min(value, 0.92)).toFixed(4));

    activateScene(index);
  }

  function tick() {
    frame = 0;
    const delta = target - rendered;
    const next = reduceMotion.matches || rendered < 0 || Math.abs(delta) < 0.0005
      ? target
      : rendered + delta * 0.14;
    render(next);
    if (!reduceMotion.matches && Math.abs(target - rendered) >= 0.0005) {
      frame = requestAnimationFrame(tick);
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function updateTarget() {
    target = scrollProgress();
    schedule();
  }

  window.addEventListener("scroll", updateTarget, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  reduceMotion.addEventListener?.("change", updateTarget);

  applyLanguage(preferredLanguage());
  measure();
  render(scrollProgress());
})();
