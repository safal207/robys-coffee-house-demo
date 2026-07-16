# AI reviewer cooperation policy

This repository treats AI reviewers as independent sensors, not as a voting committee. A request, an acknowledgement, a provider-limit notice, a reaction, a status, a maintainer-authored note, and a native exact-head bot review are different evidence classes and must never be conflated.

## Required independent-review capability

The required lane is a provider pool rather than a permanent dependency on one vendor:

1. **Qodo** is the preferred primary native exact-head reviewer.
2. **Codex** and **CodeRabbit** are warm-standby native exact-head reviewers.
3. **Jules** and **DeepSeek** remain advisory.
4. **CI** remains authoritative executable evidence for build, security, browser, accessibility, visual, integrity, and performance contracts.
5. **Maintainer** owns the final release decision but cannot impersonate an independent reviewer.

A provider name is not the capability. The capability is a request-bound native Bot review whose `commit_id` equals the current head.

## Warm-standby dispatch rule

After every head update, freeze the branch and send all three trusted exact-head requests in the same review round:

```text
/qodo review

Exact head: <full 40-character current head SHA>
```

```text
@codex review

Exact head: <full 40-character current head SHA>
```

```text
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

Qodo remains preferred, but Codex and CodeRabbit start as warm standbys instead of waiting for a provider failure. This removes provider availability from the critical path without weakening exact-head identity or evidence requirements.

A new commit invalidates every request, limit signal, timeout window, review, report, disposition, proof seal, and merge-ready decision associated with the previous head.

## Automatic provider-limit failover

Automatic failover is eligible only after the current review round contains trusted exact-head requests for **all three providers: Qodo, Codex, and CodeRabbit**.

A provider is considered unavailable for the current review round only when all of these conditions hold:

- all three trusted exact-head provider requests exist for the current head;
- that provider has a trusted exact-head request for the current head;
- an issue comment is authored by an allowlisted login for that provider;
- `user.type` equals `Bot`;
- the comment was created or bot-updated after that provider's request;
- the comment explicitly reports a review/rate/usage limit, exhausted quota, a next-review delay, or temporary unavailability caused by a limit.

After complete warm-standby dispatch, an authenticated provider-limit signal immediately opens automatic failover. The first qualifying request-bound native exact-head review from another warm-standby provider may satisfy the required lane. The limit notice itself is operational evidence only and has no merge value.

The following never open automatic failover:

- an incomplete dispatch round, including a missing Qodo request or a missing standby request;
- a maintainer claiming that a provider is limited;
- a copied or quoted limit message;
- a message from an unallowlisted login;
- a non-Bot account;
- a signal whose latest bot-controlled `created_at`/`updated_at` timestamp predates the provider request;
- a generic error without an explicit rate, usage, quota, or review-limit meaning.

If every requested provider reports a limit and no qualifying review exists, the lane remains fail-closed.

## Timeout fallback

Provider-limit failover is additive to the existing Qodo timeout path. When no authenticated provider-limit signal exists:

1. the first trusted exact-head `/qodo review` request starts the primary window;
2. a second trusted exact-head `/qodo review` request must be posted at least 15 minutes later;
3. fallback becomes eligible 15 minutes after the second request;
4. a qualifying warm-standby Codex or CodeRabbit review may then satisfy the lane.

The two trusted exact-head `/qodo review` requests remain necessary for timeout-based fallback. They are not required for provider-limit failover, but the complete single-request dispatch to Qodo, Codex, and CodeRabbit is still mandatory.

The verifier uses the GitHub-server `created_at` of the current `AI review contract` pull-request run as its freshness anchor. GitHub keeps `GITHUB_RUN_ID` unchanged when that workflow run is re-run and increments `GITHUB_RUN_ATTEMPT`. Rerunning the same failed workflow run preserves its server-side anchor. Starting a new workflow run creates a new anchor and requires fresh exact-head requests.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted exact-head request exists | None |
| E1 | Trusted exact-head request exists | None |
| E2 | Bot acknowledged, started work, or reported a limit | Operational only |
| E3 | Bot responded, but identity or exact-head binding is not verified | Advisory only |
| E4 | Verified request-bound exact-head Bot review contains actionable findings | Blocking/advisory according to severity |
| E5 | Verified request-bound exact-head Bot review is clean, or all findings are resolved on the current head | Merge-supporting evidence |

A provider-limit notice, reaction, “in progress” message, status-only result, issue comment without native commit binding, owner-authored proxy, spoofed author, unbound request, older-SHA response, pending review, dismissed review, resolved thread by itself, or truncated collection cannot satisfy E4/E5.

## Identity and binding

Evidence and limit signals are accepted only from exact allowlisted GitHub logins:

- Qodo: `qodo-code-review`, `qodo-code-review[bot]`
- Codex: `chatgpt-codex-connector`, `chatgpt-codex-connector[bot]`
- CodeRabbit: `coderabbitai`, `coderabbitai[bot]`

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
- provider-limit failover requires all three trusted current-head provider requests before any limit signal can open the lane;
- provider-limit failover requires an authenticated allowlisted Bot signal after that provider's current-head request;
- a non-limited fallback still requires the complete Qodo timeout sequence;
- every provider request and accepted review must bind the same current SHA;
- findings from every responding reviewer remain binding, including reviews that arrive after the required lane first passes;
- a later bot review invalidates any older cooperation report and D6 seal;
- a head change resets the whole state machine;
- only a rerun attempt of the same failed workflow run preserves the anchor;
- a newly created workflow run requires fresh requests even when the head SHA is unchanged.

## Provider-pool reason values

`selectRequiredEvidence` returns these stable `primaryFailure` values:

| Value | Meaning | Default action |
|---|---|---|
| `none` | A request-bound native Qodo review satisfies the primary lane | Continue with downstream evidence checks |
| `PROVIDER_LIMIT` | All three current-head requests exist and at least one requested allowlisted provider Bot reported a current-round limit | Select another warm-standby exact-head reviewer; remain fail-closed if none has reviewed |
| `QODO_TIMEOUT_1_PENDING` | No valid exact-head Qodo timeout pair exists yet, including an incomplete initial dispatch | Post any missing current-head requests or wait for the first Qodo window |
| `QODO_TIMEOUT_2_PENDING` | Two valid exact-head Qodo requests exist, but 15 minutes have not elapsed after the second | Wait until timeout fallback eligibility |
| `QODO_TIMEOUT_2` | Both Qodo timeout windows elapsed without native Qodo evidence | Accept a request-bound native Codex or CodeRabbit warm-standby review |

Other failures such as GitHub API permission errors, incomplete evidence collection, stale heads, or actionable findings are enforced by their owning workflow/report/ledger layers. They are not provider-selection reason values.

## Cross-layer failure semantics

The provider selector is only one stage of the causal chain. Downstream workflows retain their own stable reason codes, including `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH`, `NO_CURRENT_HEAD_EVIDENCE`, `STALE_HEAD`, and `PERMISSION_ERROR`. An unresolved P2 remains `FIX_THEN_RERUN`; truncated evidence remains fail-closed; and no provider selection can erase an actionable finding.

The conclusion is causal, not a majority vote. Required CI, exact-head identity, complete evidence collection, fresh reports, dispositions, and D6 provenance remain independent gates.

## Trusted-code boundary

The `AI review contract` always checks out its verifier from the protected default branch. Pull-request code cannot replace the verifier that judges the same pull request.

This trust patch changes only the default-branch AI-review gate and its read-only contracts. The cooperation report and D6 ledger remain on their legacy CodeRabbit rule until the governance bootstrap in PR #208 aligns those downstream stages. Therefore provider-pool evidence cannot produce a final merge by itself during the transition.

## Required CI and final decision

Required executable checks, reviewer identity, exact-head binding, evidence completeness, finding dispositions, report freshness, D6 provenance, and the append-only `/merge-ready <SHA>` decision remain independent gates. Bot consensus cannot override failing CI, and green CI cannot erase verified P0-P2 findings.

After the downstream migration is complete, the cooperation report and D6 seal must state:

```text
Required-Reviewer: <Qodo|Codex|CodeRabbit>
Review-Mode: <primary|automatic-failover|fallback>
Primary-Failure: <none|PROVIDER_LIMIT|QODO_TIMEOUT_2>
Unavailable-Providers: <none|comma-separated provider names>
```

No reviewer may create an unbounded retry loop.
