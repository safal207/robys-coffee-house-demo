# Compact menu candidate — 7 September 2026

## Scope and status

An opt-in, Telegram-inspired **web-menu candidate**, derived from PR #346 at
`7799f80b5a6561beec57f2d98f8e8ca58e8c36fa`. It is not a registered Telegram bot,
not deployed, and does not change the public entry points. This source-only
review isolates the new presentation from the ongoing Android investigation.
Generated assets are attached to the candidate CI run, not activated in Pages.

## Reference-to-product decisions

| Reference / pattern | Adaptation for Roby's | Boundary |
| --- | --- | --- |
| ChatFood's menu-to-cart flow | Persistent quantity and total; one canonical order | No delivery or online payment is implied |
| Laurel Cafe's product selection | Explicit Choose button, existing detail/quantity dialog | A button opening options is not labelled Add |
| Bakery/food-bot catalogue pattern | Existing product and pairing photography, readable prices | No copied catalogue, invented bestsellers or discounts |
| Telegram's mobile UI guidance | Touch-sized controls, safe-area padding, reduced motion | No Telegram client or device certification |

References inspected as design inputs, not independent full-journey tests:

- <https://chatfood.ru/>
- <https://github.com/yuzefovichalex/tma-cafe>
- <https://core.telegram.org/bots/webapps>

## Implementation

`scripts/build-compact-menu.mjs` derives `compact-menu.html` from the canonical
menu **after** the normal build, emits the TypeScript enhancement and a scoped
stylesheet. Template anchors fail closed. It retains the original catalogue,
product dialogs, shared order runtime, translated copy and CSP. The original
menu, landing, Smart Choice, pricing and visual allowances remain unchanged.

The compact route has a smaller branded introduction, searchable category chips,
two-column mobile product cards, whole photographs and explicit Choose actions.
The button opens the existing product dialog; it never writes order state.
Pairing cards retain their existing action. The single lower order button uses
existing quantity and total nodes. Its actual translated/zoomed height reserves
page clearance. The shared drawer's duplicate floating entry is hidden only on
this route; the drawer and its editing/handoff logic remain intact.

The existing final boundary stays explicit: **local selection → review → show
the barista**. Availability, acceptance and payment occur at the counter.
No SDK, token, customer identification, order transport or payment is introduced.

## Reproduce and review

```sh
npm ci --no-audit --no-fund
npm run check
npm run verify:security
node scripts/build-compact-menu.mjs
node scripts/verify-compact-preview.mjs
npm run integrity:generate
npm run verify:integrity
npx playwright install --with-deps chromium
node scripts/compact-menu-browser.mjs
```

The boundary check must precede preview-manifest generation: it verifies every
parent public file against the unchanged committed manifest and rejects a stale
generated runtime. Preview generation intentionally leaves three new files and
a changed local manifest; do not call those committed release assets.

Browser coverage targets TR/EN/RU × 320/390/768/1440 widths, keyboard selection,
Escape/focus return, quantity changes, exact Espresso totals, reload and
full-menu continuity, search recovery, repeated localization, pairing dialogs,
single-dock layout and 200% text zoom. The test enforces the original CSP.
Screenshots and reports belong to the specific run, not a universal device claim.

## Release boundary

Do not merge or publish automatically. Review the generated screenshots and
browser report first. A later activation commit must add the reviewed generated
assets and current integrity evidence, deliberately connect the entry route,
and revalidate visual/performance/current-head release checks. This candidate
does not repair or waive PR #346's separate native Android failure in #345.
