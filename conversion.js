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

const hitsCopy = {
  tr: {
    eyebrow: "ROBY'S FAVORİLERİ",
    title: "Kafenin hitleri",
    lead: "Misafirlerimizin en çok sevdiği dört lezzet.",
    open: "Menüde aç",
    swipe: "Kaydırarak keşfedin"
  },
  en: {
    eyebrow: "ROBY'S FAVORITES",
    title: "Cafe favorites",
    lead: "Four of the most-loved choices from our menu.",
    open: "Open in menu",
    swipe: "Swipe to explore"
  },
  ru: {
    eyebrow: "ЛЮБИМЫЕ ПОЗИЦИИ ROBY'S",
    title: "Хиты кафе",
    lead: "Четыре позиции, которые особенно любят наши гости.",
    open: "Открыть в меню",
    swipe: "Листайте, чтобы посмотреть"
  }
};

const hitsProducts = [
  {
    id: "san-sebastian",
    image: "src/products/san-sebastian.webp",
    href: "menu.html#desserts",
    price: 190,
    names: {
      tr: "San Sebastian Cheesecake",
      en: "San Sebastian Cheesecake",
      ru: "Чизкейк San Sebastian"
    }
  },
  {
    id: "latte",
    image: "src/products/latte.webp",
    href: "menu.html#hot-coffee",
    price: 180,
    names: {
      tr: "Caffè Latte",
      en: "Caffè Latte",
      ru: "Латте"
    }
  },
  {
    id: "nutella-croissant",
    image: "src/products/nutella-croissant.webp",
    href: "menu.html#food",
    price: 170,
    names: {
      tr: "Nutellalı Kruvasan",
      en: "Nutella Croissant",
      ru: "Круассан с Nutella"
    }
  },
  {
    id: "lotus-cheesecake",
    image: "src/products/lotus-cheesecake.webp",
    href: "menu.html#desserts",
    price: 190,
    names: {
      tr: "Lotus Cheesecake",
      en: "Lotus Cheesecake",
      ru: "Чизкейк Lotus"
    }
  }
];

const HITS_STYLESHEET = "hits-feed.css?v=20260623-1";

function updateSeoLanguage() {
  const language = document.documentElement.lang || "tr";
  const copy = seoCopy[language] || seoCopy.tr;
  document.title = copy.title;

  q('meta[name="description"]')?.setAttribute("content", copy.description);
  q('meta[property="og:title"]')?.setAttribute("content", copy.title);
  q('meta[property="og:description"]')?.setAttribute("content", copy.description);
  q('meta[property="og:locale"]')?.setAttribute("content", copy.locale);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function currentHitsLanguage() {
  const language = document.documentElement.lang || "tr";
  return hitsCopy[language] ? language : "tr";
}

function updateHitsLanguage() {
  const section = q(".hits-section");
  if (!section) return;

  const language = currentHitsLanguage();
  const copy = hitsCopy[language];

  q("[data-hits-eyebrow]", section).textContent = copy.eyebrow;
  q("[data-hits-title]", section).textContent = copy.title;
  q("[data-hits-lead]", section).textContent = copy.lead;
  q("[data-hits-swipe]", section).textContent = copy.swipe;

  qa("[data-hits-product]", section).forEach((card) => {
    const product = hitsProducts.find((item) => item.id === card.dataset.hitsProduct);
    if (!product) return;
    q("[data-hits-name]", card).textContent = product.names[language];
    q("[data-hits-open]", card).textContent = copy.open;
    card.setAttribute("aria-label", `${product.names[language]} — ${product.price} ₺`);
  });
}

function setupHitsFeed() {
  if (q(".hits-section")) return;

  const visitSection = q("#visit");
  if (!visitSection) return;

  if (!q('link[data-hits-feed-styles]')) {
    const stylesheet = createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = HITS_STYLESHEET;
    stylesheet.dataset.hitsFeedStyles = "";
    document.head.append(stylesheet);
  }

  const section = createElement("section", "section hits-section");
  section.id = "hits";
  section.setAttribute("aria-labelledby", "hits-title");

  const container = createElement("div", "container hits-inner");
  const header = createElement("header", "hits-header");
  const heading = createElement("div", "hits-heading");
  const eyebrow = createElement("p", "eyebrow");
  eyebrow.dataset.hitsEyebrow = "";
  const title = createElement("h2");
  title.id = "hits-title";
  title.dataset.hitsTitle = "";
  const lead = createElement("p", "hits-lead");
  lead.dataset.hitsLead = "";
  const swipe = createElement("span", "hits-swipe");
  swipe.dataset.hitsSwipe = "";

  heading.append(eyebrow, title, lead);
  header.append(heading, swipe);

  const track = createElement("div", "hits-track");
  track.setAttribute("aria-label", "Roby's cafe favorites");

  hitsProducts.forEach((product) => {
    const card = createElement("a", "hits-card");
    card.href = product.href;
    card.dataset.hitsProduct = product.id;

    const media = createElement("div", "hits-card-media");
    const image = createElement("img");
    image.src = product.image;
    image.alt = product.names.tr;
    image.width = 640;
    image.height = 640;
    image.loading = "lazy";
    image.decoding = "async";
    const badge = createElement("span", "hits-badge", "HIT");
    media.append(image, badge);

    const body = createElement("div", "hits-card-body");
    const cardCopy = createElement("div", "hits-card-copy");
    const name = createElement("h3");
    name.dataset.hitsName = "";
    const open = createElement("span", "hits-card-link");
    open.dataset.hitsOpen = "";
    const price = createElement("strong", "hits-price", `${product.price} ₺`);

    cardCopy.append(name, open);
    body.append(cardCopy, price);
    card.append(media, body);
    track.append(card);
  });

  container.append(header, track);
  section.append(container);
  visitSection.before(section);
  updateHitsLanguage();
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
  const prices = q("#prices");
  const visit = q("#visit");
  const footer = q(".site-footer");
  if (!cta || !hero) return;

  let heroVisible = true;
  let pricesVisible = false;
  let visitVisible = false;
  let footerVisible = false;

  const render = () => {
    cta.classList.toggle(
      "is-visible",
      !heroVisible && !pricesVisible && !visitVisible && !footerVisible
    );
  };

  if (!("IntersectionObserver" in window)) {
    const update = () => {
      const heroBottom = hero.offsetTop + hero.offsetHeight;
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;
      const pricesRect = prices?.getBoundingClientRect();
      const catalogOnScreen = Boolean(
        pricesRect && pricesRect.bottom > 96 && pricesRect.top < window.innerHeight - 64
      );
      cta.classList.toggle(
        "is-visible",
        window.scrollY > heroBottom * 0.72 && !catalogOnScreen && !nearBottom
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return;
  }

  const heroObserver = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting && entry.intersectionRatio > 0.18;
    render();
  }, { threshold: [0, 0.18, 0.5] });

  const lowerPageObserver = new IntersectionObserver((observed) => {
    observed.forEach((entry) => {
      if (entry.target === prices) pricesVisible = entry.isIntersecting;
      if (entry.target === visit) visitVisible = entry.isIntersecting;
      if (entry.target === footer) footerVisible = entry.isIntersecting;
    });
    render();
  }, {
    threshold: 0.02,
    rootMargin: "-84px 0px -48px 0px"
  });

  heroObserver.observe(hero);
  if (prices) lowerPageObserver.observe(prices);
  if (visit) lowerPageObserver.observe(visit);
  if (footer) lowerPageObserver.observe(footer);
}

let initialized = false;
function initConversionPack() {
  if (initialized) return;
  initialized = true;

  setupHitsFeed();
  setupHeaderAndProgress();
  setupActiveNavigation();
  setupMobileCta();
  updateSeoLanguage();
  updateHitsLanguage();

  new MutationObserver(() => {
    updateSeoLanguage();
    updateHitsLanguage();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initConversionPack, { once: true });
} else {
  initConversionPack();
}

window.addEventListener("scroll", initConversionPack, { once: true, passive: true });
window.addEventListener("resize", initConversionPack, { once: true, passive: true });
document.addEventListener("click", (event) => {
  if (event.target.closest(".lang-button,.menu-toggle,.main-nav a")) initConversionPack();
}, { capture: true });
