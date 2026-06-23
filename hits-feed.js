const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const copy = {
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

const products = [
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

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function language() {
  const value = document.documentElement.lang || "tr";
  return copy[value] ? value : "tr";
}

function updateLanguage() {
  const section = q(".hits-section");
  if (!section) return;
  const currentLanguage = language();
  const localized = copy[currentLanguage];

  q("[data-hits-eyebrow]", section).textContent = localized.eyebrow;
  q("[data-hits-title]", section).textContent = localized.title;
  q("[data-hits-lead]", section).textContent = localized.lead;
  q("[data-hits-swipe]", section).textContent = localized.swipe;

  qa("[data-hits-product]", section).forEach((card) => {
    const product = products.find((item) => item.id === card.dataset.hitsProduct);
    if (!product) return;
    q("[data-hits-name]", card).textContent = product.names[currentLanguage];
    q("[data-hits-open]", card).textContent = localized.open;
    card.setAttribute("aria-label", `${product.names[currentLanguage]} — ${product.price} ₺`);
  });
}

function render() {
  if (q(".hits-section")) return;
  const visitSection = q("#visit");
  if (!visitSection) return;

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

  products.forEach((product) => {
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
  updateLanguage();
}

render();
new MutationObserver(updateLanguage).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"]
});
