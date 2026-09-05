# Premium runtime verification — 5 September 2026

## Publication boundary

This is feature-branch evidence, not a Pages deployment or a release approval.
PR #338 remains open. Main was last observed at
`04b3ce7549a2fc111bcc13ca9cf92adabb29dd4a`.

The validated menu compaction was pushed as
`1f10dfbab7b4df05fd22a834044c998752fd5698`, tree
`dcb8e9a0d957b5ac71aa74dabbb022d8af185678`.
It preserves the parallel source-first conversion runtime change at `4c72672`.

## Reproducible evidence

- GitHub Actions run: <https://github.com/safal207/robys-coffee-house-demo/actions/runs/33944674982>
- Input head: `52ebaf3409d0f74c2a6d9091631273cd3ae9fb7b`.
- Artifact: `menu-compaction-52ebaf3409d0f74c2a6d9091631273cd3ae9fb7b`, ID `9963020889`.
- Archive SHA-256: `8f0443ae43e6b5a54f8a7fff804f3f1a47b6857c281e9c32014ae34db8cbc859`.

The workflow prepared the patch, built, checked and navigated the modified worktree,
then committed and fast-forward-pushed that same worktree. The browser JSON `head`
field records the input checkout, not the later output commit. Use `source.patch`,
`HEAD.txt` and `TREE.txt` together for provenance; do not relabel the JSON head.
The one-shot compaction workflow was removed by the output commit.

## Observed results

- Build, `npm run check`, integrity generation: PASS.
- Security: 285 checks PASS; current-tree secret scan PASS.
- Static performance budget: PASS; referenced JavaScript across index/menu is 93,883 bytes.
- Premium UI: 35 recorded checks PASS, zero failures. Thirty geometry combinations cover TR/EN/RU, 320/360/390/768/1440px and 100/200% root text size, with 61 product rows in each combination. Photo/copy/price overlaps and horizontal overflow were zero.
- Premium feedback: 42 recorded checks PASS, zero failures. Includes selected-card state, quantity badge, total, session restoration, toast, keyboard category and reduced-motion feedback.

The two browser suites overlap; this is not 77 unique scenarios. Navigation used
real headless Chromium with production HTML/CSS/CSP and emulated viewports. It is
not a physical-device test, a universal FPS guarantee, a payment test or a new
Lighthouse result. The cart is a local order draft, not an order sent to the cafe.

## Size and source integrity

The menu runtime shrank from 26,431 to 14,670 raw bytes. A local default-gzip
comparison was 6,585 to 4,947 bytes; this is not measured network transfer.
The parallel conversion change reduced that runtime from 14,603 to 10,943 bytes.
Prices, business behavior, lazy imports, public DOM hooks and budgets were not changed.

Readable code is in `src/menu-app.js`. Source contracts first verify that the shipped
`menu-app.js` exactly matches pinned compilation. Security checks inspect both.
The permanent isolated-fixture test added alongside this note proves that edited
output and stale source fail, and a correct rebuild recovers without mutating the
real runtime. It runs before the feedback browser suite.

## Remaining release requirements

The full final-head CI set, Lighthouse transfer budget, visual approval and review
still need final results. Earlier green results do not automatically certify a new
head. The native Android run `33943632059` reached `WEB_READY` but then recorded
`VISUAL_STATE_TIMEOUT`; native readiness remains unresolved, not a web-browser failure.
No timeouts, CSP rules, budgets or required checks were relaxed to hide a failure.
Review requests are advisory; maintainer approval and the repository release gates
must remain genuine. No merge or production publication was performed here.
