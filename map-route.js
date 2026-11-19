"use strict";

// Local-only controller: request GPS solely after an explicit route button click.
// Never store or log a guest's position; send it only in the chosen Maps URL.
(() => {
  const routeLinks = Array.from(document.querySelectorAll("a[data-route-link]"));
  const fromMeButtons = Array.from(document.querySelectorAll("[data-route-from-me]"));
  const status = document.querySelector("#route-status");
  const reveal = document.querySelector("[data-map-reveal]");
  const frame = document.querySelector(".map-live-frame[data-map-src]");
  const messages = {
    tr: {
      locating: "Konumunuz belirleniyor…",
      opening: "Google Haritalar'da rotanız açılıyor…",
      denied: "Konum izni verilmedi. Başlangıç noktasını Google Haritalar'da seçin.",
      unavailable: "Konum alınamadı. Başlangıç noktasını Google Haritalar'da seçin."
    },
    en: {
      locating: "Finding your location…",
      opening: "Opening your route in Google Maps…",
      denied: "Location permission denied. Choose your starting point in Google Maps.",
      unavailable: "Location unavailable. Choose your starting point in Google Maps."
    },
    ru: {
      locating: "Определяем ваше местоположение…",
      opening: "Открываем маршрут в Google Картах…",
      denied: "Доступ к геолокации запрещён. Выберите начало маршрута в Google Картах.",
      unavailable: "Не удалось определить местоположение. Выберите начало маршрута в Google Картах."
    }
  };
  const locale = () => Object.hasOwn(messages, document.documentElement.lang)
    ? document.documentElement.lang : "tr";
  const say = key => { if (status) status.textContent = messages[locale()][key]; };
  const setBusy = busy => fromMeButtons.forEach(button => {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  });
  const routeHref = routeLinks[0]?.href;
  let pending = false;

  function openRoute(origin) {
    if (!routeHref) return;
    const url = new URL(routeHref);
    if (origin) url.searchParams.set("origin", origin);
    url.searchParams.set("dir_action", "navigate");
    window.location.assign(url.href);
  }

  function unavailable(reason) {
    pending = false;
    setBusy(false);
    say(reason);
    // The Maps directions form remains usable with a manually selected origin.
    openRoute();
  }

  fromMeButtons.forEach(button => {
    button.hidden = false;
    button.addEventListener("click", () => {
      if (pending || !routeHref) return;
      if (!window.isSecureContext || !navigator.geolocation?.getCurrentPosition) {
        unavailable("unavailable");
        return;
      }
      pending = true;
      setBusy(true);
      say("locating");
      try {
        navigator.geolocation.getCurrentPosition(position => {
          if (!pending) return;
          const latitude = position?.coords?.latitude;
          const longitude = position?.coords?.longitude;
          const accuracy = position?.coords?.accuracy;
          if (typeof latitude !== "number" || typeof longitude !== "number" ||
              !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
              Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
              !Number.isFinite(accuracy) || accuracy > 2000) {
            unavailable("unavailable");
            return;
          }
          pending = false;
          setBusy(false);
          say("opening");
          openRoute(latitude.toFixed(5) + "," + longitude.toFixed(5));
        }, error => {
          if (pending) unavailable(error?.code === 1 ? "denied" : "unavailable");
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
      } catch {
        unavailable("unavailable");
      }
    });
  });

  // The embedded third-party map is opt-in. Its iframe has no src until click.
  if (reveal && frame) {
    reveal.hidden = false;
    reveal.addEventListener("click", () => {
      let url;
      try { url = new URL(frame.dataset.mapSrc, window.location.href); }
      catch { return; }
      if (url.protocol !== "https:" || url.hostname !== "maps.google.com") return;
      frame.src = url.href;
      frame.closest(".map-card-live")?.classList.add("map-active");
      reveal.hidden = true;
    });
  }
})();
