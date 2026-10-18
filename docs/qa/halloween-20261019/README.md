# A little Halloween at Roby’s — 19 October 2026

A small, dated decoration keeps the approved identity, menu, photography, prices and ordering behavior. All six customer views share a quiet pumpkin outline, localized seasonal label and warm copper accents. The menu retains one stylesheet; the seasonal layer precedes the unchanged security, brand and checkout layers.

The source is `src/seasonal-theme.ts`; `scripts/build.mjs` emits its runtime, binds both new assets to page revisions and service-worker precache/namespace, and rebuilds the menu stylesheet. All visual rules require the active season. The window is 15 October 2026 00:00 through 1 November 2026 00:00, using the café’s UTC+03:00 dates. A boundary timer, page restoration and visibility checks remove the theme after expiry. No JavaScript retains the ordinary site. No discounts, products, events, tracking or automatic cart additions are introduced.

`report.json`: 108/108 cases passed in Chromium 140 and WebKit 26. Coverage includes home/menu at 320×640, 390×844, 768×1024 and 1440×900 in TR/EN/RU; the other four customer views at 390×844 (the fixed Russian landing is RU); both season boundaries and the following year; expiry without reloading; language changes; no-JavaScript fallbacks; reduced and normal motion; and 679/680/681 px menu boundary samples. The theme icon is CSS rather than an emoji glyph.

`menu-layout-report.json`: 30/30 existing menu/combo layout cases passed in the same two engines, five viewport shapes and three languages. The original 600 px first-category limit, 44 px shortcut target checks, dialog containment and keyboard-focus checks are unchanged. A first pass identified menu-header pressure; the seasonal mobile header was compacted before this final run. A first normal-motion pass also found inherited hero animation on the new badge; that inheritance is explicitly disabled.

Both runs served the emitted files unchanged over local HTTPS under their original CSP, with fresh contexts and external requests blocked. Source hashes match before and after each run. These are desktop engine tests with touch viewport emulation, not physical-phone, Samsung forced-dark or OS-level accessibility certification. Service-worker registrations were blocked for the visual contexts; the existing worker/cascade contracts verify exact cache identity separately.

Assistant visual inspection covers the four captures below. It is not an independent human approval. The report’s base commit identifies the checkout ancestor; exact input hashes bind the uncommitted capture state. Screenshot baselines, global diff thresholds and the visual verifier are unchanged. Standard Visual regression CI separately uses its existing fixed July clock, exercising the ordinary out-of-season appearance; these October captures cover the active season.

- [Home, 390 px / RU](index-chromium-390-ru.png)
- [Home, 1440 px / RU](index-chromium-1440-ru.png)
- [Menu, 390 px / RU](menu-chromium-390-ru.png)
- [Menu, 1440 px / RU](menu-chromium-1440-ru.png)

Reproduce with `npm ci --no-audit --no-fund`, `npm run build`, `npm run integrity:generate`, then `ROBYS_SEASONAL_QA_DIR=.artifacts/seasonal-theme node scripts/test-seasonal-theme-browser.mjs`. Required repository validation remains `npm run check` and `npm run verify:security`.

Final required validation passed: `npm run check` and `npm run verify:security` (45 revision tests, 356 security checks and secret scan). The final browser captures were rerun after restoring the required security → brand → checkout cascade ending.
