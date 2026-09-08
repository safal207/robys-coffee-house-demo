const TARGET = "/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp";
const image = document.querySelector("#menu-product-image");
let loading = false;

function isTarget() {
  if (!image) return false;
  const source = image.getAttribute("src") || image.src || image.currentSrc;
  try {
    return new URL(source, document.baseURI).pathname.endsWith(TARGET);
  } catch {
    return false;
  }
}

function maybeLoadReveal() {
  if (!isTarget() || loading) return;
  loading = true;
  void import("./menu-product-reveal-runtime.js?v=20260909-reveal-v2").catch(() => {
    loading = false;
  });
}

if (image) {
  new MutationObserver(maybeLoadReveal).observe(image, {
    attributes: true,
    attributeFilter: ["src"]
  });
  maybeLoadReveal();
}
