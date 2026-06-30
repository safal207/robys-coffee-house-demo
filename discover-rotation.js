"use strict";
const MAX_POSTER_BASE64_LENGTH = 2500000;
const sourceCache = new Map();
const localized = (tr, en, ru) => ({ tr, en, ru });
const posterSource = (id) => `src/pairings-data/final/${id}.webp.b64.txt`;
const posters = {
    "latte-nutella": {
        id: "latte-nutella",
        source: posterSource("latte-nutella"),
        alt: localized("Latte ve Nutellalı Kruvasan eşleşmesi posteri", "Latte and Nutella Croissant pairing poster", "Постер сочетания латте и круассана с Nutella")
    },
    "iced-san-sebastian": {
        id: "iced-san-sebastian",
        source: "src/pairings-data/approved/iced-san-sebastian-hq.png",
        alt: localized("Buzlu Latte ve San Sebastian eşleşmesi posteri", "Iced Latte and San Sebastian pairing poster", "Постер сочетания айс-латте и Сан-Себастьяна")
    },
    "filter-lotus": {
        id: "filter-lotus",
        source: posterSource("filter-lotus"),
        alt: localized("Filtre Kahve ve Lotus Cheesecake eşleşmesi posteri", "Filter Coffee and Lotus Cheesecake pairing poster", "Постер сочетания фильтр-кофе и чизкейка Lotus")
    },
    "relax-lotus": {
        id: "relax-lotus",
        source: posterSource("relax-lotus"),
        alt: localized("Relax Tea ve Lotus Cheesecake eşleşmesi posteri", "Relax Tea and Lotus Cheesecake pairing poster", "Постер сочетания Relax Tea и чизкейка Lotus")
    },
    "cool-lime-macaron": {
        id: "cool-lime-macaron",
        source: "src/pairings-data/final/cool-lime-macaron-hq.webp",
        alt: localized("Cool Lime ve Makaron eşleşmesi posteri", "Cool Lime and Macaron pairing poster", "Постер сочетания Cool Lime и макарона"),
        price: localized("Fiyat: 290 ₺", "Price: 290 ₺", "Цена: 290 ₺")
    }
};
function currentLanguage() {
    const value = document.documentElement.lang;
    return value === "en" || value === "ru" ? value : "tr";
}
function normalizeWebPBase64(payload) {
    const base64 = payload.trim();
    if (!base64 || base64.length > MAX_POSTER_BASE64_LENGTH) {
        throw new Error("Poster payload is empty or too large");
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error("Poster payload is not valid base64");
    }
    const remainder = base64.length % 4;
    if (remainder === 1)
        throw new Error("Poster payload has invalid base64 length");
    const padded = remainder === 0 ? base64 : `${base64}${"=".repeat(4 - remainder)}`;
    const signature = atob(padded.slice(0, 24));
    if (signature.slice(0, 4) !== "RIFF" || signature.slice(8, 12) !== "WEBP") {
        throw new Error("Poster payload is not a WebP image");
    }
    return padded;
}
function loadPoster(source) {
    if (/\.(?:png|webp)$/i.test(source))
        return Promise.resolve(source);
    const cached = sourceCache.get(source);
    if (cached)
        return cached;
    const request = fetch(source, { credentials: "same-origin", cache: "force-cache" })
        .then((response) => {
        if (!response.ok)
            throw new Error(`Poster request failed: ${response.status}`);
        return response.text();
    })
        .then((payload) => `data:image/webp;base64,${normalizeWebPBase64(payload)}`)
        .catch((error) => {
        sourceCache.delete(source);
        throw error;
    });
    sourceCache.set(source, request);
    return request;
}
function waitForImage(image) {
    if (image.complete) {
        return image.naturalWidth > 0
            ? Promise.resolve()
            : Promise.reject(new Error("Poster image failed to decode"));
    }
    return new Promise((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => reject(new Error("Poster image failed to decode")), { once: true });
    });
}
class PosterRenderer {
    constructor(root) {
        this.root = root;
        this.renderToken = 0;
    }
    async show(poster, isCurrent) {
        const token = ++this.renderToken;
        this.root.setAttribute("aria-busy", "true");
        try {
            const source = await loadPoster(poster.source);
            if (token !== this.renderToken || !isCurrent())
                return false;
            const image = document.createElement("img");
            image.src = source;
            image.alt = poster.alt[currentLanguage()];
            image.decoding = "async";
            image.loading = "eager";
            image.width = 320;
            image.height = 320;
            await waitForImage(image);
            if (token !== this.renderToken || !isCurrent())
                return false;
            const figure = document.createElement("figure");
            figure.className = "pairing-poster";
            figure.dataset.pairingPoster = poster.id;
            figure.append(image);
            if (poster.price) {
                const caption = document.createElement("figcaption");
                caption.id = `pairing-poster-price-${poster.id}`;
                caption.className = "pairing-poster-price";
                caption.textContent = poster.price[currentLanguage()];
                image.setAttribute("aria-describedby", caption.id);
                figure.append(caption);
            }
            this.root.replaceChildren(figure);
            this.root.removeAttribute("aria-busy");
            return true;
        }
        catch {
            sourceCache.delete(poster.source);
            if (token === this.renderToken && isCurrent()) {
                this.root.removeAttribute("aria-busy");
            }
            return false;
        }
    }
}
function initialize() {
    const root = document.querySelector("#pairing-products");
    if (!root)
        return;
    const renderer = new PosterRenderer(root);
    let renderQueued = false;
    const currentId = () => root.dataset.pairingId?.trim() ?? "";
    const renderCurrent = () => {
        renderQueued = false;
        const id = currentId();
        const poster = posters[id];
        if (!poster)
            return;
        const existing = root.querySelector("[data-pairing-poster]");
        if (existing?.dataset.pairingPoster === poster.id) {
            const image = existing.querySelector("img");
            if (image)
                image.alt = poster.alt[currentLanguage()];
            const caption = existing.querySelector(".pairing-poster-price");
            if (caption && poster.price)
                caption.textContent = poster.price[currentLanguage()];
            return;
        }
        void renderer.show(poster, () => currentId() === id);
    };
    const queueRender = () => {
        if (renderQueued)
            return;
        renderQueued = true;
        queueMicrotask(renderCurrent);
    };
    const observer = new MutationObserver(queueRender);
    observer.observe(root, {
        childList: true,
        attributes: true,
        attributeFilter: ["data-pairing-id"]
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    queueRender();
}
document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", initialize, { once: true })
    : initialize();
