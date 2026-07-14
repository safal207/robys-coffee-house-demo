# AI reviewer cooperation policy

This repository treats AI reviewers as independent sensors, not as a voting committee. A request, an acknowledgement, a reaction, a status, a maintainer-authored note, and a native exact-head bot review are different evidence classes and must never be conflated.

## Required independent-review capability

The required lane is a provider pool rather than a permanent dependency on one vendor:

1. **Qodo** is the primary native exact-head reviewer.
2. **Codex** and **CodeRabbit** are native exact-head fallback reviewers.
3. **Jules** and **DeepSeek** remain advisory.
4. **CI** remains authoritative executable evidence for build, security, browser, accessibility, visual, integrity, and performance contracts.
5. **Maintainer** owns the final release decision but cannot impersonate an independent reviewer.

A provider name is not the capability. The capability is a request-bound native Bot review whose `commit_id` equals the current head.

## Canonical temporal sequence

After every head update, freeze the branch and post the primary request:

```text
/qodo review
```

If no native Qodo review appears after 15 minutes, post exactly one second trusted `/qodo review` request. The two trusted `/qodo review` requests must be at least 15 minutes apart.

Fallback becomes eligible only after another 15 minutes has elapsed after the second Qodo request and no native exact-head Qodo review exists. Fallback requests may be posted after the second Qodo request so the independent reviewers can work in parallel:

```text
@codex review
@coderabbitai review
```

The first qualifying native exact-head Codex or CodeRabbit Bot review may satisfy the required lane after fallback eligibility is reached. Status-only evidence, reactions, acknowledgements, summaries, owner-authored connector output, and maintainer proxy reviews never satisfy the required lane.

A new commit invalidates every request, timeout window, review, report, disposition, proof seal, and merge-ready decision associated with the previous head.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted request exists | None |
| E1 | Trusted exact-head request exists | None |
| E2 | Bot acknowledged or started work | Operational only |
| E3 | Bot responded, but identity or exact-head binding is not verified | Advisory only |
| E4 | Verified request-bound exact-head Bot review contains actionable findings | Blocking/advisory according to severity |
| E5 | Verified request-bound exact-head Bot review is clean, or all findings are resolved on the current head | Merge-supporting evidence |

A reaction, “in progress” message, status-only result, issue comment without native commit binding, owner-authored proxy, spoofed author, older-SHA response, pending review, dismissed review, resolved thread by itself, or truncated collection cannot satisfy E4/E5.

## Identity and binding

Evidence is accepted only from exact allowlisted GitHub logins:

- Qodo: `qodo-code-review`, `qodo-code-review[bot]`
- Codex: `chatgpt-codex-connector`, `chatgpt-codex-connector[bot]`
- CodeRabbit: `coderabbitai`, `coderabbitai[bot]`

For all required providers:

- `user.type` must equal `Bot`;
- the review must be submitted and not `PENDING` or `DISMISSED`;
- `commit_id` must equal the full current head;
- the review must be submitted after that provider’s trusted request;
- the trusted request must be created after the immutable workflow-run anchor.

## Fallback invariants

Fallback is fail-closed and cannot be used to shop for a more favorable answer:

- two trusted `/qodo review` requests are required;
- the requests must be at least 15 minutes apart;
- 15 additional minutes must pass after the second request;
- fallback requests must not predate the second Qodo request;
- a late Qodo review takes primary precedence;
- findings from every responding reviewer remain binding;
- a later bot review invalidates any older cooperation report and D6 seal;
- a head change resets the whole state machine.

## Stable failure reasons

| Code | Cause | Default action |
|---|---|---|
| `NO_REQUEST` | No trusted exact-head request was posted | Post the canonical command |
| `ACK_ONLY` | Bot acknowledged but produced no native review | Wait to timeout; retry only as policy permits |
| `QODO_TIMEOUT_1_PENDING` | The first Qodo wait window is incomplete | Wait or post the second request after 15 minutes |
| `QODO_TIMEOUT_2_PENDING` | The second Qodo wait window is incomplete | Wait until 15 minutes after the second request |
| `QODO_TIMEOUT_2` | Both Qodo windows elapsed without native evidence | Use request-bound Codex or CodeRabbit fallback |
| `NO_CURRENT_HEAD_EVIDENCE` | Response exists but is not bound to the current SHA | Request a fresh exact-head review |
| `STALE_HEAD` | PR head changed during review or before publication | Discard the result and restart |
| `IDENTITY_UNAVAILABLE` | Provider cannot publish through its configured Bot identity | Use another eligible provider; never substitute a maintainer identity |
| `EVIDENCE_TRUNCATED` | Collection did not include every page of evidence | Fail closed and paginate fully |
| `PROVIDER_UNAVAILABLE` | Provider timed out or returned a server-side failure | Apply bounded retry/fallback policy |
| `PERMISSION_ERROR` | Workflow cannot read native evidence | Fix permissions; do not downgrade evidence |
| `ACTIONABLE_FINDINGS` | P0-P3 findings are present | Resolve findings and rerun on the new head |

## Trusted-code boundary

The `AI review contract` always checks out its verifier from the protected default branch. Pull-request code cannot replace the verifier that judges the same pull request.

This trust patch changes only the default-branch AI-review gate and its read-only contracts. The cooperation report and D6 ledger remain on their legacy CodeRabbit rule until the governance bootstrap in PR #208 aligns those downstream stages. Therefore fallback evidence cannot produce a final merge by itself during the transition; it can only unblock independent review of the #208 changes that complete the migration.

## Required CI and final decision

Required executable checks, reviewer identity, exact-head binding, evidence completeness, finding dispositions, report freshness, D6 provenance, and the append-only `/merge-ready <SHA>` decision remain independent gates. Bot consensus cannot override failing CI, and green CI cannot erase verified P0-P2 findings.

After the downstream migration is complete, the cooperation report and D6 seal must state:

```text
Required-Reviewer: <Qodo|Codex|CodeRabbit>
Review-Mode: <primary|fallback>
Primary-Failure: <none|QODO_TIMEOUT_2>
```

No reviewer may create an unbounded retry loop.
