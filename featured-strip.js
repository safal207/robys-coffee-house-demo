const viewport = document.querySelector("[data-featured-viewport]");
const cards = Array.from(document.querySelectorAll(".featured-card"));
const previousButton = document.querySelector("[data-featured-prev]");
const nextButton = document.querySelector("[data-featured-next]");
const pagination = document.querySelector("[data-featured-pagination]");

const productImages = [
  "src/products/nutella-croissant.webp",
  "src/products/san-sebastian.webp",
  "src/products/latte.webp",
  "src/products/lotus-cheesecake.webp"
];

cards.forEach((card, index) => {
  const image = card.querySelector("img");
  if (!image || !productImages[index]) return;
  image.src = productImages[index];
});

if (viewport && cards.length) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const dots = cards.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "featured-dot";
    dot.setAttribute("aria-label", `Go to featured item ${index + 1}`);
    dot.addEventListener("click", () => {
      cards[index]?.scrollIntoView({
        behavior: reducedMotion.matches ? "auto" : "smooth",
        block: "nearest",
        inline: "start"
      });
    });
    pagination?.append(dot);
    return dot;
  });

  function closestIndex() {
    const left = viewport.getBoundingClientRect().left;
    return cards.reduce((bestIndex, card, index) => {
      const bestDistance = Math.abs(cards[bestIndex].getBoundingClientRect().left - left);
      const distance = Math.abs(card.getBoundingClientRect().left - left);
      return distance < bestDistance ? index : bestIndex;
    }, 0);
  }

  function updateState() {
    const index = closestIndex();
    dots.forEach((dot, dotIndex) => dot.setAttribute("aria-current", String(dotIndex === index)));
    previousButton?.toggleAttribute("disabled", viewport.scrollLeft <= 4);
    nextButton?.toggleAttribute(
      "disabled",
      viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 4
    );
  }

  function step(direction) {
    const index = closestIndex();
    const targetIndex = Math.max(0, Math.min(cards.length - 1, index + direction));
    cards[targetIndex]?.scrollIntoView({
      behavior: reducedMotion.matches ? "auto" : "smooth",
      block: "nearest",
      inline: "start"
    });
  }

  previousButton?.addEventListener("click", () => step(-1));
  nextButton?.addEventListener("click", () => step(1));
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  });

  let frame = 0;
  viewport.addEventListener("scroll", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateState);
  }, { passive: true });
  window.addEventListener("resize", updateState, { passive: true });
  updateState();
}
