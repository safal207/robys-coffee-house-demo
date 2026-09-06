# Shared order: reachable hero and demand loading — 6 September 2026

## Scope

This continues PR #341 without Codex review. It does not publish the site,
introduce payment/POS/QR, replace the entry animation or alter catalogue prices.
The shared order store's preservation, migration and quantity semantics are kept.

The hero now reserves the measured order-bar height and potential fixed-toolbar
lane inside its own content, rather than only at the end of the document. The
potential lane is independent of a toolbar's transient visibility, so scrolling
does not resize the hero as the toolbar appears. Real actions remain unforced.

Full-site enlarged-text inspection found that Visit/Android grid intrinsic minima
could enlarge the mobile layout viewport. Text/tracks/header actions now reflow;
text size is not reduced and overflow is not merely clipped. The permanent test
asserts actual innerWidth equals the requested width and header controls fit.

The empty menu does not eagerly load the order model or full drawer. First order
intent loads the one revisioned ESM instance; saved orders still hydrate. Pending
adds are disabled against duplication and canceled dialog intents cannot commit
later. A failed download is not reported as a successful addition. The existing
legacy records remain intact when storage cannot safely be used.

Classic gallery/social private bindings are compacted. Their public top-level
bindings were compared with TypeScript ASTs; image-fallback source/output and
browser contracts remain enabled. No performance threshold was increased.

## Exact candidate provenance

Base PR head: `9ad682884f7ae4fb040650b6860cceb9e61ad6bb`.
Combined run: `34007279545`.
Input checkout: `078af6aa01608e107aed2010b3d0acef0f5a7ff6`.
Pinned hero preparation: `63a80bf7c58536024895a6cccf6bd42ebc8d7dee`.
Validated runtime commit: `e636fb3160cc9d207d64fd379f0dc1fbe91373b7`.
Runtime tree: `7ed6ddaf3112ecc2b79dc2e43b24ec94d02895c6`.

Artifact `9981388122` archive SHA-256:
`36f227d63624c7d0308224f993e4f01bf23456b3afbdbda7f6f31f735c86f51d`.
The downloaded archive digest was verified. Use candidate.json, candidate.patch
and emitted-file hashes together. Browser JSON reports the input checkout, not
a fresh checkout of the subsequently stored runtime commit. The integration
commit adds the exact artifact-proposed permanent workflow and this note only.

## Executed checks on the combined working tree

- Full npm run check and verify:security: PASS.
- Cold menu / first intent / download failure / canceled intent: 8/8 PASS.
- Hero matrix: 36/36 PASS with actual navigation, no force click and CSP enabled.
  Widths 320, 390, 1440; TR/EN/RU; empty and 99-item saved order; root text 16/32px.
  Normal motion is paired with 16px and reduced motion with 32px, not independent
  extra combinations. All actual viewport widths match the requested widths.
  Minimum observed menu-button/order-bar separation: 12.09375 px.
- Original obstruction negative control: detected, 1/1. This removes only the
  new hero CSS clearance block, rather than weakening the positive assertion.
- Existing cross-route journeys: 20/20 PASS.
- Existing layout/touch matrix: 12/12 PASS.
- Existing Premium UI: 35/35 PASS; Premium feedback: 42/42 PASS.
- Classic public binding parity, dock and shared-catalogue contracts: PASS.

The suites overlap; counts are not additive unique scenarios. These are local
built-site browser runs on GitHub CI, not physical-device or deployed-site tests.
Hero tests block service workers for deterministic CSS, while enforcing CSP.
They do not certify the production service-worker upgrade path or universal FPS.

## Failure history and delivery boundary

Run 34006659389 detected the original defect; the first repair passed 32/36 but
failed four 390px enlarged-text toolbar cases. Run 34006878577 passed its original
36 cases, but their JSON exposed 320/390px viewport expansion to 360–489px. Its
nominal pass is not presented as narrow-viewport certification. Diagnostic run
34007190008 identified the offending full-site boxes. The final matrix adds a
strict actual-width assertion and passes after the reflow repair.

The earlier lazy run 33998891560 passed its browser tests but could not create a
Git tree containing workflow changes with Actions credentials. No extra token
permissions were granted. The combined writer stores only the runtime candidate;
the existing authorized connector adds the permanent workflow separately.

Run 34006958548 was correctly rejected by the evidence-publication contract when
a performance measurement shared a write-capable candidate workflow. The new
candidate workflow does not collect/publish performance results. Lighthouse is
left to the existing read-only final-head workflow; no evidence gate was changed.

## Remaining release conditions

Fresh exact-head repository CI, Lighthouse under the unchanged budget, reviewed
visual differences, shared-runtime service-worker upgrade verification, and
post-deployment journeys remain required. No merge, deployment, human approval,
Codex approval or final performance result is implied by this note.
