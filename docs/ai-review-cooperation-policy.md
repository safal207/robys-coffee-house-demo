# AI reviewer cooperation policy

This repository treats AI reviewers as evidence-producing sensors, not as a voting committee. Requests, acknowledgements, comments, native reviews and executable CI remain distinct evidence classes.

## Active reviewer

- **Codex** is the sole active request-bound AI reviewer.
- **Qodo is disabled.** Its commands, comments, billing notices, statuses and reviews cannot open, block or satisfy a merge gate.
- **CodeRabbit is disabled.** Its output is historical/advisory only.
- **Jules and DeepSeek** remain optional advisory reviewers.
- **CI** remains the authoritative executable evidence for build, security, browser, accessibility, visual, integrity and performance contracts.
- **Maintainer** owns the final release decision but cannot impersonate independent bot evidence.

## Canonical exact-head request

After every head update, freeze the branch and post a trusted top-level request containing the full 40-character current SHA:

```text
@codex review
Exact head: <full 40-character current head SHA>
```

A new commit invalidates every earlier request and review result. The request must be posted again for the new head.

Optional advisory commands may still be used:

```text
@jules review
/deepseek review
/deepseek deep-review
```

Advisory output never replaces the required Codex lane.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted Codex request exists | None |
| E1 | Trusted exact-head Codex request exists | None |
| E2 | Codex acknowledged or started work | Operational only |
| E3 | Codex responded, but bot identity or current-head binding is not verified | Advisory only |
| E4 | Verified exact-head Codex response contains actionable findings | Blocking according to severity |
| E5 | Verified exact-head Codex response is clean, or all findings are resolved on the current head | Merge-supporting evidence |

E4/E5 requires:

1. a trusted `@codex review` request posted after the current workflow freshness anchor;
2. a separate `Exact head: <full SHA>` line;
3. authenticated Codex bot authorship;
4. a native review `commit_id` matching the current head, or the canonical Codex reviewed-commit comment bound to the current head;
5. publication after the trusted request.

A reaction, acknowledgement, status-only result, maintainer-authored proxy, spoofed author, stale SHA, pre-request output, pending review, dismissed review or truncated evidence collection cannot satisfy E4/E5.

## Trusted execution boundary

The `AI review contract` workflow executes the verifier from GitHub's supplied pull-request base SHA:

```text
${{ github.event.pull_request.base.sha }}
```

The workflow therefore never executes verifier code from the untrusted PR branch. A PR that introduces a new verifier cannot self-prove that verifier; the new contract becomes authoritative only after it reaches the protected default branch and runs on a subsequent PR head.

## Stable failure reasons

| Code | Cause | Default action |
|---|---|---|
| `NO_REQUEST` | No trusted Codex exact-head request exists | Post the canonical request with the full SHA |
| `NO_ACK` | Request exists but Codex never acknowledged it | Wait to the bounded timeout, then retry once |
| `NO_CURRENT_HEAD_EVIDENCE` | Response is not bound to the current SHA | Post a fresh exact-head request |
| `STALE_HEAD` | PR head changed during review | Discard the result and rerun |
| `IDENTITY_UNAVAILABLE` | Codex cannot publish through its configured bot identity | Keep readiness blocked; do not substitute maintainer output |
| `EVIDENCE_TRUNCATED` | Evidence pagination is incomplete | Fail closed and collect every page |
| `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH` | New trusted verifier is not yet on the default branch | Merge the governance bootstrap, then validate it on another PR |
| `AUTH_REJECTED` | Credentials or permissions were rejected | Fix permissions; do not downgrade the evidence class |
| `RATE_LIMITED` | Provider returned a rate-limit response | Retry once with bounded backoff |
| `PROVIDER_UNAVAILABLE` | Provider returned a server-side failure | Retry once; required evidence remains blocked |
| `ACTIONABLE_FINDINGS` | P0-P3 findings exist | Resolve according to severity and rerun on the new head |

## Timeouts and retries

- Codex waits within the bounded workflow window and may be requested once again after timeout.
- Jules and DeepSeek remain optional and use bounded retries.
- No reviewer may create an unbounded retry loop.
- Qodo receives no new requests and has no timeout or fallback role.

## Causal aggregation

The evidence graph is:

```text
current head
→ trusted Codex exact-head request
→ verified Codex bot identity
→ exact-head response
→ finding/root cause
→ disposition
→ required action
→ overall conclusion
```

Required CI, reviewer identity, commit binding, disposition completeness and evidence-collection completeness enter the graph independently. Reviewer prose cannot override failing executable checks, and green CI cannot erase a verified P0-P2 finding.

## Overall conclusion rules

1. **BLOCK** — any P0/P1 finding, failing required CI, stale-head publication, trust-boundary breach or forged reviewer identity.
2. **FIX_THEN_RERUN** — any unresolved P2 root cause or contract mismatch.
3. **WAIT_FOR_EVIDENCE** — Codex exact-head evidence, required CI, disposition or complete pagination is missing.
4. **READY_WITH_ADVISORY_GAPS** — required CI and Codex are complete, no unresolved P0-P2 exists, but optional reviewers are unavailable.
5. **READY** — required CI is green, Codex exact-head evidence is complete, evidence collection and dispositions are complete, and actionable findings are resolved.

P3 findings are tracked but do not block unless the maintainer explicitly promotes them.

## Cooperation report

Run:

```text
/ai-cooperation report
```

The report must identify the exact head, show Codex as the only required reviewer, label Qodo and CodeRabbit as disabled, preserve stable reason codes and publish one overall conclusion.
