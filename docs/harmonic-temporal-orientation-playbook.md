# Harmonic Temporal Orientation Playbook

> Practical guide for applying Harmonic Temporal Orientation to pull requests, CI evidence, baselines, reviews, and protected project transitions.

## Purpose

The whitepaper defines the model. This playbook defines the operating loop:

```text
project invariant -> candidate transition -> real evidence -> orientation decision -> observer note -> tuner rule
```

---

## 1. Canonical orientation record

`scripts/validate-harmonic-orientation.mjs` accepts **JSON records only**. YAML may be used as a private drafting aid, but it must be serialized to the canonical JSON shape before validation.

```json
{
  "id": "HTO-YYYYMMDD-001",
  "time_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "repo": "owner/repo",
  "pr": "#000",
  "head_sha": "exact-head-sha",
  "actor": "human",
  "project_graph": {
    "invariant": ["What must remain true?"],
    "forbidden_moves": ["What must not happen yet?"]
  },
  "transition_graph": {
    "candidate": {
      "type": "documentation",
      "description": "What transition is being considered?"
    },
    "expected_effect": ["What should improve?"]
  },
  "real_graph": {
    "evidence_before": {
      "green": [],
      "red": [],
      "missing": []
    },
    "evidence_after": {
      "green": [],
      "red": [],
      "missing": []
    }
  },
  "orientation_center": {
    "decision": "hold",
    "reason": "Why this decision was selected",
    "next_allowed_move": "What may happen next?"
  },
  "observer_graph": {
    "pattern": [],
    "anomaly": [],
    "risk": []
  },
  "tuner_graph": {
    "rule_update": [],
    "threshold_update": []
  },
  "scorecard": {
    "scores": {
      "project_invariant_alignment": {"value": 1, "reason": ""},
      "side_effect_safety": {"value": 1, "reason": ""},
      "evidence_path": {"value": 1, "reason": ""},
      "exact_head_confidence": {"value": 1, "reason": ""},
      "reversibility": {"value": 2, "reason": ""}
    },
    "hard_blockers": [],
    "total": 6
  }
}
```

Both evidence snapshots are required. Each snapshot must contain `green`, `red`, and `missing` arrays.

---

## 2. Decision states

| State | Meaning | Typical action |
| --- | --- | --- |
| `allow` | The transition is strongly supported, directly verifiable, and unblocked. | Execute the transition. |
| `hold` | Evidence or a prerequisite is incomplete. | Wait, rerun, or collect evidence. |
| `reject` | The transition is unsafe, premature, or violates a protected invariant. | Redesign or abandon it. |
| `escalate` | Valid invariants conflict and no deterministic blocker decides the result. | Ask for a human priority decision. |

---

## 3. Executable score policy

Hard blockers are classified before numeric score.

```text
hold-class blocker -> hold
reject-class blocker -> reject
any blocker -> allow and escalate are forbidden
score 8-10 with zero blockers -> allow is required
score 0-7 with zero blockers -> allow is forbidden
```

Within score `0-7`, choose `hold`, `reject`, or `escalate` from the evidence and invariant relationship recorded in the graphs.

---

## 4. Transition matrix

| Transition | Project question | Required evidence |
| --- | --- | --- |
| Code change | Does it preserve security, traceability, runtime behavior, and scope? | Exact-head CI and changed-file review. |
| CI rerun | Is the result plausibly transient? | Same head and a new workflow result. |
| Review request | Does review evidence need exact-head freshness? | Trusted review tied to the current head. |
| Baseline refresh | Is the baseline a reviewed reality snapshot rather than arbitrary weakening? | Artifact or run evidence and preserved hard assertions. |
| Revert | Which invariant does the revert restore? | Previously failing evidence becomes green. |
| Protected protocol step | Are all prerequisite evidence nodes present and ordered? | Exact-head trusted evidence and accepted ordering. |

---

## 5. Observer checklist

After a failed or surprising transition, record:

```text
What did we expect?
What happened?
Which invariant was touched?
Was the failure code, governance, stale baseline, stale head, or missing evidence?
What rule should the Tuner add or change?
```

---

## 6. Tuner rule shape

```yaml
tuner_rule:
  id: "TUNE-001"
  trigger: "Condition that exposed a repeated risk"
  rule: "The future decision rule"
  preferred_transition: "Safer alternative"
  evidence_required:
    - "Exact evidence that must exist"
```

This YAML block documents a rule for humans; orientation records sent to the validator remain JSON.

---

## 7. Bundled examples

The repository includes executable records for every decision state:

```text
docs/examples/harmonic-orientation-record.pr188-baseline-allow.json
docs/examples/harmonic-orientation-record.pr188-minify-reject.json
docs/examples/harmonic-orientation-record.pr186-d6-hold.json
docs/examples/harmonic-orientation-record.conflict-escalate.json
```

Negative fixtures cover malformed types, missing evidence, score mismatches, blocker precedence, omitted required blockers, and invalid score/decision combinations.

---

## 8. Validation commands

```bash
node scripts/validate-harmonic-orientation.mjs \
  docs/examples/harmonic-orientation-record.pr188-minify-reject.json \
  docs/examples/harmonic-orientation-record.pr188-baseline-allow.json \
  docs/examples/harmonic-orientation-record.pr186-d6-hold.json \
  docs/examples/harmonic-orientation-record.conflict-escalate.json

node scripts/test-harmonic-orientation.mjs
node --check scripts/validate-harmonic-orientation.mjs
node --check scripts/test-harmonic-orientation.mjs
```

---

## 9. Readiness checklist

```text
[ ] Current head SHA is known.
[ ] Required evidence is tied to the current head.
[ ] Trusted identity requirements are satisfied.
[ ] Both evidence snapshots are complete.
[ ] Score total matches all dimensions.
[ ] Hard blockers use the canonical enum.
[ ] Decision matches blocker precedence and score range.
[ ] Observer has no unresolved high-risk pattern.
[ ] Human action is explicit where required.
```

---

## 10. Operating rule

```text
Never accept a transition merely because one check becomes green; accept it only when it preserves the project graph and reality verifies it.
```
