const BRAND_BUILD = "cup-20260619-2";
const VIDEO_SRC = `src/robys-hero-mobile-lite.mp4?v=${BRAND_BUILD}`;
const POSTER_SRC = `src/robys-hero-poster.jpg?v=${BRAND_BUILD}`;

function ensureBrandAssets(): void {
  if (!document.querySelector<HTMLLinkElement>('link[href*="family=Montserrat"]')) {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300;1,400&display=swap";
    document.head.append(font);
  }

  if (!document.querySelector<HTMLLinkElement>('link[href*="brand-cup.css"]')) {
    const theme = document.createElement("link");
    theme.rel = "stylesheet";
    theme.href = `brand-cup.css?v=${BRAND_BUILD}`;
    document.head.append(theme);
  }

  if (!document.querySelector<HTMLLinkElement>('link[href*="mobile-polish.css"]')) {
    const polish = document.createElement("link");
    polish.rel = "stylesheet";
    polish.href = `mobile-polish.css?v=${BRAND_BUILD}`;
    document.head.append(polish);
  }

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = "#1d1d21";
  document.documentElement.classList.add("cup-brand");
}

function mountWordmarks(): void {
  document.querySelectorAll<HTMLElement>(".brand").forEach((brand) => {
    if (brand.querySelector(".cup-wordmark")) return;
    brand.innerHTML = `
      <span class="cup-wordmark" aria-hidden="true">
        <span class="cup-main">
          <span>R</span><span class="cup-o"></span><span>BY</span><span class="cup-apostrophe">’</span><span>S</span>
        </span>
        <span class="cup-sub">COFFEE HOUSE</span>
      </span>`;
  });
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
