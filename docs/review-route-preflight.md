# Review Route Preflight

`RRM-001`, `RRM-002` and `RRM-003` form the Review Route Memory decision chain. Their machine-readable contracts are `RRM-DEPTH-001`, `RRM-ROSTER-001` and `RRM-ROUTE-001`.

They answer three questions before review execution:

1. **How deep must this change be reviewed?**
2. **Is accountable human authority available for that depth?**
3. **Which exact ordered route is eligible for this head?**

```text
changed paths + explicit risk signals
→ L1 / L2 / L3 / L4
→ runtime roster probe
→ deterministic route or ESCALATE
```

## Depth levels

| Level | Meaning | Binding minimum |
|---:|---|---|
| L1 | Low-risk, reversible documentation or copy change | one human maintainer |
| L2 | Product or runtime behavior | mutations and one human maintainer |
| L3 | Workflow, security, QA or governance | complete PDG proof route plus maintainer seal |
| L4 | Deploy, credentials, permissions or irreversible action | PDG, security, human authorization and action gate |

Unknown paths fail closed to **L3**. Explicit risk signals may only raise the selected depth; they cannot lower a path floor. Migration directories are L4 even when nested under product paths such as `src/migrations/`.

## Runtime roster

The probe distinguishes configuration from current availability. Supported runtime states are:

```text
AVAILABLE
PARTIAL
PAUSED
QUOTA_EXHAUSTED
NO_BALANCE
NOT_CONFIGURED
TIMED_OUT
UNKNOWN
```

These states are generic telemetry. There is no provider-specific waiver and no external AI reviewer is required. Only an `AVAILABLE` binding human maintainer counts toward capacity. Optional advisory reviewers are reported separately and cannot satisfy or block the binding requirement.

## Route selection

The selector consumes the exact-head depth result and roster result. It emits either `SELECTED` with a stable route and ordered stages, or `ESCALATE` with missing authority and capability reasons.

Initial automatic routes are fixed by depth:

| Depth | Automatic route |
|---:|---|
| L1 | CI → human maintainer review |
| L2 | CI → mutations → human maintainer evidence review |
| L3 | TRACE/PDG → mutations → human maintainer evidence review → Proof Seal |
| L4 | TRACE/PDG → security → mutations → human maintainer evidence review → human authorization → action gate |

Codex and DeepSeek are optional advisory reviewers. Their availability is diagnostic evidence only; neither reviewer appears in a binding route, counts toward binding capacity or receives merge authority.

The same inputs produce the same route and route key. A shallow route cannot serve a deeper classification.

## Manual route selection

Substitution routes, when configured, are manual-only and require the exact head, selected depth, accountable approver, meaningful reason and all binding actors to be `AVAILABLE`. The normal pull-request workflow does not supply an override.

## Pull request path evidence

For pull requests, the workflow reads the authoritative paginated file list from the GitHub Pull Files API. It does not infer the PR delta with a two-dot Git comparison. For renamed files, both `filename` and `previous_filename` are classified. The exact head repository is checked out explicitly with a read-only token and no persisted credentials.

## Authority boundary

Depth, roster and route decisions are **preflight-only**. They do not approve a pull request, grant READY, authorize merge or execute a side effect. TRACE-001, PDG-001, exact-head evidence, dispositions, Proof Seal and action authorization remain authoritative.

## Repository variables

The workflow reads optional repository variables:

- `CODEX_REVIEWER_STATUS`
- `HUMAN_REVIEWER_STATUS`
- `DEEPSEEK_REVIEWER_STATUS`

The human maintainer defaults to `AVAILABLE`; optional AI reviewers default to `UNKNOWN`. An explicitly unavailable human status produces `ESCALATE`, not indefinite pending.

## Local verification

```bash
npm run verify:review-routing
npm run test:review-routing
```
