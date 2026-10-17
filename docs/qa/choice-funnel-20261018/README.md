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
