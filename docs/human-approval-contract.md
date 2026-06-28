# Human approval contract

The repository includes a read-only workflow named `Human approval contract`.
It verifies that a pull request targeting `main` has an approval from a real human
collaborator other than the pull-request author.

## Evidence rules

A qualifying approval must satisfy all of the following:

- the review state is `APPROVED`;
- the reviewer is not the pull-request author;
- the reviewer is not a bot;
- the review is attached to the exact current head commit;
- the reviewer is an owner, member, or collaborator;
- the reviewer currently has `write`, `maintain`, or `admin` repository permission.

A new commit changes the head SHA and invalidates earlier approvals automatically.
A dismissed review is not accepted.

## Safe activation

The contract is advisory by default so a single-maintainer repository is not
accidentally deadlocked.

After a second trusted human reviewer has repository write access:

1. Create the repository Actions variable `REQUIRE_HUMAN_APPROVAL` with value `true`.
2. Open repository **Settings → Rules → Rulesets** or **Settings → Branches**.
3. Target the `main` branch.
4. Require a pull request before merging.
5. Require at least one approving review.
6. Dismiss stale approvals when new commits are pushed.
7. Require conversation resolution.
8. Require status checks and select at least:
   - `Human approval contract / Verify trusted human approval`;
   - `AI review contract / verify`;
   - the stable security, runtime, browser, and review checks used by the repository.
9. Require the branch to be up to date before merging.
10. Keep force pushes and branch deletion disabled.

Do not enable a no-bypass approval rule until a second trusted reviewer is available.
The pull-request author cannot provide the independent approval required by this
contract.

## Acceptance test

1. Open a disposable pull request against `main`.
2. Confirm that green CI without another human approval leaves the human approval
   check red when enforcement is enabled.
3. Have a second trusted collaborator approve the exact current head.
4. Confirm that the check becomes green.
5. Push another commit and confirm that the previous approval no longer qualifies.
6. Re-approve the new head and confirm that merging becomes available again.
