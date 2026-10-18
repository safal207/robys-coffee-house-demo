# Choice-to-counter verification

Captured locally on 18 October 2026 (Moscow date) against base `d368897b8185cbf120f051398fb2dc2a5cc9663b`.

- `npm run check`: passed.
- `npm run verify:security`: 353 security contracts and the secret scan passed.
- `npm run verify:performance`: passed existing budgets.
- `npm run test:choice-funnel`: all 39 scenarios passed; details in `report.json` and `pairing-report.json`.
- Node 24.19.0, locked Playwright 1.55.1 / Chromium 140.0.7339.186 (build 1193), Linux, reduced motion. CI independently uses Node 22.
- Integrity manifest SHA-256: `fdc85a67bf725f8f3f9e15eecf947a24a6aef35a38cc0da4cc0b0583dbf48701`.

## Captures

| File | State |
| --- | --- |
| [hero-390-ru.png](hero-390-ru.png) | Russian mobile homepage with the order CTA and counter-payment explanation. |
| [paths-1440-en.png](paths-1440-en.png) | English desktop coffee paths and three ordering steps. |
| [pairing-390-ru.png](pairing-390-ru.png) | Russian mobile latte dialog after explicitly selecting Lotus and collapsing the choices. |
| [cart-390-ru.png](cart-390-ru.png) | Two selected pairs, 740 ₺ total, explicit QR action. |

These are local assistant-produced evidence, not independent human approval or proof of sales growth. Element captures can include fixed navigation where it intersects the captured region. The browser matrix additionally verifies text reachability at 200%, short screens, focus, failure recovery and no-JavaScript links. Reproduce with the commands in [choice-to-counter.md](../../choice-to-counter.md). Required CI remains authoritative for release.

## Follow-up CI diagnosis

Initial CI on `21418d0` found stale checkout-copy expectations in the premium-feedback and product-reveal browser checks. Those assertions now expect the explicit QR text; local feedback passed 55/55 and the product-reveal smoke passed. The adversarial expectation is synchronized too.

The iOS and gallery jobs stopped before testing, while trying to install older browser packages over the committed lockfile (`npm: Cannot read properties of null (reading edgesOut)`). Their workflows, plus the adversarial workflow, now consume locked Playwright 1.55.1. `@playwright/test` is pinned to the same version; no application behavior, workflow permission, scenario or threshold was relaxed.

The local base/head visual comparison produced 43 captures, of which 18 exceeded the unchanged global threshold. All 18 were inspected: four full-page height changes add the planned section, four hero changes alter action hierarchy/copy, and ten lower-section crops contain 1 px rasterization/crop differences with content and controls intact. `visual-summary.json` and the content-bound record in `qa/reviewed-visual-changes.d/choice-to-counter-20261018.json` preserve the exact observed failure set. This local inspection does not assert that CI has passed.

After pinning the runner, `npm run check`, `npm run verify:security`, the installed-toolchain verifier and `npm audit --audit-level=high` passed (zero reported vulnerabilities). The gallery runner discovers all 24 existing tests; listing is not an execution pass.

## CI visual review on 18 October

Run [39078426331](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39078426331), head `317e8384f74e5fcf9d581822f9196e68554031b9`, produced 16 failing comparisons out of 43 in both attempts, with identical failure metrics. The downloaded artifact 12118350548 matches GitHub's SHA-256 `dddbaf5ef498d02c941d24d90aa125bddb89f6259c2fe6cdcc4bad2603f17616`. See `visual-ci-summary.json`.

Two assistant inspections covered the 12 non-full comparison triplets and four current full landings. Four height changes add the intended paths/steps section; four hero changes implement the CTA/copy hierarchy. Eight existing section crops preserve their content and controls, with fractional paint/alignment shifts including three 1 px crop-height differences. No new clipping or content loss was found in that capture set. Existing visit-map header overlap is present in the baseline too.

The active content-bound visual record now uses these actual CI dimensions/ratios and capture hashes. The earlier 18-failure local summary remains historical and is not asserted to match CI. Neither assistant inspection is independent human approval; a subsequent exact-head CI run must validate the new revision.

## Fallback keyboard test synchronization

The ADV CI run on `317e838` had one failing check out of 91: Escape was sent immediately after reopening a fallback dialog, before its next-frame focus transition. The helper now asserts that focus is inside the dialog before sending modal keyboard input. A 100 ms delayed-frame scenario preserves all Tab/Escape/draft assertions and adds reopening coverage. The [negative control](fallback-focus-control.json) fails when only this synchronization is removed and passes with it. No production runtime bytes changed. Full build/check and 353 security contracts passed after these test and evidence changes.

## CI repeat rasterization boundary

On `242662f`, CI run 39096463545 repeated the same 16 visual comparisons and dimensions. One phone 390 menu-preview difference changed from 7230 to 7231 pixels out of 360360. Comparing its two current images gives 50 raw RGBA changes confined to the fixed-CTA paint region (x10–373, y843–892). Current capture/diff inspection found no control or content change. Artifact 12123859924 matches SHA-256 `ee808a046640273e931ff7ee50e376cfb735d3eb061bbbd069359c1b2c858e5c`.

The exact content-bound ceiling for that capture is rounded from this newly observed ratio (`0.020067`); no global screenshot threshold changed. Evidence and image hashes are appended to the reviewed record and `visual-ci-repeat-summary.json`. Other comparisons retain their previously inspected limits.
