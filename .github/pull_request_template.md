## Summary

Describe what changed and why.

## Boundary

State what is explicitly out of scope. Mention pricing, menu data, runtime, PWA, analytics, styling, docs, or product data when relevant.

## Changed files

List important changed files and why they changed.

## LS Graph Coverage

```text
Changed files -> Affected areas -> Dependencies -> Risks -> Checks -> Verdict
```

- [ ] Changed files mapped to affected areas.
- [ ] Downstream dependencies identified.
- [ ] Regression risks listed.
- [ ] Required checks completed or marked human-only.
- [ ] Coverage verdict stated: complete / partial / insufficient.

```text
LS Graph Coverage:
- <file> -> <area> -> <risk> -> <check> -> pass/fail/missing

Coverage verdict: complete | partial | insufficient
```

## LS Temporal Memory

- [ ] Checked `ls-memory/events.jsonl` for similar files, risks, or graph paths.
- [ ] Reused lessons listed.
- [ ] Repeated risks listed.
- [ ] New lessons to record listed, if any.

```text
LS Temporal Memory:
- Memory hits: 0
- Reused lessons: none
- Repeated risks: none
- New lessons: none

Temporal risk verdict: stable | watch | elevated | repeated incident
```

## LS Verdict

```text
LS Verdict: APPROVE | COMMENT | REQUEST_CHANGES

Findings:
- LS-001 — <title> | <severity> | <status>

Decision:
- blocking findings: 0
- advisory findings: 0
- human decisions required: 0
```

## Evidence

Link screenshots, logs, artifacts, or reproducible checks.

## Manual QA

Required for runtime or visual changes. For docs-only PRs, say not required and why.

```text
Manual QA:
- Mobile 390px: not run / pass / fail
- Mobile 430px: not run / pass / fail
- Desktop 1280px: not run / pass / fail
- Language switch: not run / pass / fail
- Search: not run / pass / fail
- Console: not run / pass / fail
```

## AI review

After every PR head update, freeze the branch and post a fresh top-level request for the mandatory independent reviewer. The request must include the full 40-character current head SHA:

```text
@coderabbitai review

Exact head: <full 40-character current head SHA>
```

Also request Qodo on review-board PRs and material runtime or QA-process changes:

```text
@qodo-code-review review

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

## Human approval

Alexey is the final human gate for product feeling, visual taste, offer perception, and brand direction.

## Solo maintainer decision

When no independent human reviewer is available, finish all required checks and bot-review dispositions, then post a top-level comment with the full current head SHA:

`/merge-ready <full 40-character current head SHA>`

To revoke the decision, post:

`/merge-hold <full 40-character current head SHA>`

This is explicit maintainer intent, not independent human or bot approval.

## Rollback plan

Describe the smallest safe rollback path.

## Checklist

- [ ] Latest exact-head CI is green.
- [ ] Generated files are current.
- [ ] Visual changes include exact-head evidence.
- [ ] LS Graph Coverage is complete or explicitly accepted.
- [ ] LS Temporal Memory was checked.
- [ ] LS Verdict is posted.
- [ ] A fresh CodeRabbit request contains the full current head SHA.
- [ ] A CodeRabbit-authored PR review object is bound to that exact head.
- [ ] Qodo is requested for review-board PRs and material runtime or QA-process changes.
- [ ] Codex is recorded as supplemental unless a native exact-head bot review exists.
- [ ] Optional reviewer findings are resolved or explicitly dispositioned when requested.
- [ ] Required independent human approval exists for the exact current head when enforcement is enabled.
- [ ] Solo maintainer attestation is green for the exact current head when no independent human reviewer is available.
- [ ] Every actionable finding is resolved or documented on the current head.
