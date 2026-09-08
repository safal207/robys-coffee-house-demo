const REVEAL_PRODUCTS = Object.freeze([
  Object.freeze({
    id: "desserts:san-sebastian-cheesecake",
    primaryPath: "/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp",
    revealImage: "src/products/gallery-v5/san-sebastian.webp"
  })
]);

const REVEAL_COPY = Object.freeze({
  tr: Object.freeze({
    label: "San Sebastian'ın iç dokusunu göster",
    hint: "Sola kaydır · iç dokuyu gör",
    revealed: "San Sebastian · iç doku",
    value: "İç görünüm %{percent}"
  }),
  en: Object.freeze({
    label: "Reveal the inside texture of the San Sebastian cheesecake",
    hint: "Swipe left · see inside",
    revealed: "San Sebastian · inside texture",
    value: "Inside view %{percent}"
  }),
  ru: Object.freeze({
    label: "Показать текстуру чизкейка Сан-Себастьян внутри",
    hint: "Свайп влево · посмотреть внутри",
    revealed: "Сан-Себастьян · текстура внутри",
    value: "Внутренний вид %{percent}"
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

function installRevealStyles() {
  if (document.querySelector("style[data-menu-product-reveal-styles]")) return;
  const style = document.createElement("style");
  style.dataset.menuProductRevealStyles = "true";
  style.textContent = `
.menu-product-visual[data-menu-reveal-active="true"]{--menu-reveal-position:88%;isolation:isolate}
.menu-product-visual[data-menu-reveal-active="true"] #menu-product-image{z-index:0}
.menu-product-reveal-image{position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:cover;clip-path:inset(0 0 0 var(--menu-reveal-position,88%));pointer-events:none;user-select:none;-webkit-user-drag:none}
.menu-product-reveal-control{position:absolute;inset:0;z-index:3;width:100%;height:100%;margin:0;opacity:.001;cursor:ew-resize;touch-action:pan-y}
.menu-product-reveal-divider{position:absolute;z-index:2;top:0;bottom:0;left:var(--menu-reveal-position,88%);width:2px;transform:translateX(-1px);background:rgba(255,255,255,.9);box-shadow:0 0 0 1px rgba(35,20,16,.18),0 0 24px rgba(0,0,0,.24);pointer-events:none}
.menu-product-reveal-divider::before{content:"↔";position:absolute;top:50%;left:50%;display:grid;width:44px;height:44px;place-items:center;transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.58);border-radius:50%;color:#fff;background:rgba(35,20,16,.72);box-shadow:0 8px 24px rgba(0,0,0,.25);font:700 1.05rem/1 system-ui,sans-serif;backdrop-filter:blur(10px)}
.menu-product-reveal-control:focus-visible~.menu-product-reveal-divider::before{outline:3px solid rgba(255,255,255,.94);outline-offset:3px}
.menu-product-reveal-cue{position:absolute;z-index:2;left:50%;bottom:64px;max-width:calc(100% - 44px);transform:translateX(-50%);padding:9px 13px;border:1px solid rgba(255,255,255,.24);border-radius:999px;color:#fff;background:rgba(35,20,16,.68);box-shadow:0 8px 28px rgba(0,0,0,.2);font:800 .68rem/1.25 system-ui,sans-serif;letter-spacing:.02em;text-align:center;white-space:nowrap;pointer-events:none;backdrop-filter:blur(10px)}
.menu-product-visual[data-menu-reveal-active="true"] .menu-product-brand{z-index:4}
@media(max-width:720px){.menu-product-reveal-cue{bottom:54px;max-width:calc(100% - 36px);font-size:.64rem}.menu-product-reveal-divider::before{width:42px;height:42px}}
@media(prefers-reduced-motion:reduce){.menu-product-reveal-image{transition:none}}
`;
  document.head.append(style);
}

function bootReveal() {
  const sourceImage = document.querySelector("#menu-product-image");
  const visual = sourceImage?.closest(".menu-product-visual");
  if (!sourceImage || !visual || visual.dataset.menuRevealBooted === "true") return;
  visual.dataset.menuRevealBooted = "true";
  installRevealStyles();

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

  const activateReveal = (config) => {
    if (activeConfig?.id === config.id && revealImage.getAttribute("src")) {
      updatePosition();
      return;
    }

    activeConfig = config;
    const generation = ++revealGeneration;
    control.value = "88";
    revealImage.hidden = true;
    control.hidden = true;
    divider.hidden = true;
    cue.hidden = true;
    visual.removeAttribute("data-menu-reveal-active");
    updatePosition();

    revealImage.onload = () => {
      if (!activeConfig || generation !== revealGeneration) return;
      visual.dataset.menuRevealActive = "true";
      revealImage.hidden = false;
      control.hidden = false;
      divider.hidden = false;
      cue.hidden = false;
      updatePosition();
    };
    revealImage.onerror = () => {
      if (generation !== revealGeneration) return;
      hideReveal();
    };
    revealImage.src = new URL(config.revealImage, document.baseURI).href;
  };

  const syncProduct = () => {
    const config = resolveRevealConfig(sourceImage.currentSrc || sourceImage.src || sourceImage.getAttribute("src"));
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
