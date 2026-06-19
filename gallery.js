(() => {
  "use strict";

  const terraceImage = "https://images.openai.com/static-rsc-4/2cNHjajsW-WEGp3MgTtvlpE4f0w_Hd8v2cHCY7mfN3Q9H3imd6K9nqQT2CcvsUl_iEFedQRMg3V0LmeAhAXt2IVcI8ChhnljU9opiLQr7J9UToSHUObH4ddjzYjI8yNVCo27QrMdSHx3QS0wG-5gF0M_bTDF2xtyJg3q7pp2rwI?purpose=inline";

  const photos = [
    {
      src: terraceImage,
      key: "terrace",
      category: "OUTDOOR"
    },
    {
      src: "https://img02.restaurantguru.com/c34f-Restaurant-Robys-Coffee-House-interior.jpg",
      key: "interior",
      category: "INTERIOR"
    },
    {
      src: "https://img02.restaurantguru.com/c893-Restaurant-Robys-Coffee-House-food.jpg",
      key: "food",
      category: "FOOD"
    },
    {
      src: "https://img02.restaurantguru.com/cde4-Restaurant-Robys-Coffee-House-beverage.jpg",
      key: "drink",
      category: "COFFEE"
    },
    {
      src: "https://img02.restaurantguru.com/c188-Restaurant-Robys-Coffee-House-design.jpg",
      key: "design",
      category: "DETAILS"
    }
  ];

  const copy = {
    tr: {
      eyebrow: "ROBY'S FOTOĞRAF DUVARI",
      title: "Mekânı keşfet.<br /><em>Bir karede hissini yakala.</em>",
      text: "Roby's Coffee House'un açık web profillerinde paylaşılan atmosfer, kahve ve mekân görüntülerinden bir seçki.",
      terrace: "Teras",
      interior: "İç mekân",
      food: "Tatlı bir mola",
      drink: "Kahve anı",
      design: "Roby's detayları",
      note: "Demo için açık kaynaklı liste görselleri kullanılmıştır.",
      rights: "Yayın öncesi işletme onayı önerilir."
    },
    en: {
      eyebrow: "ROBY'S PHOTO WALL",
      title: "Discover the space.<br /><em>Feel it in every frame.</em>",
      text: "A curated selection of atmosphere, coffee and interior photos shared across Roby's public web profiles.",
      terrace: "The terrace",
      interior: "Inside Roby's",
      food: "A sweet break",
      drink: "Coffee moment",
      design: "Roby's details",
      note: "Public listing previews are used for this demo.",
      rights: "Business approval is recommended before launch."
    },
    ru: {
      eyebrow: "ФОТОЛЕНТА ROBY'S",
      title: "Посмотри пространство.<br /><em>Почувствуй атмосферу.</em>",
      text: "Подборка фотографий интерьера, кофе и атмосферы из открытых профилей Roby's Coffee House.",
      terrace: "Терраса",
      interior: "Интерьер",
      food: "Сладкая пауза",
      drink: "Кофейный момент",
      design: "Детали Roby's",
      note: "Для демо используются изображения из открытых карточек заведения.",
      rights: "Перед запуском желательно получить подтверждение владельца."
    }
  };

  const sources = [
    {
      name: "Instagram",
      short: "IG",
      href: "https://www.instagram.com/robyscoffeehouse/"
    },
    {
      name: "Google Maps",
      short: "G",
      href: "https://www.google.com/maps/search/?api=1&query=Roby%27s+Coffee+House+Gazipasa"
    },
    {
      name: "Yandex Maps",
      short: "Y",
      href: "https://yandex.com.tr/maps/org/roby_s_coffee_house/194573272549/gallery/"
    }
  ];

  const section = document.createElement("section");
  section.className = "social-gallery";
  section.id = "gallery";

  section.innerHTML = `
    <div class="container">
      <div class="gallery-head reveal">
        <div class="gallery-head-copy">
          <p class="eyebrow" data-gallery-copy="eyebrow"></p>
          <h2 data-gallery-html="title"></h2>
          <p data-gallery-copy="text"></p>
        </div>
        <div class="gallery-source-row" aria-label="Photo sources">
          ${sources.map((source) => `
            <a class="gallery-source" href="${source.href}" target="_blank" rel="noopener noreferrer">
              <span class="gallery-source-icon">${source.short}</span>
              <span>${source.name}</span>
              <span aria-hidden="true">↗</span>
            </a>`).join("")}
        </div>
      </div>

      <div class="gallery-grid">
        ${photos.map((photo, index) => `
          <button class="gallery-card reveal" type="button" data-gallery-index="${index}" aria-label="Open photo">
            <img src="${photo.src}" alt="Roby's Coffee House ${photo.key}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
            <span class="gallery-card-caption">
              <span class="gallery-card-copy">
                <strong data-gallery-photo="${photo.key}"></strong>
                <span>${photo.category}</span>
              </span>
              <span class="gallery-zoom" aria-hidden="true">↗</span>
            </span>
          </button>`).join("")}
      </div>

      <div class="gallery-note">
        <span data-gallery-copy="note"></span>
        <a href="https://restaurantguru.com/Robys-Coffee-House-Gazipasa" target="_blank" rel="noopener noreferrer" data-gallery-copy="rights"></a>
      </div>
    </div>
  `;

  const quoteSection = document.querySelector(".quote-section");
  if (quoteSection) quoteSection.insertAdjacentElement("beforebegin", section);
  else document.querySelector("main")?.append(section);

  const dialog = document.createElement("dialog");
  dialog.className = "gallery-lightbox";
  dialog.innerHTML = `
    <div class="gallery-lightbox-inner">
      <img alt="Roby's Coffee House enlarged view" />
      <div class="gallery-lightbox-bar">
        <div class="gallery-lightbox-title">
          <strong></strong>
          <span>Roby's Coffee House · Gazipaşa</span>
        </div>
        <button class="gallery-lightbox-close" type="button" aria-label="Close">×</button>
      </div>
    </div>
  `;
  document.body.append(dialog);

  const dialogImage = dialog.querySelector("img");
  const dialogTitle = dialog.querySelector("strong");
  const closeButton = dialog.querySelector(".gallery-lightbox-close");

  function languagePack() {
    return copy[document.documentElement.lang] || copy.tr;
  }

  function updateCopy() {
    const pack = languagePack();
    section.querySelectorAll("[data-gallery-copy]").forEach((element) => {
      const key = element.dataset.galleryCopy;
      if (pack[key]) element.textContent = pack[key];
    });
    section.querySelectorAll("[data-gallery-html]").forEach((element) => {
      const key = element.dataset.galleryHtml;
      if (pack[key]) element.innerHTML = pack[key];
    });
    section.querySelectorAll("[data-gallery-photo]").forEach((element) => {
      const key = element.dataset.galleryPhoto;
      if (pack[key]) element.textContent = pack[key];
    });
  }

  updateCopy();
  new MutationObserver(updateCopy).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  section.querySelectorAll(".gallery-card").forEach((card) => {
    const image = card.querySelector("img");
    image.addEventListener("error", () => {
      if (image.dataset.fallbackApplied) return;
      image.dataset.fallbackApplied = "true";
      image.src = terraceImage;
    });

    card.addEventListener("click", () => {
      const index = Number(card.dataset.galleryIndex);
      const photo = photos[index];
      const pack = languagePack();
      dialogImage.src = photo.src;
      dialogTitle.textContent = pack[photo.key] || "Roby's Coffee House";
      if (typeof dialog.showModal === "function") dialog.showModal();
    });
  });

  closeButton.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, instance) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        instance.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    section.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
  } else {
    section.querySelectorAll(".reveal").forEach((element) => element.classList.add("visible"));
  }
})();
