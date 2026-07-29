export const menuTruth = Object.freeze({
  schemaVersion: 1,
  menuVersion: "2026-06-30",
  verifiedAt: "2026-06-30",
  currency: "TRY",
  operationalAuthority: "robys-cafe-management",
  approvedSource: "approved-printed-cafe-menu",
  digitalSource: "menu-data.js",
  priceComparisonRule: "never-display-unapproved-comparison",
  savedChoiceRule: "store-menu-version-and-reconfirm-after-version-change"
});

export const pairingTruth = Object.freeze({
  "cool-lime-macaron": Object.freeze({
    pairingItemId: "cool-lime-macaron-pairing",
    pricingMode: "standalone-approved-offer",
    comparisonMode: "none",
    components: Object.freeze([
      Object.freeze({ categoryId: "refreshers", nameTr: "Cool Lime", quantity: 1 }),
      Object.freeze({ categoryId: "desserts", nameTr: "Makaron", quantity: 1 })
    ]),
    label: Object.freeze({
      tr: "Ayrı onaylanmış eşleşme fiyatı",
      en: "Separately approved pairing price",
      ru: "Отдельно утверждённая цена сочетания"
    }),
    explanation: Object.freeze({
      tr: "290 ₺ fiyatı ayrı bir eşleşme teklifi olarak onaylanmıştır; tekil ürünlerin toplamından indirim olarak gösterilmez.",
      en: "The 290 ₺ price is approved as a separate pairing offer and is not presented as a discount from the individual-item total.",
      ru: "Цена 290 ₺ утверждена как отдельное предложение и не показывается как скидка от суммы отдельных позиций."
    })
  }),
  "iced-san-sebastian": Object.freeze({
    pairingItemId: "iced-san-sebastian-pairing",
    pricingMode: "menu-total",
    comparisonMode: "component-total",
    components: Object.freeze([
      Object.freeze({ categoryId: "cold-coffee", nameTr: "Buzlu Caffè Latte", quantity: 1 }),
      Object.freeze({ categoryId: "desserts", nameTr: "San Sebastian", quantity: 1 })
    ]),
    label: Object.freeze({
      tr: "Menü toplamı",
      en: "Menu total",
      ru: "Сумма по меню"
    }),
    explanation: Object.freeze({
      tr: "Fiyat, menüdeki Buzlu Caffè Latte ve San Sebastian fiyatlarının toplamıdır.",
      en: "The price equals the listed Iced Caffè Latte and San Sebastian menu prices.",
      ru: "Цена равна сумме указанных в меню айс-латте и Сан-Себастьяна."
    })
  })
});
