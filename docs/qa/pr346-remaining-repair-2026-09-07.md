# PR #346: remaining check repair

Reviewed head: `7ca13b9adbf45b953c3b0997107d010e7bad1d9b`.
Comparison base: `e3edcf13de323c3adb80c9c96465f1dd0425eee0`.
Previous feature head: `d0a88b4f6f8d4c8be385805f710ee24923979b78`.

## Visual failure: one stale evidence binding

Visual run [34153293431](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34153293431),
job `101839814427`, captured 43 comparisons with 24 expected differences from
the main baseline. Its review validator rejected all exceptions because no
review record matched the current file contents.

Exactly one of the record's 57 content bindings was stale:

| File | Recorded Git blob | Actual Git blob |
| --- | --- | --- |
| `.github/workflows/guest-journey.yml` | `894f056ffce3d35f881330459e61cfc174f54803` | `ed23445f82b8db07b11e96447ad04a87159f7e11` |

The preceding commit added the four-line CI step for the six four-guest and
legacy-session browser cases. Its other two changed files are the new test and
its QA note. No product source, runtime, styles, generated files, catalog,
integrity manifest, visual checker or capture configuration changed from d0a88b4.

The final run's complete `results` array is exactly equal to the already
versioned `qa/evidence/pr-346-visual-summary.json` array: all 43 comparison
objects, including dimensions, pixel counts, ratios and geometry. Both raw
screenshot attempts also have the same results. This establishes a stale
binding as the new validator failure's cause; it does not claim that the
feature's screenshots are identical to main. The existing 24 reviewed visual
differences remain present. A representative 320 px menu-share baseline/current
pair was also inspected directly.

The repair changes only that workflow's hash in the existing review record.
All 24 expected comparisons, exact dimensions, pixel ceilings, masks, baseline
files and checker code remain unchanged. The review kind remains assistant
inspection, without a human attestation or release authorization.

## Replay against the downloaded CI result

| Input to the unchanged validator | Exit | Result |
| --- | --- | --- |
| Original raw CI summary and stale record | 1 | Rejected: no content-bound approvals |
| Same raw summary and corrected workflow binding | 0 | Existing 24-comparison record accepted |
| One additional unexpected failed comparison | 1 | Rejected |
| One pixel above an existing reviewed pixel ceiling | 1 | Rejected |
| Original stale workflow binding restored in an isolated fixture | 1 | Rejected |

The negative cases use copies of the raw summary or record outside the checkout.
They do not modify the product, committed evidence, thresholds or validator.
The before/after record differs in exactly one binding value.

Downloaded CI archive: `pr346-7ca-visual.zip`, 214450452 bytes, SHA-256:

`3f80a3e8bb2f2b32c9fe8a46d369802c0049954efba8e73ace5238f5411a33d9`

Raw `final/summary.json` SHA-256:

`16147502b6087cb69970440776af81d83ac3fc279c718cb0f6ad4841b0983c8b`

Both the archive size and digest were verified before extraction. Replay output
includes the raw summaries, unchanged-validator logs, before/after records and
`binding-replay-report.json`. This replay repairs the evidence association;
the published repair commit still requires its own CI run.

## Scope boundary

This Visual repair does not resolve or explain Android handoff timing failures.
Those require separate native/web evidence. No merge, deployment, threshold
relaxation or maintainer approval follows from the successful local replay.
