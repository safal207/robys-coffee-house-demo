# Session Spine v2

Session Spine is the authoritative handoff between agents and sessions. It stores machine-checkable state instead of relying on a prose recap.

## Sidecar storage

Live state must not be committed into the product pull request it describes. A commit containing its own `head_sha` changes that SHA and creates a self-reference.

Keep canonical live state separately, such as in a dedicated state branch, a workflow artifact, or another atomic state store. The repository contains the structural schema, runtime tools, tests, and immutable QA fixtures.

## Validation boundary

`docs/session-spine/session-state.schema.json` validates the structural envelope: required fields, primitive types, allowed values, SHA shapes, and unknown properties.

Schema-only validation is not authorization. Cross-field trust rules are enforced by `validateSessionState()` in `scripts/session-state-lib.mjs`, including:

- `verified_for_sha` must equal `head_sha`;
- authorized states must contain passed evidence for the current head;
- authorized states must have no blockers;
- `AUTHORIZED` and `DONE` require `merge_authorized=true`.

The runtime validator is therefore the semantic authority before any merge or irreversible action.

## Invariants

1. `head_sha` identifies the exact product bytes under discussion.
2. `verified_for_sha` is null or exactly equal to `head_sha`.
3. Merge authorization requires an authorized status, no blockers, current-head verification, and passed current-head evidence.
4. A new product head makes previous successful evidence stale, clears verification, and revokes merge authorization.
5. Missing CLI flag values fail closed; they never disable exact-head validation or silently substitute operator input.
6. Every mutation declares the exact `sequence` revision it observed.
7. A changed state increments `sequence` by exactly one.
8. A stale writer cannot overwrite a newer state.

## Concurrency model

Version 2 supports competing coordinators on one shared filesystem through two layers:

- an exclusive `<state-path>.lock` file serializes writers while a mutation is being prepared;
- compare-and-swap checks `--expected-sequence` after the lock is acquired and before any write.

If another coordinator currently owns the lock, the writer fails with `SESSION_STATE_BUSY`. After the lock is released, a retry using an old revision fails with `SESSION_STATE_CONFLICT`. Successful writes use a temporary file followed by an atomic rename, so readers see either the old complete document or the new complete document.

The lock is intentionally fail-closed. A process crash can leave a stale lock file; an operator must verify that no writer is active before removing it. Stores that span multiple hosts must place the sidecar and lock on a filesystem whose exclusive create and rename operations are atomic, or implement the same `sequence` CAS in a transactional database/object store.

## Commands

Validate the immutable repository fixture used by CI:

    npm run verify:session-state-fixture

Validate a materialized live sidecar against an observed head:

    npm run verify:session-state -- path/to/session-state.json --head <sha>

A repository checkout cannot validate an external live sidecar unless that state is explicitly materialized and passed to the command. The normal `npm run check` validates the fixture and protocol tests, while the coordinator validates the real sidecar at its storage boundary.

Advance state after a new product commit using the revision observed by the coordinator:

    npm run session:update-head -- path/to/session-state.json --head <sha> --expected-sequence <n>

Use an explicit timestamp when reproducibility is required:

    npm run session:update-head -- path/to/session-state.json --head <sha> --expected-sequence <n> --at <iso-date-time>

Check for a stale head without changing the sidecar. `--expected-sequence` is optional in read-only mode but can assert the exact snapshot:

    npm run session:update-head -- path/to/session-state.json --head <sha> --check --expected-sequence <n>

## Race behavior

Two coordinators that both read sequence `7` cannot both commit:

1. coordinator A acquires the lock and commits sequence `8`;
2. coordinator B either receives `SESSION_STATE_BUSY` while A holds the lock;
3. or, after retrying, receives `SESSION_STATE_CONFLICT` because it still expects `7` while the canonical state is `8`.

The second coordinator must reload the canonical state, reconsider its intended transition, and submit a new mutation against the new sequence. Blind automatic retries are forbidden because the meaning of the state may have changed.

## First fixture

`qa/fixtures/session-state/pr-126-stale-review.json` captures the mismatch observed on 2026-06-29: PR #126 had live head `144ab511...`, while its description still requested review for `676d79ae...`.
