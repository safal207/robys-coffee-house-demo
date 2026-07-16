# Trusted AI review bootstrap

The authoritative AI review gate is owned by the protected default branch and runs on `pull_request_target`.

Security invariants:

- the workflow definition is loaded from the default branch;
- verifier code is checked out from the immutable trusted base SHA exposed as `github.sha`;
- the gate never checks out, downloads, caches, installs, builds, imports or executes pull-request code;
- the workflow run must be `AI review contract`, use event `pull_request_target`, match the trusted base SHA, and originate from `.github/workflows/ai-review-contract.yml@<default-branch>`;
- the live pull-request head is re-read on every polling pass and must match the event head;
- reviewer requests and native Bot reviews remain exact-head and request-time bound.

Bootstrap boundary:

The first pull request that introduces this workflow cannot self-prove the new default-branch trust boundary. Its ordinary pull-request contracts may validate structure and behavior, but they are not a substitute for the default-branch-owned gate. After this bootstrap change reaches the default branch, later pull requests are evaluated by the authoritative `pull_request_target` workflow.
