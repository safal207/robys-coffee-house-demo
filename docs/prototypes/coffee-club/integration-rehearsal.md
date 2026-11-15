# Coffee Club integrated rehearsal — 2026-11-15

Source-snapshot test lane. Not a merge or release.
Base: `59f127c69983eae57215868679d8fa46bab89931`
- #497: `0ae479f42b122e2834c2cc6047e28b884da53fd2`
- #498: `81b2315bb10f770eafe270878366b1b25f3e5ae8`
- #499: `5d31b6c572b5864844c35136ed5613a7e5980b69`
- #500: `8bf790369db16ac8b9b005c07890ee9d3cd17aca`

Reconciles package.json and causal-regression graph additions. Copies all
other added files from these four source drafts, except the paid-link test
which now exercises Counter store payment and authorized fixture claim ->
one stamp on retry -> insufficient balance -> synthetic refund.
Economics inputs and policy are illustrative. No HTTP identity, real
refund, durable reward ledger or deployment. Exact-head CI and browser
review pending.

## Release lanes

- #495 menu-first handoff remains separate: head 0712716fb7bd91fd8b0641621ef6048b5b708dec,
  62 successful checks, one skipped and one failing visual job. Logs:
  25/43 screenshot comparisons outside thresholds, no matching reviewed
  change. Artifact 14164604699, run 43721992774; actual visual review is
  required. No baseline approvals or threshold relaxation from logs alone.
  Owner confirmation of menu, pricing, address, hours and photos pending.
- #501 BiteOS local analytics pilot stays separate. No production consent or
  identity integration assumed.
- Before Club pilot: real identity/session/consent, data deletion, atomic
  durable earning/redemption, refunds, concurrency, confirmed Counter
  hosting, owner-approved cost inputs and risk cap.
- Original drafts remain open. This is not Git ancestry or replacement
  review evidence. Reconcile against current main and select one canonical
  lane before any merge. No live rewards or data collection.