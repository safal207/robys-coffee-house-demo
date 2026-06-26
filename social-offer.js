"use strict";
const SOCIAL_OFFER = {
    id: "lotus-latte-340",
    active: true,
    title: {
        tr: "Bugün Roby's'de",
        en: "Today at Roby's",
        ru: "Сегодня в Roby’s"
    },
    product: {
        tr: "Lotus Cheesecake + Latte",
        en: "Lotus Cheesecake + Latte",
        ru: "Lotus Cheesecake + Latte"
    },
    socialPrompt: {
        tr: "Instagram'da bizi etiketle",
        en: "Tag us on Instagram",
        ru: "Отметь нас в Instagram"
    },
    buttonLabel: {
        tr: "Instagram",
        en: "Instagram",
        ru: "Instagram"
    },
    price: 340,
    currency: "₺",
    href: "https://www.instagram.com/robyscoffeehouse/"
};
function localizedElement(tagName, className, copy) {
    const element = document.createElement(tagName);
    element.className = className;
    element.dataset.localized = "";
    element.dataset.tr = copy.tr;
    element.dataset.en = copy.en;
    element.dataset.ru = copy.ru;
    element.textContent = copy.tr;
    return element;
}
function renderSocialOffer() {
    const root = document.querySelector("#daily-offer");
    if (!root)
        return;
    if (!SOCIAL_OFFER.active) {
        root.remove();
        return;
    }
    const card = document.createElement("div");
    card.className = "container social-offer-card";
    card.dataset.offerId = SOCIAL_OFFER.id;
    const mark = document.createElement("span");
    mark.className = "social-offer-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "R";
    const copy = document.createElement("div");
    copy.className = "social-offer-copy";
    const title = localizedElement("h2", "social-offer-title", SOCIAL_OFFER.title);
    title.id = "daily-offer-title";
    const deal = document.createElement("p");
    deal.className = "social-offer-deal";
    const product = localizedElement("span", "social-offer-product", SOCIAL_OFFER.product);
    const separator = document.createTextNode(" · ");
    const price = document.createElement("strong");
    price.className = "social-offer-price";
    price.textContent = `${SOCIAL_OFFER.price} ${SOCIAL_OFFER.currency}`;
    deal.append(product, separator, price);
    copy.append(title, deal);
    const socialLink = document.createElement("a");
    socialLink.className = "social-offer-social";
    socialLink.href = SOCIAL_OFFER.href;
    socialLink.target = "_blank";
    socialLink.rel = "noopener noreferrer";
    const socialIcon = document.createElement("span");
    socialIcon.className = "social-offer-instagram-icon";
    socialIcon.setAttribute("aria-hidden", "true");
    const socialText = localizedElement("span", "social-offer-social-text", SOCIAL_OFFER.socialPrompt);
    socialLink.append(socialIcon, socialText);
    const button = document.createElement("a");
    button.className = "social-offer-button";
    button.href = SOCIAL_OFFER.href;
    button.target = "_blank";
    button.rel = "noopener noreferrer";
    const buttonText = localizedElement("span", "social-offer-button-text", SOCIAL_OFFER.buttonLabel);
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    button.append(buttonText, arrow);
    card.append(mark, copy, socialLink, button);
    root.replaceChildren(card);
    root.hidden = false;
}
document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", renderSocialOffer, { once: true })
    : renderSocialOffer();
