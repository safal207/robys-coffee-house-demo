# Android stylesheet failure recovery — 8 September 2026

This change fixes a reproducible error-path defect in the isolated native product
frame candidate. It does **not** fix or explain the successful-but-late stylesheet
loads in run 34229226048. It is not a release or promotion verdict.

## Defect and repair

The native product module waits for DOMContentLoaded before checking required
stylesheets. If a stylesheet had already failed, `link.sheet` was absent and the
module subscribed to a load/error event that had already happened. Preparation
then remained in `loading` until an external abort or native timeout.

The parser bootstrap now captures stylesheet resource errors on the document,
only for the canonical native generation route. A WeakMap binds each recorded
failure to its link element and current URL. The native dependency check accepts
an available stylesheet first, rejects a recorded failure through the existing
failure path, and otherwise keeps waiting for the current resource events.

The document capture and pagehide listeners are removed after styles settle,
module/import failure, release, abort, or page exit. The change adds no timer,
animation frame, layout read, or polling. It does not change native Java, timeout
budgets, the ready criteria, browser entry behavior, or the existing error UI.
In particular, rejecting preparation is not a successful native handoff.

## Reproduction and validation

The parent is `c9a9d9c5feeb35d8b6077485b537ab3b60f62b67`, an unpromoted native
candidate outside PR #346. The same two new behavioral tests were run against
the parent runtime and repaired runtime. They inject the stylesheet failure
before DOMContentLoaded, both before and after module evaluation.

| Runtime | Result |
| --- | --- |
| Parent c9a9d9c5 | Both cases fail: observed state remains `loading` |
| Repaired source | Both cases pass: preparation takes the existing failure path |

The [differential manifest](../../qa/evidence/android-stylesheet-error-20260908/manifest.json)
binds both runtime variants and the identical test file by SHA-256.
[Parent output](../../qa/evidence/android-stylesheet-error-20260908/old.stdout.json)
and [repaired output](../../qa/evidence/android-stylesheet-error-20260908/fixed.stdout.json)
retain the exact stdout as JSON strings and its decoded SHA-256, alongside the
actual assertions and exit results. This is a VM behavior test, not
an Android launch measurement or a browser screenshot.

From this checkout, run:

```sh
node --test --test-name-pattern='stylesheet error before DOM' scripts/test-android-product-frame.mjs
```

To repeat the negative arm, copy that same test into a disposable directory's
`scripts/` subdirectory, and place the parent's `bootstrap-v2.js`,
`android-native-product-frame.js`, and `android-handoff.js` beside `scripts/`.
Use `git show c9a9d9c5feeb35d8b6077485b537ab3b60f62b67:<path>` to obtain each
parent file. Run the same command from that disposable directory. Do not replace
the repaired files in the working checkout.

Validation completed on the repaired runtime:

- `npm run build` and `npm run integrity:generate` passed.
- `npm run check` passed, including all 56 combined native-frame and hero-video
  cases: early/late failure, inactive resources, recovered/replaced links,
  listener cleanup, abort/release, browser-route isolation, and cache binding.
- `npm run verify:security` passed: 287 contracts and the secret scan.
- `git diff --check` passed.

The [validation manifest](../../qa/evidence/android-stylesheet-error-20260908/validation.json)
records the command outputs' hashes. The build refreshes bootstrap/module
revisions in HTML and the service worker. The integrity manifest still contains
244 entries; only six protected files change (the two runtime modules, three
HTML bootstrap references, and the service worker).

## Remaining Android failure

The separate [readiness observation](android-readiness-observation-2026-09-08.md)
records successful CSS load events and JS readiness arriving after native
failure. The repaired error path was not executed in that run. Native rendering
latency, visible completion, required CI, and current-head maintainer approval
remain independent release requirements. PR #346 and main are unchanged by
publishing this isolated branch.
