# Taste Memory + Visual Cart — QA / release matrix

Status: implementation on draft PR #515; this checklist **does not imply visual or production acceptance**.

## Primary user journey (RU -> Turkish cashier)
1. Open `menu-feed.html?view=feed&lang=ru` in a clean browser profile.
2. Like San Sebastian Cheesecake; check that `Мой вкус` shows 1 liked item. Scroll a card fully into view for a continuous 1 second: view count increases once per product per visit, not for preloaded/offscreen media.
3. Select Iced Caffè Latte and add to the shared order; do **not** like any unrelated product.
4. Open the cart: a single photo-led personalised San Sebastian card should appear if the dessert was liked. Check the price is the catalog price 190 ₺; no invented discount.
5. Tap Add once, then double-tap/rapidly repeat to verify no duplicate item. Total expected 370 ₺ (180 ₺ latte + 190 ₺ San Sebastian).
6. Produce a cashier QR and open it on another device; guest language remains RU, **cashier receipt is Turkish**, including ingredients/variants and totals. Both items have matching, approved product photographs. The screen explicitly says payment is pending.
7. Confirm cancel, insufficient storage, or conflict never mark the order as paid.

## Negative / time-based cases
- Unliked product / new session: no personal pop-up; only a previous like is eligible.
- Return after 90 active seconds: at most one reminder per page session; global 24-hour and product 7-day cool-downs.
- Background/hidden tab, open dialog or active basket: no reminder.
- Dismiss, ESC panel, and disabled reminder option: no repeated interruption. Reminder automatically disappears after roughly 11 seconds.
- Saved favorite removed, unknown SKU or a selected dessert already in cart: never recommend the same item again.
- Inactive/offline module: base cart, quantities and QR remain functional. A failed optional module load can retry on reopening.
- RU / EN / TR and language switch while a cart is open; currency and Turkish names do not change the underlying totals.
- Share panel: only successful copied links are counted; do not count canceled native share sheets as completed shares.
- Cross-tab changes and stale state while an add request is running: no duplication or stale override.

## Mobile visual and accessibility acceptance
Capture screenshots and inspect **320 × 568**, **360 × 800**, **390 × 844**, **430 × 932** CSS pixels and 200% browser zoom:
- Product names, prices, photo cards and the main checkout CTA stay in view, with no horizontal overflow.
- Quantity, remove, replace and Add controls have at least 44 × 44 px touch targets.
- Taste Memory panel opens from a sticky toolbar regardless of scroll depth and supports Escape/keyboard focus.
- Reminder never overlaps a modal or blocks the cashier/checkout CTA.
- Cashier receipt at 320 px has readable Turkish names, modifiers, quantities, photographs and totals. Test printing with/without images.
- Test prefers-reduced-motion, forced-colors/high-contrast and screen readers.
- Confirm product photos are real approved local assets, not remote or AI substitutions.

## Technical release gates
- `npm run check`
- `npm run verify:security`
- `npm run test:menu-feed`
- `npm run verify:integrity`
- Visual regression and iOS/WebKit/Android mobile browser checks.
- Rebuild the generated runtimes and commit a fresh `integrity-manifest.json` after any public asset change.
- **Do not merge while any required CI check is running or failing.** Preserve existing origin, prices and QR semantics.
