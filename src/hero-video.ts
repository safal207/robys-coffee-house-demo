const BRAND_BUILD = "amenities-20260619-3";
const VIDEO_SRC = `src/robys-hero-mobile-lite.mp4?v=${BRAND_BUILD}`;
const POSTER_SRC = `src/robys-hero-poster.jpg?v=${BRAND_BUILD}`;

function ensureBrandAssets(): void {
  if (!document.querySelector<HTMLLinkElement>('link[href*="family=Montserrat"]')) {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Oswald:wght@300;400;500;600;700&display=swap";
    document.head.append(font);
  }

  ["brand-cup.css", "mobile-polish.css", "hero-mobile-fix.css", "napkin-style.css", "logo-video-tune.css", "amenities.css"].forEach((file) => {
    if (document.querySelector<HTMLLinkElement>(`link[href*="${file}"]`)) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `${file}?v=${BRAND_BUILD}`;
    document.head.append(stylesheet);
  });

  if (!document.querySelector<HTMLScriptElement>('script[src*="amenities.js"]')) {
    const amenities = document.createElement("script");
    amenities.type = "module";
    amenities.src = `amenities.js?v=${BRAND_BUILD}`;
    document.head.append(amenities);
  }

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

function setupDockVisibility(hero: HTMLElement): void {
  const mediaQuery = window.matchMedia("(max-width: 620px)");
  const update = (): void => {
    if (!mediaQuery.matches) {
      document.body.classList.add("show-mobile-dock");
      return;
    }
    const threshold = Math.max(220, hero.offsetHeight * 0.58);
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
  setupDockVisibility(hero);

  video.addEventListener("loadeddata", () => hero.classList.add("video-loaded"), { once: true });
  video.addEventListener("error", () => {
    hero.classList.add("video-fallback");
    video.remove();
  }, { once: true });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    video.autoplay = false;
    video.pause();
  } else {
    void video.play().catch(() => hero.classList.add("video-paused"));
  }
}

function initializeBrand(): void {
  mountWordmarks();
  mountHeroVideo();
}

ensureBrandAssets();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeBrand, { once: true });
} else {
  initializeBrand();
}
