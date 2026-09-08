const REVEAL_PRODUCTS = Object.freeze([
  Object.freeze({
    id: "desserts:san-sebastian-cheesecake",
    primaryPath: "/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp",
    revealImage: "src/products/san-sebastian.webp"
  })
]);

const REVEAL_COPY = Object.freeze({
  tr: Object.freeze({
    label: "San Sebastian'ın alternatif görünümünü göster",
    hint: "Sola kaydır · diğer görünümü gör",
    revealed: "San Sebastian · diğer görünüm",
    value: "Alternatif görünüm %{percent}"
  }),
  en: Object.freeze({
    label: "Reveal an alternate view of the San Sebastian cheesecake",
    hint: "Swipe left · alternate view",
    revealed: "San Sebastian · alternate view",
    value: "Alternate view %{percent}"
  }),
  ru: Object.freeze({
    label: "Показать другой ракурс чизкейка Сан-Себастьян",
    hint: "Свайп влево · другой ракурс",
    revealed: "Сан-Себастьян · другой ракурс",
    value: "Другой ракурс %{percent}"
  })
});

function pathnameFor(source) {
  if (!source) return "";
  try {
    return new URL(source, "https://robys.invalid/").pathname;
  } catch {
    return String(source).split(/[?#]/, 1)[0];
  }
}

export function resolveRevealConfig(source) {
  const pathname = pathnameFor(source);
  return REVEAL_PRODUCTS.find((candidate) => pathname.endsWith(candidate.primaryPath)) ?? null;
}

export function revealCopy(language) {
  return REVEAL_COPY[language] ?? REVEAL_COPY.tr;
}

function bootReveal() {
  const sourceImage = document.querySelector("#menu-product-image");
  const visual = sourceImage?.closest(".menu-product-visual");
  if (!sourceImage || !visual || visual.dataset.menuRevealBooted === "true") return;
  visual.dataset.menuRevealBooted = "true";

  const revealImage = document.createElement("img");
  revealImage.className = "menu-product-reveal-image";
  revealImage.alt = "";
  revealImage.width = 1024;
  revealImage.height = 1024;
  revealImage.decoding = "async";
  revealImage.draggable = false;
  revealImage.hidden = true;

  const control = document.createElement("input");
  control.className = "menu-product-reveal-control";
  control.type = "range";
  control.min = "0";
  control.max = "100";
  control.step = "1";
  control.value = "88";
  control.hidden = true;

  const divider = document.createElement("span");
  divider.className = "menu-product-reveal-divider";
  divider.setAttribute("aria-hidden", "true");
  divider.hidden = true;

  const cue = document.createElement("span");
  cue.className = "menu-product-reveal-cue";
  cue.setAttribute("aria-hidden", "true");
  cue.hidden = true;

  sourceImage.insertAdjacentElement("afterend", revealImage);
  revealImage.insertAdjacentElement("afterend", control);
  control.insertAdjacentElement("afterend", divider);
  divider.insertAdjacentElement("afterend", cue);

  let activeConfig = null;
  let revealGeneration = 0;

  const currentLanguage = () => document.documentElement.lang || "tr";

  const updatePosition = () => {
    if (!activeConfig) return;
    const position = Math.max(0, Math.min(100, Number(control.value)));
    const revealed = 100 - position;
    const copy = revealCopy(currentLanguage());
    visual.style.setProperty("--menu-reveal-position", `${position}%`);
    control.setAttribute("aria-label", copy.label);
    control.setAttribute("aria-valuetext", copy.value.replace("%{percent}", `${revealed}%`));
    cue.textContent = position <= 18 ? copy.revealed : copy.hint;
  };

  const hideReveal = () => {
    activeConfig = null;
    revealGeneration += 1;
    visual.removeAttribute("data-menu-reveal-active");
    visual.style.removeProperty("--menu-reveal-position");
    revealImage.hidden = true;
    control.hidden = true;
    divider.hidden = true;
    cue.hidden = true;
  };

  const showReveal = (generation) => {
    if (!activeConfig || generation !== revealGeneration || !revealImage.naturalWidth) return;
    visual.dataset.menuRevealActive = "true";
    revealImage.hidden = false;
    control.hidden = false;
    divider.hidden = false;
    cue.hidden = false;
    updatePosition();
  };

  const activateReveal = (config) => {
    activeConfig = config;
    const generation = ++revealGeneration;
    control.value = "88";
    revealImage.hidden = true;
    control.hidden = true;
    divider.hidden = true;
    cue.hidden = true;
    visual.removeAttribute("data-menu-reveal-active");
    updatePosition();

    revealImage.onload = () => showReveal(generation);
    revealImage.onerror = () => {
      if (generation !== revealGeneration) return;
      hideReveal();
    };

    const target = new URL(config.revealImage, document.baseURI).href;
    if (revealImage.src !== target) revealImage.src = target;
    if (revealImage.complete && revealImage.naturalWidth > 0) {
      queueMicrotask(() => showReveal(generation));
    }
  };

  const syncProduct = () => {
    const config = resolveRevealConfig(
      sourceImage.getAttribute("src") || sourceImage.src || sourceImage.currentSrc
    );
    if (!config) {
      hideReveal();
      return;
    }
    activateReveal(config);
  };

  control.addEventListener("input", updatePosition);
  control.addEventListener("change", updatePosition);

  new MutationObserver(syncProduct).observe(sourceImage, {
    attributes: true,
    attributeFilter: ["src"]
  });

  new MutationObserver(updatePosition).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });

  syncProduct();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootReveal, { once: true });
  } else {
    bootReveal();
  }
}
