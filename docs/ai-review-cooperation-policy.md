# AI reviewer cooperation policy

This repository treats AI reviewers as independent sensors, not as a voting committee. A request, an acknowledgement, a provider-limit notice, a reaction, a status, a maintainer-authored note, and a native exact-head Bot review are different evidence classes and must never be conflated.

## Required independent-review capability

The active required lane is a two-provider pool:

1. **Qodo** is the preferred primary native exact-head reviewer.
2. **Codex** is the active warm-standby native exact-head reviewer.
3. **CodeRabbit is dormant**. Its automatic reviews, incremental reviews, commit statuses, request-changes workflow and chat replies are disabled. Its requests, comments, limits, statuses and reviews do not affect the required lane until a separate governance change explicitly re-enables it.
4. **Jules, DeepSeek and other reviewers** remain advisory.
5. **CI** remains authoritative executable evidence for build, security, browser, accessibility, visual, integrity and performance contracts.
6. **Maintainer** owns the final release decision but cannot impersonate an independent reviewer.

A provider name is not the capability. The capability is a request-bound native Bot review whose `commit_id` equals the current head.

## Active dispatch rule

After every head update, freeze the branch and send both active trusted exact-head requests in the same review round:

```text
/qodo review

Exact head: <full 40-character current head SHA>
```

```text
@codex review

Exact head: <full 40-character current head SHA>
```

Do not send a CodeRabbit request while it is dormant.

A new commit invalidates every request, limit signal, timeout window, review, report, disposition, proof seal and merge-ready decision associated with the previous head.

## Automatic provider-limit failover

Automatic failover is eligible only after the current review round contains trusted exact-head requests for **both active providers: Qodo and Codex**.

An active provider is considered unavailable for the current review round only when all of these conditions hold:

- both active trusted exact-head provider requests exist for the current head;
- that active provider has a trusted exact-head request for the current head;
- an issue comment is authored by an allowlisted login for that active provider;
- `user.type` equals `Bot`;
- the comment was created or bot-updated at or after the completed active-round timestamp;
- the comment explicitly reports a review/rate/usage limit, exhausted quota, a next-review delay, or temporary unavailability caused by a limit.

After complete active dispatch, an authenticated active-provider limit signal immediately opens automatic failover. The qualifying request-bound native exact-head review from the other active provider may satisfy the required lane. The limit notice itself is operational evidence only and has no merge value.

The following never open automatic failover:

- an incomplete active dispatch round;
- a provider-limit signal created and last updated before complete active dispatch;
- any CodeRabbit message or status while CodeRabbit is dormant;
- a maintainer claiming that a provider is limited;
- copied, quoted or fenced limit text;
- a negated statement such as `No review limit reached`;
- a message from an unallowlisted login;
- a non-Bot account;
- a generic error without explicit rate, usage, quota or review-limit meaning.

If an active provider reports a limit and no qualifying review from the other active provider exists, the lane remains fail-closed.

## Timeout fallback

Provider-limit failover is additive to the Qodo timeout path. When no authenticated active-provider limit signal exists:

1. the first trusted exact-head `/qodo review` request starts the primary window;
2. a second trusted exact-head `/qodo review` request must be posted at least 15 minutes later;
3. fallback becomes eligible 15 minutes after the earliest qualifying second request;
4. a request-bound native exact-head Codex review may then satisfy the lane.

The two trusted exact-head Qodo requests remain necessary for timeout-based fallback. They are not required for provider-limit failover, but the complete single-request dispatch to Qodo and Codex is mandatory before either fallback path can open.

The verifier uses the GitHub-server `created_at` of the current `AI review contract` pull-request run as its freshness anchor. GitHub keeps `GITHUB_RUN_ID` unchanged when that workflow run is re-run and increments `GITHUB_RUN_ATTEMPT`. Rerunning the same failed workflow run preserves its server-side anchor. Starting a new workflow run creates a new anchor and requires fresh exact-head requests.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted exact-head request exists | None |
| E1 | Trusted exact-head request exists | None |
| E2 | Active Bot acknowledged, started work, or reported a limit | Operational only |
| E3 | Bot responded, but identity or exact-head binding is not verified | Advisory only |
| E4 | Verified request-bound exact-head active Bot review contains actionable findings | Blocking/advisory according to severity |
| E5 | Verified request-bound exact-head active Bot review is clean, or all findings are resolved on the current head | Merge-supporting evidence |

A provider-limit notice, reaction, “in progress” message, status-only result, issue comment without native commit binding, owner-authored proxy, spoofed author, dormant-provider evidence, unbound request, older-SHA response, pending review, dismissed review, resolved thread by itself, or truncated collection cannot satisfy E4/E5.

## Identity and binding

Required evidence and active-provider limit signals are accepted only from these exact allowlisted GitHub logins:

- Qodo: `qodo-code-review`, `qodo-code-review[bot]`
- Codex: `chatgpt-codex-connector`, `chatgpt-codex-connector[bot]`

CodeRabbit logins are intentionally not part of the active selector while the provider is dormant.

For all required reviews:

- `user.type` must equal `Bot`;
- the review must be submitted and not `PENDING` or `DISMISSED`;
- `commit_id` must equal the full current head;
- the review must be submitted after that provider's trusted request;
- the request body must contain both the canonical command and `Exact head: <full current SHA>`;
- the trusted request must be created after the current workflow run's stable server-side anchor.

## Selection invariants

The pool is fail-closed and cannot be used to shop for a more favorable answer:

- Qodo takes primary precedence whenever a qualifying Qodo review exists;
- provider-limit failover requires both active trusted current-head provider requests before any active-provider limit signal can open the lane;
- provider-limit failover requires an authenticated allowlisted active Bot signal at or after the completed active-round timestamp;
- non-limit fallback requires the complete Qodo timeout sequence;
- every active-provider request and accepted review must bind the same current SHA;
- dormant CodeRabbit evidence is ignored rather than counted positively or negatively;
- findings from every responding active reviewer remain binding, including reviews that arrive after the required lane first passes;
- a later active Bot review invalidates any older cooperation report and D6 seal;
- a head change resets the whole state machine;
- only a rerun attempt of the same failed workflow run preserves the anchor;
- a newly created workflow run requires fresh requests even when the head SHA is unchanged.

## Provider-pool reason values

`selectRequiredEvidence` returns these stable `primaryFailure` values:

| Value | Meaning | Default action |
|---|---|---|
| `none` | A request-bound native Qodo review satisfies the primary lane | Continue with downstream evidence checks |
| `PROVIDER_LIMIT` | Both active current-head requests exist and at least one requested allowlisted active-provider Bot reported a current-round limit after active dispatch completed | Select the other active exact-head reviewer; remain fail-closed if it has not reviewed |
| `QODO_TIMEOUT_1_PENDING` | No valid exact-head Qodo timeout pair exists yet, including incomplete active dispatch | Post any missing Qodo/Codex request or wait for the first Qodo window |
| `QODO_TIMEOUT_2_PENDING` | Two valid exact-head Qodo requests exist, but 15 minutes have not elapsed after the second | Wait until timeout fallback eligibility |
| `QODO_TIMEOUT_2` | Both Qodo timeout windows elapsed without native Qodo evidence | Accept a request-bound native Codex review |

Other failures such as GitHub API permission errors, incomplete evidence collection, stale heads, or actionable findings are enforced by their owning workflow/report/ledger layers. They are not provider-selection reason values.

## Cross-layer failure semantics

The provider selector is only one stage of the causal chain. Downstream workflows retain their own stable reason codes, including `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH`, `NO_CURRENT_HEAD_EVIDENCE`, `STALE_HEAD`, and `PERMISSION_ERROR`. An unresolved P2 remains `FIX_THEN_RERUN`; truncated evidence remains fail-closed; and no provider selection can erase an actionable finding.

The conclusion is causal, not a majority vote. Required CI, exact-head identity, complete evidence collection, fresh reports, dispositions, and D6 provenance remain independent gates.

## Trusted-code boundary

The `AI review contract` always checks out its verifier from the protected default branch. Pull-request code cannot replace the verifier that judges the same pull request.

The protected default-branch verifier must use the same active-provider set as this policy before the PR can rely on Qodo/Codex evidence. No maintainer proxy, admin bypass, stale review, or dormant CodeRabbit evidence may bridge a bootstrap mismatch.

## Required CI and final decision

Required executable checks, reviewer identity, exact-head binding, evidence completeness, finding dispositions, report freshness, D6 provenance, and the append-only `/merge-ready <SHA>` decision remain independent gates. Bot consensus cannot override failing CI, and green CI cannot erase verified P0-P2 findings.

After downstream migration, the cooperation report and D6 seal must state:

```text
Required-Reviewer: <Qodo|Codex>
Review-Mode: <primary|automatic-failover|fallback>
Primary-Failure: <none|PROVIDER_LIMIT|QODO_TIMEOUT_2>
Unavailable-Providers: <none|Qodo|Codex>
Dormant-Providers: CodeRabbit
```

No reviewer may create an unbounded retry loop.
