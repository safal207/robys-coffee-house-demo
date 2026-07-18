## Summary

Describe what changed and why.

## Evidence

Link screenshots, logs, artifacts, or reproducible checks.

## AI review

After every PR head update, freeze the branch and post a fresh trusted top-level request for the sole required AI reviewer. Include the full 40-character current head SHA:

```text
@codex review

Exact head: <full 40-character current head SHA>
```

Codex evidence is valid only when the configured Codex bot publishes authenticated evidence bound to that exact head after the trusted request. A reaction, progress message, pending or dismissed review, maintainer-authored proxy, edited pre-request comment, or response for an older SHA does not satisfy the gate.

CodeRabbit is a scheduled advisory reserve. The protected default-branch dispatcher may request it at 09:00, 13:00 or 19:00 Europe/Istanbul only after a Codex exact-head request has waited at least 45 minutes without acceptable evidence. Do not manually request CodeRabbit during the normal PR flow. Its absence, rate limit, or failure cannot block readiness, and a clean CodeRabbit result cannot replace Codex. Authenticated current-head CodeRabbit findings must still be resolved or dispositioned when present.

Qodo is disabled. Do not request Qodo and do not treat its comments, reviews, statuses, or billing notices as readiness evidence.

A new commit invalidates every earlier request and review result. Post a fresh Codex request with the new full SHA.

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
- [ ] A fresh trusted Codex request contains the full current head SHA.
- [ ] Authenticated Codex evidence is bound to that exact head and was published after the request.
- [ ] Any authenticated current-head CodeRabbit reserve findings are resolved or explicitly dispositioned.
- [ ] Qodo was not requested and is not treated as readiness evidence.
- [ ] Optional reviewer findings are resolved or explicitly dispositioned when requested.
- [ ] Required independent human approval exists for the exact current head when enforcement is enabled.
- [ ] Solo maintainer attestation is green for the exact current head when no independent human reviewer is available.
- [ ] Every actionable finding is resolved or documented on the current head.
