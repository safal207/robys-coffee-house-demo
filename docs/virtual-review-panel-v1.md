# Robis Virtual Review Panel v1

## Purpose

The panel preserves useful review work when the required external reviewer is rate-limited,
unavailable, or does not acknowledge a bounded request. It does **not** pretend that several
external foundation models ran. Every record discloses one of two implementation modes:

- `single_model_role_simulation`: one named model executes separate role contracts;
- `multi_provider`: two or more independently identified providers with evidence references.

The panel is advisory evidence only. It cannot satisfy the CodeRabbit lane, execute repository
changes, approve a pull request, or merge.

## Activation

A record may be created only for an explicit reason code:

- `QUOTA_EXHAUSTED`;
- `PROVIDER_UNAVAILABLE`;
- `NO_ACK`;
- `MANUAL_ADVISORY_REQUEST`.

Silence is not converted into a clean result. The external lane remains unsatisfied in every
virtual-panel record.

## Stable roles

The versioned role registry is `qa/virtual-review-panel-roles.json`.

1. `causal_architect` checks parent causes, evidence identity, graph lineage, and deduplication.
2. `temporal_provenance` checks valid/transaction time, freshness, and supersession.
3. `adversarial_semantics` tries rehashed tampering, contradictory fields, and shadow paths.
4. `authority_safety` protects least privilege and the human adjudication boundary.
5. `ci_reliability` checks provider lifecycle, retries, pagination, comment reuse, and CI behavior.

One role may pass while another blocks. The disagreement is retained in `dissent`; it is never
averaged away.

## Decision policy

The conclusion is causal, not a vote count:

- any P0 or P1 root cause -> `BLOCK`;
- any P2 or P3 root cause -> `FIX_THEN_RERUN`;
- no findings with an authenticated provider stall -> `READY_WITH_ADVISORY_GAPS`;
- otherwise -> `WAIT_FOR_EVIDENCE`.

`READY` is intentionally absent. A virtual panel cannot turn missing independent evidence into a
fully complete review.

## Record contract

Each record binds:

- repository, pull request, and full exact-head SHA;
- the real external-provider state;
- disclosed implementation identity;
- role observations with path, line, confidence, and exact-head evidence;
- deterministic root-cause deduplication;
- visible dissent;
- a complete evidence manifest;
- `EXTERNAL_REVIEW_STALLED -> cause -> advisory decision`;
- trusted head-observation time and transaction time;
- mandatory supersession after a head change;
- no execution, approval, or merge authority.

`causal_basis` includes the role outputs, deduplicated causes, dissent, evidence manifest, and
decision boundary. `cause_id` is its SHA-256 digest. `record_id` seals the entire JSON record.

## Commands

Validate a record:

```bash
python3 scripts/virtual_review_panel.py validate qa/virtual-review-panel.example.json
```

Normalize a role-output source into a sealed record:

```bash
python3 scripts/virtual_review_panel.py normalize source.json panel.json
```

After the workflow reaches the default branch, a trusted repository member can verify a committed
PR-head record without executing PR code:

```text
/virtual-panel verify qa/virtual-review-panel.example.json
```

The observer checks out the validator from the default branch, downloads only the JSON record from
the current PR head, validates subject/head identity, and uploads the verified record as an
artifact. It has read-only permissions and writes no PR comments.

## First pilot

`qa/virtual-review-panel.example.json` records the first panel pilot for PR #225 at exact head
`9fa5ff666f1aa7eb80ae0d1061e3917358e9dedb`. It explicitly states that GPT-5.6 Thinking executed
five role contracts in `single_model_role_simulation` mode. The record does not claim five external
providers and does not satisfy CodeRabbit.

## Future adapters

The record is designed to map into CML, Pythia, T-Trace, LiminalDB, LS, TIP/IFP, and ProofPath.
Adapters must preserve provider identity, dissent, exact-head binding, and advisory-only authority.
