const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const seoCopy = {
  tr: {
    title: "Roby's Coffee House | Gazipaşa",
    description: "Gazipaşa'da taze kahve, tatlılar ve sakin anlar. Roby's Coffee House'u keşfedin.",
    locale: "tr_TR"
  },
  en: {
    title: "Roby's Coffee House | Gazipaşa",
    description: "Fresh coffee, desserts and calm moments in Gazipaşa. Discover Roby's Coffee House.",
    locale: "en_US"
  },
  ru: {
    title: "Roby's Coffee House | Газипаша",
    description: "Свежий кофе, десерты и спокойная атмосфера в Газипаше. Откройте для себя Roby's Coffee House.",
    locale: "ru_RU"
  }
};

const androidStatusCopy = {
  tr: { preparing: "APK hazırlanıyor…", ready: "İndirme başladı", error: "İndirme hazırlanamadı" },
  en: { preparing: "Preparing APK…", ready: "Download started", error: "Download could not be prepared" },
  ru: { preparing: "Подготавливаем APK…", ready: "Скачивание началось", error: "Не удалось подготовить файл" }
};

const androidApkParts = Array.from(
  { length: 6 },
  (_, index) => `downloads/android-v1.1/part-${String(index + 1).padStart(2, "0")}.b64`
);
const androidApkBytes = 25231;
const androidApkSha256 = "f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6";
const androidApkFileName = "robys-coffee-house-v1.1.apk";

function updateSeoLanguage() {
  const language = document.documentElement.lang || "tr";
  const copy = seoCopy[language] || seoCopy.tr;
  document.title = copy.title;

  q('meta[name="description"]')?.setAttribute("content", copy.description);
  q('meta[property="og:title"]')?.setAttribute("content", copy.title);
  q('meta[property="og:description"]')?.setAttribute("content", copy.description);
  q('meta[property="og:locale"]')?.setAttribute("content", copy.locale);
}

function setupHeaderAndProgress() {
  const header = q(".site-header");
  const bar = q(".scroll-progress > span");
  if (!header && !bar) return;

  let scheduled = false;

  const update = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, scrollTop / maximum));

    header?.classList.toggle("is-scrolled", scrollTop > 24);
    if (bar) bar.style.transform = `scaleX(${progress})`;
    scheduled = false;
  };

  const requestUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
}

function setupActiveNavigation() {
  const links = qa('.main-nav a[href^="#"]');
  const entries = links
    .map((link) => ({ link, section: q(link.getAttribute("href")) }))
    .filter((item) => item.section);

  if (!entries.length) return;

  const setActive = (sectionId) => {
    entries.forEach(({ link, section }) => {
      const active = section.id === sectionId;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };

  if (!("IntersectionObserver" in window)) {
    const update = () => {
      const marker = window.scrollY + window.innerHeight * 0.36;
      const current = [...entries].reverse().find(({ section }) => section.offsetTop <= marker);
      setActive(current?.section.id || "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return;
  }

  const observer = new IntersectionObserver((observed) => {
    const visible = observed
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActive(visible.target.id);
  }, {
    threshold: [0, 0.15, 0.4],
    rootMargin: "-28% 0px -58% 0px"
  });

  entries.forEach(({ section }) => observer.observe(section));
}

function setupMobileCta() {
  const cta = q(".mobile-cta");
  const hero = q(".hero");
  const prices = q("#prices");
  const visit = q("#visit");
  const footer = q(".site-footer");
  if (!cta || !hero) return;

  let heroVisible = true;
  let pricesVisible = false;
  let visitVisible = false;
  let footerVisible = false;

  const render = () => {
    cta.classList.toggle(
      "is-visible",
      !heroVisible && !pricesVisible && !visitVisible && !footerVisible
    );
  };

  if (!("IntersectionObserver" in window)) {
    const update = () => {
      const heroBottom = hero.offsetTop + hero.offsetHeight;
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;
      const pricesRect = prices?.getBoundingClientRect();
      const catalogOnScreen = Boolean(
        pricesRect && pricesRect.bottom > 96 && pricesRect.top < window.innerHeight - 64
      );
      cta.classList.toggle(
        "is-visible",
        window.scrollY > heroBottom * 0.72 && !catalogOnScreen && !nearBottom
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return;
  }

  const heroObserver = new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting && entry.intersectionRatio > 0.18;
    render();
  }, { threshold: [0, 0.18, 0.5] });

  const lowerPageObserver = new IntersectionObserver((observed) => {
    observed.forEach((entry) => {
      if (entry.target === prices) pricesVisible = entry.isIntersecting;
      if (entry.target === visit) visitVisible = entry.isIntersecting;
      if (entry.target === footer) footerVisible = entry.isIntersecting;
    });
    render();
  }, {
    threshold: 0.02,
    rootMargin: "-84px 0px -48px 0px"
  });

  heroObserver.observe(hero);
  if (prices) lowerPageObserver.observe(prices);
  if (visit) lowerPageObserver.observe(visit);
  if (footer) lowerPageObserver.observe(footer);
}

function localizedElement(tagName, className, copy) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.dataset.localized = "";
  element.dataset.tr = copy.tr;
  element.dataset.en = copy.en;
  element.dataset.ru = copy.ru;
  element.textContent = copy.tr;
  return element;
}

function appendAndroidBrand(screen) {
  const brand = document.createElement("div");
  brand.className = "android-app-screen-brand";

  const mark = document.createElement("span");
  mark.className = "android-app-screen-mark";
  mark.textContent = "R";

  const name = document.createElement("span");
  name.className = "android-app-screen-name";
  const strong = document.createElement("strong");
  strong.textContent = "ROBY'S";
  const small = document.createElement("span");
  small.textContent = "COFFEE HOUSE";
  name.append(strong, small);
  brand.append(mark, name);
  screen.append(brand);
}

function createAndroidDownloadSection() {
  const section = document.createElement("section");
  section.className = "android-app-section";
  section.id = "android-app";
  section.setAttribute("aria-labelledby", "android-app-title");

  const container = document.createElement("div");
  container.className = "container";
  const card = document.createElement("div");
  card.className = "android-app-card";
  const copy = document.createElement("div");
  copy.className = "android-app-copy";

  copy.append(localizedElement("p", "eyebrow", {
    tr: "ROBY'S MOBİL",
    en: "ROBY'S MOBILE",
    ru: "ROBY'S В ТЕЛЕФОНЕ"
  }));

  const title = document.createElement("h2");
  title.id = "android-app-title";
  title.append(localizedElement("span", "", {
    tr: "Roby's cebinizde.",
    en: "Roby's in your pocket.",
    ru: "Roby's в вашем телефоне."
  }));
  title.append(document.createElement("br"));
  title.append(localizedElement("em", "", {
    tr: "Kahveye daha yakın.",
    en: "Closer to your coffee.",
    ru: "Ещё ближе к кофе."
  }));
  copy.append(title);

  copy.append(localizedElement("p", "android-app-description", {
    tr: "Menüye, yol tarifine ve güncel Roby's deneyimine tek dokunuşla ulaşın.",
    en: "Open the menu, directions and the latest Roby's experience with one tap.",
    ru: "Открывайте меню, маршрут и актуальный Roby's одним касанием."
  }));

  const actions = document.createElement("div");
  actions.className = "android-app-actions";
  const button = document.createElement("button");
  button.className = "android-download-button";
  button.type = "button";
  button.setAttribute("aria-describedby", "android-download-note android-download-status");

  const icon = document.createElement("span");
  icon.className = "android-download-icon";
  icon.setAttribute("aria-hidden", "true");
  const iconLine = document.createElement("span");
  iconLine.className = "android-download-line";
  icon.append(iconLine);
  button.append(icon, localizedElement("span", "android-download-label", {
    tr: "Android uygulamasını indir",
    en: "Download the Android app",
    ru: "Скачать приложение для Android"
  }));

  const meta = document.createElement("span");
  meta.className = "android-app-meta";
  meta.textContent = "APK · v1.1";
  actions.append(button, meta);
  copy.append(actions);

  const status = document.createElement("p");
  status.className = "android-download-status";
  status.id = "android-download-status";
  status.setAttribute("aria-live", "polite");
  copy.append(status);

  const note = localizedElement("p", "android-app-note", {
    tr: "İndirme doğrudan bu siteden başlar. Android, kurulum için tarayıcınıza izin vermenizi isteyebilir.",
    en: "The download starts directly from this site. Android may ask you to allow installation from your browser.",
    ru: "Скачивание начнётся прямо с сайта. Android может попросить разрешить установку из браузера."
  });
  note.id = "android-download-note";
  copy.append(note);

  const device = document.createElement("div");
  device.className = "android-app-device";
  device.setAttribute("aria-hidden", "true");
  const screen = document.createElement("div");
  screen.className = "android-app-screen";
  appendAndroidBrand(screen);

  const screenCopy = document.createElement("div");
  screenCopy.className = "android-app-screen-copy";
  const screenTitle = document.createElement("strong");
  screenTitle.append("Good coffee.", document.createElement("br"), "Calm moments.");
  const screenPlace = document.createElement("span");
  screenPlace.textContent = "Gazipaşa · Antalya";
  screenCopy.append(screenTitle, screenPlace);
  const pill = document.createElement("div");
  pill.className = "android-app-screen-pill";
  screen.append(screenCopy, pill);
  device.append(screen);

  card.append(copy, device);
  container.append(card);
  section.append(container);
  return { section, button, status };
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function downloadAndroidApk(button, status) {
  const language = document.documentElement.lang;
  const copy = androidStatusCopy[language] || androidStatusCopy.tr;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  status.textContent = copy.preparing;

  try {
    const responses = await Promise.all(androidApkParts.map((path) => fetch(path, { cache: "no-store" })));
    if (responses.some((response) => !response.ok)) throw new Error("APK part unavailable");
    const base64 = (await Promise.all(responses.map((response) => response.text()))).join("").replace(/\s+/g, "");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength !== androidApkBytes) throw new Error("APK size mismatch");
    const digest = await sha256Hex(bytes);
    if (digest && digest !== androidApkSha256) throw new Error("APK checksum mismatch");

    const blob = new Blob([bytes], { type: "application/vnd.android.package-archive" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = androidApkFileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    status.textContent = copy.ready;
  } catch {
    status.textContent = copy.error;
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function setupAndroidAppDownload() {
  if (q("#android-app")) return;
  const visit = q("#visit");
  if (!visit) return;

  if (!q('link[href^="android-app.css"]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "android-app.css?v=android-download-20260627-2";
    document.head.append(stylesheet);
  }

  const { section, button, status } = createAndroidDownloadSection();
  visit.before(section);
  button.addEventListener("click", () => void downloadAndroidApk(button, status));
}

let initialized = false;
function initConversionPack() {
  if (initialized) return;
  initialized = true;

  setupHeaderAndProgress();
  setupActiveNavigation();
  setupMobileCta();
  updateSeoLanguage();

  new MutationObserver(updateSeoLanguage).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"]
  });
}

window.addEventListener("scroll", initConversionPack, { once: true, passive: true });
window.addEventListener("resize", initConversionPack, { once: true, passive: true });
document.addEventListener("click", (event) => {
  if (event.target.closest(".lang-button,.menu-toggle,.main-nav a")) initConversionPack();
}, { capture: true });

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", setupAndroidAppDownload, { once: true })
  : setupAndroidAppDownload();
