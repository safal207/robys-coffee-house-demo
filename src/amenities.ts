type Lang = "tr" | "en" | "ru";

type AmenityCopy = {
  eyebrow: string;
  title: string;
  text: string;
  wifiTitle: string;
  wifiText: string;
  menuTitle: string;
  menuText: string;
  airTitle: string;
  airText: string;
  restroomTitle: string;
  restroomText: string;
  musicTitle: string;
  musicText: string;
  workTitle: string;
  workText: string;
  socketsTitle: string;
  socketsText: string;
};

const copies: Record<Lang, AmenityCopy> = {
  tr: {
    eyebrow: "KONFORLU BİR MOLA",
    title: "İhtiyacınız olan her şey.<br><em>Tek bir yerde.</em>",
    text: "Roby's'te kahvenizin yanında rahatlık da var.",
    wifiTitle: "Ücretsiz Wi‑Fi",
    wifiText: "Çalışmak ve bağlantıda kalmak için.",
    menuTitle: "Zengin menü",
    menuText: "Kahve, soğuk içecekler ve tatlı seçenekleri.",
    airTitle: "Klima",
    airText: "Sıcak günlerde serin ve rahat bir ortam.",
    restroomTitle: "Tuvalet",
    restroomText: "Misafirler için temiz ve düzenli alan.",
    musicTitle: "Keyifli müzik",
    musicText: "Sohbeti bölmeden atmosferi tamamlar.",
    workTitle: "Sabah buluşmaları ve çalışma",
    workText: "Sabah saatlerinde toplantı, laptopla çalışma ve sakin bir başlangıç için uygun.",
    socketsTitle: "Prizler",
    socketsText: "Laptop ve telefonlarınızı rahatça şarj edin."
  },
  en: {
    eyebrow: "COMFORT AT ROBY'S",
    title: "Everything you need<br><em>for an easy pause.</em>",
    text: "Coffee, comfort and a calm atmosphere in one place.",
    wifiTitle: "Free Wi‑Fi",
    wifiText: "For work, messages and staying connected.",
    menuTitle: "Full menu",
    menuText: "Coffee, cold drinks and sweet choices.",
    airTitle: "Air conditioning",
    airText: "A cool, comfortable space on warm days.",
    restroomTitle: "Restroom",
    restroomText: "A clean and convenient guest facility.",
    musicTitle: "Pleasant music",
    musicText: "A warm soundtrack that never gets in the way.",
    workTitle: "Morning meetings and work",
    workText: "A calm place for meetings, laptop work and a productive start to the day.",
    socketsTitle: "Power outlets",
    socketsText: "Convenient charging for laptops and phones."
  },
  ru: {
    eyebrow: "КОМФОРТ В ROBY'S",
    title: "Всё, что нужно<br><em>для приятной паузы.</em>",
    text: "Кофе, комфорт и спокойная атмосфера — в одном месте.",
    wifiTitle: "Бесплатный Wi‑Fi",
    wifiText: "Для работы, общения и стабильной связи.",
    menuTitle: "Разнообразное меню",
    menuText: "Кофе, холодные напитки и десерты.",
    airTitle: "Кондиционер",
    airText: "Прохлада и комфорт даже в жаркий день.",
    restroomTitle: "Туалетная комната",
    restroomText: "Чистое и удобное пространство для гостей.",
    musicTitle: "Приятная музыка",
    musicText: "Создаёт настроение и не мешает разговору.",
    workTitle: "Утренние встречи и работа",
    workText: "Удобное место для встреч, работы за ноутбуком и спокойного начала дня.",
    socketsTitle: "Удобные розетки",
    socketsText: "Для зарядки ноутбуков и телефонов рядом с местами для гостей."
  }
};

const keys = [
  "eyebrow", "title", "text", "wifiTitle", "wifiText", "menuTitle", "menuText",
  "airTitle", "airText", "restroomTitle", "restroomText", "musicTitle", "musicText",
  "workTitle", "workText", "socketsTitle", "socketsText"
] as const;

type CopyKey = typeof keys[number];

function getLanguage(): Lang {
  const htmlLang = document.documentElement.lang;
  if (htmlLang === "en" || htmlLang === "ru") return htmlLang;
  try {
    const stored = localStorage.getItem("robys-language");
    if (stored === "en" || stored === "ru") return stored;
  } catch {
    // Local storage is optional.
  }
  return "tr";
}

function renderAmenities(): void {
  const copy = copies[getLanguage()];
  keys.forEach((key) => {
    document.querySelectorAll<HTMLElement>(`[data-amenity-copy="${key}"]`).forEach((element) => {
      if (key === "title") element.innerHTML = copy[key];
      else element.textContent = copy[key];
    });
  });
}

function mountAmenities(): void {
  if (document.querySelector("#amenities")) return;
  const about = document.querySelector<HTMLElement>("#about");
  if (!about) return;

  about.insertAdjacentHTML("afterend", `
    <section id="amenities" class="amenities-section" aria-labelledby="amenities-title">
      <div class="container amenities-wrap">
        <header class="amenities-head reveal">
          <p class="eyebrow" data-amenity-copy="eyebrow"></p>
          <h2 id="amenities-title" data-amenity-copy="title"></h2>
          <p data-amenity-copy="text"></p>
        </header>
        <div class="amenities-grid">
          <article class="amenity-card reveal">
            <span class="amenity-mark" aria-hidden="true">Wi‑Fi</span>
            <div><h3 data-amenity-copy="wifiTitle"></h3><p data-amenity-copy="wifiText"></p></div>
          </article>
          <article class="amenity-card reveal">
            <span class="amenity-mark" aria-hidden="true">MENU</span>
            <div><h3 data-amenity-copy="menuTitle"></h3><p data-amenity-copy="menuText"></p></div>
          </article>
          <article class="amenity-card reveal">
            <span class="amenity-mark" aria-hidden="true">A/C</span>
            <div><h3 data-amenity-copy="airTitle"></h3><p data-amenity-copy="airText"></p></div>
          </article>
          <article class="amenity-card reveal">
            <span class="amenity-mark" aria-hidden="true">WC</span>
            <div><h3 data-amenity-copy="restroomTitle"></h3><p data-amenity-copy="restroomText"></p></div>
          </article>
          <article class="amenity-card reveal amenity-card-wide">
            <span class="amenity-mark" aria-hidden="true">09:00</span>
            <div><h3 data-amenity-copy="workTitle"></h3><p data-amenity-copy="workText"></p></div>
          </article>
          <article class="amenity-card reveal">
            <span class="amenity-mark" aria-hidden="true">220V</span>
            <div><h3 data-amenity-copy="socketsTitle"></h3><p data-amenity-copy="socketsText"></p></div>
          </article>
          <article class="amenity-card reveal">
            <span class="amenity-mark amenity-mark-music" aria-hidden="true">♪</span>
            <div><h3 data-amenity-copy="musicTitle"></h3><p data-amenity-copy="musicText"></p></div>
          </article>
        </div>
      </div>
    </section>`);

  renderAmenities();
  document.querySelectorAll<HTMLButtonElement>(".lang-button").forEach((button) => {
    button.addEventListener("click", () => window.setTimeout(renderAmenities, 0));
  });
  new MutationObserver(renderAmenities).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAmenities, { once: true });
} else {
  mountAmenities();
}
