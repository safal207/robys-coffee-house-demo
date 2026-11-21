# PR #515 — mission 8 performance evidence (2026-11-21)

## Reproduced on 420b405

- Lighthouse mobile/desktop: `total_js_bytes` 23,796.5 vs baseline 22,139, regression +7.49% > 5%. Performance scores 99 mobile / 100 desktop; other hard checks passed.
- Causal regression: `menu-switch-feed` exceeded its 999 ms enforced budget in 11/12 tested profiles, with observed values near 1,004–1,037 ms. All other journeys reported PASS.

## Candidate fixes

- Split first-interaction QA accessibility and image fallback enhancements into `qa-enhancements.js`, preserving eager hero/video setup in `qa.js`.
- Give the default first feed photograph a matching responsive high-priority preload in `menu-feed.html`, ahead of the feed initialization.
- Pin the QA lazy module revision in build output and service-worker precache so offline revisits do not depend on unversioned assets.
- Add deterministic source/runtime contract checks in `scripts/test-performance-delivery-regression.mjs`.
- Do not alter Lighthouse or journey-latency budgets and do not modify approved branding assets.

## Verification

- Source change: `c7a650caf19a189da68b95ceced22517abb7cf1a`.
- Verified generated runtime: `b5f9c994f9aac4d6c35ea3370ac4f72894f1b2ac`.
- One-shot GitHub Actions run `44842299912`: SUCCESS, including `npm ci`, `npm run build`, `npm run integrity:generate`, and new regression tests. The one-shot workflow was removed in its generated commit.
- A fresh PR check run is required on the exact final head to establish whether the two performance failures are resolved.

No merge or approval is performed by this evidence file.

## Follow-up fix and generated-runtime evidence

- `e8fbb1c`: removed unconditional first-photo preload, preserving the sole context-specific runtime preload for category, search and product deep links.
- `2e0d6de`: repaired the ASSET-001 guard to require the exact approved hero path in both authored QA source and minified shipped runtime.
- `9b86749`: deterministic generated runtime and integrity-manifest update from one-shot GitHub Actions run 44871941811 (SUCCESS); the temporary workflow removed itself.
- The one-shot run passed npm build, integrity generation, both performance-delivery contract tests, and P1 mobile/CTA/accessibility/asset contracts.
- Shipped `qa.js` was reduced from 3,161 to 2,339 UTF-8 characters with the reviewed source retained in `src/qa.js`.
- Previous baseline performance and browser failures are not marked resolved until checks complete on the final human-authored exact HEAD.
