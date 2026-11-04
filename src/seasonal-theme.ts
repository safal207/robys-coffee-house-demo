// Seasonal windows use the café's UTC+03:00 dates.
// Keep the ordinary site as the no-JavaScript and out-of-season experience.
(() => {
  const seasons = [
    { name: "halloween", startsAt: Date.parse("2026-10-15T00:00:00+03:00"), endsAt: Date.parse("2026-11-01T00:00:00+03:00") },
    { name: "christmas", startsAt: Date.parse("2026-12-01T00:00:00+03:00"), endsAt: Date.parse("2027-01-08T00:00:00+03:00") }
  ];
  let boundaryTimer: number | undefined;

  function synchronizeSeason() {
    window.clearTimeout(boundaryTimer);
    const now = Date.now();
    const upcoming = seasons.find(season => now < season.endsAt);
    const active = upcoming && now >= upcoming.startsAt ? upcoming : undefined;
    if (active) {
      document.documentElement.dataset.robysSeason = active.name;
    } else {
      delete document.documentElement.dataset.robysSeason;
    }
    const nextBoundary = active?.endsAt ?? upcoming?.startsAt;
    if (nextBoundary !== undefined) {
      boundaryTimer = window.setTimeout(synchronizeSeason, Math.min(nextBoundary - now, 2_147_483_647));
    }
  }

  synchronizeSeason();
  window.addEventListener("pageshow", synchronizeSeason);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) synchronizeSeason();
  });
})();
