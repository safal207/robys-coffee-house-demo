# Homepage copy payload verification — 6 September 2026

## Scope

The homepage dictionary contained 128 keys per language, but the only app.js
consumer (index.html) declares 30 active translation keys. The 98 retired keys
per locale describe sections which the existing runtime already removes.
This source-first change retains all 30 live strings byte-for-byte in TR/EN/RU,
including rich-text copy, and removes only the retired dictionary entries.
No catalogue, prices, order state, CSS, intro animation or security policy changes.

Measured build sizes for app.js: 21,008 to 7,165 raw bytes; gzip 8,275 to 3,374.
These are file sizes, not a measured site-speed or Lighthouse improvement.
The prior Lighthouse transfer/TBT failures remain historical evidence; only a
new read-only final-head run can establish budget compliance. No limit changed.

## Tests and preserved concurrent work

The permanent unit contract has 13 checks: complete locales, original live-text
hash parity, missing/blank translation negative cases, newly declared markup,
rich-text key extraction and retired-section exclusion. It runs in npm run check.
The six browser checks exercise 33 live DOM nodes / 30 unique keys in each
language, dynamic-content translation, subsequent language changes and errors.
Production CSP is enforced; service workers are blocked in that translation test
for deterministic cold-page inspection. This is not cache-upgrade certification.
The existing readonly Unified order workflow now includes the browser contract.

Run 34008261616 passed the full build, security and all bounded browser suites,
but its writer stopped because the PR advanced from ae0d022 to 7bae774. It was
not a product-test failure and did not overwrite the branch or create a commit.
Artifact 9981666867 SHA-256:
7512ee08c323033106322d96dfc57b812689a09355255268d56d89a5aab35777.

The subsequent run 34008475524 checked out exactly
7bae774cfffbaeb7f997c6ad7453142d294876f1, including the intervening skip-link
focus repair, and applied the same three hash-bound candidate source files.
Full npm run check, 287 security contracts and current-tree secret scan passed.
Browser results: translations 6/6, demand loading 8/8, cross-route order 20/20,
layout/touch 12/12, current hero/focus 36/36, original-obstruction negative control
1/1 detected. These suites overlap and are not additive unique user scenarios.

Run workflow head: a30c0e5793ba2db825096dc4314debd047ad61c3.
Output implementation: b6838b7a80548005c8ee70a01ebf52112718ffe4.
Output tree: 96b76a45c94ef7dc99f105c5f8178623abf55294.
Artifact 9981738361, downloaded ZIP SHA-256:
85baef531c2892f85091fd31c4b55f891bd6cb771e44f80cc5d1968865aaac78.
All seven archived candidate-file digests match the locally rebuilt combined
source, and the checked-in runtime hash is
0a634c2a1ee405e419521de8ba532238e581cb9de155c3c8f85aa7d7fdac5603.

Use candidate.json, inputHead, candidate.patch and file hashes together: browser
JSON identifies the checkout whose working tree was rebuilt, not an independent
checkout of the subsequently created implementation commit. The integration
commit adds this note and the permanent readonly workflow step only.

## Release boundaries

The isolated preparation workflow is not included in the PR tree. No force push,
Codex review request, paid-provider changes, approval, merge, deployment, real
order or payment is performed by this integration. Required current-head CI,
visual-change review, performance budgets, shared-runtime cache-upgrade evidence
and maintainer authorization remain release conditions. Local browser navigation
was administrator-blocked; successful browser evidence comes from GitHub CI,
not a claimed physical-phone or public-site test.
