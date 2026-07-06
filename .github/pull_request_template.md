## Summary

Describe what changed and why.

## Evidence

Link screenshots, logs, artifacts, or reproducible checks.

## AI review

After every PR head update, freeze the branch and post a fresh top-level request for the mandatory independent reviewer. The request must include the full 40-character current head SHA:

```text
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

CodeRabbit evidence is valid only when the configured bot publishes a pull-request review object whose `commit_id` equals that exact head. A reaction, progress/status comment, maintainer-authored review, proxy marker, or response for an older SHA does not satisfy the gate.

The Codex lane is supplemental on connector surfaces where no native Codex bot review object is available. It may be requested with the same exact-head format:

```text
@codex review

Exact head: <full 40-character current head SHA>
```

Codex counts as independent evidence only when the configured Codex bot itself publishes a review object bound to the exact head. Output written through the repository owner identity remains advisory and cannot satisfy an independent-review gate.

A new commit invalidates every earlier request and review result. Post fresh requests with the new full SHA.

Optional advisory reviewers may also be requested after the latest head update:

```text
@jules review
/deepseek review
```

Use `/deepseek deep-review` only when a slower reasoning-oriented pass is useful. Advisory evidence must identify the current reviewed commit SHA before it can be treated as exact-head evidence.

## Solo maintainer decision

When no independent human reviewer is available, finish all required checks and bot-review dispositions, then post a top-level comment with the full current head SHA:

`/merge-ready <full 40-character current head SHA>`

To revoke the decision, post:

`/merge-hold <full 40-character current head SHA>`

This is explicit maintainer intent, not independent human or bot approval.

## Checklist

- [ ] Latest exact-head CI is green.
- [ ] Generated files are current.
- [ ] Visual changes include exact-head evidence.
- [ ] A fresh CodeRabbit request contains the full current head SHA.
- [ ] A CodeRabbit-authored PR review object is bound to that exact head.
- [ ] Codex is recorded as supplemental unless a native exact-head bot review exists.
- [ ] Optional reviewer findings are resolved or explicitly dispositioned when requested.
- [ ] Required independent human approval exists for the exact current head when enforcement is enabled.
- [ ] Solo maintainer attestation is green for the exact current head when no independent human reviewer is available.
- [ ] Every actionable finding is resolved or documented on the current head.
