# Session Spine v1

Session Spine is the authoritative handoff between agents and sessions. It stores machine-checkable state instead of relying on a prose recap.

## Sidecar storage

Live state must not be committed into the product pull request it describes. A commit containing its own `head_sha` changes that SHA and creates a self-reference.

Keep canonical live state separately, such as in a dedicated state branch, a workflow artifact, or another atomic state store. The repository contains the structural schema, runtime tools, tests, and immutable QA fixtures.

## Validation boundary

`docs/session-spine/session-state.schema.json` validates the structural envelope: required fields, primitive types, allowed values, SHA shapes, and unknown properties.

Schema-only validation is not authorization. Cross-field trust rules are enforced by `scripts/session-state-lib.mjs`, including:

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
5. Only the coordinator writes canonical state. Other agents contribute evidence references.
6. Missing CLI flag values fail closed; they never disable exact-head validation or silently substitute operator input.

## Commands

Validate the immutable repository fixture used by CI:

    npm run verify:session-state-fixture

Validate a materialized live sidecar against an observed head:

    npm run verify:session-state -- path/to/session-state.json --head <sha>

A repository checkout cannot validate an external live sidecar unless that state is explicitly materialized and passed to the command. The normal `npm run check` therefore validates the fixture and protocol tests, while the coordinator validates the real sidecar at its storage boundary.

Advance state after a new product commit:

    npm run session:update-head -- path/to/session-state.json --head <sha>

Check for stale state without changing it:

    npm run session:update-head -- path/to/session-state.json --head <sha> --check

## First fixture

`qa/fixtures/session-state/pr-126-stale-review.json` captures the mismatch observed on 2026-06-29: PR #126 had live head `144ab511...`, while its description still requested review for `676d79ae...`.
