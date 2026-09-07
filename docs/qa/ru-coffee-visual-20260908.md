# RU coffee landing: bounded visual repair

Base: `7799f80b5a6561beec57f2d98f8e8ca58e8c36fa` (PR #346).
The downloaded source tree was verified against Git tree
`2512415b267f502917b76d6bb16c6d2f52360fd7`; it is not a production-page capture.
This change is deliberately stacked on #346, rather than mixing its order work
into this page-only review. Retargeting/cherry-picking requires fresh validation.

## Repair

- Scope new styles to `.ru-coffee-page`; keep the three navigation links visible,
  keyboard-reachable and at least 44 CSS px tall without any application JS.
- Statically load the existing approved SVG identity stylesheet; do not redraw assets.
- Use a separate copy accent, underlined content links and visible keyboard focus.
  Measured section-label contrast is 6.018:1, previously 4.222:1 (rounded).
- Put the header in normal flow, remove the duplicated viewport-height hero spacer,
  maintain readable hero contrast, and add section/footer spacing.
- Add full-page, hero and FAQ screenshot families (11 viewport/capture pairs).
  Existing definitions, tolerances, masks and approval records are unchanged.
- Regenerate integrity evidence: the RU HTML changes and one new RU CSS file is added.
  All other 242 previously protected files remain byte-identical.

## Evidence and boundaries

Local Chromium source rendering passed **22/22** configurations: the ten original
viewports at 100% and 200% root-font size, plus two JavaScript-disabled configurations.
The original source failed the same four defect checks in the ten-viewports replay.
The Node test records actual image decoding, source digests, layout, contrast,
trial-click actionability and five consecutive real Tab inputs. It does not activate
external links or submit orders. Font-size simulation is not browser pinch zoom.

Offline mode explicitly inlines the downloaded stylesheet/assets in their original
order; it does not prove URL routing, response headers, service-worker/cache upgrades,
production delivery, Safari, Android WebView or physical devices. It does not approve
historical screenshot baselines. Earlier offline-harness results are preserved in
the handoff evidence: URL-name logo matching was replaced with decoded-byte identity,
and focus observations now use bounded web-first settling rather than one immediate
style sample. Failing assertions have not been removed or relaxed.

`npm run check`, `npm run verify:security` (287 checks plus secret scan), integrity
verification and `git diff --check` passed locally. An initial time-limited full-check
attempt did not finish; it is not counted as a pass. The subsequent complete run did.

The new read-only workflow repeats full verification and uses the test's default
**HTTP** mode with the unmodified page under its GitHub Pages project-path prefix.
HTTP/CI results must be inspected for the final commit before any release decision.
The existing screenshot-diff workflow may flag these intentional visual changes;
review them through the existing exact-head approval mechanism, never a tolerance bump.
No merge, deployment or baseline acceptance is authorized by this evidence.

## Reproduce

```sh
npm ci --no-audit --no-fund
npm run check
npm run verify:security
npx playwright install chromium
node scripts/test-ru-coffee-landing.mjs
```

For an explicitly offline source-only replay (not equivalent to HTTP delivery):

```sh
RU_QA_MODE=offline RU_QA_CHROMIUM=/usr/bin/chromium \
  node scripts/test-ru-coffee-landing.mjs
```

Evidence is written to `visual-results/ru-coffee/` and uploaded by the workflow.

## Candidate file SHA-256

- `ru/coffee-gazipasa.html`: `1b9e73f1e8d61b7c76e0e05054ac59297444e684e4b5ee266e6881cb5529add1`
- `ru/coffee-gazipasa.css`: `43152430a245f81955f25bb99fe8a35e9d661bbe6a0d75eb60c2d8ec71589d57`
- `qa/visual-regression.json`: `8220d9b5d7c154c2c348b4e673f9003fea2512dc6d6d0cae0ce0c1d8391dfe6b`
- `scripts/test-ru-coffee-landing.mjs`: `1af5a589f797488b58757877677845830b840ed1bb6505d4dcca30657d80e9e2`
- `.github/workflows/ru-coffee-regression.yml`: `36c9153aafe9a514b99e2af01042e81e14c1e295348de3c91221fe343be0009d`
- `integrity-manifest.json`: `07795838843b7c821fa851dd17be6b7a552e552d5d7c01832bc26df2af3b54fc`
