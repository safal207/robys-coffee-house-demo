# Robis Causal Review Envelope v1

## Purpose

The Robis cooperation report already aggregates exact-head CI and reviewer evidence into an advisory verdict. The causal review envelope adds a machine-readable contract for the path behind that verdict:

```text
exact PR head
→ observed evidence
→ unique causal basis
→ advisory decision
→ human adjudication
```

It does **not** replace the existing Markdown report or change its decision policy. The builder imports the existing `scripts/ai-review-cooperation.py` module and reuses its reviewer classification, finding deduplication, required-check classification, and overall conclusion.

## Boundary

The envelope is advisory only.

- It cannot execute a repository mutation.
- It cannot approve a pull request.
- It cannot merge a pull request.
- It cannot turn missing evidence into success.
- A head update supersedes the previous envelope and requires a new exact-head record.
- Human adjudication remains mandatory.

The live workflow has read-only repository permissions and uploads an artifact. It does not create or update PR comments.

## Record shape

`robis.causal-review.v1` binds five dimensions in one object.

### Exact identity

- repository;
- pull request number;
- full 40-character head SHA;
- deterministic record ID and SHA-256 digest.

### Causal lineage

- `cause_id`;
- `parent_cause_id`;
- deterministic `causal_basis`;
- graph nodes and edges connecting exact head, cause, and decision.

The exact PR head is the root parent cause. A decision with a missing or ambiguous parent fails validation.

### Transition semantics

```text
state_from
→ tension
→ cause
→ state_to
→ smallest justified action
```

The current mapping is:

| Reporter conclusion | Envelope state |
|---|---|
| `BLOCK` | `BLOCKED` |
| `FIX_THEN_RERUN` | `FIX_REQUIRED` |
| `WAIT_FOR_EVIDENCE` | `EVIDENCE_PENDING` |
| `READY_WITH_ADVISORY_GAPS` | `READY_ADVISORY` |
| `READY` | `READY` |

The validator recomputes the allowed decision from findings, required CI, evidence completeness, and the required CodeRabbit lane. A record cannot claim a stronger state than the underlying evidence allows.

### Two time axes

- `valid_time`: when the reviewed Git head became the current candidate state;
- `transaction_time`: the latest timestamp represented in the collected evidence set.

`transaction_time` must never precede `valid_time`.

### Space and authority

The space transition records:

```text
origin: repository / PR / exact head
crossed boundary: evidence_to_advisory_decision
destination: human_adjudication
```

The authority block is fixed to an advisory aggregator with `can_execute`, `can_approve`, and `can_merge` all set to `false`.

### Acknowledged transition trace

The envelope includes a small T-Trace-compatible semantic sequence:

```text
sense
→ transition
→ commit
```

Here, `commit` means commitment of the **advisory record**, not execution of a repository action. `execution_committed` must remain `false`.

## Evidence manifest

The builder hashes every exact input used to produce the envelope:

- PR snapshot;
- head commit;
- issue comments;
- submitted reviews;
- review comments;
- GraphQL review threads;
- check runs;
- commit statuses;
- changed files.

Each role records byte size and SHA-256. Temporary runner paths are not exposed in the artifact.

## Commands

Build from the same environment files used by the cooperation reporter:

```bash
python3 scripts/causal_review_envelope.py build
```

Validate the structural envelope and its cross-field semantic seal:

```bash
python3 scripts/causal_review_envelope.py validate \
  qa/causal-review-envelope.example.json
python3 scripts/verify_causal_review_semantics.py validate \
  qa/causal-review-envelope.example.json
```

Run the semantic mutation challenge:

```bash
python3 scripts/verify_causal_review_semantics.py self-test \
  qa/causal-review-envelope.example.json
```

Run mutation tests:

```bash
python3 scripts/test_causal_review_envelope.py -v
```

## Workflow

`.github/workflows/causal-review-envelope.yml` runs as a parallel observer after the same trusted triggers used by the existing cooperation reporter. It:

1. resolves one open PR for the triggering exact head;
2. collects paginated REST and GraphQL evidence;
3. builds the envelope with the existing reporter policy;
4. validates structure and recomputes the cross-field semantic projection;
5. uploads the JSON artifact;
6. publishes only a GitHub Step Summary.

## Bootstrap boundary

`issue_comment` and `workflow_run` workflows execute from the default branch. The pull request can prove the implementation through the dedicated contract workflow, but the live observer becomes active only after this workflow reaches `main`.

## Future adapters

This v1 contract intentionally remains local and dependency-free. Later adapters may translate the same envelope into:

- TIP/IFP transition records;
- T-Trace append-only JSONL;
- CML causal-parent audits;
- Pythia `ALLOW / BLOCK / ESCALATE` gates;
- LiminalDB bi-temporal storage;
- LS exact-head scorecards;
- ProofPath execution receipts.

Those adapters must consume the envelope without inheriting merge authority.
