# AI reviewer cooperation policy

This repository treats AI reviewers as evidence-producing sensors, not as a voting committee. Requests, acknowledgements, comments, native reviews, provider-limit signals and executable CI remain distinct evidence classes.

## Reviewer roles

- **CodeRabbit is the required request-bound AI reviewer.**
- **Codex, Jules and DeepSeek are advisory.** Their output may add findings but cannot independently satisfy the required AI-review lane.
- **Qodo is disabled.** Its commands, comments, billing notices, statuses and reviews cannot open, block or satisfy a merge gate.
- **CI** remains authoritative for build, security, browser, accessibility, visual, integrity and performance contracts.
- **Maintainer** owns the final release decision but cannot impersonate independent bot evidence.

## Canonical CodeRabbit exact-head request

After every head update, freeze the branch and post a trusted top-level request containing the full 40-character current SHA:

```text
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

A trusted request may be authored by an OWNER, MEMBER or COLLABORATOR. The protected default-branch scheduler may also author the same request with the marker:

```text
<!-- coderabbit-reserve -->
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

A new commit invalidates every earlier request, review result, provider-limit signal and readiness decision.

Optional advisory commands may still be used:

```text
@codex review
@jules review
/deepseek review
/deepseek deep-review
```

Advisory output never replaces the required CodeRabbit lane.

## Bounded CodeRabbit request windows

The default-branch-owned scheduler runs at:

| Europe/Istanbul | UTC cron |
|---:|---|
| 09:00 | `0 6 * * *` |
| 13:00 | `0 10 * * *` |
| 19:00 | `0 16 * * *` |

The scheduler is intentionally bounded:

1. the PR must be open and the head must be at least 45 minutes old;
2. no final exact-head CodeRabbit evidence may already exist;
3. no explicit provider-limit waiver may already exist for the latest request;
4. only one PR may receive a request per scheduled run;
5. one exact head may receive at most three requests per Europe/Istanbul calendar day;
6. retries require at least a three-hour gap;
7. non-draft PRs and the oldest waiting head are prioritized;
8. scheduler code executes from the protected default branch and never executes PR code.

The scheduler can create the initial required request or a bounded retry. It is not a second reviewer and it does not weaken the evidence contract.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted CodeRabbit request exists | None |
| E1 | Trusted exact-head CodeRabbit request exists | None |
| E2 | Provider acknowledged, started, failed, or returned an operational state | Operational only |
| E3 | Response exists but identity or current-head binding is not verified | Advisory only |
| E4 | Verified exact-head CodeRabbit response contains actionable findings | Blocking according to severity |
| E5 | Verified exact-head CodeRabbit response is clean, or all findings are resolved on the current head | Merge-supporting |

Normal CodeRabbit E4/E5 requires:

1. a trusted `@coderabbitai review` request posted after the current workflow freshness anchor;
2. a separate `Exact head: <full SHA>` line;
3. authenticated CodeRabbit bot authorship;
4. a submitted native review with `commit_id` matching the current head, or a canonical completed reviewed-commit comment bound to the current head;
5. publication after the trusted request.

A reaction, acknowledgement, progress message, generic failure, maintainer-authored proxy, spoofed author, stale SHA, pre-request output, pending review, dismissed review or truncated evidence collection cannot satisfy E4/E5.

## Narrow provider-limit waiver

An **explicit authenticated CodeRabbit limit** or quota response may waive only the external AI-review execution step when all of the following are true:

1. the response is authored by the configured CodeRabbit bot identity;
2. it is published after the latest trusted exact-head request;
3. it contains a positive limit signal such as `review limit reached`, `quota exceeded`, `usage limit exhausted`, or `next review available in ...`;
4. it is not a negated statement such as `no review limit was reached`;
5. the PR head has not changed.

The waiver does **not** claim that a review happened. It produces `E2: provider limit waived` and permits only `READY_WITH_ADVISORY_GAPS` after all remaining controls are complete.

The waiver never removes these requirements:

- green required CI;
- required human approval or maintainer attestation under the repository's human policy;
- complete evidence pagination;
- disposition of every active P0-P3 finding;
- a refreshed cooperation report for the exact head;
- a D6 proof seal posted after the latest evidence and dispositions.

Silence, timeout, `provider unavailable`, generic error, billing speculation or a third-party statement does not activate the waiver.

## Stable failure reasons

| Code | Cause | Default action |
|---|---|---|
| `NO_REQUEST` | No trusted CodeRabbit exact-head request exists | Post the canonical request with the full SHA |
| `NO_CURRENT_HEAD_EVIDENCE` | Response is not bound to the current SHA | Wait for a final exact-head review or post a fresh request after a head change |
| `QUOTA_EXHAUSTED` | CodeRabbit returned a verified post-request limit signal | Continue only through the documented human/CI/report/D6 fallback |
| `REQUEST_COOLDOWN` | A request was posted too recently | Wait for the next eligible window |
| `DAILY_HEAD_CAP` | The current head already used all three daily attempts | Wait for the next Europe/Istanbul calendar day |
| `STALE_HEAD` | PR head changed during review | Discard the result and rerun |
| `IDENTITY_UNAVAILABLE` | A provider cannot publish through its configured bot identity | Do not substitute maintainer output |
| `EVIDENCE_TRUNCATED` | Evidence pagination is incomplete | Fail closed and collect every page |
| `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH` | New trusted verifier or scheduler is not yet on the default branch | Merge the governance bootstrap, then validate it on another PR |
| `AUTH_REJECTED` | Credentials or permissions were rejected | Fix permissions; do not downgrade the evidence class |
| `ACTIONABLE_FINDINGS` | P0-P3 findings exist | Resolve according to severity and rerun on the new head |

## Causal aggregation

```text
current head
→ trusted CodeRabbit exact-head request
→ verified CodeRabbit identity
→ final exact-head review OR explicit provider-limit waiver
→ finding/root cause graph
→ dispositions
→ required CI and human decision
→ cooperation report
→ later D6 proof seal
→ overall conclusion
```

Reviewer prose cannot override failing executable checks, and green CI cannot erase a verified P0-P2 finding.

## Overall conclusion rules

1. **BLOCK** — any P0/P1 finding, failing required CI, stale-head publication, trust-boundary breach or forged reviewer identity.
2. **FIX_THEN_RERUN** — any unresolved P2 root cause or contract mismatch.
3. **WAIT_FOR_EVIDENCE** — the trusted CodeRabbit request, final review or verified limit waiver, required CI, disposition or complete pagination is missing.
4. **READY_WITH_ADVISORY_GAPS** — required CI and human controls are complete and either advisory reviewers are unavailable or CodeRabbit has a verified provider-limit waiver.
5. **READY** — required CI is green, CodeRabbit exact-head evidence is complete, evidence collection and dispositions are complete, and actionable findings are resolved.

P3 findings are tracked but do not block unless the maintainer explicitly promotes them.

## Cooperation report

Run:

```text
/ai-cooperation report
```

The report must identify the exact head, show CodeRabbit as the required reviewer, label a verified quota condition as a waiver rather than a review, show Codex/Jules/DeepSeek as advisory, label Qodo disabled, preserve stable reason codes and publish one overall conclusion.
