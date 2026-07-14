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

After every head update, freeze the branch and post the primary request with the full current SHA:

```text
/qodo review

Exact head: <full 40-character current head SHA>
```

If no native Qodo review appears after 15 minutes, post exactly one second trusted request with the same exact-head binding. The two trusted `/qodo review` requests must be at least 15 minutes apart.

Fallback becomes eligible only after another 15 minutes has elapsed after the second Qodo request and no native exact-head Qodo review exists. Fallback requests may be posted after the second Qodo request so the independent reviewers can work in parallel:

```text
@codex review

Exact head: <full 40-character current head SHA>
```

```text
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

The first qualifying native exact-head Codex or CodeRabbit Bot review may satisfy the required lane after fallback eligibility is reached. Status-only evidence, reactions, acknowledgements, summaries, owner-authored connector output, unbound commands, and maintainer proxy reviews never satisfy the required lane.

The verifier uses the GitHub-server `created_at` of the current `AI review contract` workflow run as its freshness anchor. GitHub keeps `GITHUB_RUN_ID` unchanged when that workflow run is re-run and increments `GITHUB_RUN_ATTEMPT` for each attempt. Therefore, rerunning the same failed workflow run after the timeout windows preserves its original server-side anchor without depending on `pull_requests`, branch-name heuristics, another PR, or author-controlled commit timestamps. Starting a new workflow run creates a new anchor and requires fresh exact-head requests.

A new commit invalidates every request, timeout window, review, report, disposition, proof seal, and merge-ready decision associated with the previous head.

## Evidence ladder

| Level | Meaning | Merge value |
|---|---|---|
| E0 | No trusted exact-head request exists | None |
| E1 | Trusted exact-head request exists | None |
| E2 | Bot acknowledged or started work | Operational only |
| E3 | Bot responded, but identity or exact-head binding is not verified | Advisory only |
| E4 | Verified request-bound exact-head Bot review contains actionable findings | Blocking/advisory according to severity |
| E5 | Verified request-bound exact-head Bot review is clean, or all findings are resolved on the current head | Merge-supporting evidence |

A reaction, “in progress” message, status-only result, issue comment without native commit binding, owner-authored proxy, spoofed author, unbound request, older-SHA response, pending review, dismissed review, resolved thread by itself, or truncated collection cannot satisfy E4/E5.

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
- the request body must contain both the canonical command and `Exact head: <full current SHA>`;
- the trusted request must be created after the current workflow run’s stable server-side anchor.

## Fallback invariants

Fallback is fail-closed and cannot be used to shop for a more favorable answer:

- two trusted exact-head `/qodo review` requests are required;
- the requests must be at least 15 minutes apart;
- 15 additional minutes must pass after the second request;
- fallback requests must not predate the second Qodo request;
- every primary and fallback request must bind the same current SHA;
- a late Qodo review takes primary precedence;
- findings from every responding reviewer remain binding;
- a later bot review invalidates any older cooperation report and D6 seal;
- a head change resets the whole state machine;
- only a rerun attempt of the same failed workflow run preserves the anchor;
- a newly created workflow run requires fresh requests even when the head SHA is unchanged.

## Provider-pool reason values

`selectRequiredEvidence` returns exactly these stable `primaryFailure` values:

| Value | Meaning | Default action |
|---|---|---|
| `none` | A request-bound native Qodo review satisfies the primary lane | Continue with downstream evidence checks |
| `QODO_TIMEOUT_1_PENDING` | No valid exact-head timeout pair exists yet | Wait for the first window or post the second exact-head Qodo request after 15 minutes |
| `QODO_TIMEOUT_2_PENDING` | Two valid exact-head Qodo requests exist, but 15 minutes have not elapsed after the second | Wait until fallback eligibility time |
| `QODO_TIMEOUT_2` | Both Qodo windows elapsed without native Qodo evidence | Require request-bound native Codex or CodeRabbit fallback, then rerun the same failed workflow run |

Other failures such as GitHub API permission errors, incomplete evidence collection, stale heads, or actionable findings are enforced by their owning workflow/report/ledger layers. They are not `selectRequiredEvidence.primaryFailure` values and must not be confused with this provider-selection contract.

## Cross-layer failure semantics

The provider selector is only one stage of the causal chain. Downstream workflows retain their own stable reason codes, including `BOOTSTRAP_NOT_ON_DEFAULT_BRANCH`, `NO_CURRENT_HEAD_EVIDENCE`, `STALE_HEAD`, and `PERMISSION_ERROR`. An unresolved P2 remains `FIX_THEN_RERUN`; truncated evidence remains fail-closed; and no provider selection can erase an actionable finding.

The conclusion is causal, not a majority vote. Required CI, exact-head identity, complete evidence collection, fresh reports, dispositions, and D6 provenance remain independent gates.

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
