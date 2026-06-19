(() => {
  "use strict";

  const placeholder = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8efe9"/><stop offset="1" stop-color="#b9cdbf"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><circle cx="600" cy="390" r="120" fill="#173d32" opacity=".12"/><text x="600" y="430" text-anchor="middle" font-family="Georgia,serif" font-size="92" font-weight="700" fill="#173d32">ROBY'S</text><text x="600" y="515" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" letter-spacing="10" fill="#31584c">COFFEE HOUSE</text></svg>`);

  const photos = [
    ["https://images.openai.com/static-rsc-4/2cNHjajsW-WEGp3MgTtvlpE4f0w_Hd8v2cHCY7mfN3Q9H3imd6K9nqQT2CcvsUl_iEFedQRMg3V0LmeAhAXt2IVcI8ChhnljU9opiLQr7J9UToSHUObH4ddjzYjI8yNVCo27QrMdSHx3QS0wG-5gF0M_bTDF2xtyJg3q7pp2rwI?purpose=inline", "terrace", "OUTDOOR"],
    ["https://img02.restaurantguru.com/c34f-Restaurant-Robys-Coffee-House-interior.jpg", "interior", "INTERIOR"],
    ["https://img02.restaurantguru.com/c893-Restaurant-Robys-Coffee-House-food.jpg", "food", "FOOD"],
    ["https://img02.restaurantguru.com/cde4-Restaurant-Robys-Coffee-House-beverage.jpg", "drink", "COFFEE"],
    ["https://img02.restaurantguru.com/c188-Restaurant-Robys-Coffee-House-design.jpg", "design", "DETAILS"]
  ].map(([src, key, category]) => ({ src, key, category }));

  const copy = {
    tr: { eyebrow: "ROBY'S FOTOĞRAF DUVARI", title: "Mekânı keşfet.<br /><em>Bir karede hissini yakala.</em>", text: "Roby's Coffee House'un açık web profillerinde paylaşılan atmosfer, kahve ve mekân görüntülerinden bir seçki.", terrace: "Teras", interior: "İç mekân", food: "Tatlı bir mola", drink: "Kahve anı", design: "Roby's detayları", note: "Demo için açık kaynaklı liste görselleri kullanılmıştır.", rights: "Yayın öncesi işletme onayı önerilir." },
    en: { eyebrow: "ROBY'S PHOTO WALL", title: "Discover the space.<br /><em>Feel it in every frame.</em>", text: "A curated selection of atmosphere, coffee and interior photos shared across Roby's public web profiles.", terrace: "The terrace", interior: "Inside Roby's", food: "A sweet break", drink: "Coffee moment", design: "Roby's details", note: "Public listing previews are used for this demo.", rights: "Business approval is recommended before launch." },
    ru: { eyebrow: "ФОТОЛЕНТА ROBY'S", title: "Посмотри пространство.<br /><em>Почувствуй атмосферу.</em>", text: "Подборка фотографий интерьера, кофе и атмосферы из открытых профилей Roby's Coffee House.", terrace: "Терраса", interior: "Интерьер", food: "Сладкая пауза", drink: "Кофейный момент", design: "Детали Roby's", note: "Для демо используются изображения из открытых карточек заведения.", rights: "Перед запуском желательно получить подтверждение владельца." }
  };

  const sources = [
    ["Instagram", "IG", "https://www.instagram.com/robyscoffeehouse/"],
    ["Google Maps", "G", "https://www.google.com/maps/search/?api=1&query=Roby%27s+Coffee+House+Gazipasa"],
    ["Yandex Maps", "Y", "https://yandex.com.tr/maps/org/roby_s_coffee_house/194573272549/gallery/"]
  ];

  const section = document.createElement("section");
  section.className = "social-gallery";
  section.id = "gallery";
  section.innerHTML = `
    <div class="container">
      <div class="gallery-head reveal">
        <div class="gallery-head-copy"><p class="eyebrow" data-gallery-copy="eyebrow"></p><h2 data-gallery-html="title"></h2><p data-gallery-copy="text"></p></div>
        <div class="gallery-source-row" aria-label="Photo sources">${sources.map(([name, short, href]) => `<a class="gallery-source" href="${href}" target="_blank" rel="noopener noreferrer"><span class="gallery-source-icon">${short}</span><span>${name}</span><span aria-hidden="true">↗</span></a>`).join("")}</div>
      </div>
      <div class="gallery-grid">${photos.map((photo, index) => `<button class="gallery-card reveal" type="button" data-gallery-index="${index}" aria-label="Open photo"><img src="${photo.src}" alt="Roby's Coffee House ${photo.key}" width="1200" height="900" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer"/><span class="gallery-card-caption"><span class="gallery-card-copy"><strong data-gallery-photo="${photo.key}"></strong><span>${photo.category}</span></span><span class="gallery-zoom" aria-hidden="true">↗</span></span></button>`).join("")}</div>
      <div class="gallery-note"><span data-gallery-copy="note"></span><a href="https://restaurantguru.com/Robys-Coffee-House-Gazipasa" target="_blank" rel="noopener noreferrer" data-gallery-copy="rights"></a></div>
    </div>`;

  document.querySelector(".quote-section")?.insertAdjacentElement("beforebegin", section);

  const dialog = document.createElement("dialog");
  dialog.className = "gallery-lightbox";
  dialog.innerHTML = `<div class="gallery-lightbox-inner"><img alt="Roby's Coffee House enlarged view" width="1200" height="900"/><div class="gallery-lightbox-bar"><div class="gallery-lightbox-title"><strong></strong><span>Roby's Coffee House · Gazipaşa</span></div><button class="gallery-lightbox-close" type="button" aria-label="Close">×</button></div></div>`;
  document.body.append(dialog);

  const pack = () => copy[document.documentElement.lang] || copy.tr;
  const updateCopy = () => {
    const current = pack();
    section.querySelectorAll("[data-gallery-copy]").forEach((element) => { const key = element.dataset.galleryCopy; if (current[key]) element.textContent = current[key]; });
    section.querySelectorAll("[data-gallery-html]").forEach((element) => { const key = element.dataset.galleryHtml; if (current[key]) element.innerHTML = current[key]; });
    section.querySelectorAll("[data-gallery-photo]").forEach((element) => { const key = element.dataset.galleryPhoto; if (current[key]) element.textContent = current[key]; });
  };
  updateCopy();
  new MutationObserver(updateCopy).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  const dialogImage = dialog.querySelector("img");
  const dialogTitle = dialog.querySelector("strong");

  section.querySelectorAll(".gallery-card").forEach((card) => {
    const image = card.querySelector("img");
    image.addEventListener("error", () => { image.src = placeholder; image.removeAttribute("referrerpolicy"); }, { once: true });
    card.addEventListener("click", () => {
      const photo = photos[Number(card.dataset.galleryIndex)];
      dialogImage.src = image.currentSrc || image.src || placeholder;
      dialogTitle.textContent = pack()[photo.key] || "Roby's Coffee House";
      dialog.showModal?.();
    });
  });

  dialog.querySelector(".gallery-lightbox-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, instance) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("visible"); instance.unobserve(entry.target); } }), { threshold: 0.08, rootMargin: "120px 0px" });
    section.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
  } else {
    section.querySelectorAll(".reveal").forEach((element) => element.classList.add("visible"));
  }
})();
