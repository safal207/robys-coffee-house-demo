(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const desktopMotion = finePointer && !reducedMotion && window.innerWidth > 1100;

  function loadMapAssets() {
    if (document.querySelector('link[href="map.css"]')) return;

    const mapStyles = document.createElement("link");
    mapStyles.rel = "stylesheet";
    mapStyles.href = "map.css";
    document.head.appendChild(mapStyles);

    const mapScript = document.createElement("script");
    mapScript.src = "map.js";
    mapScript.defer = true;
    document.head.appendChild(mapScript);
  }

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(loadMapAssets, { timeout: 1200 });
  } else {
    window.setTimeout(loadMapAssets, 450);
  }

  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.prepend(progress);

  const hero = document.querySelector(".hero");
  if (hero && !document.querySelector(".premium-marquee")) {
    const marquee = document.createElement("section");
    marquee.className = "premium-marquee";
    marquee.setAttribute("aria-label", "Roby's Coffee House highlights");
    const words = `
      <span>FRESH COFFEE</span><i class="marquee-dot"></i>
      <span>SLOW MOMENTS</span><i class="marquee-dot"></i>
      <span>GAZİPAŞA</span><i class="marquee-dot"></i>
      <span>GOOD COMPANY</span><i class="marquee-dot"></i>
      <span>DAILY 09:00 — 00:00</span><i class="marquee-dot"></i>`;
    marquee.innerHTML = `<div class="marquee-track"><div class="marquee-group">${words}</div><div class="marquee-group" aria-hidden="true">${words}</div></div>`;
    hero.insertAdjacentElement("afterend", marquee);
  }

  const heroImage = document.querySelector(".hero-image-wrap img");
  const heroCopy = document.querySelector(".hero-copy");
  let scrollQueued = false;

  function updateScrollEffects() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${maxScroll > 0 ? Math.min(scrollTop / maxScroll, 1) : 0})`;

    if (desktopMotion && hero && scrollTop < hero.offsetHeight + 160) {
      if (heroImage) heroImage.style.transform = `translate3d(0,${Math.min(scrollTop * 0.045, 34)}px,0) scale(1.06)`;
      if (heroCopy) heroCopy.style.transform = `translate3d(0,${Math.max(scrollTop * -0.012, -18)}px,0)`;
    }

    scrollQueued = false;
  }

  window.addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(updateScrollEffects);
  }, { passive: true });
  updateScrollEffects();

  if (desktopMotion) {
    document.querySelectorAll(".feature-card, .menu-card, .visit-card, .map-card, .hero-image-wrap").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        card.style.setProperty("--spot-x", `${x}px`);
        card.style.setProperty("--spot-y", `${y}px`);
        const rotateY = ((x / rect.width) - 0.5) * 4;
        const rotateX = ((y / rect.height) - 0.5) * -4;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
      });

      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
        card.style.removeProperty("--spot-x");
        card.style.removeProperty("--spot-y");
      });
    });

    document.querySelectorAll(".button, .brand, .lang-button, .back-top").forEach((element) => {
      element.addEventListener("pointermove", (event) => {
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        element.style.transform = `translate3d(${x * 0.08}px,${y * 0.08}px,0)`;
      });
      element.addEventListener("pointerleave", () => {
        element.style.transform = "";
      });
    });
  }

  const quote = document.querySelector("blockquote");
  if (quote && "IntersectionObserver" in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries, instance) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.animate(
          [{ opacity: 0.45, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 700, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" }
        );
        instance.unobserve(entry.target);
      });
    }, { threshold: 0.35 });
    observer.observe(quote);
  }
})();
