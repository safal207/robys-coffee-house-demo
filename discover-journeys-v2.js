const ACTIVE_PAIRING_IDS = ["cool-lime-macaron", "iced-san-sebastian"];
const text = (tr, en, ru) => ({ tr, en, ru });

function installDiscoverInteractionGuard() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const queuedActions = [];
  const supportedPairingIds = new Set(ACTIVE_PAIRING_IDS);
  let weatherPending = true;
  const originalFetch = window.fetch.bind(window);

  const finishWeatherLoad = () => {
    if (!weatherPending) return;
    weatherPending = false;
    for (const selector of queuedActions.splice(0)) {
      document.querySelector(selector)?.click();
    }
  };

  const synchronizePosterVisibility = () => {
    const root = document.querySelector("#pairing-products");
    const poster = root?.querySelector("[data-pairing-poster]");
    if (!root || !poster) return;
    const pairingId = root.dataset.pairingId?.trim() ?? "";
    poster.style.visibility = supportedPairingIds.has(pairingId) ? "visible" : "hidden";
    if (poster.style.visibility === "hidden") root.removeAttribute("aria-busy");
  };

  document.addEventListener("click", (event) => {
    if (!weatherPending) return;
    const button = event.target.closest("#next-pairing, #mark-discovered");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    queuedActions.push(`#${button.id}`);
  }, true);

  window.fetch = async (input, init = {}) => {
    const resolvedUrl = typeof input === "string"
      ? new URL(input, window.location.href)
      : input instanceof URL
        ? input
        : input instanceof Request
          ? new URL(input.url)
          : null;

    if (!resolvedUrl || resolvedUrl.origin !== "https://api.open-meteo.com") {
      return originalFetch(input, init);
    }

    const controller = typeof AbortController === "function"
      ? new AbortController()
      : null;
    const timeout = setTimeout(() => {
      controller?.abort();
      finishWeatherLoad();
    }, 8000);

    try {
      const response = await originalFetch(
        input,
        controller ? { ...init, signal: controller.signal } : init
      );
      if (!response.ok) {
        clearTimeout(timeout);
        setTimeout(finishWeatherLoad, 0);
        return response;
      }

      const originalJson = response.json.bind(response);
      response.json = async () => {
        try {
          return await originalJson();
        } finally {
          clearTimeout(timeout);
          setTimeout(finishWeatherLoad, 0);
        }
      };
      return response;
    } catch (error) {
      clearTimeout(timeout);
      setTimeout(finishWeatherLoad, 0);
      throw error;
    }
  };

  const root = document.querySelector("#pairing-products");
  if (root) {
    new MutationObserver(synchronizePosterVisibility).observe(root, {
      childList: true,
      attributes: true,
      attributeFilter: ["data-pairing-id"]
    });
    synchronizePosterVisibility();
  }
}

installDiscoverInteractionGuard();

const allContexts = [
  "morning:hot", "morning:mild", "morning:cool", "morning:rain", "morning:unavailable",
  "day:hot", "day:mild", "day:cool", "day:rain", "day:unavailable",
  "evening:hot", "evening:mild", "evening:cool", "evening:rain", "evening:unavailable",
  "late:hot", "late:mild", "late:cool", "late:rain", "late:unavailable"
];

export const journeys = [
  {
    id: "cool-lime-macaron",
    contexts: allContexts,
    primary: {
      name: "Cool Lime",
      category: "refreshers",
      emoji: "🍹"
    },
    companion: {
      name: "Macaron",
      category: "desserts",
      emoji: "◎"
    },
    title: text(
      "Cool Lime + Makaron",
      "Cool Lime + Macaron",
      "Cool Lime + макарон"
    ),
    reason: text(
      "Canlı lime ferahlığı, küçük ve tatlı makaronla dengelenir. Şimdilik Taste Journey'nin hafif ve parlak seçimi.",
      "Bright lime freshness is balanced by a small sweet macaron. For now, this is Taste Journey's light and vivid choice.",
      "Яркая свежесть лайма уравновешивается маленьким сладким макароном. Пока это лёгкий и яркий выбор Taste Journey."
    )
  },
  {
    id: "iced-san-sebastian",
    contexts: allContexts,
    primary: {
      name: "Iced Caffè Latte",
      category: "cold-coffee",
      image: "src/products/gallery-v5/iced-latte-828.webp",
      emoji: "🧊"
    },
    companion: {
      name: "San Sebastian Cheesecake",
      category: "desserts",
      image: "src/products/gallery-v5/san-sebastian-828.webp",
      emoji: "🍰"
    },
    title: text(
      "Buzlu Latte + San Sebastian",
      "Iced Latte + San Sebastian Cheesecake",
      "Айс-латте + чизкейк Сан-Себастьян"
    ),
    reason: text(
      "Serin kahve ferahlık verir; yoğun ve kremamsı cheesecake tadı yavaşlatır. Şimdilik Taste Journey'nin daha derin seçimi.",
      "The chilled coffee refreshes while the dense, creamy cheesecake slows the moment down. For now, this is Taste Journey's richer choice.",
      "Холодный кофе освежает, а плотный сливочный чизкейк замедляет момент. Пока это более насыщенный выбор Taste Journey."
    )
  }
];

export const imageAlt = {
  "Iced Caffè Latte": text("Roby's buzlu latte", "Roby's iced latte", "Айс-латте Roby's"),
  "San Sebastian Cheesecake": text(
    "San Sebastian cheesecake",
    "San Sebastian cheesecake",
    "Чизкейк Сан-Себастьян"
  )
};
