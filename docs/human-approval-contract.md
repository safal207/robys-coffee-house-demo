# Human approval contract

The repository includes a read-only workflow named `Human approval contract`.
It verifies that a pull request targeting `main` has an approval from a specifically
configured human collaborator other than the pull-request author.

## Evidence rules

A qualifying approval must satisfy all of the following:

- the review state is `APPROVED`;
- the reviewer login is listed in the repository variable `HUMAN_APPROVER_LOGINS`;
- the reviewer is not the pull-request author;
- the reviewer is not a bot;
- the review is attached to the exact current head commit;
- the reviewer is an owner, member, or collaborator;
- the reviewer currently has `write`, `maintain`, or `admin` repository permission.

`HUMAN_APPROVER_LOGINS` is an administrator-maintained allowlist of individually
verified human GitHub accounts. It accepts comma-, space-, or newline-separated
logins and compares them case-insensitively.

A new commit changes the head SHA and invalidates earlier approvals automatically.
A later `COMMENTED` review does not revoke an approval. A later
`CHANGES_REQUESTED` review or a dismissed approval does revoke it.

The workflow also handles pull-request `edited` events. Retargeting a pull request
from another base branch to `main` therefore triggers a fresh evaluation instead
of reusing a skipped result for the same head SHA.

## Safe activation

The contract is advisory by default so a single-maintainer repository is not
accidentally deadlocked.

After a second trusted human reviewer has repository write access:

1. Open **Settings → Secrets and variables → Actions → Variables**.
2. Create the repository variable `HUMAN_APPROVER_LOGINS` containing the verified
   reviewer login or logins, for example `alice,bob`.
3. Create the repository variable `REQUIRE_HUMAN_APPROVAL` with value `true`.
   Do not create either variable as an environment-scoped variable.
4. Open repository **Settings → Rules → Rulesets** or **Settings → Branches**.
5. Target the `main` branch.
6. Require a pull request before merging.
7. Require at least one approving review.
8. Dismiss stale approvals when new commits are pushed.
9. Require conversation resolution.
10. Require status checks and select at least:
    - `Human approval contract / Verify trusted human approval`;
    - `AI review contract / verify`;
    - the stable security, runtime, browser, and review checks used by the repository.
11. Require the branch to be up to date before merging.
12. Keep force pushes and branch deletion disabled.

Do not enable a no-bypass approval rule until a second trusted reviewer is available.
The pull-request author cannot provide the independent approval required by this
contract.

## Acceptance test

1. Open a disposable pull request against `main`.
2. Confirm that green CI without another configured human approval leaves the human
   approval check red when enforcement is enabled.
3. Have an allowlisted trusted collaborator approve the exact current head.
4. Confirm that the check becomes green.
5. Push another commit and confirm that the previous approval no longer qualifies.
6. Re-approve the new head and confirm that merging becomes available again.
7. Open a second disposable PR against a non-`main` base, then retarget it to `main`.
8. Confirm that the `edited` event runs the human approval contract for that same
   head SHA and does not preserve a previously skipped result.
