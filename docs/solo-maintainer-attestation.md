# Solo maintainer merge attestation

This protocol is for periods when the repository has only one trusted human
maintainer. It provides deliberate current-head evidence, but it is **not** an
independent human review and must never be described as one.

## Trusted execution boundary

The status writer runs on `pull_request_target` and `issue_comment`, so GitHub
loads the workflow only from the trusted default branch. The workflow never
checks out or executes pull-request code. Pull-request titles, bodies, refs,
comments, and SHAs are treated only as untrusted API data.

The pull request that first installs this workflow is a bootstrap exception: the
new `pull_request_target` workflow cannot run until it exists on the default
branch. After that bootstrap merge, validate the full protocol with a disposable
pull request before making the status required in branch rules.

## Decision commands

After all current-head CI and review findings are complete, the configured solo
maintainer posts a new top-level pull-request comment containing exactly:

```text
/merge-ready <full 40-character current head SHA>
```

To revoke the decision or stop the merge, post a new comment:

```text
/merge-hold <full 40-character current head SHA>
```

The command must contain exactly one space before the full SHA, with no leading,
trailing, or multiline whitespace.

Decision comments are append-only. Do not edit an existing `/merge-ready` or
`/merge-hold` comment. Editing or deleting one creates a new failure baseline and
requires a fresh decision comment.

The workflow publishes the commit status context `Maintainer merge attestation`
on the pull request head. While no current decision exists, that status is
`pending`: it still blocks a required merge gate but does not falsely report a
workflow defect. `/merge-hold`, stale SHA evidence, permission failures, and
mutated decision evidence produce `failure`.

## Trust rules

A command qualifies only when all of the following are true:

- the pull request targets `main` and is open;
- both the comment author and the webhook actor match repository variable
  `SOLO_MAINTAINER_LOGIN`;
- when the variable is absent, the repository owner login is used;
- login comparison is case-insensitive inside the trusted script;
- the account is not a bot;
- the account currently has repository `admin` permission;
- the comment has never been edited;
- the command contains the exact full current head SHA.

Each opening, head update, reopen, ready-for-review transition, or PR edit writes a
separate `Maintainer attestation baseline` status containing the largest issue
comment ID visible when that event is evaluated. Only comments with a larger ID
qualify. This avoids timestamp precision and clock-ordering gaps.

Baseline comment IDs are monotonic. An older queued run cannot move the freshness
boundary backwards. A manual rerun of the same workflow attempt reuses the stored
baseline instead of invalidating evidence again; this supports deterministic
re-evaluation and smoke testing. If no baseline exists, the comment path fails
closed.

All attestation events for one pull request use GitHub Actions concurrency with
`queue: max`. Up to 100 pending events are preserved and processed one at a time;
an edit, deletion, hold, or ready event cannot silently replace an older pending
invalidation event.

On every trusted decision creation, the workflow re-reads all currently existing,
unedited decision comments after the latest baseline. The decision with the
largest qualifying comment ID wins. Editing or deleting a decision comment resets
the baseline instead of trusting mutable evidence.

The job condition rejects comments whose author is not an owner, member, or
collaborator. The script then performs exact author, actor, bot, and current
`admin` permission checks before changing any status.

## Safe order

1. Finish implementation and stop changing the head.
2. Run Security, CodeQL, ZAP, browser, visual, static, and project-specific checks.
3. Request current-head Codex, Jules, CodeRabbit, and optional DeepSeek review.
4. Resolve every actionable review thread.
5. Read the final diff and evidence as the responsible maintainer.
6. Post a new `/merge-ready <full current head SHA>` comment.
7. Confirm `Maintainer merge attestation` is green.
8. Merge with an expected-head SHA guard.

Use a new `/merge-hold <full current head SHA>` comment whenever evidence becomes
doubtful or a new risk appears. A later fresh `/merge-ready` may release that hold.

## Branch-rule activation

When repository rules can be configured, add `Maintainer merge attestation` as a
required status for `main` while the project remains in solo-maintainer mode.
The internal `Maintainer attestation baseline` context is evidence storage and
must not be selected as the merge gate.

Keep `Human approval contract / Verify trusted human approval` advisory until a
second verified human is available.

When a second trusted human joins, the independent human approval contract should
become authoritative. The solo attestation may remain as an explicit owner release
decision, but it must not replace the independent approval.
