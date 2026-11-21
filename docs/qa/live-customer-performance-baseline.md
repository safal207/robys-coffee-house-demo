# Roby's mobile customer journey performance baseline

This Draft PR adds **measurement only**. It does not modify production HTML, JavaScript, CSS, photographs, cache budgets or sales workflows.

## Existing evidence: 20 November 2026

The published-home Lighthouse run on main commit 6997ba193eff1b292e5c076af185a525324b199e reported mobile **Performance 98**, FCP **1177 ms**, LCP **1606 ms**, TBT **123 ms**, CLS **0**. The separate local CI Lighthouse run on the same commit reported mobile **Performance 94**, FCP **1815 ms**, LCP **2826 ms**, TBT **45 ms**. They use different networks and conditions: the scores must not be subtracted to claim a production improvement.

- [Published run](https://github.com/safal207/robys-coffee-house-demo/actions/runs/44774836164)
- [Local run](https://github.com/safal207/robys-coffee-house-demo/actions/runs/44774836149)

Local opportunities are estimates, not measured savings: approximately 420 KiB from image sizing, 370 ms from render-blocking resources, and 630 KiB from image delivery in one Lighthouse run. Optimizations must be tested independently without changing approved image content.

## New evidence protocol

The workflow checks the **deployed** GitHub Pages build and exact menu integrity hash against the branch's version before measuring. It visits homepage, list menu, and photographic feed through Chromium with a 390x844 viewport, simulated 150 ms latency, 1.6 Mbps download and 4x CPU throttling, and service workers disabled.

Three independent cold browser contexts and a same-page warm reload are measured for each route. It records initial semantic readiness, first viewport-visible product photograph decoded (scroll to the first card if necessary in the list; menu and feed), FCP, LCP when observable, CSS/JS/image transfer bytes, representative image widths, and resource timings. Warm reload retains the browser HTTP cache. Median and p90 are recorded alongside raw samples; missing values are explicitly labelled **unavailable**. The 500 ms settle window only covers resource accounting, not readiness.

This is **synthetic laboratory evidence**, not real visitor Web Vitals; it does not establish field INP or ordering completion time. An existing causal journey suite separately measures cart and selection actions.

## Release guardrails

Do not optimize from guessed numbers. First inspect the published run artifact and find the heaviest requested images, blocking styles, or slow photo readiness. Keep authentic photographs and approved Roby's branding intact. Introduce image/media optimizations in a separate Draft PR, require Chromium/Firefox/WebKit functional tests, Lighthouse, visual regression, and generated artifact parity. Do not loosen existing performance budgets.
