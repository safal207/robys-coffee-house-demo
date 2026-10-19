import type { SmartChoiceLanguage } from "./catalog.js";
import { photoPreviews } from "./photo-previews.js";

export type PhotoPlacement = "catalog" | "selection" | "sweet" | "cart" | "confirmation" | "inspiration";

const COPY = {
  tr: { loading: "Fotoğraf yükleniyor", error: "Fotoğraf kullanılamıyor" },
  en: { loading: "Loading photo", error: "Photo unavailable" },
  ru: { loading: "Загружаем фото", error: "Фото недоступно" }
};
const SIZES: Record<PhotoPlacement, string> = {
  catalog: "(max-width: 480px) calc((100vw - 74px) / 2), (max-width: 850px) calc((100vw - 112px) / 3), 260px",
  selection: "(max-width: 600px) 96px, 112px",
  sweet: "(max-width: 600px) 48px, 64px",
  cart: "64px",
  confirmation: "56px",
  inspiration: "(max-width: 480px) calc((100vw - 40px) / 3), (max-width: 700px) 88px, 112px"
};
const retries = new WeakMap<HTMLSpanElement, () => void>();

/** Another explicit catalog action can retry a failed photo after connectivity returns. */
export function retryProductPhoto(frame: HTMLSpanElement): void {
  if (frame.dataset.photoState === "error") retries.get(frame)?.();
}

/** A reserved, informative photo frame never blocks the product's own controls. */
export function createProductPhoto(source: string, language: SmartChoiceLanguage, placement: PhotoPlacement,
  loading: "lazy" | "eager" = "eager"): HTMLSpanElement {
  const frame = document.createElement("span");
  frame.className = `qb-photo qb-photo--${placement}`;
  frame.dataset.photoState = "loading";
  // Product names are already visible and announced by the adjacent controls.
  frame.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.alt = "";
  image.width = image.height = 256;
  image.loading = loading;
  image.decoding = "async";
  const status = document.createElement("span");
  status.className = "qb-photo-status";
  status.textContent = COPY[language].loading;
  frame.append(image);
  const previewSource = photoPreviews[source];
  let preview: HTMLImageElement | undefined;
  if (previewSource) {
    preview = document.createElement("img");
    preview.className = "qb-photo-preview";
    preview.alt = "";
    preview.width = preview.height = 32;
    preview.loading = "eager";
    preview.src = previewSource;
    preview.hidden = false;
    frame.dataset.photoPreview = "true";
    // The tiny local preview shows the same product without a network round trip.
    // Keep the real photo first so consumers consistently target its load state.
    frame.append(preview);
    status.hidden = true;
  }
  frame.append(status);

  const original = `../${source}`;
  const responsive = source.match(/^src\/products\/(menu-v1|sets-v1|quick-choice-v1)\/(.+)\.webp$/);
  let originalAttempted = !responsive;
  retries.set(frame, () => {
    frame.dataset.photoState = "loading";
    status.textContent = COPY[language].loading;
    status.hidden = Boolean(preview);
    image.hidden = false;
    if (preview) preview.hidden = false;
    // A previous fallback already failed. One explicit action retries the
    // original once; errors never schedule another retry themselves.
    originalAttempted = true;
    image.srcset = "";
    image.src = original;
  });
  image.addEventListener("load", () => {
    if (!image.naturalWidth) return;
    frame.dataset.photoState = "loaded";
    status.hidden = true;
    image.hidden = false;
    if (preview) preview.hidden = true;
  });
  image.addEventListener("error", () => {
    if (!originalAttempted) {
      originalAttempted = true;
      image.srcset = "";
      image.src = original;
      return;
    }
    frame.dataset.photoState = "error";
    status.textContent = COPY[language].error;
    status.hidden = false;
    image.hidden = true;
    if (preview) preview.hidden = false;
  });
  if (responsive) {
    const base = `../src/products/quick-v1/${responsive[1]}/${responsive[2]}`;
    image.sizes = SIZES[placement];
    image.srcset = `${base}-256.webp 256w, ${base}-512.webp 512w`;
    image.src = `${base}-256.webp`;
  } else image.src = original;
  return frame;
}
