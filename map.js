(() => {
  "use strict";

  const oldMap = document.querySelector(".map-card");
  if (!oldMap || oldMap.classList.contains("real-map")) return;

  const coordinates = "36.266192, 32.298118";
  const embedUrl = "https://www.openstreetmap.org/export/embed.html?bbox=32.2925%2C36.2615%2C32.3037%2C36.2708&layer=mapnik&marker=36.266192%2C32.298118";
  const googleUrl = "https://www.google.com/maps/search/?api=1&query=Roby%27s+Coffee+House+Gazipasa";
  const yandexUrl = "https://yandex.com.tr/maps/org/roby_s_coffee_house/194573272549/";

  const copy = {
    tr: {
      show: "İnteraktif haritayı göster",
      note: "Harita yalnızca siz açtığınızda yüklenir.",
      title: "Roby's Coffee House haritası",
      google: "Google Maps",
      yandex: "Yandex Maps"
    },
    en: {
      show: "Show interactive map",
      note: "The map loads only when you open it.",
      title: "Map of Roby's Coffee House",
      google: "Google Maps",
      yandex: "Yandex Maps"
    },
    ru: {
      show: "Показать интерактивную карту",
      note: "Карта загружается только после нажатия.",
      title: "Карта Roby's Coffee House",
      google: "Google Карты",
      yandex: "Яндекс Карты"
    }
  };

  const map = document.createElement("div");
  map.className = "map-card real-map reveal";
  map.innerHTML = `
    <div class="map-preview">
      <button class="map-load-button" type="button">
        <span class="map-load-icon" aria-hidden="true"><span>R</span></span>
        <strong data-map-copy="show"></strong>
        <small data-map-copy="note"></small>
      </button>
    </div>
    <div class="map-frame-shell" hidden></div>
    <div class="map-info-panel">
      <div class="map-address">
        <span class="map-address-kicker">ROBY'S COFFEE HOUSE</span>
        <strong>Pazarcı Mah., Uğur Mumcu Cad.</strong>
        <small>Gazipaşa / Antalya · ${coordinates}</small>
      </div>
      <div class="map-route-actions">
        <a class="map-route-link" href="${googleUrl}" target="_blank" rel="noopener noreferrer">
          <span class="map-route-dot">G</span><span data-map-copy="google"></span>
        </a>
        <a class="map-route-link" href="${yandexUrl}" target="_blank" rel="noopener noreferrer">
          <span class="map-route-dot">Y</span><span data-map-copy="yandex"></span>
        </a>
      </div>
    </div>`;

  oldMap.replaceWith(map);

  const preview = map.querySelector(".map-preview");
  const frameShell = map.querySelector(".map-frame-shell");
  const loadButton = map.querySelector(".map-load-button");
  let loaded = false;

  function currentCopy() {
    return copy[document.documentElement.lang] || copy.tr;
  }

  function updateLanguage() {
    const dictionary = currentCopy();
    map.querySelectorAll("[data-map-copy]").forEach((element) => {
      const key = element.dataset.mapCopy;
      if (dictionary[key]) element.textContent = dictionary[key];
    });
    const iframe = frameShell.querySelector("iframe");
    if (iframe) iframe.title = dictionary.title;
  }

  function loadMap() {
    if (loaded) return;
    loaded = true;
    const dictionary = currentCopy();
    const iframe = document.createElement("iframe");
    iframe.src = embedUrl;
    iframe.title = dictionary.title;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.setAttribute("allowfullscreen", "");
    frameShell.appendChild(iframe);
    frameShell.hidden = false;
    preview.hidden = true;
    map.classList.add("is-loaded");
  }

  loadButton.addEventListener("click", loadMap);
  updateLanguage();
  new MutationObserver(updateLanguage).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
})();
