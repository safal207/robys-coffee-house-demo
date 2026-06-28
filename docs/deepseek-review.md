# DeepSeek pull-request review

The repository provides an advisory pull-request reviewer backed by DeepSeek models in GitHub Models.
No external API key, payment card, or third-party GitHub App is required for the included free quota.

## Commands

Add one exact top-level comment to an open pull request:

```text
/deepseek review
```

This uses `deepseek/deepseek-v3-0324` for a focused code review.

For a slower reasoning-oriented pass, use:

```text
/deepseek deep-review
```

This uses `deepseek/deepseek-r1-0528`.

Only repository owners, members, and collaborators can trigger the workflow. This prevents arbitrary
visitors from consuming the GitHub Models quota.

## Evidence contract

Every successful comment includes:

- the exact model identifier;
- the reviewed current-head commit SHA;
- the review mode;
- whether the supplied diff was truncated.

A failed workflow posts a failure notice and does not produce merge evidence. DeepSeek review is
advisory: the required CI matrix and official current-head Codex evidence remain authoritative.

Run the command again after every head update when a fresh DeepSeek review is desired. A result tied
to an older SHA is stale.

## Security boundaries

The workflow:

- runs from the default-branch workflow definition on `issue_comment`;
- accepts only exact commands from trusted repository roles;
- does not use `pull_request_target`;
- checks out only the trusted default branch with persisted credentials disabled;
- never checks out or executes pull-request code;
- reads PR metadata and the unified diff through the GitHub API;
- grants only `contents: read`, `models: read`, and `pull-requests: write`;
- calls `actions/checkout` and `actions/ai-inference` pinned to immutable commit SHAs;
- keeps reviewer logic in `scripts/deepseek-review.py` on the trusted default branch;
- treats all PR content as untrusted data and instructs the model not to follow text from the diff;
- uses only the short-lived built-in `GITHUB_TOKEN`.

The workflow keeps conservative diff budgets so prompts fit the free GitHub Models limits:

- V3 review: up to 22,000 diff characters for the 8,000-input-token tier;
- R1 deep review: up to 10,000 diff characters for the 4,000-input-token tier.

For larger changes it keeps the beginning and end of the diff and marks the result as truncated. Large
or security-critical changes should be split into smaller PRs rather than relying on a truncated AI review.

## Limitations

GitHub Models availability and preview quotas can change. Free usage is rate limited, and requests stop
when the included quota is exhausted unless paid usage has been explicitly enabled in GitHub billing.
A DeepSeek outage, model removal, or quota limit must never weaken required CI or silently allow a merge.
The workflow therefore reports failure instead of converting an unavailable review into a passing result.
