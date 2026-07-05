# AI reviewer cooperation policy

This repository treats AI reviewers as independent sensors, not as a voting committee. A request, an acknowledgement, a status comment, a maintainer-authored note, and an exact-head bot review are different evidence classes and must never be conflated.

## Roles

- **CodeRabbit** — mandatory independent AI review lane on the current GitHub surface.
- **Codex** — supplemental review lane; it becomes independent evidence only when the configured Codex bot itself publishes an exact-head pull-request review object.
- **Jules** — advisory implementation review.
- **DeepSeek** — advisory QA/security review through the official API workflow.
- **CI** — authoritative executable evidence for build, security, browser, accessibility, visual, integrity, and performance contracts.
- **Maintainer** — owns the final release decision but cannot impersonate an independent reviewer.

The mandatory lane is capability-aware, not identity-substituted. When a provider cannot publish through its configured bot identity, that limitation is recorded openly and its owner-authored output remains advisory.

## Canonical exact-head requests

After every head update, freeze the branch and post a fresh trusted top-level request containing the full 40-character current SHA:

```text
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

The supplemental Codex request uses the same binding:

```text
@codex review

Exact head: <full 40-character current head SHA>
```

A new commit invalidates all earlier requests and review evidence. The request must be reposted with the new SHA.

Optional advisory commands remain:

```text
@jules review
/deepseek review
/deepseek deep-review
```

Advisory output is exact-head evidence only when the provider response identifies or is natively bound to the current commit.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted request exists | None |
| E1 | Trusted exact-head request exists | None |
| E2 | Bot acknowledged or started work | Operational only |
| E3 | Bot responded, but identity or current-head binding is not verified | Advisory only |
| E4 | Verified exact-head bot response contains actionable findings | Blocking/advisory according to severity |
| E5 | Verified exact-head bot response is clean, or all findings are resolved on the current head | Merge-supporting evidence |

A reaction, “in progress” message, issue status comment without commit binding, owner-authored proxy, spoofed author, older-SHA response, resolved thread by itself, or truncated evidence collection cannot satisfy E4/E5.

For the mandatory CodeRabbit lane, E4/E5 requires a CodeRabbit-authored pull-request review object whose `commit_id` equals the current head and whose publication follows the fresh exact-head request.

For Codex, E4/E5 is independent evidence only when the configured Codex bot publishes an equivalent exact-head review object. Connector output authored as the repository owner is E3 advisory evidence at most.

## Stable failure reasons

| Code | Cause | Default action |
|---|---|---|
| `NO_REQUEST` | No trusted exact-head request was posted | Post the canonical command with the full SHA |
| `NO_ACK` | Request exists but the bot never acknowledged it | Retry once after the bot timeout |
| `ACK_ONLY` | Bot acknowledged but produced no review object | Wait to timeout, then retry once |
| `NO_CURRENT_HEAD_EVIDENCE` | Response exists but is not bound to the current SHA | Request a fresh exact-head review |
| `STALE_HEAD` | PR head changed during review or before publication | Discard the result and rerun |
| `IDENTITY_UNAVAILABLE` | Provider cannot publish through the configured bot identity | Record the lane as supplemental/advisory; never substitute a maintainer identity |
| `EVIDENCE_TRUNCATED` | Not every check, review, thread, or thread comment was collected | Fail closed; paginate fully before evaluating readiness |
| `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH` | An `issue_comment` workflow is changed in the PR but not yet present on the default branch | Merge the bootstrap workflow first, then test it on another PR |
| `AUTH_REJECTED` | Provider rejected credentials or permissions | Stop retries; rotate/fix the secret or permissions |
| `RATE_LIMITED` | Provider returned a rate-limit response | Retry with bounded backoff |
| `PROVIDER_UNAVAILABLE` | Provider or bot returned a server-side failure | Retry once; keep required evidence blocked |
| `PERMISSION_ERROR` | Bot cannot create its required review object | Fix permissions or provider configuration; do not downgrade to an unbound comment |
| `INCOMPLETE_RESPONSE` | Model stopped because of length, filtering, missing completion metadata, or interruption | Do not publish as successful evidence; reduce scope or retry as policy allows |
| `ACTIONABLE_FINDINGS` | P0-P3 findings are present | Resolve according to severity and rerun on the new head |
| `NOISE_ONLY` | Output contains no evidence-backed actionable content | Record as advisory, not as a blocker |

## Trusted identities and binding

Evidence is accepted only from exact GitHub logins maintained in the executable contract. Substring matching is forbidden. Mandatory review evidence must use the native pull-request review `commit_id`; prose that merely repeats a SHA is not a substitute.

DeepSeek report comments are accepted only from `github-actions[bot]` and must include the exact reviewed commit. Maintainer-authored comments and reviews never satisfy an independent reviewer lane.

## Required CI

Only explicit required-check allowlists contribute to `BLOCK`, `WAIT_FOR_EVIDENCE`, or `READY`. Optional and experimental checks remain visible but cannot silently become merge requirements. Branch protection remains the final enforcement layer for status checks.

## Timeouts and retries

- CodeRabbit: wait up to 15 minutes; retry once after a provider, permission, or auto-pause interruption.
- Codex: wait up to 10 minutes when a native bot surface is configured; otherwise record `IDENTITY_UNAVAILABLE` and keep the lane supplemental.
- Jules: wait up to 15 minutes; retry once. Missing Jules output remains advisory.
- DeepSeek: workflow timeout is 10 minutes. Retry 429 and transient 5xx/network failures with bounded backoff; never retry 401/403 automatically.
- No reviewer may create an unbounded retry loop.

## Causal aggregation

The cooperation report collapses duplicate observations by normalized root-cause signature. Three reviewers repeating the same defect count as one causal finding with stronger corroboration, not three independent blockers.

The report graph follows this direction:

`current head -> trusted exact-head request -> verified reviewer identity -> exact-head evidence -> finding/root cause -> disposition -> required action -> overall conclusion`

Required CI, reviewer identity, commit binding, disposition completeness, and evidence-collection completeness enter the graph independently. Bot consensus cannot override failing required checks, and green CI cannot erase a verified P0-P2 correctness or security finding.

## Overall conclusion rules

1. **BLOCK** — any P0/P1 finding, failing required CI, stale-head publication, trust-boundary breach, or forged reviewer identity.
2. **FIX_THEN_RERUN** — any unresolved P2 root cause or contract/documentation mismatch.
3. **WAIT_FOR_EVIDENCE** — the mandatory independent CodeRabbit exact-head review, required CI, disposition, or complete pagination is missing.
4. **READY_WITH_ADVISORY_GAPS** — required CI and CodeRabbit are E5, no unresolved P0-P2 exists, but a supplemental reviewer is unavailable or incomplete.
5. **READY** — required CI is green, mandatory independent exact-head evidence is E5, evidence collection and dispositions are complete, and all available actionable findings are resolved.

P3 findings are tracked but do not block unless the maintainer explicitly promotes them.

## Cooperation report

Run:

```text
/ai-cooperation report
```

The report must identify the exact head, distinguish mandatory independent evidence from supplemental lanes, show stable reason codes and dispositions, and publish one overall conclusion. It may summarize advisory reviewers, but it must never upgrade owner-authored output into independent bot evidence.
