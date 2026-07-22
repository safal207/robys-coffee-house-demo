# Harmonic Temporal Orientation Scorecard

> Scoring tool for deciding whether a transition should be allowed, rejected, held, or escalated.

## Purpose

The scorecard makes project invariants, transition safety, and evidence quality explicit.

It replaces:

```text
This may fix one red check, so commit it.
```

with:

```text
This transition preserves the project graph, has a real evidence path, and does not break higher-priority invariants.
```

---

## 1. Score dimensions

Each dimension is scored from 0 to 2.

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Project invariant alignment | The invariant is unclear or contradicted. | The transition partially supports the invariant. | The transition clearly preserves or advances the invariant. |
| Side-effect safety | The transition breaks another protected invariant. | Side effects are unknown or not yet checked. | No known higher-priority invariant is harmed. |
| Evidence path | No direct way to prove the transition worked. | Evidence is indirect or partial. | CI, bot output, artifact, or exact-head proof can verify it. |
| Exact-head confidence | Evidence is stale or not tied to the current head. | Evidence is probably current but not explicit. | Evidence is tied to the exact current head SHA. |
| Reversibility | Hard to unwind or contaminates unrelated work. | Revert is possible but costly. | Easy to revert, isolated, or documentation-only. |

Maximum score: `10`.

---

## 2. Decision guide

Hard blockers are classified before the numeric score.

| Condition | Decision | Meaning |
| --- | --- | --- |
| Hold-class hard blocker | `hold` | A prerequisite or trusted evidence is missing. |
| Reject-class hard blocker | `reject` | The transition is premature, unsafe, or crosses a protected boundary. |
| Conflicting valid invariants and no hard blocker | `escalate` | A human must choose the priority. |
| Score `8-10` and no hard blocker | `allow` | Safe enough to execute and directly verifiable. |
| Score `5-7` and no hard blocker | `hold`, `reject`, or `escalate` | More evidence or a clearer transition is needed. |
| Score `0-4` with missing prerequisite evidence | `hold` | The system cannot decide safely yet. |
| Score `0-4` with sufficient evidence of an unsafe transition | `reject` | Redesign or abandon the transition. |

The score never overrides a hard blocker.

---

## 3. Canonical hard blockers

### Hold class

```text
trusted_exact_head_evidence_required_but_missing
bot_identity_untrusted_or_unknown
baseline_refresh_lacks_source_artifact_or_run_id
```

### Reject class

```text
seal_order_wrong
merge_readiness_command_premature
transition_mutates_unrelated_repair_flows
transition_hides_evidence_debt
```

Rules:

```text
any hard blocker forbids allow
reject-class blocker requires reject
otherwise hold-class blocker requires hold
escalate requires zero hard blockers
```

---

## 4. Example: unsafe local optimization

Candidate transition:

```text
Minify runtime files to reduce one performance metric.
```

| Dimension | Score | Reason |
| --- | ---: | --- |
| Project invariant alignment | 1 | It targets one metric but not the broader governance invariant. |
| Side-effect safety | 0 | It breaks source-shape evidence. |
| Evidence path | 1 | Performance can verify size, but governance impact is not preserved. |
| Exact-head confidence | 2 | CI ran on the exact head. |
| Reversibility | 2 | It is easy to revert. |
| **Total** | **6** | Evidence shows the transition is unsafe. |

Hard blocker:

```text
transition_hides_evidence_debt
```

Final decision: `reject`.

---

## 5. Example: evidence-backed baseline refresh

Candidate transition:

```text
Restore readable runtime and refresh the baseline from reviewed CI evidence.
```

| Dimension | Score | Reason |
| --- | ---: | --- |
| Project invariant alignment | 2 | Preserves traceability and security. |
| Side-effect safety | 2 | Does not mutate unrelated flows. |
| Evidence path | 2 | Direct CI proof exists. |
| Exact-head confidence | 2 | Evidence is tied to the exact head. |
| Reversibility | 2 | The change is isolated and reviewable. |
| **Total** | **10** | No hard blocker exists. |

Final decision: `allow`.

---

## 6. Example: missing prerequisite evidence

Candidate transition:

```text
Advance a protected protocol step before its trusted evidence exists.
```

| Dimension | Score | Reason |
| --- | ---: | --- |
| Project invariant alignment | 0 | The prerequisite order is not satisfied. |
| Side-effect safety | 0 | Acting early can invalidate the protocol. |
| Evidence path | 0 | Required evidence is missing. |
| Exact-head confidence | 0 | Exact-head proof is absent. |
| Reversibility | 1 | The action can be corrected, but noise remains. |
| **Total** | **1** | Missing evidence means wait, not guess. |

Hard blocker:

```text
trusted_exact_head_evidence_required_but_missing
```

Final decision: `hold`.

---

## 7. Scorecard YAML template

```yaml
scorecard:
  scores:
    project_invariant_alignment:
      value: 0
      reason: ""
    side_effect_safety:
      value: 0
      reason: ""
    evidence_path:
      value: 0
      reason: ""
    exact_head_confidence:
      value: 0
      reason: ""
    reversibility:
      value: 0
      reason: ""
  hard_blockers: []
  total: 0
```

The final decision belongs in `orientation_center.decision`, not inside the scorecard.

---

## 8. Operating rule

```text
Classify blockers first, calculate score second, choose the decision third.
```
