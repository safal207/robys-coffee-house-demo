# Review Route Preflight

`RRM-001`, `RRM-002` and `RRM-003` form the first Review Route Memory decision chain. Their machine-readable contracts are `RRM-DEPTH-001`, `RRM-ROSTER-001` and `RRM-ROUTE-001`.

They answer three questions before review execution:

1. **How deep must this change be reviewed?**
2. **Which configured reviewers are actually runtime-ready for that depth?**
3. **Which exact ordered route is eligible for this head?**

```text
changed paths + explicit risk signals
→ L1 / L2 / L3 / L4
→ runtime roster probe
→ deterministic route or ESCALATE
```

## Depth levels

| Level | Meaning | Initial minimum |
|---:|---|---|
| L1 | Low-risk, reversible documentation or copy change | one binding reviewer |
| L2 | Product or runtime behavior | mutations and two binding reviewers |
| L3 | Workflow, security, QA or governance | complete PDG proof route plus a maintainer seal |
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

`PARTIAL` means that orchestration or status evidence exists but the reviewer did not complete the required content-analysis surface. It does not count as `AVAILABLE`.

Only `AVAILABLE` binding reviewers count toward capacity. Advisory reviewers are reported separately and cannot satisfy or block the binding requirement. Runtime availability is not a model-quality score.

## Route selection

The selector consumes the exact-head depth result and roster result. It emits either:

```text
SELECTED
- routeId
- stable routeKey
- ordered stages
- exact actors and roles
- selection mode
```

or:

```text
ESCALATE
- proposed route
- missing actors
- partial actors
- missing capabilities
- roster reasons
```

Initial automatic routes are fixed by depth:

| Depth | Automatic route |
|---:|---|
| L1 | CI → CodeRabbit |
| L2 | CI → mutations → CodeRabbit risk review → Codex evidence review |
| L3 | TRACE/PDG → mutations → CodeRabbit → Codex → maintainer Proof Seal |
| L4 | TRACE/PDG → security → mutations → CodeRabbit → Codex → human authorization → action gate |

The same inputs produce the same route and route key. A shallow route cannot serve a deeper classification.

## Manual route selection

Substitution routes are **manual-only**. They require all of the following:

- a manual route ID;
- the exact 40-character head SHA;
- the exact selected depth;
- an accountable approver identifier;
- a meaningful reason;
- all actors in the selected route to be `AVAILABLE` and binding.

Manual selection is recorded in `overrideAudit` and the selected route remains marked `governanceExceptionRequired: true`. It cannot silently turn an unavailable reviewer into an available one.

The normal pull-request workflow never supplies an override. The optional override input exists only on trusted `workflow_dispatch` executions.

## Pull request path evidence

For pull requests, the workflow reads the authoritative paginated file list from the GitHub Pull Files API. It does not infer the PR delta with a two-dot Git comparison, so unrelated base-branch movement cannot raise the selected depth. For renamed files, both `filename` and `previous_filename` are classified so moving a sensitive file to a benign path cannot lower the review floor. The exact head repository is checked out explicitly, including fork repositories, with a read-only token and no persisted credentials.

## Authority boundary

Depth, roster and route decisions are **preflight-only**. They do not approve a pull request, grant READY, authorize merge or execute a side effect. TRACE-001, PDG-001, exact-head evidence, dispositions, Proof Seal and action authorization remain authoritative.

## Repository variables

The workflow reads optional repository variables:

- `CODERABBIT_REVIEWER_STATUS`
- `CODEX_REVIEWER_STATUS`
- `HUMAN_REVIEWER_STATUS`
- `DEEPSEEK_REVIEWER_STATUS`

Missing variables resolve to `UNKNOWN`. Insufficient capacity or an ineligible standard route produces `ESCALATE`, not indefinite `pending`.

## Local verification

```bash
npm run verify:review-routing
npm run test:review-routing
```
