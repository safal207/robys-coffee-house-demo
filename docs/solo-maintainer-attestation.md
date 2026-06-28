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
comment. Any mutation of maintainer decision evidence fails the status and
requires a fresh command, even when a newer decision comment also exists. This is
an intentional fail-closed rule, not an attempt to reconstruct mutable history.

## Event-driven state machine

The workflow publishes the commit status context `Maintainer merge attestation`
on the pull-request head.

Every opening, head update, reopen, ready-for-review transition, or PR edit sets
the exact current head to `pending`. This invalidates earlier intent without
using timestamps, comment snapshots, or stored baselines.

A trusted new decision comment then changes that current-head status directly:

- exact `/merge-ready <current SHA>` → `success`;
- exact `/merge-hold <current SHA>` → `failure`;
- a command containing another SHA → `failure`;
- no command → no status change;
- edited or deleted decision evidence → `failure`.

A later fresh `/merge-ready` can release a hold or mutation failure. Because every
command includes the exact current head SHA, decisions for older commits cannot
approve a newer head.

All attestation events for one pull request use GitHub Actions concurrency with
`queue: max`. Pending events are preserved and processed one at a time instead of
silently replacing an earlier edit, deletion, hold, or ready event.

## Trust rules

A new decision command qualifies only when all of these conditions hold:

- the pull request targets `main` and is open;
- both the comment author and the webhook actor match repository variable
  `SOLO_MAINTAINER_LOGIN`;
- when the variable is absent, the repository owner login is used;
- login comparison is case-insensitive inside the trusted script;
- the account is not a bot;
- the account currently has repository `admin` permission;
- the command contains the exact full current head SHA.

The job condition rejects most unrelated public comments before the write-capable
step starts. The script then performs the exact author, actor, bot, permission,
command-format, and current-head checks before changing the status.

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
