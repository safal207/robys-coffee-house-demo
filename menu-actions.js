const copy = {
  tr: {
    shareEyebrow: "MENÜYÜ PAYLAŞ",
    shareTitle: "Roby's dünyalarını paylaş",
    shareLead: "Signature vitrinini ve kahve dünyalarını tek dokunuşla gönder.",
    shareButton: "Menüyü paylaş",
    instagramLink: "Instagram",
    mapsLink: "Google Maps ↗",
    bookingLead: "Seçimi bitirdiniz mi? Şimdi sipariş yolunu seçin.",
    takeawayButton: "WhatsApp ile paket sipariş",
    waiterButton: "Garsona göster",
    clubBenefit: "Roby's Club 🎉 · 5. ziyarette işletme ikramı",
    bookingNote: "Kulüp mekaniği işletme onayıyla netleştirilir.",
    shareText: "Roby's Coffee House Gazipaşa menüsüne göz at.",
    shared: "Paylaşım menüsü açıldı.",
    copied: "Menü bağlantısı kopyalandı.",
    copyPrompt: "Menü bağlantısını kopyalayın:"
  },
  en: {
    shareEyebrow: "SHARE THE MENU",
    shareTitle: "Share Roby's worlds",
    shareLead: "Send the signature showcase and coffee worlds in one tap.",
    shareButton: "Share menu",
    instagramLink: "Instagram",
    mapsLink: "Google Maps ↗",
    bookingLead: "Finished choosing? Pick how you want to order.",
    takeawayButton: "Order takeaway in WhatsApp",
    waiterButton: "Show to waiter",
    clubBenefit: "Roby's Club 🎉 · Treat from the café on the 5th visit",
    bookingNote: "Club mechanics should be confirmed by the business.",
    shareText: "Take a look at the Roby's Coffee House Gazipaşa menu.",
    shared: "Share options opened.",
    copied: "Menu link copied.",
    copyPrompt: "Copy the menu link:"
  },
  ru: {
    shareEyebrow: "ПОДЕЛИТЬСЯ МЕНЮ",
    shareTitle: "Отправьте миры Roby's",
    shareLead: "Витрина Signature и миры меню — одним касанием.",
    shareButton: "Поделиться меню",
    instagramLink: "Instagram",
    mapsLink: "Google Карты ↗",
    bookingLead: "Выбор сделан? Теперь выберите сценарий заказа.",
    takeawayButton: "Заказать с собой в WhatsApp",
    waiterButton: "Показать официанту",
    clubBenefit: "Roby's Club 🎉 · на 5-й визит угощение за счёт заведения",
    bookingNote: "Механику клуба нужно подтвердить у заведения перед запуском.",
    shareText: "Посмотрите меню Roby's Coffee House в Газипаше.",
    shared: "Открыто меню «Поделиться».",
    copied: "Ссылка на меню скопирована.",
    copyPrompt: "Скопируйте ссылку на меню:"
  }
};

const shareButton = document.querySelector("#menu-share-button");
const shareStatus = document.querySelector("#menu-share-status");
const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;

function currentLanguage() {
  const language = document.documentElement.lang;
  return Object.hasOwn(copy, language) ? language : "tr";
}

function applyCopy() {
  const language = currentLanguage();
  const localized = copy[language];

  document.querySelectorAll("[data-menu-action-copy]").forEach((element) => {
    const key = element.dataset.menuActionCopy;
    if (localized[key]) element.textContent = localized[key];
  });

  shareButton?.setAttribute("aria-label", localized.shareButton);
  document.querySelector("[data-whatsapp-order]")?.setAttribute("aria-label", localized.takeawayButton);
  document.querySelector("[data-waiter-order]")?.setAttribute("aria-label", localized.waiterButton);
  if (shareStatus) shareStatus.textContent = "";
}

function track(action) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: "robys_action",
    action,
    language: currentLanguage(),
    path: window.location.pathname,
    placement: "menu"
  });
}

function isAndroidWebView() {
  const userAgent = navigator.userAgent || "";
  return /Android/i.test(userAgent) && (/(?:^|[;\s])wv(?:[;)\s]|$)/i.test(userAgent) || /Version\/4\.0/i.test(userAgent));
}

function androidShareIntent(payload) {
  const text = `${payload.text}\n${payload.url}`;
  return [
    "intent:#Intent",
    "action=android.intent.action.SEND",
    "type=text/plain",
    `S.android.intent.extra.SUBJECT=${encodeURIComponent(payload.title)}`,
    `S.android.intent.extra.TEXT=${encodeURIComponent(text)}`,
    "end"
  ].join(";");
}

async function shareMenu(event) {
  event?.preventDefault();
  if (shareStatus) shareStatus.textContent = "";

  const localized = copy[currentLanguage()];
  const payload = {
    title: document.title,
    text: localized.shareText,
    url: canonical
  };

  try {
    if (isAndroidWebView()) {
      window.location.assign(androidShareIntent(payload));
      track("menu_share_android_intent");
      return;
    }

    if (typeof navigator.share === "function") {
      await navigator.share(payload);
      if (shareStatus) shareStatus.textContent = localized.shared;
      track("menu_share");
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${localized.shareText}\n${canonical}`);
      if (shareStatus) shareStatus.textContent = localized.copied;
      track("menu_link_copy");
      return;
    }

    window.prompt(localized.copyPrompt, canonical);
    track("menu_link_copy_prompt");
  } catch (error) {
    if (error?.name === "AbortError") return;
    window.prompt(localized.copyPrompt, canonical);
  }
}

shareButton?.addEventListener("click", shareMenu);
document.querySelector("[data-whatsapp-order]")?.addEventListener("click", () => track("whatsapp_takeaway_click"));
document.querySelector("[data-waiter-order]")?.addEventListener("click", () => track("waiter_show_click"));

document.querySelectorAll(".lang-button").forEach((button) => {
  button.addEventListener("click", () => window.requestAnimationFrame(applyCopy));
});

new MutationObserver(applyCopy).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"]
});

applyCopy();