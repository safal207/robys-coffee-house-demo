# AI reviewer cooperation policy

This repository treats AI reviewers as independent sensors, not as a voting committee. A bot request, an acknowledgement, and a current-head review are different evidence classes and must never be conflated.

## Roles

- **Codex** — required exact-head code-review evidence for merge readiness.
- **Jules** — advisory independent implementation review.
- **CodeRabbit** — advisory structured review and duplicate-finding detection.
- **DeepSeek** — advisory QA/security review through the official API.
- **CI** — authoritative executable evidence for build, security, browser, accessibility, and performance contracts.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No request exists | None |
| E1 | Trusted request exists | None |
| E2 | Bot acknowledged or started work | Operational only |
| E3 | Bot responded, but the response is not bound to the current head | Stale/advisory only |
| E4 | Response, review, or inline finding is bound to the exact current head | Valid review evidence |
| E5 | E4 plus findings are resolved or an explicit clean result is recorded | Merge-supporting evidence |

A generic reaction, “in progress” message, or response for an older SHA cannot satisfy E4.

## Stable failure reasons

| Code | Cause | Default action |
|---|---|---|
| `NO_REQUEST` | No trusted request was posted | Post the canonical command |
| `NO_ACK` | Request exists but the bot never acknowledged it | Retry once after the bot timeout |
| `ACK_ONLY` | Bot acknowledged but produced no review | Wait to timeout, then retry once |
| `NO_CURRENT_HEAD_EVIDENCE` | Response exists but is not tied to the current SHA | Request a fresh review |
| `STALE_HEAD` | PR head changed during review | Discard result and rerun |
| `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH` | An `issue_comment` workflow is changed in the PR but not yet present on the default branch | Merge the bootstrap workflow first, then test it on another PR |
| `AUTH_REJECTED` | Provider rejected credentials or permissions | Stop retries; rotate/fix the secret or permissions |
| `RATE_LIMITED` | Provider returned a rate-limit response | Retry with bounded backoff |
| `PROVIDER_UNAVAILABLE` | Provider or bot returned a server-side failure | Retry once; keep as advisory gap if CI is healthy |
| `PERMISSION_ERROR` | Bot cannot create or update its comment/review | Fix token permissions or switch to one owned persistent comment |
| `INCOMPLETE_RESPONSE` | Model stopped because of length or filtering | Increase budget or reduce prompt; do not treat as review evidence |
| `ACTIONABLE_FINDINGS` | P0-P3 findings are present | Resolve according to severity and rerun on the new head |
| `NOISE_ONLY` | Output contains no evidence-backed actionable content | Record as advisory, not as a blocker |

## Timeouts and retries

- Codex: wait up to 10 minutes; retry once with a fresh exact command.
- Jules: wait up to 15 minutes; retry once. Missing Jules output is visible but advisory.
- CodeRabbit: wait up to 15 minutes. Retry once after provider or comment-update failure.
- DeepSeek: workflow timeout is 10 minutes. Retry 429 and transient 5xx/network failures with bounded backoff; never retry 401/403 automatically.
- No bot may create an unbounded retry loop.

## Causal aggregation

The cooperation report collapses duplicate observations by root cause. Three bots repeating the same defect count as one causal finding with stronger corroboration, not three independent blockers.

The report graph follows this direction:

`current head -> request -> acknowledgement -> exact-head evidence -> finding/root cause -> required action -> overall conclusion`

CI evidence enters the graph independently. Bot consensus cannot override failing executable checks, and green CI cannot erase a verified P0-P2 correctness or security finding.

## Overall conclusion rules

1. **BLOCK** — any P0/P1 finding, failing required CI, stale-head publication, or trust-boundary breach.
2. **FIX_THEN_RERUN** — any unresolved P2 finding.
3. **WAIT_FOR_EVIDENCE** — required Codex exact-head evidence or required CI is still pending.
4. **READY_WITH_ADVISORY_GAPS** — required CI and Codex are green, no unresolved P0-P2 exists, but Jules/CodeRabbit/DeepSeek has an outage or no response.
5. **READY** — required CI is green, exact-head Codex evidence exists, and all available actionable findings are resolved.

P3 findings are tracked but do not block unless the maintainer explicitly promotes them.

## Commands

- `@codex review`
- `@jules review`
- `@coderabbitai review`
- `/deepseek review`
- `/deepseek deep-review`
- `/ai-cooperation report`

The cooperation report updates one persistent PR comment and includes a Mermaid causal graph, a bot evidence table, reason codes, next actions, and one overall conclusion.
