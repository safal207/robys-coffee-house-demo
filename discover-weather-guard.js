(() => {
  const queuedActions = [];
  let weatherPending = true;
  const originalFetch = window.fetch.bind(window);

  function finishWeatherLoad() {
    if (!weatherPending) return;
    weatherPending = false;
    for (const selector of queuedActions.splice(0)) {
      document.querySelector(selector)?.click();
    }
  }

  document.addEventListener("click", (event) => {
    if (!weatherPending) return;
    const button = event.target.closest("#next-pairing, #mark-discovered");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    queuedActions.push(`#${button.id}`);
  }, true);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url;
    if (!url?.startsWith("https://api.open-meteo.com/")) {
      return originalFetch(input, init);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await originalFetch(input, { ...init, signal: controller.signal });
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
})();
