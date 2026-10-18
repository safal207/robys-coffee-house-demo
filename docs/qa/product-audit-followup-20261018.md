# Product audit follow-up — 18 October 2026

Base: `810f5e660b18d0179abcce8857733fb56d89375c`.

The audit found a shared-order race, late navigation intents and several mobile selection obstacles. This change keeps one shared order across the menu and Smart Choice, makes family choices easier to find, and gives the customer explicit control over components and QR refresh.

| Finding | Acceptance behavior |
| --- | --- |
| RACE-01 | Concurrent additions, edits, quantities, variants and recommendations apply to the latest canonical order in one transaction. Both tabs converge; failed persistence does not report a successful addition. |
| RACE-02 | A delayed family/product/cart import cannot reveal, scroll or focus an older intent after a new choice or dismissal. |
| MENU-01 | The two verified ordinary-price promotional pairs expose their actual components. Removing or replacing the dessert preserves the drink and recalculates the current catalog total. |
| MENU-02 | A nonempty mobile order remains reachable while scrolling. The control clears content and safe areas and hides during search and dialogs. |
| MENU-03 | Smart Choice has a visible direct link to the full menu on mobile in TR/EN/RU; language and order survive both directions. |
| UI-01 | The Russian return label reads «На главную» and fits narrow screens. |
| PO-01 | A localized family shortcut on the home page opens the existing three editable recipes. |
| PO-02 | The menu introduction uses a compact approved wordmark. Each family card has one complete photograph and a localized heart ribbon. |
| PO-03 | A changed order produces a warning beside the immutable old QR. Only an explicit refresh creates the latest QR; an empty or unreadable order cannot silently replace it. |

## Family content

The recipes remain ordinary catalog products, without a discount or new sale SKU: milk + cookie (160 ₺), milk + sesame simit + cookie (195 ₺), milk + cake roll (230 ₺). Each selected component is independently removable after adding. The three family photographs use the previously generated set images, encoded as local 1024×1024 WebP assets. They are lazy loaded and available in the versioned offline cache; missing images fall back to the individual product photographs.

Juice, water, child portion sizes and complete ingredient/allergen data have not been confirmed in the digital catalog. This change does not invent them. Parents retain the choice and can ask the café about ingredients and portions.

## Regression entry points

IndexedDB is the authoritative order store. Its read, mutation and write share one transaction, with a monotonically increasing revision. The previous localStorage basket is migrated only when the canonical record does not exist. Thereafter localStorage is a compatibility projection; clearing or editing that projection is not an order mutation. The customer clears the order using its actual controls. Clearing all site data also clears IndexedDB.

Completed canonical writes remain successful if the optional projection cannot be written. A failed or aborted canonical transaction reports an error and leaves the previous order. Fresh UI and QR reads use the canonical store; storage/broadcast notifications and returning to the page refresh the view. Mixed versions of long-lived tabs are not certified by the same-version concurrency tests.

The `Order reliability` workflow runs separate Chromium, Firefox and WebKit jobs on the exact PR head. It checks family loading and editing, promotional components, conflicting cart operations, immutable QR refresh, and actual emitted-runtime QR decoding through the cashier page. Mobile navigation runs in the Chromium job as an additional responsive contract.

```sh
npm run check
npm run verify:security
node scripts/test-menu-family-browser.mjs
node scripts/test-promo-components-browser.mjs
node scripts/test-order-transactions-stress-browser.mjs
node scripts/test-order-checkout-staleness-browser.mjs
node scripts/test-order-release-built-browser.mjs
node scripts/test-mobile-navigation-browser.mjs
```

Source fixtures and emitted-runtime checks are distinct evidence. Initial failed probes and environment failures are retained in task artifacts; a later pass does not erase them. Linux browser engines and touch-sized viewports do not certify physical Xiaomi, Huawei, OPPO or vivo built-in browsers. Revenue uplift, café stock, real payments and physical device keyboards are outside this verification.
