# Four guests and legacy family recovery

Runtime reviewed: `d0a88b4f6f8d4c8be385805f710ee24923979b78`, PR #346.
Base: `e3edcf13de323c3adb80c9c96465f1dd0425eee0`.

The family dead end recorded on PR #342's `b8b9e17` is addressed by the existing
PR #346 product implementation: explicit 1/2/3/4 guests, complete portions and
total-budget filtering. This follow-up adds browser regression coverage only.
It does not introduce a second fallback into the older pairing branch.

The existing guest browser matrix covered two and three guests. Four guests had
domain coverage, and legacy recovery had source evidence, but neither path had
its own complete browser journey. `scripts/guest-group-recovery-browser.mjs`
closes those two gaps and runs in the existing Complete guest journey workflow.

## Six actual browser cases

| Case, repeated in TR/EN/RU | Input and required result |
| --- | --- |
| Four guests, 320 px, reduced motion | Coffee/cold/neutral/four with total budget 600 must show no match without dropping portions. Change the budget to 1200; four iced lattes total exactly 720 TRY. Add, review, reload, show the barista and return to editing. |
| Legacy family, 390 px | Add a real Espresso at 110 TRY through the menu. Restore a legacy-shaped `results` session containing `family` and `open`. Explicitly choose the number of guests and a current budget; no silent family-to-four conversion. Add four lattes for 720 TRY while preserving Espresso: exactly 830 TRY. |

Both paths also require:

- All four drinks in the order, with exact line and total amounts.
- Repeated add and reload must not duplicate the selection.
- An explicitly declined extra stays declined.
- Barista view shows quantities; edit controls return after choosing Edit.
- No horizontal dialog overflow or browser page errors.

All six cases pass on unchanged d0a88b4 runtime bytes. Four served runtime files
are compared with their checkout hashes before the browser cases. Each test uses
a fresh context, original CSP and blocked service workers. Screenshots wait for
finite dialog animations and image decoding. These checks do not certify a
physical device, QR transfer, POS submission, payment or cafe acceptance.

A separate read-only review caught two test weaknesses before finalization:
substring amount checks could accept a larger amount, and the initial fixture's
`selected` screen overstated a reachable old family result. Final checks compare
exact order amounts and restore the historical `results`/no-match state. The
revised six-case run passes; its script hash is recorded in the raw report.

## Validation and current CI boundary

Full `npm run check` passes. `npm run verify:security` exits successfully, and its
fresh JSON reports independently confirm 287 checks without failures and 480
current-tree files without secret findings. That command's saved text log lacks
the final console lines; both JSON reports are retained rather than inferring
complete execution from exit status alone. The cause of the missing console
capture is not established.

No product/runtime, catalog, generated asset, integrity file, visual allowance,
animation sampler, threshold or native deadline changes in this follow-up.

On the reviewed d0a88b4 parent, Complete guest journey, Unified order, Contextual,
Motion release and Visual workflows pass. The original Android smoke fails with
WEB_READY_TIMEOUT and VISUAL_STATE_TIMEOUT. Its native build loads mutable live
web content, so that failure does not isolate PR #346's guest UI as the cause.
These are parent observations; the new test commit requires its own CI result.

The current web scene is takeaway-v1 from the main integration. Its historical
startup failures concern a 150 ms first-visible startup bound, a different
mechanism and measurement from the older PR #342 Day/Night spline's 21 ms frame
interval gate. A green current web run does not establish a stable startup cure;
the controlled failed observations remain in the existing startup ledger.

## Replay evidence

Archive: `pr346-group-recovery-evidence-2026-09-07.zip`, 373327 bytes,
11 manifest-bound files, SHA-256:

`4db019f0acf36ed3cdf71cd04c487374c1397cbff95209d5da95918893121a09`

The archive contains the final browser report, six screenshots, full check log,
security log and both security JSON reports. Every member's size and SHA-256 was
verified after reopening. The test source is versioned in this repository.

```sh
GUEST_GROUP_RESULTS_DIR=.artifacts/guest-group-recovery node scripts/guest-group-recovery-browser.mjs
```

Continue product work on #346. The original #341/#342 branches remain intact;
no merge, deployment, native repair or maintainer approval is implied.
