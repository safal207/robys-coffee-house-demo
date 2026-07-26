# Roby’s Smart Choice — Release QA Contract v0.1

Status: **Draft for pilot**  
Owner issue: **#257**  
Depends on: **#249–#256**

## 1. Pilot boundary

Smart Choice is ready for a limited public pilot only when:

- all Smart Choice domain and browser checks pass;
- TR, EN and RU have complete non-empty locale objects;
- the owner has confirmed the catalog and availability used by the pilot;
- no P0 Smart Choice issue remains open;
- the release is not presented as a proven revenue uplift.

## 2. Localization

Supported locales:

- `tr` → `tr-TR`;
- `en` → `en-US`;
- `ru` → `ru-RU`.

Every localized object containing one supported locale must contain all three. Unknown locale values fail closed to Turkish, the product default.

Money is stored as integer minor units and formatted with `Intl.NumberFormat` using currency `TRY`. The UI must not concatenate a manually written currency sign to an unformatted number.

## 3. Accessibility

Required contracts:

- skip link to the main Smart Choice content;
- native buttons and links for primary interactions;
- no positive `tabindex`;
- visible `:focus-visible` treatment;
- focus moves to the current heading after a state change;
- progress exposes `role=progressbar` and current/min/max values;
- result and cart price changes are announced in a polite live region;
- offline and fatal fallbacks use an assertive alert region;
- language controls have localized accessible names;
- reduced-motion preference disables non-essential motion.

## 4. Safe failure

Offline state does not invent a result or price. It preserves the current screen and exposes a safe link to the full menu.

An uncaught browser error or rejected promise exposes a localized fatal fallback with the full-menu link. Error details are not displayed to the guest and are not inserted with `innerHTML`.

No-match remains a normal product state and keeps the existing safe menu fallback.

## 5. Mobile and long-copy layout

The public pilot supports viewports from 320 px.

- document-level horizontal overflow is forbidden;
- TR/RU copy may wrap at safe boundaries;
- cards and controls may shrink below their content’s intrinsic width;
- language controls remain operable at 320 px;
- controls keep a minimum interactive height of 44 px.

## 6. Performance budget

Pilot static budgets:

| Asset group | Budget |
|---|---:|
| Each Smart Choice JS bundle | 90 KB |
| All Smart Choice JS | 250 KB |
| All Smart Choice CSS | 100 KB |
| Smart Choice HTML | 30 KB |

The budget is checked against exact generated files committed to the branch. Existing browser/visual CI remains the mobile smoke and layout evidence layer.

## 7. Commands

```bash
npm run verify:smart-choice
npm run test:smart-choice
npm run check
```

`verify:smart-choice` validates catalog truth, generated assets, locale completeness, TRY formatting contracts, accessibility structure, navigation/fallback behavior, 320 px rules and performance budgets.

`test:smart-choice` runs the engine, cart, analytics, Decision Trace, experiments, release-domain and page suites.

Both commands are mandatory parts of `npm run check`.

## 8. Pilot checklist

- [ ] Owner confirms current catalog and availability.
- [ ] No P0 Smart Choice issue remains open.
- [ ] `npm run check` is green on the exact head SHA.
- [ ] Browser, visual, CodeQL and ZAP checks are green.
- [ ] TR, EN and RU complete the full guided flow.
- [ ] 320 px screenshots show no horizontal overflow.
- [ ] Keyboard-only flow reaches recommendation, cart and handoff draft.
- [ ] Offline/fatal/no-match states retain a safe full-menu exit.
