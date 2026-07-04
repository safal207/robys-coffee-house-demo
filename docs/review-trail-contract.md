# Cognitive Review Trail Contract

`RRM-TRAIL-001` records one replayable review episode after depth evaluation, runtime probing, route selection and governance outcome.

A trail is evidence memory, not authority:

```text
exact task and head
→ depth
→ selected route or escalation
→ ordered evidence
→ finding dispositions
→ terminal outcome
→ repeatability decision
```

It cannot approve a pull request, authorize merge, execute a side effect or weaken PDG requirements.

## Files

- `qa/review-trail.schema.json` — closed JSON Schema shape;
- `scripts/record-review-trail.mjs` — deterministic source-to-trail recorder;
- `scripts/verify-review-trail.mjs` — structural and semantic verifier;
- `scripts/test-review-trail.mjs` — mutation and replay tests;
- `qa/fixtures/review-trails/` — source evidence fixtures;
- `reports/review-trails/` — committed replayable trails.

The JSON Schema defines the serialized shape. The verifier enforces cross-field, filesystem and governance semantics that cannot be trusted to shape validation alone.

## Exact-head evidence

Every evidence item contains:

- a stable evidence ID;
- evidence kind and reference;
- the exact 40-character PR head;
- observation time;
- supporting or binding authority;
- SHA-256 digest;
- replayable snapshot metadata.

All evidence heads must equal the trail head. A trail recorded before its latest evidence is invalid. Every terminal trail requires at least one binding evidence item; a list containing only supporting observations cannot prove a completed outcome.

Repository references use `repo:<path>`. The verifier:

- checks lexical containment inside the repository;
- resolves the real target and rejects a symlink escape;
- requires the target to be a regular file;
- recomputes the file digest;
- verifies that snapshot `path` and `bytes` match the actual file.

GitHub and manual references preserve a local snapshot whose canonical JSON digest is rechecked offline.

## Route semantics

A `SELECTED` route must contain:

- route ID and stable route key;
- ordered stages with contiguous sequence numbers;
- no escalation reasons;
- route-selection-only authority.

An automatic selected route cannot claim a governance exception. A selected override route must explicitly retain `governanceExceptionRequired: true`.

An `ESCALATE` result cannot claim a selected route, route key, selected-route exception flag or executed stages. It must retain the proposed route and explicit reasons.

## Episode and outcome

| Episode | Allowed outcome |
|---|---|
| `IN_PROGRESS` | `PENDING` only |
| `COMPLETED` | `MERGED`, `CLOSED_UNMERGED` or `BLOCKED` |
| `ABORTED` | `CLOSED_UNMERGED` or `BLOCKED` |

A merged outcome requires an exact merge SHA and completion time. A merged escalation requires a named governance exception and cannot mark the failed route as repeatable.

## Findings

Findings are separated into:

- `accepted`;
- `rejected`;
- `advisory`.

Every finding must reference existing evidence IDs. Finding IDs are unique across all categories.

## First real trail

`reports/review-trails/PR-152@c11f1721673b.json` records the actual RRM-003 episode:

- depth `L3`;
- route decision `ESCALATE`;
- Codex `QUOTA_EXHAUSTED`;
- CodeRabbit `PARTIAL`;
- governance resolution `GE-003 / ACCEPTED_RISK`;
- merge commit `b218b6938c01524bfa3fb3d0d690fc1d8476d373`;
- route repeatability set to `false` with `needsMoreRuns: true`.

The CI contract rebuilds this trail from the source fixture and compares it byte-for-byte with the committed artifact.

## Mutation coverage

The contract rejects:

- stale evidence heads;
- mutated external snapshots;
- repository path traversal and symlink escapes;
- falsified repository snapshot path or byte count;
- terminal trails without binding evidence;
- findings referencing unknown evidence;
- selected routes with escalation reasons;
- override routes missing their governance-exception flag;
- automatic routes claiming an exception;
- sequence gaps, impossible outcomes and ungoverned merged escalations.

## Local verification

```bash
npm run verify:review-trail
npm run test:review-trail
npm run record:review-trail:pr152
```
