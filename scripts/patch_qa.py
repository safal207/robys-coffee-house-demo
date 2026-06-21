from pathlib import Path

path = Path(__file__).resolve().parents[1] / "qa.js"
text = path.read_text(encoding="utf-8")
old = '''  image.addEventListener("error", () => {
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.classList.add("is-fallback");
    image.closest(".gallery-card")?.classList.add("image-fallback");
    image.src = FALLBACK_IMAGE;
    window.robysAnalytics?.track?.("image_fallback", {
      placement: image.closest(".gallery-section") ? "gallery" : "page"
    });
  });'''
new = '''  image.addEventListener("error", () => {
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.classList.add("is-fallback");

    const productCard = image.closest(".price-card");
    if (productCard) {
      productCard.classList.add("image-fallback");
      image.hidden = true;
    } else {
      image.closest(".gallery-card")?.classList.add("image-fallback");
      image.src = FALLBACK_IMAGE;
    }

    window.robysAnalytics?.track?.("image_fallback", {
      placement: productCard ? "product" : image.closest(".gallery-section") ? "gallery" : "page"
    });
  });'''
if old not in text:
    raise RuntimeError("Product image fallback block was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
