# Roby's cross-thread continuation

Reconciled on 7 September 2026 at the owner's request to check where all Roby's
threads stopped and continue. Prior-conversation search did not return a complete
transcript of every thread. This ledger therefore uses the available conversation
context, current GitHub metadata and repository reports; it is not an assertion
that every past message was read.

## One current delivery lane

Continue the guest-facing web work in **PR #346**, branch
`fix/guest-journey-complete-20260907`. The central product contract is
need → portions → visible total → one editable order → show the barista.

At reconciliation, main is `e3edcf13de323c3adb80c9c96465f1dd0425eee0` and PR #346
is open, ready for review, mergeable and not merged. Its inspected head is
`b545fd3d17161caa2164b5bb88b6a46beaea87ab`: 49 successful check runs, two skipped
and one failed native Android check. All web checks have completed successfully.
The earlier PR-body count of 42 successes preceded seven additional successful
checks after the PR became ready. These counts belong to that head, not to this
follow-up commit.

| Work from the other threads | Current location and disposition |
| --- | --- |
| Branded menu photography and initial premium menu/cart | #337 and #338 are merged; preserve them |
| Calm takeaway cup, “Возьми с собой”, supported-browser haptic | #343 is merged into main; #346 also fixes the settled reading pause |
| Shared order, storage preservation, history, demand loading, mobile clearance | #341 at `5b01276` is an ancestor of #346; do not reapply old repair archives |
| Complete pairing photos, readable prices, explicit set action | Selected #342 runtime files are already in #346; the original draft remains intact |
| Latest multi-angle mechanics review | #342 at `b8b9e17`; compared directly with the #346 implementation below |
| Group selection and complete menu-to-barista journey | #346 supports explicit 1–4 guests and preserves the whole order across routes |
| Older menu truth/search/accessibility alternatives | #332 and #344 are drafts based on older runtimes; review remaining deltas individually, never merge their whole historical stacks |
| Native cold-start handoff | #345 remains open; #342 contains related diagnostics, not a separate completed Android release |

## Latest #342 findings reconciled

The [multi-angle review](https://github.com/safal207/robys-coffee-house-demo/blob/b8b9e17580d1d8426915ccf9bee0bf3d1c963c7e/docs/qa/pr342-multi-angle-review-2026-09-07.md)
reviewed parent `d794605` against base `5b01276`. Its four later changed paths are
three QA documents and one diagnostic script; there is no later product-runtime
repair missing from the selected pairing integration.

| Finding | Disposition in the common journey |
| --- | --- |
| Family always returns no match and changing budget cannot recover | #346 replaces an unspecified family label with 1/2/3/4 guests, multiplies complete portions before budget filtering, and asks legacy sessions for a real count |
| Suspected exclusion of drinks below the budget minimum | Disproved in #342; do not introduce an unsupported minimum-price patch |
| Modified set and ordinary set need separate order identities | Preserve #341's shared-order configuration semantics; #346's domain and browser checks cover canonical additions, quantities and persistence |
| Russian skip link remains Turkish | Confirmed in #346; this follow-up connects it to the existing static-copy locale hook with TR/EN/RU strings |
| Standalone 290 TRY offer and guided component pricing differ | Keep the existing standalone price without a fabricated discount; keep the unresolved guided combo excluded. Current price/availability authority remains #299/#300 |
| Contextual composition cost and Android draw waits | Do not transfer #342's historical animation verdicts to the deployed takeaway design or call the native problem solved; retain the separate evidence and #345 |

This follow-up changes only the skip-link translation, its generated app/HTML/cache
revision, integrity evidence, scoped visual source bindings and this ledger. The
existing locale-update function supplies the text on startup and on language
changes. The Turkish no-JavaScript fallback, href and focus/CSS behavior remain.
No new test suite, visual baseline, pixel allowance or timing threshold is added.
Required full checks and security verification run before publishing; CI for the
new head must be evaluated separately.

## Next transition and remaining work

1. Finish this small localization follow-up in #346, then evaluate its own CI and
   review state. Preserve the green predecessor evidence without calling it a pass
   for new bytes.
2. The current `Maintainer merge attestation` commit status is pending. The
   repository's `.github/workflows/maintainer-merge-attestation.yml` expects the
   owner `safal207` to record `/merge-ready <full-current-head>` on the PR. This
   ledger, an assistant review, a skipped provider review or the successful
   attestation-updater job is not that owner decision.
3. After the release requirements and owner decision are satisfied, merge the
   common web lane and verify deployed bytes plus an actual guest journey on the
   public site. A local barista screen still does not submit or pay for an order.
4. Keep #340 open for QR transfer to a second device and remaining acceptance;
   #259 needs an actual POS/Odoo acknowledgement contract. Keep operational menu
   ownership/current-price confirmation in #300/#299. Native Android remains
   deferred in #345 as requested.
5. Reconcile overlapping old PRs only after the common lane is published. Do not
   close the entire #340 issue, discard diagnostic branches or announce a new APK
   from these web checks.

Current PR: <https://github.com/safal207/robys-coffee-house-demo/pull/346>.
Product detail: [one guest journey](guest-journey-2026-09-07.md).
Evidence: [verification note](../qa/guest-journey-verification-2026-09-07.md).
