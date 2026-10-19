# Contextual combo offer cards

Base: `d2470cc4273f35ebe93114640dacc77fd5ab6655` in
`safal207/robys-coffee-house-demo`.

The menu's existing editorial selections now have poster-style HTML cards:
audience, original set photograph, named components and quantities, regular
catalog total, and a primary selection button. The preview uses the same
editable quantities and atomic shared-order transaction as before. Its
photograph is labelled as the original selection when contents are edited.
There is no new sale SKU, discount, delivery or payment promise.

## Quiet suggestion

- Wait for 45 seconds of visible browsing and eight seconds without interaction.
- Show at most one automatic offer per tab session; explicit help stays available.
- Preserve typing, focus, open dialogs and existing orders. Read the authoritative
  order before an automatic offer; uncertain storage suppresses the offer.
- Show one recipe, local photograph and catalog total. Recipe data loads only
  after assistance is requested or becomes eligible.
- Use the visible family section/filter for `family`, desserts for `sweet`, food
  for `hearty`, and the together filter for `together`; otherwise suggest `sweet`.
  This uses the current menu view, without inferred personal attributes.
- A failed recipe load keeps the original generic help with working navigation.
- An explicit request survives settling scroll or focus on its own entry while
  suggestion data loads. New user intent, editing, overlays and navigation still
  cancel it; renewed activity continues to cancel pending automatic offers.

The action links to `menu.html#menu-combo-<recipeId>`. Explicit navigation opens
that recipe; an ordinary menu visit opens no preview. Same-page navigation
preserves the common latest-intent guard, so delayed loading cannot overwrite a
newer cart/product action. Escape returns focus to the corresponding visible
selection button after the helper itself closes.

## Content and media

The family selection is two cappuccinos, two sesame simits, two milks and two
cookies: 750 TRY at this catalog revision. The default coffee-and-cookie
selection is 280 TRY. All totals are calculated from catalog products rather
than duplicated in the offer UI. Turkish, English and Russian remain supported.

The existing local set photos and approved compact SVG wordmark are reused.
No matching family video exists in the repository, so there is no video tab,
empty player or unrelated promotional clip.

## Verification entry points

- `npm run check` and `npm run verify:security`.
- `node scripts/test-combo-offer-cards-browser.mjs` with
  `ROBYS_OFFER_BROWSERS=chromium,firefox,webkit`.
- `node scripts/test-menu-combos-browser.mjs` for the existing ordering,
  concurrency, recovery and assistance coverage.
- `node scripts/test-combo-offline.mjs` for source/runtime parity, revisioned
  assets, actual service-worker cache bytes and first offline reveal.

Browser harnesses serve emitted files over local HTTPS under the production
CSP, record source/artifact hashes and use read-only canonical order checks.
Their viewport captures are browser-engine evidence, not physical-device tests.
The focused WebKit cases keep the same functional, geometry and CSP assertions
but skip screenshot calls: Playwright's WebKit screenshot preparation inserts
an inline `body {}` stylesheet which the production CSP correctly blocks.
Chromium/Firefox captures and the existing browser matrix provide visual evidence.
