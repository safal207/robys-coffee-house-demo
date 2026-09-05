# Unified guest order — 5 September 2026

## Implemented scope

One versioned ESM order store now connects Smart Choice, full menu, home and Discover.
The persistent bottom entry opens the same order: quantities, catalog-derived TRY
prices, remove/undo and same-tab session restoration. Opening a recommendation
only configures it; the explicit Add to my order button performs the addition.
Menu rows and the existing menu dialog subscribe to the shared state. Existing
pairing offer prices are preserved; no price or catalog entries were changed.

Smart Choice treats explicit #welcome as the welcome screen, validates saved
answers and restores the actual browser-history entry. A live state event replaces
storage polling between the flow and its cart editor. Storage denial keeps the
current page usable with an honest persistence warning; it does not promise
cross-page persistence when the browser refuses storage.

Previous menu state is migrated once. A previous Smart Choice selection is never
silently combined: import requires confirmation. Candidate-specific substitutions
and upgrades remain distinct line identities. Unknown products/options, invalid
quantities and untrusted client prices cannot change the catalog price calculation.

## Verified candidate and provenance

Integration commit: 97557790c3314a1cffefa9d140cd7dccc9678050.
Tree: 138622bbee271ae0110b7d15a67402ec3777da4a.
Preparation checkout: 7207a84b72e9f4e2e2e01f4dde8cf3004d4246bf.
Run: 33964941723. Artifact: 9969136656.
Archive SHA-256: 8acd81696ac5a078f4abceba221fc1a3b78c495511f5f1f5be55409e1ae2ab22.

The run applied the guarded readable-source integration, regenerated all emitted
files and integrity data, tested the working tree, then created the commit above.
It did not update any ref. The feature ref was subsequently fast-forwarded without
force. Input-head metadata is not falsely relabeled as the output commit: use
candidate.json, source.patch and the emitted file hashes together.

Executed successfully:

- Complete npm run check and npm run verify:security.
- 28 unified-order domain, migration and source-contract checks.
- 20 Chromium journey checks: TR/EN/RU selection, explicit addition, full-menu
  continuation, reload, quantity changes, removal/undo, home/Discover continuity,
  explicit welcome, back/forward, invalid saved state and unavailable storage.
- 12 layout cases: 320/390/1440px, 16/32px root text, normal/reduced motion;
  original CSP, unforced touch or mouse input, exact hit-target checks and dialog
  overflow checks. Focus returns to the order entry after closing.
- Existing Premium UI 35/35 and Premium feedback 42/42.

Suites overlap; counts are not additive unique guest journeys. Browser contexts
simulate touch; no physical phone, live public deployment, POS or payment is tested.
The new permanent unified-order workflow checks a fresh checkout and refuses
source/generated drift before browser checks.

## Failure history retained, not rerun into an unexplained pass

Run 33964352346 failed an existing cache-name grammar check. The cache generation
now advances v62 to v63 while preserving the required format; the gate is unchanged.

Run 33964448334 exposed a real interaction conflict: Smart Choice's active-button
scale replaced the order bar's centering transform. Insets now center the bar,
so pressed-state transforms cannot displace it. All three languages now test
opening the bar on the Smart Choice page itself, not only on the full-menu route.

Run 33964628772 exposed enlarged-text selection-layout trouble. Intrinsic grid
minimums now stay within the viewport instead of enlarging it. The subsequent
explicit layout probe in 33964828677 confirmed reachable coordinates at 320px
and 200% text but rejected a native-dialog horizontal overflow of 29px. Explicit
maximum width, wrapping, and a full-width price row on narrow screens fix that
separate defect. The twelve-case probe passed on the final candidate.

## Release boundary

This is the shared-order package only. QR transfer, POS integration, the redesigned
wave intro and pairing-photo crop changes are not included. The basket is a local
order draft; it never marks itself submitted, accepted or paid.

The owner requested continuation without Codex review; no Codex request or approval
is fabricated. AI advisory review is not a substitute for maintainer authorization.
Final-head repository CI, visual inspection, performance budgets, cache-upgrade
validation and post-deployment smoke remain release requirements. This note does
not claim a merge or publication.
