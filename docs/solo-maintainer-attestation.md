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
new trusted-base workflow cannot run until it exists on the default branch. After
that bootstrap merge, validate the full protocol with a disposable pull request
before making the status required in branch rules.

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

Decision comments are append-only. Do not edit or delete an existing decision
comment. A mutation stores a monotonic cursor for that comment ID and requires a
newer append-only decision before the gate can become green again.

## Order-independent state reducer

The workflow publishes the commit status context `Maintainer merge attestation`
on the pull-request head. Every trusted event recomputes that status from current
GitHub state instead of trusting webhook delivery order.

The reducer reads all existing, unedited decision comments from the configured
maintainer and sorts them by GitHub comment ID. The newest decision is
authoritative:

- no decision → `pending`;
- exact `/merge-ready <current SHA>` → `success`;
- exact `/merge-hold <current SHA>` → `failure`;
- latest command containing another SHA → `failure`.

Edited or deleted decision evidence is represented by the separate
`Maintainer attestation mutation cursor` status. Its description stores the
largest mutated decision comment ID. When that cursor is greater than or equal
to the newest surviving decision ID, the main gate is `failure`. A fresh command
has a larger comment ID and can recover the gate.

Every run also publishes its numeric GitHub Actions run ID in the internal
`Maintainer attestation run cursor` status. Before publishing `success`, the
workflow waits through a short cancellation window and reads the pull request,
comments, mutation cursor, and run cursor again. A run exits without writing a
final gate when a newer run ID or another head has superseded it.

Attestation events for one pull request use `cancel-in-progress: true`. A newer
hold, edit, deletion, head update, or metadata event cancels an older reducer run.
The final state read additionally catches invalidating evidence that arrived while
the older run was executing, so an already-started ready run cannot publish stale
success after a newer event has begun processing.

A new head naturally invalidates old intent because the newest surviving command
contains the previous SHA. Metadata-only PR events simply trigger another
reduction; they do not invent a new decision or rely on timestamps.

## Trust rules

A decision qualifies only when these conditions hold:

- the pull request targets `main` and is open;
- the comment author matches repository variable `SOLO_MAINTAINER_LOGIN`;
- when the variable is absent, the repository owner login is used;
- login comparison is case-insensitive inside the trusted script;
- the account is not a bot;
- the configured account currently has repository `admin` permission;
- the comment has never been edited;
- the command contains a full 40-character SHA.

The workflow fails closed when maintainer permission cannot be verified. Mutation
events for maintainer-authored decision comments are recorded even when another
account performed the edit or deletion, so another actor cannot preserve stale
green evidence.

The job condition rejects most unrelated public comments before the write-capable
step starts. The mutation and run cursor contexts are internal evidence storage
and must not be selected as required merge gates.

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
doubtful or a new risk appears.

## Branch-rule activation

When repository rules can be configured, add `Maintainer merge attestation` as a
required status for `main` while the project remains in solo-maintainer mode.

Keep `Human approval contract / Verify trusted human approval` advisory until a
second verified human is available.

When a second trusted human joins, the independent human approval contract should
become authoritative. The solo attestation may remain as an explicit owner release
decision, but it must not replace the independent approval.
