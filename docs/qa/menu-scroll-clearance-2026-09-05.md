# SCROLL-CLEARANCE-001 — measured menu scroll insets

## Finding and source boundary

Pinned diagnosis run 33945955211, artifact 9963335280, navigated unchanged e103e6e995f060c697dfb3954033aaeb4d694aae web bytes with original CSP. At 320/390px and a fine pointer, selecting hot-coffee placed the category heading near y=217 while sticky controls extended to y=243; hit testing returned a category chip. Touch profiles were clear. This is a narrow-browser UI defect, not proof of a corresponding physical-touch-phone failure.

## Repair

Readable src/menu-app.js measures actual header/control geometry, updates scroll-padding and scroll-margin through CSS variables, and responds to size, font and input-profile changes. The minified menu runtime, cache URLs, service-worker revision and integrity manifest are regenerated. No catalog, prices, release deadlines, animation thresholds or CSP permissions changed.

Preparation run 33946485204 started at 4c3d0d8c3097e6bb16baeb2c63e9677142300640, applied the guarded source repair, rebuilt and verified its working tree, and published candidate dd22baf2b55f529fa955fdf2707f0389a3fcd7bc (tree 61a78fc26e31f0a4b9d6472a5c8e97e41d631326). Artifact 9963513780 has SHA-256 515a592400b6b10f6921c21f41a3c1f295ac60d495ce9b802007e7cd79ff2574. The JSON source field denotes the preparation checkout, not the later output commit; validated-candidate.sha binds the published candidate.

## Executed verification

- Complete npm run check, verify:security, nine dependency build-edge fixtures and real repository orphan audit passed.
- Scroll clearance: 48/48 combinations of 320/390/768/1440px, fine/touch input, TR/EN/RU and 16/32px root text passed.
- Restoring the old fixed 170px offset and zero scroll padding reproduced the original covered heading; the test rejected it and then verified recovery.
- Premium UI: 35 checks, no failures. Premium feedback: 42 checks, no failures. These suites overlap; do not sum as unique scenarios.
- At 320px fine/TR/16px, the heading moved from the occluded y=217.375 negative control to a hit-test-visible y=302.375.

The 48-case contract covers category navigation and explicit share-heading scrolling. Automatic centering of an entire share card is diagnostic, not asserted when enlarged content is taller than the unobscured viewport. Its individual heading remains reachable. No masks, hidden sticky controls, screenshot-derived approval or physical-device FPS claim are used.

## Other release evidence, not this candidate's certification

Lighthouse run 33945639477 for e103e6e passed mobile and desktop. Its mobile six-run summary reports performance 99/100, LCP 1809.673375ms, TBT 3.75ms, CLS 0 and 22447 JavaScript bytes: +1.3912% against 22139 bytes, below the unchanged 5% limit. URL includes entry=off, so this does not certify the entry animation.

Android run 33946115135 at 2fbf343 succeeded via WEB_READY_TIMEOUT -> VISUAL_STATE_CONFIRMED -> HANDOFF_COMPLETE_FALLBACK. The artifact explicitly loads public Pages, not pinned PR web bytes. It is not proof of a normal-ready path or premium web release.

## Release boundary

The integration preserves the owner's no-Codex instruction from 2fbf343. No Codex request, human approval, independent approval, D6 seal, main merge or deployment is created by this repair. Run final-head CI and inspect fresh visual evidence; old visual bindings and old-head results cannot certify new bytes.
