# Roby's: from choosing a drink to the counter

This change makes the existing café journey easier to understand: choose a drink,
optionally add a dessert, review the complete price, then get a QR for the cashier.
It does not add online payments, a POS connection or automatic order submission.

## What changed

- **A concrete first action.** “Build my order” is authored in the homepage HTML,
  so there is one primary action before JavaScript runs. The full menu remains a
  secondary button; the pairing route remains a quieter text link. The next step
  and payment location are explained immediately below the actions.
- **Three useful entry points.** Warm coffee, cold drinks and drink/dessert
  pairings use existing local imagery and native links to filtered menu sections.
  No new catalog prices are copied onto the homepage. A three-step explanation
  connects selection, price review and payment at the café.
- **A shorter optional choice.** Hot drinks initially offer San Sebastian,
  Brownie and Cookie, plus the default drink-only option. These are editorial
  starting points at different prices, not a claimed sales ranking. “See all
  desserts” reveals the full twelve choices. A previously chosen dessert remains
  visible after collapsing; an absent starting product is replaced from the
  current available catalog list. Each option shows both the pair total and the
  extra amount, taken from the canonical catalog.
- **An explicit checkout action.** Both menu and Smart Choice use “Get QR for
  the counter” in TR/EN/RU. Adding an item still requires a deliberate action;
  opening a QR is a separate action. Existing draft, quantity and cashier rules
  remain in force.
- **Readable enlarged text.** Pair preview captions use the existing rem-based
  auto-fit layout at narrow widths, so 200% text can reflow into one column.

## Evidence and limits

Quick design inspection, 18 October 2026 (Moscow date), against main
`d368897b8185cbf120f051398fb2dc2a5cc9663b`:

| Finding | Observed evidence | Intended improvement |
| --- | --- | --- |
| CHOICE-01 | The live homepage injects “Help me choose” beside two other hero buttons; its destination is the order builder. | A static primary action names the actual outcome and explains counter payment. |
| CHOICE-02 | The live latte dialog exposes all twelve dessert options in one horizontal strip. | Start with three, retain access to every dessert and preserve the customer's selection. |
| CHOICE-03 | Menu and Smart Choice checkout labels say “continue” without naming the QR destination. | Name the next screen and keep the amount visible before activation. |

The navigation and copy changes are **conversion hypotheses**, not measured sales
results. No fabricated reviews, scarcity, discounts or revenue uplift are added.
The café must still confirm availability and the final amount at the counter.

References consulted: [SamCart](https://www.samcart.com/) for optional add-ons and
a clear checkout; [ClickFunnels](https://www.clickfunnels.com/) for a focused
entry and a connected sequence of decisions. Their marketing performance figures
are not evidence of an effect at Roby's and are not reproduced here.

## Measurement

The existing local analytics listener records `coffee_path_hot`,
`coffee_path_cold` and `coffee_path_pair`, with language and placement. Existing
`smart_choice_start` and `pairing_click` events stay in place. No new analytics
destination is introduced. Local events alone are not a durable analytics service.

After connecting an approved measurement sink, compare menu-entry and QR-opening
rates by language/device, time to first committed selection, and dessert attach
rate. Counter sales need separate POS evidence: a QR opening is not a paid order.
Guard against a longer time to checkout, accidental additions or increased exits.

## Reproduce verification

```bash
npm ci --no-audit --no-fund
npx playwright install chromium
npm run check
npm run verify:security
npm run verify:performance
npm run test:choice-funnel
```

The last command starts an isolated local server and tests the actual emitted
pages. It covers TR/EN/RU, 320/360/390/768/1440 px (including a 360×640 short
screen), no-JavaScript homepage links, category routing, keyboard disclosure,
selected-choice retention, catalog-based totals, QR opening, focus restoration,
and the existing twenty pairing regression scenarios. The inherited matrix also
exercises 200% text, native/fallback dialogs, capacity limits, stored drafts,
flavor requirements and failed optional-module recovery.

Reports and captures are written to `.artifacts/choice-funnel/` and
`.artifacts/custom-pairing/`. The report records the integrity manifest hash;
checked-in representative evidence lives in `docs/qa/choice-funnel-20261018/`.
This is assistant inspection and local Chromium verification, not an independent
human review, field-performance study or Safari certification. CI remains the
release authority for its required checks, including visual comparison.

## Delivery and rollback

Source files are changed before rebuilding. The build refreshes the lazy pairing
and ordering modules, Smart Choice runtime, stylesheets and worker revisions.
`coffee-paths.css` has a new pathname, an exact-revision worker entry and a cache
namespace component. The integrity manifest covers all changed public bytes.
No budget, CSP, workflow permission or review rule is weakened.

Revert this change as a unit, rebuild and regenerate integrity. Do not revert
unrelated menu data or treat a stale generated bundle as a rollback.
