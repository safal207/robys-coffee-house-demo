## Summary

Describe what changed and why.

## Evidence

Link screenshots, logs, artifacts, or reproducible checks.

## AI review

After every PR head update, freeze the branch and post a fresh trusted top-level request for the required AI reviewer. Include the full 40-character current head SHA:

```text
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

CodeRabbit evidence is valid only when the configured CodeRabbit bot publishes authenticated evidence bound to that exact head after the trusted request. A reaction, progress message, pending or dismissed review, maintainer-authored proxy, edited pre-request comment, or response for an older SHA does not satisfy the normal lane.

A positive authenticated CodeRabbit `limit`, `quota`, `usage limit`, or `next review available` response published after the latest trusted exact-head request may waive only the external AI-review step. Silence, a generic failure, an unavailable message without an explicit limit, or a third-party claim does not activate the waiver. Under a provider-limit waiver, CI, human approval, the cooperation report, all finding dispositions and the later D6 proof seal remain mandatory.

Codex, Jules and DeepSeek are optional advisory reviewers. Qodo is disabled. Advisory evidence never replaces CodeRabbit evidence and cannot independently authorize merge.

A new commit invalidates every earlier request, review result and provider-limit waiver. Post a fresh CodeRabbit request with the new full SHA.

Optional advisory reviewers may also be requested after the latest head update:

```text
@codex review
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
- [ ] A fresh trusted CodeRabbit request contains the full current head SHA.
- [ ] Authenticated CodeRabbit evidence is bound to that exact head and was published after the request, or an authenticated post-request provider-limit signal activates the narrow waiver.
- [ ] Any authenticated current-head CodeRabbit findings are resolved or explicitly dispositioned.
- [ ] Codex, Jules and DeepSeek are treated as advisory only.
- [ ] Qodo was not requested and is not treated as readiness evidence.
- [ ] Optional reviewer findings are resolved or explicitly dispositioned when requested.
- [ ] Required independent human approval exists for the exact current head when enforcement is enabled.
- [ ] Solo maintainer attestation is green for the exact current head when no independent human reviewer is available.
- [ ] The cooperation report is READY or READY_WITH_ADVISORY_GAPS for the exact head.
- [ ] The D6 proof seal was posted after the latest evidence and dispositions.
- [ ] Every actionable finding is resolved or documented on the current head.
