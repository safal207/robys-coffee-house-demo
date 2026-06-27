"use strict";
const localized = (tr, en, ru) => ({ tr, en, ru });
const galleries = {
    "01": {
        id: "latte-nutella",
        artworks: [
            { mood: "warm", src: "src/pairings/latte-nutella-warm.webp", alt: localized("Sıcak Latte ve Nutellalı Kruvasan posteri", "Warm Latte and Nutella Croissant poster", "Тёплый постер: латте и круассан с Nutella") },
            { mood: "fresh", src: "src/pairings/latte-nutella-fresh.webp", alt: localized("Ferah Latte ve Nutellalı Kruvasan posteri", "Fresh Latte and Nutella Croissant poster", "Свежий постер: латте и круассан с Nutella") }
        ]
    },
    "02": {
        id: "iced-san-sebastian",
        artworks: [
            { mood: "warm", src: "src/pairings/iced-san-sebastian-warm.webp", alt: localized("Sıcak tonlarda Buzlu Latte ve San Sebastian posteri", "Warm Iced Latte and San Sebastian poster", "Тёплый постер: айс-латте и Сан-Себастьян") },
            { mood: "fresh", src: "src/pairings/iced-san-sebastian-fresh.webp", alt: localized("Ferah Buzlu Latte ve San Sebastian posteri", "Fresh Iced Latte and San Sebastian poster", "Свежий постер: айс-латте и Сан-Себастьян") }
        ]
    },
    "03": {
        id: "filter-lotus",
        artworks: [
            { mood: "warm", src: "src/pairings/filter-lotus-warm.webp", alt: localized("Sıcak Filtre Kahve ve Lotus Cheesecake posteri", "Warm Filter Coffee and Lotus Cheesecake poster", "Тёплый постер: фильтр-кофе и чизкейк Lotus") },
            { mood: "fresh", src: "src/pairings/filter-lotus-fresh.webp", alt: localized("Ferah Filtre Kahve ve Lotus Cheesecake posteri", "Fresh Filter Coffee and Lotus Cheesecake poster", "Свежий постер: фильтр-кофе и чизкейк Lotus") }
        ]
    },
    "04": {
        id: "relax-lotus",
        artworks: [
            { mood: "warm", src: "src/pairings/relax-lotus-warm.webp", alt: localized("Sıcak Relax Tea ve Lotus Cheesecake posteri", "Warm Relax Tea and Lotus Cheesecake poster", "Тёплый постер: Relax Tea и чизкейк Lotus") },
            { mood: "fresh", src: "src/pairings/relax-lotus-fresh.webp", alt: localized("Ferah Relax Tea ve Lotus Cheesecake posteri", "Fresh Relax Tea and Lotus Cheesecake poster", "Свежий постер: Relax Tea и чизкейк Lotus") }
        ]
    },
    "05": {
        id: "cool-lime-macaron",
        artworks: [
            { mood: "warm", src: "src/pairings/cool-lime-macaron-warm.webp", alt: localized("Sıcak tonlarda Cool Lime ve Makaron posteri", "Warm Cool Lime and Macaron poster", "Тёплый постер: Cool Lime и макарон") },
            { mood: "fresh", src: "src/pairings/cool-lime-macaron-fresh.webp", alt: localized("Ferah Cool Lime ve Makaron posteri", "Fresh Cool Lime and Macaron poster", "Свежий постер: Cool Lime и макарон") }
        ]
    }
};
const labels = {
    tr: { gallery: "Eşleşmenin sıcak ve ferah görünümleri", warm: "Sıcak atmosfer", fresh: "Ferah atmosfer" },
    en: { gallery: "Warm and fresh views of this pairing", warm: "Warm atmosphere", fresh: "Fresh atmosphere" },
    ru: { gallery: "Тёплый и свежий образы этого сочетания", warm: "Тёплая атмосфера", fresh: "Свежая атмосфера" }
};
function currentLanguage() {
    const value = document.documentElement.lang;
    return value === "en" || value === "ru" ? value : "tr";
}
class MoodRotator {
    constructor(root) {
        this.root = root;
        this.images = [];
        this.dots = [];
        this.activeIndex = 0;
        this.timer = null;
        this.pointerStartX = null;
        this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        root.addEventListener("pointerenter", () => this.stop());
        root.addEventListener("pointerleave", () => this.start());
        root.addEventListener("focusin", () => this.stop());
        root.addEventListener("focusout", (event) => {
            if (!root.contains(event.relatedTarget))
                this.start();
        });
        root.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
            event.preventDefault();
            this.setIndex(this.activeIndex + (event.key === "ArrowRight" ? 1 : -1), true);
        });
        root.addEventListener("pointerdown", (event) => {
            this.pointerStartX = event.clientX;
        });
        root.addEventListener("pointerup", (event) => {
            if (this.pointerStartX === null)
                return;
            const distance = event.clientX - this.pointerStartX;
            this.pointerStartX = null;
            if (Math.abs(distance) >= 42)
                this.setIndex(this.activeIndex + (distance < 0 ? 1 : -1), true);
        });
        document.addEventListener("visibilitychange", () => document.hidden ? this.stop() : this.start());
        this.reducedMotion.addEventListener("change", () => this.reducedMotion.matches ? this.stop() : this.start());
    }
    show(galleryData) {
        this.stop();
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
            image.src = artwork.src;
            image.alt = artwork.alt[language];
            image.decoding = "async";
            image.loading = index === 0 ? "eager" : "lazy";
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
    }
    setIndex(index, userInitiated) {
        if (this.images.length < 2)
            return;
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
    start() {
        if (this.timer !== null || this.images.length < 2 || this.reducedMotion.matches || document.hidden)
            return;
        this.timer = window.setInterval(() => this.setIndex(this.activeIndex + 1, false), 3000);
    }
    stop() {
        if (this.timer === null)
            return;
        window.clearInterval(this.timer);
        this.timer = null;
    }
}
function initialize() {
    const root = document.querySelector("#pairing-products");
    const number = document.querySelector("#pairing-number");
    if (!root || !number)
        return;
    const rotator = new MoodRotator(root);
    let rendering = false;
    const renderCurrent = () => {
        if (rendering || root.querySelector("[data-pairing-gallery]"))
            return;
        const gallery = galleries[number.textContent?.trim() ?? ""];
        if (!gallery)
            return;
        rendering = true;
        rotator.show(gallery);
        rendering = false;
    };
    const observer = new MutationObserver(renderCurrent);
    observer.observe(root, { childList: true });
    observer.observe(number, { childList: true, characterData: true, subtree: true });
    renderCurrent();
}
document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", initialize, { once: true })
    : initialize();
