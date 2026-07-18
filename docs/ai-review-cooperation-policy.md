# AI reviewer cooperation policy

This repository treats AI reviewers as evidence-producing sensors, not as a voting committee. Requests, acknowledgements, comments, native reviews and executable CI remain distinct evidence classes.

## Reviewer roles

- **Codex** is the sole required request-bound AI reviewer.
- **Qodo is disabled.** Its commands, comments, billing notices, statuses and reviews cannot open, block or satisfy a merge gate.
- **CodeRabbit is a bounded scheduled reserve.** It may be requested at 09:00, 13:00 and 19:00 Europe/Istanbul only when Codex exact-head evidence is still missing after the bounded wait. CodeRabbit does not replace Codex and its absence never blocks readiness.
- **Jules and DeepSeek** remain optional advisory reviewers.
- **CI** remains the authoritative executable evidence for build, security, browser, accessibility, visual, integrity and performance contracts.
- **Maintainer** owns the final release decision but cannot impersonate independent bot evidence.

## Canonical Codex exact-head request

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

## CodeRabbit reserve windows

The default-branch-owned `CodeRabbit reserve windows` workflow runs at:

| Europe/Istanbul | UTC cron |
|---:|---|
| 09:00 | `0 6 * * *` |
| 13:00 | `0 10 * * *` |
| 19:00 | `0 16 * * *` |

The dispatcher is intentionally conservative:

1. an open PR must already contain a trusted Codex exact-head request;
2. no acceptable Codex exact-head evidence may exist;
3. at least 45 minutes must have passed since the latest trusted Codex request;
4. no current-head CodeRabbit evidence may already exist;
5. only one PR may receive a reserve request per scheduled run;
6. one exact head may receive at most three reserve requests per Europe/Istanbul calendar day;
7. retries require at least a three-hour gap, including after a provider-limit signal;
8. non-draft PRs and the oldest waiting Codex request are prioritized;
9. the workflow executes dispatcher code from the protected default branch and never executes PR code.

The trusted reserve request is authored by `github-actions[bot]` and contains:

```text
<!-- coderabbit-reserve -->
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

Provider availability cannot be known before a request. The schedule therefore performs bounded probes: if CodeRabbit is rate-limited or unavailable, there is no immediate retry; the next eligible window may try again.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted Codex request exists | None |
| E1 | Trusted exact-head Codex request exists | None |
| E2 | Codex acknowledged or started work | Operational only |
| E3 | Codex responded, but bot identity or current-head binding is not verified | Advisory only |
| E4 | Verified exact-head reviewer response contains actionable findings | Blocking according to severity |
| E5 | Verified exact-head reviewer response is clean, or all findings are resolved on the current head | Merge-supporting for Codex; advisory for CodeRabbit |

Codex E4/E5 requires:

1. a trusted `@codex review` request posted after the current workflow freshness anchor;
2. a separate `Exact head: <full SHA>` line;
3. authenticated Codex bot authorship;
4. a native review `commit_id` matching the current head, or the canonical Codex reviewed-commit comment bound to the current head;
5. publication after the trusted request.

CodeRabbit evidence is accepted only after the default-branch reserve marker request, from the exact configured CodeRabbit bot identity, and bound to the current head. A clean CodeRabbit review cannot satisfy the required Codex lane. Verified CodeRabbit P0-P2 findings still enter the causal finding graph and must be resolved.

A reaction, acknowledgement, status-only result, maintainer-authored proxy, spoofed author, stale SHA, pre-request output, pending review, dismissed review or truncated evidence collection cannot satisfy E4/E5.

## Trusted execution boundary

The `AI review contract` workflow executes the verifier from GitHub's supplied pull-request base SHA:

```text
${{ github.event.pull_request.base.sha }}
```

The required-review workflow therefore never executes verifier code from the untrusted PR branch. The scheduled reserve workflow checks out the protected default branch. A PR that introduces either governance path cannot authoritatively self-prove it; the new contract becomes active only after it reaches the protected default branch and runs on a subsequent PR head.

## Stable failure reasons

| Code | Cause | Default action |
|---|---|---|
| `NO_REQUEST` | No trusted Codex exact-head request exists | Post the canonical request with the full SHA |
| `NO_ACK` | Request exists but Codex never acknowledged it | Wait to the bounded timeout, then retry once |
| `NO_CURRENT_HEAD_EVIDENCE` | Response is not bound to the current SHA | Post a fresh exact-head request |
| `SCHEDULED_RESERVE` | CodeRabbit is standing by for the next bounded window | No action unless Codex remains unavailable |
| `RESERVE_COOLDOWN` | A reserve request was posted too recently | Wait for the next eligible window |
| `DAILY_HEAD_CAP` | The current head already used all three daily reserve attempts | Wait for the next Europe/Istanbul calendar day |
| `PROVIDER_LIMIT_COOLDOWN` | CodeRabbit reported a recent limit condition | Do not retry until a later scheduled window |
| `STALE_HEAD` | PR head changed during review | Discard the result and rerun |
| `IDENTITY_UNAVAILABLE` | A provider cannot publish through its configured bot identity | Do not substitute maintainer output |
| `EVIDENCE_TRUNCATED` | Evidence pagination is incomplete | Fail closed and collect every page |
| `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH` | New trusted verifier or scheduler is not yet on the default branch | Merge the governance bootstrap, then validate it on another PR |
| `AUTH_REJECTED` | Credentials or permissions were rejected | Fix permissions; do not downgrade the evidence class |
| `RATE_LIMITED` | Provider returned a rate-limit response | Wait for the next bounded window |
| `PROVIDER_UNAVAILABLE` | Provider returned a server-side failure | Retry only through the bounded schedule |
| `ACTIONABLE_FINDINGS` | P0-P3 findings exist | Resolve according to severity and rerun on the new head |

## Timeouts and retries

- Codex waits within the bounded workflow window and may be requested once again after timeout.
- CodeRabbit is probed only at the three reserve windows, with one PR per run, a three-hour retry gap and three attempts per head per local day.
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
→ optional scheduled CodeRabbit reserve evidence
→ finding/root cause
→ disposition
→ required action
→ overall conclusion
```

Required CI, reviewer identity, commit binding, disposition completeness and evidence-collection completeness enter the graph independently. Reviewer prose cannot override failing executable checks, and green CI cannot erase a verified P0-P2 finding.

## Overall conclusion rules

1. **BLOCK** — any P0/P1 finding, failing required CI, stale-head publication, trust-boundary breach or forged reviewer identity.
2. **FIX_THEN_RERUN** — any unresolved P2 root cause or contract mismatch, including a verified CodeRabbit reserve finding.
3. **WAIT_FOR_EVIDENCE** — Codex exact-head evidence, required CI, disposition or complete pagination is missing.
4. **READY_WITH_ADVISORY_GAPS** — required CI and Codex are complete, no unresolved P0-P2 exists, but optional reviewers are unavailable.
5. **READY** — required CI is green, Codex exact-head evidence is complete, evidence collection and dispositions are complete, and actionable findings are resolved.

CodeRabbit being idle, rate-limited or absent is not itself an advisory gap and never blocks readiness. P3 findings are tracked but do not block unless the maintainer explicitly promotes them.

## Cooperation report

Run:

```text
/ai-cooperation report
```

The report must identify the exact head, show Codex as the only required reviewer, label Qodo disabled, label CodeRabbit as scheduled reserve, preserve stable reason codes and publish one overall conclusion.
