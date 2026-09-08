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

## Historical local evidence — product repair at `44cb7b6`

The local results in this section belong to the original repair/test revision,
not the stronger navigation and visibility contract added afterward. They are
preserved as historical evidence and are not a current-head CI pass.

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

## Completed HTTP evidence — exact source `4f0006a`

Evidence source commit: `4f0006a38eb87ec791c94cfae97556620e622b52`.
The updated file fingerprints below identify this commit, not a moving branch tip.
This documentation correction does not itself rerun a browser or transfer a PASS
to a later commit. Inspect that commit's completed CI separately.

[RU HTTP run 34190777167](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34190777167),
job `101948219217`, completed successfully. The independently downloaded
[artifact 10042153685](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34190777167/artifacts/10042153685)
contains `report.json` and 44 PNG captures. Its 26,207,927-byte ZIP has SHA-256
`88b4d7e3eec3be4fb64b20e47fecdc2012a79acd3e3a8cd421d2026b721c0dc2`,
matching GitHub's artifact digest. The parsed report identifies this exact source
SHA, HTTP mode and Chromium `140.0.7339.186`, and reports:

- 22/22 viewport/root-font/no-JavaScript configurations, each 14/14 named checks;
- 24/24 separate positive/negative anchor-visibility controls;
- real Location/FAQ clicks, exact Tab targets, and independent real menu clicks
  from both the header link and the hero button;
- HTTP 200, the project-prefixed destination and checked-out `menu.html` response
  identity for both menu entry points; no recorded landing-page case errors.

These are 308 named page-check results plus 24 synthetic controls, not 332 guest
journeys. Both menu checks prove local document delivery, not menu application
readiness or an order. Offline mode records both HTTP-only checks as NOT_RUN.
The same completed job passed `npm run check`, `npm run verify:security`
(287 contract checks plus secret scan) and `git diff --exit-code`. These are CI
results for `4f0006a`, not a claim that this documentation follow-up ran them locally.

### Global screenshot evidence — same source, different browser

[Visual run 34190777014](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34190777014)
compared `4f0006a` against `7799f80b5a6561beec57f2d98f8e8ca58e8c36fa`
using Playwright `1.52.0` / Chromium `136.0.7103.25`. Do not substitute the RU
workflow's Chromium 140 captures for these comparison images.

The downloaded [artifact 10042231925](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34190777014/artifacts/10042231925)
is 232,354,652 bytes and independently hashes to
`d0b0b7bd1693d755a44d6776eb6d35c9d53bee331b02316f882cae790bff65a9`,
matching GitHub's digest. Both comparison attempts were retained and checked:

- 43/43 non-RU comparisons pass with zero reported differences under the existing
  comparator settings. This does not mean all raw PNG bytes are identical.
- All 11 RU differences are explicit image-dimension mismatches. A reported ratio
  of 1 for unequal dimensions is not a measured claim that every pixel changed.
- 22/22 matching RU baseline/current PNGs are byte-identical between attempts.
  Across all 108 baseline/current files, 102 are byte-identical; six non-RU files
  differ by 14–82 raw pixels each. Their cause is not established.
- All 11 RU before/after pairs were visually inspected. No new visible clipping,
  overlap or white content gap was found in those pairs. The earlier `5e9c8c7`
  white-rectangle capture anomaly did not recur here; its root cause is not fixed
  or established by this result.

The global job failed at `Validate reviewed visual change`: no content-bound record
matched the exact 11-failure set. Downstream skipped checks are not PASS. The
image review supports recommending these expected layout changes for acceptance;
it is not human approval, a baseline update, a merge or a deployment.

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

## File SHA-256 — evidence source `4f0006a`

- `ru/coffee-gazipasa.html`: `1b9e73f1e8d61b7c76e0e05054ac59297444e684e4b5ee266e6881cb5529add1`
- `ru/coffee-gazipasa.css`: `43152430a245f81955f25bb99fe8a35e9d661bbe6a0d75eb60c2d8ec71589d57`
- `qa/visual-regression.json`: `8220d9b5d7c154c2c348b4e673f9003fea2512dc6d6d0cae0ce0c1d8391dfe6b`
- `scripts/test-ru-coffee-landing.mjs`: `9c4de1d0a28792e60d9c4fc230ac6b7c5ce9ecd46618d73643c06b8092904782`
- `.github/workflows/ru-coffee-regression.yml`: `ff17ecaa858a8373b7356ed1d59bf08b3f36bad138e1287c9d2033c45a020b76`
- `integrity-manifest.json`: `07795838843b7c821fa851dd17be6b7a552e552d5d7c01832bc26df2af3b54fc`
