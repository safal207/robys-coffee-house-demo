# Review Route Preflight

`RRM-001` and `RRM-002` are the first Review Route Memory backlog items. Their machine-readable contracts are `RRM-DEPTH-001` and `RRM-ROSTER-001`.

They answer two questions before a review route is selected:

1. **How deep must this change be reviewed?**
2. **Which configured reviewers are actually runtime-ready for that depth?**

```text
changed paths + explicit risk signals
→ L1 / L2 / L3 / L4
→ runtime roster probe
→ READY or ESCALATE
```

## Depth levels

| Level | Meaning | Initial minimum |
|---:|---|---|
| L1 | Low-risk, reversible documentation or copy change | one binding reviewer |
| L2 | Product or runtime behavior | mutations and two binding reviewers |
| L3 | Workflow, security, QA or governance | complete PDG proof path |
| L4 | Deploy, credentials, permissions or irreversible action | PDG plus a binding human |

Unknown paths fail closed to **L3**. Explicit risk signals may only raise the selected depth; they cannot lower a path floor. Migration directories are L4 even when nested under product paths such as `src/migrations/`.

## Runtime roster

The probe distinguishes configuration from current availability. Supported runtime states are:

```text
AVAILABLE
PAUSED
QUOTA_EXHAUSTED
NO_BALANCE
NOT_CONFIGURED
TIMED_OUT
UNKNOWN
```

Only `AVAILABLE` binding reviewers count toward capacity. Advisory reviewers are reported separately and cannot satisfy or block the binding requirement.

An unavailable binding route returns `ESCALATE` rather than remaining pending forever. Runtime availability is not a model-quality score.

## Pull request path evidence

For pull requests, the workflow reads the authoritative paginated file list from the GitHub Pull Files API. It does not infer the PR delta with a two-dot Git comparison, so unrelated base-branch movement cannot raise the selected depth. The exact head repository is checked out explicitly, including fork repositories, with a read-only token and no persisted credentials.

## Authority boundary

This preflight does **not** grant READY, approve a pull request or authorize merge. It only supplies deterministic input to the future route selector. TRACE-001, PDG-001, exact-head evidence, dispositions and action authorization remain authoritative.

## Repository variables

The workflow reads optional repository variables:

- `CODERABBIT_REVIEWER_STATUS`
- `CODEX_REVIEWER_STATUS`
- `HUMAN_REVIEWER_STATUS`
- `DEEPSEEK_REVIEWER_STATUS`

Missing variables resolve to `UNKNOWN`, which is fail-closed and produces `ESCALATE` when binding capacity is insufficient.

## Local verification

```bash
npm run verify:review-routing
npm run test:review-routing
```
