function setupCommunityReel() {
  const card = document.querySelector<HTMLElement>("[data-community-reel-card]");
  const video = document.querySelector<HTMLVideoElement>("[data-community-reel-video]");
  const source = video?.querySelector<HTMLSourceElement>("source[data-src]");
  if (!card || !video || !source) return;

  let activated = false;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const activate = () => {
    if (!activated) {
      const sourceUrl = source.dataset.src;
      if (!sourceUrl) return;
      source.src = sourceUrl;
      video.load();
      activated = true;
    }
    if (!prefersReducedMotion.matches && !document.hidden) {
      void video.play().catch(() => undefined);
    }
  };

  const pause = () => {
    if (!video.paused) video.pause();
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) activate();
          else pause();
        }
      },
      { rootMargin: "320px 0px", threshold: 0.08 }
    );
    observer.observe(card);
  } else {
    activate();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else if (activated) activate();
  });

  prefersReducedMotion.addEventListener("change", () => {
    if (prefersReducedMotion.matches) pause();
    else if (activated) activate();
  });

  video.addEventListener("playing", () => {
    card.dataset.videoState = "playing";
  });
  video.addEventListener("pause", () => {
    card.dataset.videoState = "paused";
  });
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", setupCommunityReel, { once: true })
  : setupCommunityReel();
