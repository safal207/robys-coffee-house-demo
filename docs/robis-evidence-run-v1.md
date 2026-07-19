# Robis Evidence Run v1

Robis Evidence Run v1 packages the repository's existing QA, security, performance and integrity gates into one immutable, exact-head evidence bundle.

## Run locally

```bash
npm ci
node scripts/run-evidence-v1.mjs
```

The runner reads the requested SHA from `ROBYS_EXACT_HEAD`, `GITHUB_HEAD_SHA` or `GITHUB_SHA`, then verifies it against `git rev-parse HEAD`. A mismatch produces `BLOCKED`; environment metadata alone cannot bind evidence to a commit.

The default run executes only repository-bound checks. To add checks against the currently published site:

```bash
ROBYS_RUN_LIVE=1 node scripts/run-evidence-v1.mjs
```

Production checks describe the deployed site. They do not prove that the deployment contains the pull-request head unless a separate deployment binding is supplied.

## Verdicts

- `BLOCKED`: exact-head identity is unavailable, does not match the checked-out commit, or a required exact-head stage is unproven.
- `PRODUCTION_EVIDENCE_FAILED`: live evidence was explicitly requested and at least one production stage failed or remained unproven.
- `READY_WITH_ADVISORY_GAPS`: required exact-head checks passed; production evidence was not requested and deployment equivalence remains unproven.
- `READY_WITH_PRODUCTION_EVIDENCE`: required exact-head and requested production checks passed, while deployment equivalence remains explicit rather than assumed.
- `DRY_RUN_ONLY`: artifact generation was tested without executing repository gates.

## Bundle

The workflow uploads `.artifacts/robis-evidence-run` containing:

- `exact-head.json`
- `run-summary.json`
- `causal-graph.json`
- `pythia-verdict.json`
- `lotus-final-report.md`
- `manifest.json`
- per-stage logs
- copies of known reports produced by existing project verifiers, including `.artifacts/live-integrity-report.json` when live integrity is requested

## Authority boundary

The runner gathers and evaluates evidence. It cannot approve, merge, deploy, waive a finding, or replace maintainer authorization.
