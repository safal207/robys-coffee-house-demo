# Manual owner confirmation — retired

## Decision and scope

On 1 October 2026 the owner requested: "Бро уберем это проверку владельцем".
The additional owner-confirmation step is retired for
`safal207/robys-coffee-house-demo`, including PR #422.

The file `.github/workflows/maintainer-merge-attestation.yml` has been removed.
It no longer listens for pull-request/comment events or writes the
`Maintainer merge attestation` status and its internal cursors. The automatic
writer's `statuses: write` permission is removed with it.

No `/merge-ready <SHA>` comment, duplicate owner attestation or manual D6 seal
is required for an owner-requested merge. Older instructions that require one
are superseded by this policy. The owner still determines task and release scope;
this change does not authorize unrelated work or unattended publication.

## Requirements retained

Current-head build and tests, security checks, CodeQL/ZAP where applicable,
visual verification, integrity, performance budgets and generated-source parity
remain mandatory. Resolve actionable findings or document why they do not apply.
Do not merge red or running required technical checks. Guard the merge with the
expected head SHA and verify the deployment separately.

Other workflows, repository protection/rulesets, reviewer allowlists, secrets,
application files and runtime behavior are not changed by this retirement.
The existing independent-human review workflow remains advisory unless separately
configured otherwise. The existing review-ledger workflow is a manual audit,
not an automatic release gate. Missing reviews are not successful reviews.
Business-owner attestations about café data are unrelated and are unchanged.

## Existing statuses and honest evidence

GitHub may retain `pending` or other historical attestation statuses on old SHAs.
They are not current release requirements under this policy. Do not replace them
with invented approvals, impersonated owner commands or synthetic successful
attestation statuses. Record the policy change instead.

At retirement preflight, the branch API reported `main` as unprotected with no
required status contexts, and the repository ruleset list was empty. No branch
rule was modified. Recheck actual settings if an administrator adds rules later;
removing a workflow does not remove an independently configured required check.

## Rollback

Restore the original workflow and policy documents from commit
`766f515bc22976efa800b1834af7f666acce53e6` as an explicit owner-requested change.
Restoring files is not proof of a new human approval. Reevaluate current rules,
current-head checks and consent at that time; do not reuse old approval comments.
