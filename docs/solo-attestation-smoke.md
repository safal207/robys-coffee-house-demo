# Solo maintainer attestation smoke test

Disposable evidence file for validating the live default-branch attestation workflow.

This pull request must not be merged. It exists only to prove the status transitions:

1. no decision → pending;
2. current-head `/merge-ready` → success;
3. current-head `/merge-hold` → failure;
4. newer current-head `/merge-ready` → success.
