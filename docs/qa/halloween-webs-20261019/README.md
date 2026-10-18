# Halloween corner webs — 19 October 2026

The home hero now has two fine copper webs below the header; the menu has one in its empty upper-right corner. They are drawn as a small SVG data image inside the existing authored `seasonal.css`. There is no new image request, script, markup, focus stop or animation. The menu content remains above its decorative background, and the pseudo-elements use `pointer-events: none`. Existing forced-colors mode hides them. The original dated theme removes them on 1 November 2026 at 00:00 UTC+03:00, including open pages.

`npm run build` regenerated the menu bundle, page revisions and service-worker cache identity; the integrity manifest still protects 305 files. No logo, catalog, ordering source, CSP, workflow, performance budget or visual baseline changed.

The existing seasonal browser harness passed 108/108 cases in Chromium 140 and WebKit 26, with source and emitted-file hashes unchanged during capture. Its matrix covers the six customer views, TR/EN/RU, home/menu at 320×640, 390×844, 768×1024 and 1440×900, date boundaries, in-place expiry, language changes, no-JavaScript fallback and reduced/normal motion. `report.json` binds the exact captured input files; its base commit is the checkout ancestor rather than an approval of a dirty worktree.

`height-observations.json` records an additional manual probe at 390×699/700/701 in both engines for the new short-height rule. It records decorative hit testing, forced colors, pseudo-element size and horizontal overflow. These observations supplement the existing harness; they do not claim physical-device coverage. Original CSP remained active and external requests were blocked on local HTTPS. Service workers were blocked in the visual contexts; the repository's existing cache contracts cover worker identity separately.

Assistant visual inspection covers these captures. It is not an independent human approval:

- [Home, mobile / RU](index-chromium-390-ru.png)
- [Home, desktop / RU](index-chromium-1440-ru.png)
- [Menu, mobile / RU](menu-chromium-390-ru.png)
- [Menu, desktop / RU](menu-chromium-1440-ru.png)

Reproduce the main capture with `ROBYS_SEASONAL_QA_DIR=.artifacts/halloween-webs node scripts/test-seasonal-theme-browser.mjs` after building. `npm run check` and `npm run verify:security` passed (45 revision tests, 354 security checks and secret scan). Current-revision CI and published-file verification remain required before release.
