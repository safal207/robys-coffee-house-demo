"use strict";
const ROTATION_INTERVAL_MS = 3000;
const SWIPE_THRESHOLD_PX = 42;
const galleries = {
    "01": { id: "latte-nutella" },
    "02": { id: "iced-san-sebastian" },
    "03": { id: "filter-lotus" },
    "04": { id: "relax-lotus" },
    "05": { id: "cool-lime-macaron" }
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
function cloneProductCards(root) {
    return [...root.children]
        .filter((node) => node instanceof HTMLElement && node.classList.contains("product-portrait"))
        .map((node) => node.cloneNode(true));
}
class MoodRotator {
    constructor(root) {
        this.root = root;
        this.slides = [];
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
            if (Math.abs(distance) >= SWIPE_THRESHOLD_PX) {
                this.setIndex(this.activeIndex + (distance < 0 ? 1 : -1), true);
            }
        });
        root.addEventListener("pointercancel", () => {
            this.pointerStartX = null;
        });
        document.addEventListener("visibilitychange", () => document.hidden ? this.stop() : this.start());
        this.reducedMotion.addEventListener("change", () => this.reducedMotion.matches ? this.stop() : this.start());
    }
    show(galleryData) {
        const sourceCards = cloneProductCards(this.root);
        if (sourceCards.length !== 2)
            return false;
        this.stop();
        this.activeIndex = 0;
        this.slides = [];
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
        ["warm", "fresh"].forEach((mood, index) => {
            const slide = document.createElement("div");
            slide.className = `pairing-artwork pairing-artwork--${mood}`;
            slide.classList.toggle("is-active", index === 0);
            slide.dataset.mood = mood;
            slide.setAttribute("aria-hidden", String(index !== 0));
            const composition = document.createElement("div");
            composition.className = "pairing-composition";
            sourceCards.forEach((card) => composition.append(card.cloneNode(true)));
            slide.append(composition);
            stage.append(slide);
            this.slides.push(slide);
        });
        const controls = document.createElement("div");
        controls.className = "pairing-gallery-dots";
        ["warm", "fresh"].forEach((mood, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "pairing-gallery-dot";
            button.classList.toggle("is-active", index === 0);
            button.setAttribute("aria-label", labels[language][mood]);
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
    setIndex(index, userInitiated) {
        if (this.slides.length < 2)
            return;
        this.activeIndex = (index + this.slides.length) % this.slides.length;
        this.slides.forEach((slide, slideIndex) => {
            const active = slideIndex === this.activeIndex;
            slide.classList.toggle("is-active", active);
            slide.setAttribute("aria-hidden", String(!active));
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
        if (this.timer !== null || this.slides.length < 2 || this.reducedMotion.matches || document.hidden)
            return;
        this.timer = window.setInterval(() => this.setIndex(this.activeIndex + 1, false), ROTATION_INTERVAL_MS);
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
    let renderQueued = false;
    const renderCurrent = () => {
        renderQueued = false;
        if (root.querySelector("[data-pairing-gallery]"))
            return;
        const gallery = galleries[number.textContent?.trim() ?? ""];
        if (!gallery)
            return;
        rotator.show(gallery);
    };
    const queueRender = () => {
        if (renderQueued)
            return;
        renderQueued = true;
        queueMicrotask(renderCurrent);
    };
    const observer = new MutationObserver(queueRender);
    observer.observe(root, { childList: true });
    observer.observe(number, { childList: true, characterData: true, subtree: true });
    queueRender();
}
document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", initialize, { once: true })
    : initialize();
