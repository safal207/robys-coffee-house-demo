const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const seoCopy = {
  tr: {
    title: "Roby's Coffee House | Gazipaşa",
    description: "Gazipaşa'da taze kahve, tatlılar ve sakin anlar. Roby's Coffee House'u keşfedin.",
    locale: "tr_TR"
  },
  en: {
    title: "Roby's Coffee House | Gazipaşa",
    description: "Fresh coffee, desserts and calm moments in Gazipaşa. Discover Roby's Coffee House.",
    locale: "en_US"
  },
  ru: {
    title: "Roby's Coffee House | Газипаша",
    description: "Свежий кофе, десерты и спокойная атмосфера в Газипаше. Откройте для себя Roby's Coffee House.",
    locale: "ru_RU"
  }
};

function updateSeoLanguage() {
  const language = document.documentElement.lang || "tr";
  const copy = seoCopy[language] || seoCopy.tr;
  document.title = copy.title;

  q('meta[name="description"]')?.setAttribute("content", copy.description);
  q('meta[property="og:title"]')?.setAttribute("content", copy.title);
  q('meta[property="og:description"]')?.setAttribute("content", copy.description);
  q('meta[property="og:locale"]')?.setAttribute("content", copy.locale);
}

function setupHeaderAndProgress() {
  const header = q(".site-header");
  const bar = q(".scroll-progress > span");
  if (!header && !bar) return;

  let scheduled = false;

  const update = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, scrollTop / maximum));

    header?.classList.toggle("is-scrolled", scrollTop > 24);
    if (bar) bar.style.transform = `scaleX(${progress})`;
    scheduled = false;
  };

  const requestUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
}

function setupActiveNavigation() {
  const links = qa('.main-nav a[href^="#"]');
  const entries = links
    .map((link) => ({ link, section: q(link.getAttribute("href")) }))
    .filter((item) => item.section);

  if (!entries.length) return;

  const setActive = (sectionId) => {
    entries.forEach(({ link, section }) => {
      const active = section.id === sectionId;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };

  if (!("IntersectionObserver" in window)) {
    const update = () => {
      const marker = window.scrollY + window.innerHeight * 0.36;
      const current = [...entries].reverse().find(({ section }) => section.offsetTop <= marker);
      setActive(current?.section.id || "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return;
  }

  const observer = new IntersectionObserver((observed) => {
    const visible = observed
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActive(visible.target.id);
  }, {
    threshold: [0, 0.15, 0.4],
    rootMargin: "-28% 0px -58% 0px"
  });

  entries.forEach(({ section }) => observer.observe(section));
}

function setupMobileCta() {
  const cta = q(".mobile-cta");
  const hero = q(".hero");
  const visit = q("#visit");
  const footer = q(".site-footer");
  if (!cta || !hero) return;

  let heroVisible = true;
  let visitVisible = false;
  let footerVisible = false;

  const render = () => {
    cta.classList.toggle("is-visible", !heroVisible && !visitVisible && !footerVisible);
  };

  if (!("IntersectionObserver" in window)) {
    const update = () => {
      const heroBottom = hero.offsetTop + hero.offsetHeight;
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;
      cta.classList.toggle("is-visible", window.scrollY > heroBottom * 0.72 && !nearBottom);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return;
  }

  const heroObserver = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting && entry.intersectionRatio > 0.18;
    render();
  }, { threshold: [0, 0.18, 0.5] });

  const lowerPageObserver = new IntersectionObserver((observed) => {
    observed.forEach((entry) => {
      if (entry.target === visit) visitVisible = entry.isIntersecting;
      if (entry.target === footer) footerVisible = entry.isIntersecting;
    });
    render();
  }, { threshold: 0.08 });

  heroObserver.observe(hero);
  if (visit) lowerPageObserver.observe(visit);
  if (footer) lowerPageObserver.observe(footer);
}

let initialized = false;
function initConversionPack() {
  if (initialized) return;
  initialized = true;

  setupHeaderAndProgress();
  setupActiveNavigation();
  setupMobileCta();
  updateSeoLanguage();

  new MutationObserver(updateSeoLanguage).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
}

window.addEventListener("scroll", initConversionPack, { once: true, passive: true });
window.addEventListener("resize", initConversionPack, { once: true, passive: true });
document.addEventListener("click", (event) => {
  if (event.target.closest(".lang-button,.menu-toggle,.main-nav a")) initConversionPack();
}, { capture: true });
