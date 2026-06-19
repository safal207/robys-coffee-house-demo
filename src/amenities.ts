type Lang = "tr" | "en" | "ru";

type AmenityCopy = {
  eyebrow: string;
  title: string;
  text: string;
  wifiTitle: string;
  wifiText: string;
  restroomTitle: string;
  restroomText: string;
  socketsTitle: string;
  socketsText: string;
  temperatureTitle: string;
  temperatureText: string;
  tablesTitle: string;
  tablesText: string;
};

const copies: Record<Lang, AmenityCopy> = {
  tr: {
    eyebrow: "ROBY'S KONFORU",
    title: "Rahat bir mola için<br><em>her şey hazır.</em>",
    text: "Bağlanın, şarj edin, buluşun ve rahatça çalışın.",
    wifiTitle: "Ücretsiz Wi‑Fi",
    wifiText: "Çalışmak, iletişim kurmak ve bağlantıda kalmak için.",
    restroomTitle: "Konforlu tuvalet",
    restroomText: "Misafirler için temiz, düzenli ve rahat bir alan.",
    socketsTitle: "Kullanışlı prizler",
    socketsText: "Telefon, tablet ve laptoplarınızı kolayca şarj edin.",
    temperatureTitle: "17–22 °C konfor",
    temperatureText: "Birinci ve ikinci katta klimalı, ferah bir ortam.",
    tablesTitle: "2 büyük toplantı masası",
    tablesText: "Toplantılar, ekip çalışması ve laptopla çalışma için."
  },
  en: {
    eyebrow: "COMFORT AT ROBY'S",
    title: "Everything is ready<br><em>for an easy pause.</em>",
    text: "Connect, recharge, meet and work comfortably.",
    wifiTitle: "Free Wi‑Fi",
    wifiText: "For work, messages and staying connected.",
    restroomTitle: "Comfortable restroom",
    restroomText: "A clean, tidy and convenient space for guests.",
    socketsTitle: "Convenient outlets",
    socketsText: "Charge phones, tablets and laptops with ease.",
    temperatureTitle: "Comfortable 17–22 °C",
    temperatureText: "Air conditioning on both the first and second floors.",
    tablesTitle: "2 large meeting tables",
    tablesText: "For meetings, teamwork and working on a laptop."
  },
  ru: {
    eyebrow: "КОМФОРТ В ROBY'S",
    title: "Всё готово<br><em>для комфортного отдыха.</em>",
    text: "Подключайтесь, заряжайте устройства, встречайтесь и работайте.",
    wifiTitle: "Бесплатный Wi‑Fi",
    wifiText: "Для работы, общения и стабильной связи.",
    restroomTitle: "Комфортная туалетная комната",
    restroomText: "Чистое, аккуратное и удобное пространство для гостей.",
    socketsTitle: "Удобные розетки",
    socketsText: "Для зарядки телефонов, планшетов и ноутбуков.",
    temperatureTitle: "Комфортные 17–22 °C",
    temperatureText: "Кондиционеры установлены на первом и втором этажах.",
    tablesTitle: "2 больших стола для встреч",
    tablesText: "Для переговоров, совместной работы и ноутбуков."
  }
};

const keys = [
  "eyebrow", "title", "text", "wifiTitle", "wifiText",
  "restroomTitle", "restroomText", "socketsTitle", "socketsText",
  "temperatureTitle", "temperatureText", "tablesTitle", "tablesText"
] as const;

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
    <section id="amenities" class="amenities-section amenities-visible" aria-labelledby="amenities-title">
      <div class="container amenities-wrap">
        <header class="amenities-head">
          <p class="eyebrow" data-amenity-copy="eyebrow"></p>
          <h2 id="amenities-title" data-amenity-copy="title"></h2>
          <p data-amenity-copy="text"></p>
        </header>
        <div class="amenities-grid">
          <article class="amenity-card">
            <span class="amenity-mark" aria-hidden="true">Wi‑Fi</span>
            <div><h3 data-amenity-copy="wifiTitle"></h3><p data-amenity-copy="wifiText"></p></div>
          </article>
          <article class="amenity-card">
            <span class="amenity-mark" aria-hidden="true">WC</span>
            <div><h3 data-amenity-copy="restroomTitle"></h3><p data-amenity-copy="restroomText"></p></div>
          </article>
          <article class="amenity-card">
            <span class="amenity-mark" aria-hidden="true">220V</span>
            <div><h3 data-amenity-copy="socketsTitle"></h3><p data-amenity-copy="socketsText"></p></div>
          </article>
          <article class="amenity-card amenity-card-feature">
            <span class="amenity-mark amenity-mark-temperature" aria-hidden="true">17–22°</span>
            <div><h3 data-amenity-copy="temperatureTitle"></h3><p data-amenity-copy="temperatureText"></p></div>
          </article>
          <article class="amenity-card amenity-card-feature">
            <span class="amenity-mark" aria-hidden="true">2×</span>
            <div><h3 data-amenity-copy="tablesTitle"></h3><p data-amenity-copy="tablesText"></p></div>
          </article>
        </div>
      </div>
    </section>`);

  renderAmenities();
  document.querySelectorAll<HTMLButtonElement>(".lang-button").forEach((button) => {
    button.addEventListener("click", () => window.setTimeout(renderAmenities, 0));
  });
  new MutationObserver(renderAmenities).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAmenities, { once: true });
} else {
  mountAmenities();
}
