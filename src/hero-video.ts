const BRAND_BUILD = "perf-inline-20260619-12";
const VIDEO_SRC = `src/robys-hero-mobile-lite.mp4?v=${BRAND_BUILD}`;
const POSTER_SRC = `src/robys-hero-poster.jpg?v=${BRAND_BUILD}`;

function ensureBrandAssets(): void {
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = "#312b2a";
  document.documentElement.classList.add("napkin-brand");
}

function mountWordmarks(): void {
  document.querySelectorAll<HTMLElement>(".brand").forEach((brand) => {
    if (brand.querySelector(".cup-wordmark")) return;
    brand.innerHTML = `
      <span class="cup-wordmark" aria-hidden="true">
        <span class="cup-main">
          <span class="cup-r">R</span>
          <span class="cup-o"></span>
          <span class="cup-bys">BY</span>
          <span class="cup-apostrophe">’</span>
          <span class="cup-s">S</span>
        </span>
        <span class="cup-sub">COFFEE HOUSE</span>
        <span class="cup-tagline">· Fresh Coffee Point ·</span>
      </span>`;
  });
}

function setupDockVisibility(): void {
  const mediaQuery = window.matchMedia("(max-width: 620px)");
  const update = (): void => {
    if (!mediaQuery.matches) {
      document.body.classList.add("show-mobile-dock");
      return;
    }
    const threshold = Math.max(220, window.innerHeight * 0.58);
    document.body.classList.toggle("show-mobile-dock", window.scrollY > threshold);
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  mediaQuery.addEventListener?.("change", update);
}

function mountHeroVideo(): void {
  const hero = document.querySelector<HTMLElement>(".hero");
  const grid = hero?.querySelector<HTMLElement>(".hero-grid");
  const copy = hero?.querySelector<HTMLElement>(".hero-copy");
  const visual = hero?.querySelector<HTMLElement>(".hero-visual");
  if (!hero || !grid || !copy || hero.classList.contains("ruby-video-ready")) return;

  const media = document.createElement("div");
  media.className = "ruby-hero-media";
  const video = document.createElement("video");
  video.className = "ruby-hero-video";
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.poster = POSTER_SRC;
  video.setAttribute("aria-hidden", "true");

  const source = document.createElement("source");
  source.src = VIDEO_SRC;
  source.type = "video/mp4";
  video.append(source);

  const overlay = document.createElement("div");
  overlay.className = "ruby-hero-overlay";
  overlay.setAttribute("aria-hidden", "true");

  media.append(video, overlay, copy);
  grid.replaceChildren(media);
  visual?.remove();
  hero.classList.add("ruby-video-ready");

  video.addEventListener("loadeddata", () => hero.classList.add("video-loaded"), { once: true });
  video.addEventListener("error", () => {
    hero.classList.add("video-fallback");
    video.remove();
  }, { once: true });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.autoplay = false;
    video.pause();
  } else {
    void video.play().catch(() => hero.classList.add("video-paused"));
  }
}

export function startHeroVideo(): void {
  mountHeroVideo();
}

function initializeBrand(): void {
  ensureBrandAssets();
  mountWordmarks();
  setupDockVisibility();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeBrand, { once: true });
} else {
  initializeBrand();
}
