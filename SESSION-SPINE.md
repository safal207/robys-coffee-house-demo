# Session Spine v1

Session Spine is the authoritative handoff between agents and sessions. It stores machine-checkable state instead of relying on a prose recap.

## Sidecar storage

Live state must not be committed into the product pull request it describes. A commit containing its own `head_sha` changes that SHA and creates a self-reference.

Keep canonical live state separately, such as in a dedicated state branch, a workflow artifact, or another atomic state store. The repository contains the schema, tools, and immutable QA fixtures.

## Invariants

1. `head_sha` identifies the exact product bytes under discussion.
2. `verified_for_sha` is null or exactly equal to `head_sha`.
3. Merge authorization requires an authorized status, no blockers, current-head verification, and passed current-head evidence.
4. A new product head makes previous successful evidence stale, clears verification, and revokes merge authorization.
5. Only the coordinator writes canonical state. Other agents contribute evidence references.

## Commands

Validate the QA fixture:

    npm run verify:session-state

Validate a sidecar against an observed head:

    npm run verify:session-state -- path/to/session-state.json --head <sha>

Advance state after a new product commit:

    npm run session:update-head -- path/to/session-state.json --head <sha>

Check for stale state without changing it:

    npm run session:update-head -- path/to/session-state.json --head <sha> --check

## First fixture

`qa/fixtures/session-state/pr-126-stale-review.json` captures the mismatch observed on 2026-06-29: PR #126 had live head `144ab511...`, while its description still requested review for `676d79ae...`.
