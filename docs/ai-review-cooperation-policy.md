# AI reviewer cooperation policy

This repository treats AI reviewers as independent sensors, not as a voting committee. A request, an acknowledgement, a status comment, a maintainer-authored note, and an exact-head bot review are different evidence classes and must never be conflated.

## Roles

- **Qodo** — mandatory independent exact-head review lane.
- **CodeRabbit** — supplemental review lane.
- **Codex** — supplemental review lane; it becomes independent evidence only when the configured Codex bot itself publishes an exact-head pull-request review object.
- **Jules** — advisory implementation review.
- **Grok** — advisory QA/security review through the official xAI API workflow.
- **DeepSeek** — advisory QA/security review through the official DeepSeek API workflow.
- **CI** — authoritative executable evidence for build, security, browser, accessibility, visual, integrity, and performance contracts.
- **Maintainer** — owns the final release decision but cannot impersonate an independent reviewer.

The mandatory lane is capability-aware, not identity-substituted. When a provider cannot publish through its configured identity, that limitation is recorded openly and its owner-authored output remains advisory.

## Canonical exact-head requests

After every head update, freeze the branch and post a fresh trusted Qodo approval command after the immutable workflow-run freshness anchor:

```text
/qodo review
```

The supplemental native-bot requests are:

```text
@coderabbitai review
@codex review
@jules review
```

The API-backed advisory requests are:

```text
/grok review
/grok deep-review
/deepseek review
/deepseek deep-review
```

A new commit invalidates all earlier requests and review evidence. Every reviewer result must be bound to the new exact head.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted request exists | None |
| E1 | Trusted exact-head request exists | None |
| E2 | Bot acknowledged or started work | Operational only |
| E3 | Bot responded, but identity or current-head binding is not verified | Advisory only |
| E4 | Verified exact-head response contains actionable findings | Blocking/advisory according to severity |
| E5 | Verified exact-head response is clean, or all findings are resolved on the current head | Merge-supporting evidence |

A reaction, “in progress” message, issue status comment without commit binding, owner-authored proxy, spoofed author, older-SHA response, resolved thread by itself, or truncated evidence collection cannot satisfy E4/E5.

For the mandatory Qodo lane, E4/E5 requires both:

1. a trusted maintainer `/qodo review` approval created after the immutable workflow-run freshness anchor;
2. a Qodo-authored pull-request review object whose `commit_id` equals the current head and whose publication follows that request.

For Codex and CodeRabbit, E4/E5 is independent evidence only when the configured bot publishes an equivalent exact-head review object. Connector output authored as the repository owner is E3 advisory evidence at most.

Grok and DeepSeek report comments are advisory E4/E5 only when:

- the command was posted by a trusted repository association;
- the workflow result is authored by `github-actions[bot]`;
- the provider marker is present;
- the full reviewed commit equals the current head;
- the PR head is re-read before publication.

The canonical machine binding may be stored in an HTML comment so it remains parser-visible without introducing untranslated user-facing copy.

## Stable failure reasons

| Code | Cause | Default action |
|---|---|---|
| `NO_REQUEST` | No trusted exact-head request was posted | Post the canonical command |
| `NO_ACK` | Request exists but the bot never acknowledged it | Retry once after the bot timeout |
| `ACK_ONLY` | Bot acknowledged but produced no review object | Wait to timeout, then retry once |
| `NO_CURRENT_HEAD_EVIDENCE` | Response exists but is not bound to the current SHA | Request a fresh exact-head review |
| `STALE_HEAD` | PR head changed during review or before publication | Discard the result and rerun |
| `IDENTITY_UNAVAILABLE` | Provider cannot publish through the configured identity | Record the lane as supplemental/advisory; never substitute a maintainer identity |
| `EVIDENCE_TRUNCATED` | Not every check, review, thread, or thread comment was collected | Fail closed; paginate fully before evaluating readiness |
| `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH` | A default-branch-only reviewer or reporter is changed in the PR but is not yet executable from the default branch | Apply `BOOTSTRAP-001`; merge the governance-only phase first, then validate live behavior on the named post-merge PR |
| `MISSING_CONFIGURATION` | Required reviewer secret or configuration is absent | Add the required secret/configuration before rerunning |
| `AUTH_REJECTED` | Provider rejected credentials or permissions | Stop retries; rotate/fix the secret or permissions |
| `RATE_LIMITED` | Provider returned a rate-limit response | Retry with bounded backoff |
| `PROVIDER_UNAVAILABLE` | Provider or bot returned a server-side failure | Retry once; keep required evidence blocked only when the mandatory lane is affected |
| `PERMISSION_ERROR` | Bot cannot create its required review object | Fix permissions or provider configuration; do not downgrade to an unbound comment |
| `INCOMPLETE_RESPONSE` | Model stopped because of length, filtering, missing completion metadata, or interruption | Do not publish as successful evidence; reduce scope or retry as policy allows |
| `ACTIONABLE_FINDINGS` | P0-P3 findings are present | Resolve according to severity and rerun on the new head |
| `NOISE_ONLY` | Output contains no evidence-backed actionable content | Record as advisory, not as a blocker |

## Trusted identities and binding

Evidence is accepted only from exact GitHub logins maintained in the executable contract. Substring matching is forbidden. Mandatory review evidence must use the native pull-request review `commit_id`; prose that merely repeats a SHA is not a substitute.

Grok output uses marker `<!-- grok-pr-review -->`; DeepSeek output uses marker `<!-- deepseek-pr-review -->`. Both must be authored by `github-actions[bot]` and include the full exact reviewed commit. Maintainer-authored comments and reviews never satisfy an independent reviewer lane.

## Required configuration

- Qodo GitHub App installed and permitted to review pull requests.
- `XAI_API_KEY` repository Actions secret for Grok.
- `DEEPSEEK_API_KEY` repository Actions secret for DeepSeek.

The Grok workflow uses the official xAI API endpoint and defaults to model `grok-4.5`.

## Required CI

Only explicit required-check allowlists contribute to `BLOCK`, `WAIT_FOR_EVIDENCE`, or `READY`. Optional and experimental checks remain visible but cannot silently become merge requirements. Branch protection remains the final enforcement layer for status checks.

## Bootstrap rollout boundary (`BOOTSTRAP-001`)

GitHub executes `issue_comment` and trusted `workflow_run` automation from the repository default branch. A pull request that introduces or replaces those workflows cannot use its own unmerged reporter code to prove that same reporter works. Executing pull-request code with comment-write permissions is forbidden because it would cross the trust boundary.

A one-time **Phase 1 bootstrap** may proceed without a live report from the new reporter only when every condition below is true:

1. the diff is governance-only and matches the executable bootstrap allowlist;
2. the mandatory Qodo review is request-bound, native, submitted, and exact-head;
3. all required executable CI is green;
4. all exact-head actionable review threads are resolved;
5. the read-only `AI review cooperation contract` compiles the reviewer code, runs offline causal tests, validates workflow syntax, checks publication boundaries, and verifies the bootstrap scope;
6. the PR description names the exact post-merge validation target;
7. no product, menu, media, deployment, public-copy, or performance-budget change is present.

Phase 1 is an installation transition, not a reusable waiver. It cannot be used when the same reporter already exists on the default branch, when the diff contains product code, or when Qodo/required CI is incomplete.

**Phase 2 enforcement** must run on the named first post-merge PR—currently **PR #202**—after Phase 1 reaches `main`. Phase 2 must demonstrate:

- a live `/grok review` through the official xAI API;
- a fresh cooperation report generated by the new default-branch reporter and containing Qodo and Grok lanes;
- exact-head dispositions for all actionable findings;
- a fresh D6 proof seal after the report and dispositions;
- fail-closed behavior if any of those steps cannot be reproduced.

A failed Phase 2 validation blocks the target PR and requires fixing or reverting the bootstrap governance change.

## Timeouts and retries

- Qodo: wait for the native exact-head review after the trusted `/qodo review` approval; repost after a head update.
- CodeRabbit: wait up to 15 minutes; retry once after a provider, permission, quota, or auto-pause interruption.
- Codex: wait up to 10 minutes when a native bot surface is configured; otherwise record `IDENTITY_UNAVAILABLE` and keep the lane supplemental.
- Jules: wait up to 15 minutes; retry once. Missing Jules output remains advisory.
- Grok: workflow timeout is 12 minutes. Retry 429 and transient 5xx/network failures with bounded backoff; never retry 401/403 automatically.
- DeepSeek: workflow timeout is 10 minutes. Retry 429 and transient 5xx/network failures with bounded backoff; never retry 401/403 automatically.
- No reviewer may create an unbounded retry loop.

## Causal aggregation

The cooperation report collapses duplicate observations by normalized root-cause signature. Three reviewers repeating the same defect count as one causal finding with stronger corroboration, not three independent blockers.

The report graph follows this direction:

`current head -> trusted exact-head request -> verified reviewer identity -> exact-head evidence -> finding/root cause -> disposition -> required action -> overall conclusion`

Required CI, reviewer identity, commit binding, disposition completeness, and evidence-collection completeness enter the graph independently. Bot consensus cannot override failing required checks, and green CI cannot erase a verified P0-P2 correctness or security finding.

All dynamic Mermaid labels must be normalized to a single line, stripped of raw double quotes/backticks, and length-bounded before insertion into the graph.

## Overall conclusion rules

1. **BLOCK** — any P0/P1 finding, failing required CI, stale-head publication, trust-boundary breach, or forged reviewer identity.
2. **FIX_THEN_RERUN** — any unresolved P2 root cause or contract/documentation mismatch.
3. **WAIT_FOR_EVIDENCE** — the mandatory independent Qodo exact-head review, required CI, disposition, or complete pagination is missing.
4. **READY_WITH_ADVISORY_GAPS** — required CI and Qodo are E5, no unresolved P0-P2 exists, but a supplemental reviewer such as CodeRabbit, Codex, Jules, Grok, or DeepSeek is unavailable or incomplete.
5. **READY** — required CI is green, mandatory independent exact-head evidence is E5, evidence collection and dispositions are complete, and all available actionable findings are resolved.

P3 findings are tracked but do not block unless the maintainer explicitly promotes them.

## Cooperation report

Run:

```text
/ai-cooperation report
```

The report must identify the exact head, distinguish mandatory independent evidence from supplemental lanes, show stable reason codes and dispositions, and publish one overall conclusion. It may summarize advisory reviewers, but it must never upgrade owner-authored output into independent bot evidence.

During `BOOTSTRAP-001` Phase 1, the unmerged reporter is validated only through the read-only offline contract. The first live report from that reporter is mandatory in Phase 2 on PR #202 after the reporter exists on the default branch.
