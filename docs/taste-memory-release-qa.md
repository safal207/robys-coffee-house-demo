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

## My Feed — acceptance criteria (same PR)

The opt-in `Моя лента / My feed / Benim akışım` is an additional discovery rail,
**not** a replacement for the original vertical feed or its order/engagement
calculation. The initial personal module loads only on a deliberate tap.

1. Clean profile: six actual menu items from diverse categories, correctly
   labelled as *not yet viewed*; no invented ratings, trending scores or discounts.
2. Like Iced Caffè Latte and Cookie, then tap My Feed: two favorites,
   a real San Sebastian Cheesecake pairing and three discovery ideas. Verify that
   no SKU repeats; each card uses the original catalog photograph and TRY price.
3. Horizontally swipe the rail; vertically continue the original feed without
   scroll traps, involuntary reorder, blocked touches or shifted photo boundaries.
4. Like/unlike something while the rail is open: its position and already
   rendered cards remain unchanged. Tap `Другие идеи` to deliberately refresh
   from the latest local likes and views.
5. Switch TR → EN → RU and back while scrolled halfway across the rail.
   The same six product IDs remain in the same order and at the same scroll
   position; only labels, localized names and prices' number format update.
6. Tap an item; the existing feed navigation should open that product
   (including a target past the initial eight-card lazy page) using its
   official item link, preserving variant selection and checkout behavior.
7. At 320, 360, 390 and 430 CSS px, verify a visible next-card preview,
   44 px interaction targets, native horizontal momentum, no horizontal page
   overflow, and focus outlines reachable with keyboard.
8. With localStorage unavailable, personalisation falls back to cold-start
   discoveries, without errors or network tracking. No previously viewed
   product is falsely represented as unseen.
9. With weak/offline connections: the standard feed and order remain usable;
   an optional failed My Feed import can retry on a later explicit tap.
10. Verify `prefers-reduced-motion`, high contrast, screen readers and BFCache.
    Inspect real photographs and screenshots, not AI-generated mockups.

Focused test: `node --test scripts/test-my-feed.mjs`. Full release gates remain
`npm run check`, `npm run verify:security`, visual regression and fresh
`integrity-manifest.json`. **No claim of mobile/browser acceptance without evidence.**
