(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const root = document.documentElement;

  const responsiveStyles = document.createElement("link");
  responsiveStyles.rel = "stylesheet";
  responsiveStyles.href = "responsive.css";
  document.head.appendChild(responsiveStyles);

  const galleryStyles = document.createElement("link");
  galleryStyles.rel = "stylesheet";
  galleryStyles.href = "gallery.css";
  document.head.appendChild(galleryStyles);

  const galleryScript = document.createElement("script");
  galleryScript.src = "gallery.js";
  galleryScript.defer = true;
  document.head.appendChild(galleryScript);

  const loader = document.createElement("div");
  loader.className = "page-loader";
  loader.setAttribute("aria-hidden", "true");
  loader.innerHTML = `
    <div class="loader-core">
      <div class="loader-ring"><span class="loader-r">R</span></div>
      <span class="loader-copy">Roby's Coffee House</span>
    </div>`;
  document.body.prepend(loader);

  const hideLoader = () => {
    window.setTimeout(() => loader.classList.add("is-hidden"), reducedMotion ? 0 : 480);
    window.setTimeout(() => loader.remove(), reducedMotion ? 50 : 1400);
  };

  if (document.readyState === "complete") hideLoader();
  else window.addEventListener("load", hideLoader, { once: true });
  window.setTimeout(hideLoader, 2200);

  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.prepend(progress);

  const hero = document.querySelector(".hero");
  if (hero) {
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

  let ticking = false;
  const heroImage = document.querySelector(".hero-image-wrap img");
  const heroCopy = document.querySelector(".hero-copy");

  const updateScrollEffects = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = pageHeight > 0 ? Math.min(scrollTop / pageHeight, 1) : 0;
    progress.style.transform = `scaleX(${ratio})`;

    if (!reducedMotion && window.innerWidth > 900) {
      if (heroImage) heroImage.style.transform = `translate3d(0, ${Math.min(scrollTop * 0.055, 42)}px, 0) scale(1.08)`;
      if (heroCopy) heroCopy.style.transform = `translate3d(0, ${Math.min(scrollTop * -0.018, 0)}px, 0)`;
    }

    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(updateScrollEffects);
      ticking = true;
    }
  }, { passive: true });
  updateScrollEffects();

  document.addEventListener("pointermove", (event) => {
    root.style.setProperty("--cursor-x", `${event.clientX}px`);
    root.style.setProperty("--cursor-y", `${event.clientY}px`);
  }, { passive: true });

  const interactiveCards = document.querySelectorAll(".feature-card, .menu-card, .visit-card, .map-card, .hero-image-wrap");
  interactiveCards.forEach((card) => {
    card.setAttribute("data-tilt", "");

    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      card.style.setProperty("--spot-x", `${x}px`);
      card.style.setProperty("--spot-y", `${y}px`);

      if (!finePointer || reducedMotion || window.innerWidth <= 900) return;
      const rotateY = ((x / rect.width) - 0.5) * 5.5;
      const rotateX = ((y / rect.height) - 0.5) * -5.5;
      const lift = card.classList.contains("hero-image-wrap") ? -4 : -7;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(${lift}px)`;
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
      card.style.removeProperty("--spot-x");
      card.style.removeProperty("--spot-y");
    });
  });

  if (finePointer && !reducedMotion) {
    const cursor = document.createElement("div");
    const dot = document.createElement("div");
    cursor.className = "premium-cursor";
    dot.className = "premium-cursor-dot";
    cursor.setAttribute("aria-hidden", "true");
    dot.setAttribute("aria-hidden", "true");
    document.body.append(cursor, dot);

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    document.addEventListener("pointermove", (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      dot.style.transform = `translate3d(${mouseX - 3}px, ${mouseY - 3}px, 0)`;
    }, { passive: true });

    const renderCursor = () => {
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;
      cursor.style.transform = `translate3d(${ringX - cursor.offsetWidth / 2}px, ${ringY - cursor.offsetHeight / 2}px, 0)`;
      window.requestAnimationFrame(renderCursor);
    };
    renderCursor();

    const hoverTargets = document.querySelectorAll("a, button, .feature-card, .menu-card, .map-card");
    hoverTargets.forEach((target) => {
      target.addEventListener("pointerenter", () => cursor.classList.add("is-active"));
      target.addEventListener("pointerleave", () => cursor.classList.remove("is-active"));
    });

    document.querySelectorAll(".button, .brand, .lang-button, .back-top").forEach((element) => {
      element.addEventListener("pointermove", (event) => {
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        element.style.transform = `translate3d(${x * 0.12}px, ${y * 0.12}px, 0)`;
      });
      element.addEventListener("pointerleave", () => {
        element.style.transform = "";
      });
    });
  }

  const quote = document.querySelector("blockquote");
  if (quote && "IntersectionObserver" in window && !reducedMotion) {
    const quoteObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.animate([
          { letterSpacing: "0.018em", opacity: 0.35 },
          { letterSpacing: "-0.03em", opacity: 1 }
        ], { duration: 1100, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.45 });
    quoteObserver.observe(quote);
  }
})();
