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
    ])
  }),
  "iced-san-sebastian": Object.freeze({
    pairingItemId: "iced-san-sebastian-pairing",
    pricingMode: "menu-total",
    comparisonMode: "component-total",
    components: Object.freeze([
      Object.freeze({ categoryId: "cold-coffee", nameTr: "Buzlu Caffè Latte", quantity: 1 }),
      Object.freeze({ categoryId: "desserts", nameTr: "San Sebastian", quantity: 1 })
    ])
  })
});
