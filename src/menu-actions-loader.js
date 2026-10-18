const copy = {
  tr: {
    failed: "Paylaşım açılamadı. Yeniden denemek için Menüyü paylaş düğmesine dokunun.",
    shared: "Paylaşım menüsü açıldı."
  },
  en: {
    failed: "Sharing could not load. Tap Share menu to try again.",
    shared: "Share options opened."
  },
  ru: {
    failed: "Не удалось открыть отправку меню. Нажми «Поделиться меню» ещё раз.",
    shared: "Открыто меню «Поделиться»."
  }
};

// The catalog owns activation-sensitive native sharing. This boundary only
// loads optional feedback/fallback code; a failed download must remain retryable.
export function createMenuActionsLoader({ loadModule, getLanguage, setStatus }) {
  let pending;
  let attempt = 0;
  const localized = () => copy[getLanguage()] ?? copy.tr;

  function load() {
    if (!pending) {
      pending = Promise.resolve().then(() => loadModule(attempt)).catch(error => {
        pending = undefined;
        attempt += 1;
        throw error;
      });
    }
    return pending;
  }

  async function prefetch() {
    try { await load(); } catch { /* The next explicit action retries. */ }
  }

  async function share(skipNative = false) {
    setStatus("");
    try {
      const actions = await load();
      await actions.shareMenu(null, { skipNative });
    } catch {
      setStatus(localized().failed);
    }
  }

  async function completeNativeShare() {
    // Native sharing has already succeeded. Optional analytics/feedback loading
    // must neither launch another share nor replace success with a load error.
    setStatus(localized().shared);
    try { await (await load()).completeNativeShare(); } catch { /* Keep the success feedback. */ }
  }

  async function track(action) {
    try { await (await load()).track(action); } catch { /* Analytics does not block navigation. */ }
  }

  return { load, prefetch, share, completeNativeShare, track };
}
