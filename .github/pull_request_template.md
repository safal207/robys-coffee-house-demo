## Summary

Describe what changed and why.

## Evidence

Link screenshots, logs, artifacts, or reproducible checks.

## Independent review

After every PR head update, freeze the branch and bind the review decision to the full current 40-character SHA.

A trusted human approval on the exact head satisfies the independent-review stage. A solo maintainer may instead post this accountable top-level attestation:

```text
Independent-Review: PDG-001
Head: <full 40-character current head SHA>
Outcome: accepted
```

The existing exact-head command is also accepted:

```text
/merge-ready <full 40-character current head SHA>
```

Optional automated reviews may be requested, but they are advisory and never own approval or merge authority:

```text
@codex review
@jules review
/deepseek review
```

A new commit invalidates earlier review evidence, dispositions and the Proof Seal. Bind new evidence to the new full SHA.

## Solo maintainer decision

When no independent human reviewer is available, finish all required checks and finding dispositions, then post `/merge-ready <full SHA>` or the explicit `Independent-Review` attestation above.

To revoke the decision, post:

```text
/merge-hold <full 40-character current head SHA>
```

This is explicit maintainer intent, not an external-provider approval.

## Checklist

- [ ] Latest exact-head CI is green.
- [ ] Generated files are current.
- [ ] Visual changes include exact-head evidence.
- [ ] Exact-head human approval or maintainer attestation exists.
- [ ] Optional automated reviewers are treated as advisory only.
- [ ] Optional reviewer findings are resolved or explicitly dispositioned when requested.
- [ ] Solo maintainer attestation is green for the exact current head when no independent human reviewer is available.
- [ ] The D6 proof seal was posted after the latest evidence and dispositions.
- [ ] Every actionable finding is resolved or documented on the current head.
- [ ] No external AI provider or provider quota is required for release.
