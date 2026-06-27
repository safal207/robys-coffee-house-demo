const copy = {
  tr: {
    shareEyebrow: "MENÜYÜ PAYLAŞ",
    shareTitle: "Menüyü arkadaşlarınla paylaş",
    shareLead: "Roby's menüsünü tek dokunuşla gönder veya sosyal hesaplarımızı aç.",
    shareButton: "Menüyü paylaş",
    instagramLink: "Instagram",
    mapsLink: "Google Maps ↗",
    bookingLead: "Masa ayırtmak için Instagram üzerinden bize yazın.",
    bookingButton: "Instagram'dan yaz · Masa ayırt",
    bookingNote: "Rezervasyon, kafenin Instagram üzerinden onayıyla kesinleşir.",
    shareText: "Roby's Coffee House Gazipaşa menüsüne göz at.",
    shared: "Paylaşım menüsü açıldı.",
    copied: "Menü bağlantısı kopyalandı.",
    copyPrompt: "Menü bağlantısını kopyalayın:"
  },
  en: {
    shareEyebrow: "SHARE THE MENU",
    shareTitle: "Share the menu with friends",
    shareLead: "Send Roby's menu in one tap or open our social pages.",
    shareButton: "Share menu",
    instagramLink: "Instagram",
    mapsLink: "Google Maps ↗",
    bookingLead: "Message us on Instagram to request a table.",
    bookingButton: "Message on Instagram · Request a table",
    bookingNote: "Your reservation is confirmed only after the café replies on Instagram.",
    shareText: "Take a look at the Roby's Coffee House Gazipaşa menu.",
    shared: "Share options opened.",
    copied: "Menu link copied.",
    copyPrompt: "Copy the menu link:"
  },
  ru: {
    shareEyebrow: "ПОДЕЛИТЬСЯ МЕНЮ",
    shareTitle: "Отправьте меню друзьям",
    shareLead: "Поделитесь меню Roby's одним касанием или откройте наши страницы.",
    shareButton: "Поделиться меню",
    instagramLink: "Instagram",
    mapsLink: "Google Карты ↗",
    bookingLead: "Чтобы забронировать столик, напишите нам в Instagram.",
    bookingButton: "Написать в Instagram · Забронировать столик",
    bookingNote: "Бронь считается подтверждённой после ответа кафе в Instagram.",
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
  document.querySelector("[data-instagram-booking]")?.setAttribute("aria-label", localized.bookingButton);
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
      await navigator.clipboard.writeText(canonical);
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
document.querySelector("[data-instagram-booking]")?.addEventListener("click", () => track("instagram_booking_click"));

document.querySelectorAll(".lang-button").forEach((button) => {
  button.addEventListener("click", () => window.requestAnimationFrame(applyCopy));
});

new MutationObserver(applyCopy).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["lang"]
});

applyCopy();
