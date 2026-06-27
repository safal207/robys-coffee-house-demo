type Language = "tr" | "en" | "ru";
type Mood = "warm" | "fresh";
type LocalizedText = Record<Language, string>;

interface Artwork {
  mood: Mood;
  source: string;
  alt: LocalizedText;
}

interface PairingGallery {
  id: string;
  artworks: readonly [Artwork, Artwork];
}

const localized = (tr: string, en: string, ru: string): LocalizedText => ({ tr, en, ru });
const artworkSource = (name: string): string => `src/pairings-data/${name}.webp.b64.txt`;

const galleries: Record<string, PairingGallery> = {
  "01": {
    id: "latte-nutella",
    artworks: [
      { mood: "warm", source: artworkSource("latte-nutella-warm"), alt: localized("Sıcak Latte ve Nutellalı Kruvasan posteri", "Warm Latte and Nutella Croissant poster", "Тёплый постер: латте и круассан с Nutella") },
      { mood: "fresh", source: artworkSource("latte-nutella-fresh"), alt: localized("Ferah Latte ve Nutellalı Kruvasan posteri", "Fresh Latte and Nutella Croissant poster", "Свежий постер: латте и круассан с Nutella") }
    ]
  },
  "02": {
    id: "iced-san-sebastian",
    artworks: [
      { mood: "warm", source: artworkSource("iced-san-sebastian-warm"), alt: localized("Sıcak tonlarda Buzlu Latte ve San Sebastian posteri", "Warm Iced Latte and San Sebastian poster", "Тёплый постер: айс-латте и Сан-Себастьян") },
      { mood: "fresh", source: artworkSource("iced-san-sebastian-fresh"), alt: localized("Ferah Buzlu Latte ve San Sebastian posteri", "Fresh Iced Latte and San Sebastian poster", "Свежий постер: айс-латте и Сан-Себастьян") }
    ]
  },
  "03": {
    id: "filter-lotus",
    artworks: [
      { mood: "warm", source: artworkSource("filter-lotus-warm"), alt: localized("Sıcak Filtre Kahve ve Lotus Cheesecake posteri", "Warm Filter Coffee and Lotus Cheesecake poster", "Тёплый постер: фильтр-кофе и чизкейк Lotus") },
      { mood: "fresh", source: artworkSource("filter-lotus-fresh"), alt: localized("Ferah Filtre Kahve ve Lotus Cheesecake posteri", "Fresh Filter Coffee and Lotus Cheesecake poster", "Свежий постер: фильтр-кофе и чизкейк Lotus") }
    ]
  },
  "04": {
    id: "relax-lotus",
    artworks: [
      { mood: "warm", source: artworkSource("relax-lotus-warm"), alt: localized("Sıcak Relax Tea ve Lotus Cheesecake posteri", "Warm Relax Tea and Lotus Cheesecake poster", "Тёплый постер: Relax Tea и чизкейк Lotus") },
      { mood: "fresh", source: artworkSource("relax-lotus-fresh"), alt: localized("Ferah Relax Tea ve Lotus Cheesecake posteri", "Fresh Relax Tea and Lotus Cheesecake poster", "Свежий постер: Relax Tea и чизкейк Lotus") }
    ]
  },
  "05": {
    id: "cool-lime-macaron",
    artworks: [
      { mood: "warm", source: artworkSource("cool-lime-macaron-warm"), alt: localized("Sıcak tonlarda Cool Lime ve Makaron posteri", "Warm Cool Lime and Macaron poster", "Тёплый постер: Cool Lime и макарон") },
      { mood: "fresh", source: artworkSource("cool-lime-macaron-fresh"), alt: localized("Ferah Cool Lime ve Makaron posteri", "Fresh Cool Lime and Macaron poster", "Свежий постер: Cool Lime и макарон") }
    ]
  }
};

const labels: Record<Language, { gallery: string; warm: string; fresh: string }> = {
  tr: { gallery: "Eşleşmenin sıcak ve ferah görünümleri", warm: "Sıcak atmosfer", fresh: "Ferah atmosfer" },
  en: { gallery: "Warm and fresh views of this pairing", warm: "Warm atmosphere", fresh: "Fresh atmosphere" },
  ru: { gallery: "Тёплый и свежий образы этого сочетания", warm: "Тёплая атмосфера", fresh: "Свежая атмосфера" }
};

const sourceCache = new Map<string, Promise<string>>();

function currentLanguage(): Language {
  const value = document.documentElement.lang;
  return value === "en" || value === "ru" ? value : "tr";
}

function loadArtwork(source: string): Promise<string> {
  const cached = sourceCache.get(source);
  if (cached) return cached;

  const request = fetch(source, { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`Artwork request failed: ${response.status}`);
      return response.text();
    })
    .then((payload) => {
      const base64 = payload.trim();
      if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("Artwork payload is invalid");
      return `data:image/webp;base64,${base64}`;
    })
    .catch((error: unknown) => {
      sourceCache.delete(source);
      throw error;
    });

  sourceCache.set(source, request);
  return request;
}

class MoodRotator {
  private images: HTMLImageElement[] = [];
  private dots: HTMLButtonElement[] = [];
  private activeIndex = 0;
  private timer: number | null = null;
  private pointerStartX: number | null = null;
  private renderToken = 0;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(private readonly root: HTMLElement) {
    root.addEventListener("pointerenter", () => this.stop());
    root.addEventListener("pointerleave", () => this.start());
    root.addEventListener("focusin", () => this.stop());
    root.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget as Node | null)) this.start();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      this.setIndex(this.activeIndex + (event.key === "ArrowRight" ? 1 : -1), true);
    });
    root.addEventListener("pointerdown", (event) => {
      this.pointerStartX = event.clientX;
    });
    root.addEventListener("pointerup", (event) => {
      if (this.pointerStartX === null) return;
      const distance = event.clientX - this.pointerStartX;
      this.pointerStartX = null;
      if (Math.abs(distance) >= 42) this.setIndex(this.activeIndex + (distance < 0 ? 1 : -1), true);
    });
    document.addEventListener("visibilitychange", () => document.hidden ? this.stop() : this.start());
    this.reducedMotion.addEventListener("change", () => this.reducedMotion.matches ? this.stop() : this.start());
  }

  async show(galleryData: PairingGallery, isCurrent: () => boolean): Promise<boolean> {
    const token = ++this.renderToken;
    this.stop();
    const sources = await Promise.all(galleryData.artworks.map((artwork) => loadArtwork(artwork.source)));
    if (token !== this.renderToken || !isCurrent()) return false;

    this.activeIndex = 0;
    this.images = [];
    this.dots = [];
    const language = currentLanguage();

    const gallery = document.createElement("div");
    gallery.className = "pairing-gallery";
    gallery.tabIndex = 0;
    gallery.dataset.pairingGallery = galleryData.id;
    gallery.setAttribute("role", "region");
    gallery.setAttribute("aria-roledescription", "carousel");
    gallery.setAttribute("aria-label", labels[language].gallery);

    const stage = document.createElement("div");
    stage.className = "pairing-gallery-stage";

    galleryData.artworks.forEach((artwork, index) => {
      const image = document.createElement("img");
      image.className = "pairing-artwork";
      image.classList.toggle("is-active", index === 0);
      image.src = sources[index];
      image.alt = artwork.alt[language];
      image.decoding = "async";
      image.setAttribute("aria-hidden", String(index !== 0));
      stage.append(image);
      this.images.push(image);
    });

    const controls = document.createElement("div");
    controls.className = "pairing-gallery-dots";
    galleryData.artworks.forEach((artwork, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pairing-gallery-dot";
      button.classList.toggle("is-active", index === 0);
      button.setAttribute("aria-label", artwork.mood === "warm" ? labels[language].warm : labels[language].fresh);
      button.setAttribute("aria-current", index === 0 ? "true" : "false");
      button.addEventListener("click", () => this.setIndex(index, true));
      controls.append(button);
      this.dots.push(button);
    });

    gallery.append(stage, controls);
    this.root.replaceChildren(gallery);
    this.start();
    return true;
  }

  private setIndex(index: number, userInitiated: boolean): void {
    if (this.images.length < 2) return;
    this.activeIndex = (index + this.images.length) % this.images.length;
    this.images.forEach((image, imageIndex) => {
      const active = imageIndex === this.activeIndex;
      image.classList.toggle("is-active", active);
      image.setAttribute("aria-hidden", String(!active));
    });
    this.dots.forEach((dot, dotIndex) => {
      const active = dotIndex === this.activeIndex;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
    if (userInitiated) {
      this.stop();
      this.start();
    }
  }

  private start(): void {
    if (this.timer !== null || this.images.length < 2 || this.reducedMotion.matches || document.hidden) return;
    this.timer = window.setInterval(() => this.setIndex(this.activeIndex + 1, false), 3000);
  }

  private stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }
}

function initialize(): void {
  const root = document.querySelector<HTMLElement>("#pairing-products");
  const number = document.querySelector<HTMLElement>("#pairing-number");
  if (!root || !number) return;

  const rotator = new MoodRotator(root);
  let rendering = false;

  const renderCurrent = async (): Promise<void> => {
    if (rendering || root.querySelector("[data-pairing-gallery]")) return;
    const numberKey = number.textContent?.trim() ?? "";
    const gallery = galleries[numberKey];
    if (!gallery) return;
    rendering = true;
    try {
      await rotator.show(gallery, () => (number.textContent?.trim() ?? "") === numberKey);
    } catch (error) {
      console.warn("Taste Journey artwork could not be loaded.", error);
    } finally {
      rendering = false;
      if (!root.querySelector("[data-pairing-gallery]") && galleries[number.textContent?.trim() ?? ""]) {
        queueMicrotask(() => void renderCurrent());
      }
    }
  };

  const observer = new MutationObserver(() => void renderCurrent());
  observer.observe(root, { childList: true });
  observer.observe(number, { childList: true, characterData: true, subtree: true });
  void renderCurrent();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", initialize, { once: true })
  : initialize();
