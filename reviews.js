(() => {
  "use strict";

  const links = {
    google: "https://www.google.com/maps/search/?api=1&query=Roby%27s+Coffee+House+Gazipasa",
    yandex: "https://yandex.com.tr/maps/org/roby_s_coffee_house/194573272549/reviews/",
    instagram: "https://www.instagram.com/robyscoffeehouse/",
    source: "https://restaurantguru.com/Robys-Coffee-House-Gazipasa"
  };

  const copy = {
    tr: {
      eyebrow: "MİSAFİRLER NE DİYOR?",
      title: "Gerçek puanlar.<br /><em>İyi anların izi.</em>",
      googleVotes: "148 Google değerlendirmesi",
      yandexVotes: "Yandex puanı",
      publicSnapshot: "Açık profil özeti",
      openSource: "Kaynağı aç",
      reviewBy: "Google yorumu",
      ipekQuote: "Deniz beye selamlar.",
      food: "Yemek",
      service: "Hizmet",
      atmosphere: "Atmosfer",
      elenaTitle: "Hizmet ve atmosfer tam puan",
      elenaText: "Elena Chkalova, hizmeti ve atmosferi 5/5; yemeği 4/5 olarak değerlendirdi.",
      summaryTitle: "Konukların ortak yorumu",
      summaryText: "İyi kahve, güler yüzlü ekip, güzel hizmet, ferah iç mekân ve sakin atmosfer en sık öne çıkan noktalar.",
      yandexTitle: "Yandex'te yüksek puan",
      yandexText: "Roby's, açık listeleme özetinde Yandex kullanıcılarından 4,9/5 puan alıyor.",
      instagramTitle: "Instagram'da sevilen atmosfer",
      instagramText: "@robyscoffeehouse profilinde kahve, tatlılar ve mekânın sakin görsel dünyası öne çıkıyor.",
      profile: "Profili gör",
      note: "Puanlar açık profil anlık görüntüsünden alınmıştır ve zamanla değişebilir. Instagram kartı doğrudan müşteri alıntısı değil, profil içeriğinin dürüst bir özetidir."
    },
    en: {
      eyebrow: "WHAT GUESTS SAY",
      title: "Real ratings.<br /><em>Memorable moments.</em>",
      googleVotes: "148 Google ratings",
      yandexVotes: "Yandex rating",
      publicSnapshot: "Public listing snapshot",
      openSource: "Open source",
      reviewBy: "Google review",
      ipekQuote: "Greetings to Mr Deniz.",
      food: "Food",
      service: "Service",
      atmosphere: "Atmosphere",
      elenaTitle: "Top marks for service and atmosphere",
      elenaText: "Elena Chkalova rated service and atmosphere 5/5, and food 4/5.",
      summaryTitle: "What guests mention most",
      summaryText: "Good coffee, welcoming staff, good service, a beautiful interior and a calm atmosphere appear most often.",
      yandexTitle: "Highly rated on Yandex",
      yandexText: "Roby's carries a 4.9/5 Yandex score in the available public listing snapshot.",
      instagramTitle: "An atmosphere people follow",
      instagramText: "The @robyscoffeehouse feed highlights coffee, desserts and the café's calm visual identity.",
      profile: "View profile",
      note: "Ratings come from a public listing snapshot and may change. The Instagram card summarizes profile content and is not presented as a direct customer quote."
    },
    ru: {
      eyebrow: "ЧТО ГОВОРЯТ ГОСТИ",
      title: "Настоящие оценки.<br /><em>Тёплые впечатления.</em>",
      googleVotes: "148 оценок Google",
      yandexVotes: "оценка Яндекса",
      publicSnapshot: "Снимок открытой карточки",
      openSource: "Открыть источник",
      reviewBy: "Отзыв в Google",
      ipekQuote: "Привет Дениз-бею.",
      food: "Еда",
      service: "Сервис",
      atmosphere: "Атмосфера",
      elenaTitle: "Максимум за сервис и атмосферу",
      elenaText: "Elena Chkalova оценила сервис и атмосферу на 5/5, а еду — на 4/5.",
      summaryTitle: "Что гости отмечают чаще всего",
      summaryText: "Хороший кофе, приветливый персонал, качественное обслуживание, красивый интерьер и спокойная атмосфера.",
      yandexTitle: "Высокая оценка на Яндексе",
      yandexText: "В доступном снимке открытой карточки Roby's имеет рейтинг Яндекса 4,9/5.",
      instagramTitle: "Атмосфера, за которой следят",
      instagramText: "В ленте @robyscoffeehouse особенно заметны кофе, десерты и спокойный визуальный стиль кафе.",
      profile: "Открыть профиль",
      note: "Оценки взяты из открытого снимка карточки и могут меняться. Карточка Instagram — честное описание профиля, а не выдуманная цитата клиента."
    }
  };

  function currentCopy() {
    return copy[document.documentElement.lang] || copy.tr;
  }

  function createSection() {
    const t = currentCopy();
    const section = document.createElement("section");
    section.className = "guest-reviews";
    section.id = "reviews";
    section.innerHTML = `
      <div class="container reviews-wrap">
        <div class="reviews-head reveal">
          <div>
            <p class="eyebrow" data-review-copy="eyebrow">${t.eyebrow}</p>
            <h2 data-review-html="title">${t.title}</h2>
          </div>
          <div class="reviews-summary">
            <a class="rating-pill" href="${links.google}" target="_blank" rel="noopener noreferrer">
              <div class="rating-pill-top"><strong>4.7</strong><span class="rating-stars">★★★★★</span></div>
              <span data-review-copy="googleVotes">${t.googleVotes}</span>
            </a>
            <a class="rating-pill" href="${links.yandex}" target="_blank" rel="noopener noreferrer">
              <div class="rating-pill-top"><strong>4.9</strong><span class="rating-stars">★★★★★</span></div>
              <span data-review-copy="yandexVotes">${t.yandexVotes}</span>
            </a>
          </div>
        </div>

        <div class="reviews-grid">
          <article class="review-card reveal">
            <div>
              <div class="review-source">
                <div class="review-source-left">
                  <span class="review-source-icon">G</span>
                  <span class="review-source-name"><strong>İpek Yıldırım</strong><span data-review-copy="reviewBy">${t.reviewBy}</span></span>
                </div>
                <span class="review-rating">★★★★★</span>
              </div>
              <blockquote class="review-quote" data-review-copy="ipekQuote">${t.ipekQuote}</blockquote>
              <div class="review-metrics">
                <div class="review-metric"><strong>5/5</strong><span data-review-copy="food">${t.food}</span></div>
                <div class="review-metric"><strong>5/5</strong><span data-review-copy="service">${t.service}</span></div>
                <div class="review-metric"><strong>5/5</strong><span data-review-copy="atmosphere">${t.atmosphere}</span></div>
              </div>
            </div>
            <div class="review-footer"><span>Google</span><a href="${links.google}" target="_blank" rel="noopener noreferrer"><span data-review-copy="openSource">${t.openSource}</span> ↗</a></div>
          </article>

          <article class="review-card reveal">
            <div>
              <div class="review-source">
                <div class="review-source-left">
                  <span class="review-source-icon">G</span>
                  <span class="review-source-name"><strong>Elena Chkalova</strong><span data-review-copy="reviewBy">${t.reviewBy}</span></span>
                </div>
                <span class="review-rating">★★★★★</span>
              </div>
              <h3 class="review-quote small" data-review-copy="elenaTitle">${t.elenaTitle}</h3>
              <p data-review-copy="elenaText">${t.elenaText}</p>
              <div class="review-metrics">
                <div class="review-metric"><strong>4/5</strong><span data-review-copy="food">${t.food}</span></div>
                <div class="review-metric"><strong>5/5</strong><span data-review-copy="service">${t.service}</span></div>
                <div class="review-metric"><strong>5/5</strong><span data-review-copy="atmosphere">${t.atmosphere}</span></div>
              </div>
            </div>
            <div class="review-footer"><span>Google</span><a href="${links.google}" target="_blank" rel="noopener noreferrer"><span data-review-copy="openSource">${t.openSource}</span> ↗</a></div>
          </article>

          <article class="review-card reveal">
            <div>
              <span class="review-badge">Google · 4.7/5</span>
              <h3 class="review-quote small" data-review-copy="summaryTitle">${t.summaryTitle}</h3>
              <p data-review-copy="summaryText">${t.summaryText}</p>
            </div>
            <div class="review-footer"><span data-review-copy="publicSnapshot">${t.publicSnapshot}</span><a href="${links.source}" target="_blank" rel="noopener noreferrer"><span data-review-copy="openSource">${t.openSource}</span> ↗</a></div>
          </article>

          <article class="review-card reveal">
            <div>
              <div class="review-source">
                <div class="review-source-left"><span class="review-source-icon">Y</span><span class="review-source-name"><strong>Yandex Maps</strong><span>4.9/5</span></span></div>
                <span class="review-rating">★★★★★</span>
              </div>
              <h3 class="review-quote small" data-review-copy="yandexTitle">${t.yandexTitle}</h3>
              <p data-review-copy="yandexText">${t.yandexText}</p>
            </div>
            <div class="review-footer"><span data-review-copy="publicSnapshot">${t.publicSnapshot}</span><a href="${links.yandex}" target="_blank" rel="noopener noreferrer"><span data-review-copy="openSource">${t.openSource}</span> ↗</a></div>
          </article>

          <article class="review-card reveal">
            <div>
              <div class="review-source">
                <div class="review-source-left"><span class="review-source-icon">IG</span><span class="review-source-name"><strong>@robyscoffeehouse</strong><span>Instagram</span></span></div>
                <span class="review-rating">● ● ●</span>
              </div>
              <h3 class="review-quote small" data-review-copy="instagramTitle">${t.instagramTitle}</h3>
              <p data-review-copy="instagramText">${t.instagramText}</p>
            </div>
            <div class="review-footer"><span>Instagram</span><a href="${links.instagram}" target="_blank" rel="noopener noreferrer"><span data-review-copy="profile">${t.profile}</span> ↗</a></div>
          </article>
        </div>

        <p class="reviews-note" data-review-copy="note">${t.note}</p>
      </div>
    `;
    return section;
  }

  const section = createSection();
  const gallery = document.querySelector(".social-gallery");
  const quote = document.querySelector(".quote-section");
  if (gallery) gallery.insertAdjacentElement("afterend", section);
  else if (quote) quote.insertAdjacentElement("beforebegin", section);
  else document.querySelector("main")?.append(section);

  function updateLanguage() {
    const t = currentCopy();
    section.querySelectorAll("[data-review-copy]").forEach((element) => {
      const key = element.dataset.reviewCopy;
      if (t[key]) element.textContent = t[key];
    });
    section.querySelectorAll("[data-review-html]").forEach((element) => {
      const key = element.dataset.reviewHtml;
      if (t[key]) element.innerHTML = t[key];
    });
  }

  new MutationObserver(updateLanguage).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  section.querySelectorAll(".review-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--review-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--review-y", `${event.clientY - rect.top}px`);
    });
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
