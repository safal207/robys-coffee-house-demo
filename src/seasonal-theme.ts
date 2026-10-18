// A small visual layer for Halloween 2026, using the café's UTC+03:00 dates.
// Keep the ordinary site as the no-JavaScript and out-of-season experience.
(() => {
  const startsAt = Date.parse("2026-10-15T00:00:00+03:00");
  const endsAt = Date.parse("2026-11-01T00:00:00+03:00");
  let boundaryTimer: number | undefined;

  function synchronizeSeason() {
    window.clearTimeout(boundaryTimer);
    const now = Date.now();
    if (now >= startsAt && now < endsAt) {
      document.documentElement.dataset.robysSeason = "halloween";
    } else {
      delete document.documentElement.dataset.robysSeason;
    }
    const nextBoundary = now < startsAt ? startsAt : now < endsAt ? endsAt : null;
    if (nextBoundary !== null) {
      boundaryTimer = window.setTimeout(synchronizeSeason, Math.min(nextBoundary - now, 2_147_483_647));
    }
  }

  synchronizeSeason();
  window.addEventListener("pageshow", synchronizeSeason);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) synchronizeSeason();
  });
})();
