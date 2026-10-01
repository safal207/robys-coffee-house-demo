# Screen refinement v5 — smooth letters and compact language control

## Approved scope

The owner approved a smoother Roby's wordmark and a TR / EN / RU control whose border hugs its three buttons. This implements the visual direction, not a pixel-identical vectorization of the AI concept board.

- Only black R, B, Y and S outlines are refined. The red Organic O, apostrophe, colors, viewBoxes and other lockup geometry are unchanged.
- Original `*-master-v1.svg` assets, v4 fixtures and `brand-photo-logo.css` remain unchanged. Three `*-smooth-v5.svg` files are additive.
- `brand-refinement-v5.css` follows the original stylesheet on index, menu and discover. Preloads match the active `20261001-smooth-v5` variants.
- The language control shrink-wraps its three buttons, retaining at least 44 by 44 CSS-pixel targets. Language storage, prices, menu/cart behavior and pairing business logic are unchanged.
- Precache the four new brand resources and require exact revision matching. Advance the cache version while preserving worker lifecycle and navigation policy.

## Build blocker and regression repairs

The locked build reproduced 300,654 bytes of client Smart Choice JavaScript, exceeding the unchanged 300,000-byte cap. Six ESM outputs now use UTF-8: 253,615 bytes, saving 47,039 bytes without deleting or translating any copy.

`test-smart-choice-output-encoding.mjs` compares complete cooked-literal ASTs between ASCII and UTF-8 esbuild output and requires byte equality with the committed generated modules. The existing release verifier invokes it. Per-file and aggregate budgets are unchanged; no new dependency or lockfile change is needed.

Rebuilding exposed older emitted-file and poster-revision drift. The build now synchronizes poster JS/CSS references in menu HTML and the worker cache. The rotation VM supplies URLSearchParams and location.search, retaining its previous assertions and adding requested, discovered and invalid-pair cases.

## Validation and evidence boundary

The geometry verifier locks the refined letter paths and checks preserved original geometry, active references and exact precache entries. The original v4 contracts remain mandatory.

`node scripts/test-brand-refinement-v5.mjs` runs 90 real-page Chromium cases (three entry pages, ten widths from 320 to 1200, three languages). It checks active language state, touch targets, border padding, viewport containment, the active logo reference and JavaScript errors, and saves screenshots.

It then starts a fresh browser profile, visits only index online, shuts down the actual HTTP origin, independently verifies that origin is unreachable, and tests three offline route/variant decodes plus four current-versus-wrong revision probes. Page-only network emulation is not accepted as proof of a worker network outage.

CI run 36816799491 passed the full `npm run check`, `npm run verify:security` (353 security contract checks plus secret scan), 90 browser cases and seven origin-disconnected offline cases before syncing the bounded source/generated repair to the PR branch. The generated repair commit is `03e6bd1c34ffc1cee1e7f2e4e80695f5b60b807d`.

The temporary branch writer, one-shot source applicator and reproduction export steps were removed after synchronization. The production integrity workflow is unchanged. Final-head required CI and authentic current-head maintainer authorization must still be checked; earlier repair evidence is not a final release approval. No merge or publication is implied by this document. Local browser navigation is administrator-blocked; browser evidence comes from GitHub CI.

## Rollback

Revert the change as a unit and rebuild. Removing the three refinement stylesheet links and restoring the original preloads returns the visible identity to v4; original SVGs were never overwritten. Revert corresponding verifier/cache changes together and regenerate the integrity manifest. Do not roll back unrelated menu/cart work. Keep a passing bundle budget when reverting the independent encoding repair.
