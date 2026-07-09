# Harmonic Temporal Orientation Scorecard

> Lightweight scoring tool for deciding whether a transition should be allowed, rejected, held, or escalated.

## Purpose

The Harmonic Temporal Orientation System separates project intent, candidate transitions, and real evidence.

The scorecard makes that separation operational.

It helps avoid decisions such as:

```text
This may fix one red check, so commit it.
```

and replaces them with:

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

| Score | Default decision | Meaning |
| --- | --- | --- |
| `8-10` | `allow` | Safe enough to execute if no hard blocker exists. |
| `5-7` | `hold` | Add evidence, reduce side effects, or clarify invariants before acting. |
| `0-4` | `reject` | Redesign the transition. It is likely unsafe or poorly grounded. |

Escalate instead of scoring when two valid invariants conflict and the project needs a human trade-off.

---

## 3. Hard blockers

The score cannot override hard blockers.

A transition must be rejected or held when any of these apply:

```text
trusted exact-head evidence is required but missing
bot identity is untrusted or unknown
seal order is wrong
merge-readiness command would be premature
baseline refresh lacks source artifact/run ID
transition mutates unrelated repair flows
transition hides rather than explains evidence debt
```

---

## 4. Example score: minified runtime transition

Candidate transition:

```text
Minify PWA runtime files to reduce Lighthouse total_js_bytes.
```

| Dimension | Score | Reason |
| --- | ---: | --- |
| Project invariant alignment | 1 | It aimed at Lighthouse, but not at the broader governance invariant. |
| Side-effect safety | 0 | It broke Security and TRACE source-shape expectations. |
| Evidence path | 1 | Lighthouse could check it, but source-governance impact was not safely covered. |
| Exact-head confidence | 2 | CI ran on the exact head. |
| Reversibility | 2 | It was easy to revert. |
| **Total** | **6** | Hold/reject territory. After real evidence showed broken invariants, reject. |

Final decision:

```text
reject
```

Tuner rule:

```text
Do not reshape readable source when governance evidence depends on exact source tokens unless the evidence contracts are intentionally updated too.
```

---

## 5. Example score: readable runtime + evidence-backed baseline refresh

Candidate transition:

```text
Restore readable runtime and refresh Lighthouse baseline from CI artifact evidence.
```

| Dimension | Score | Reason |
| --- | ---: | --- |
| Project invariant alignment | 2 | Preserves traceability/security while resolving stale baseline. |
| Side-effect safety | 2 | Does not mutate unrelated flows or weaken runtime behavior. |
| Evidence path | 2 | Lighthouse, Security, TRACE, Adversarial and CodeQL can verify it. |
| Exact-head confidence | 2 | Baseline cites source head/run evidence. |
| Reversibility | 2 | Documentation and baseline change are isolated and reviewable. |
| **Total** | **10** | Allow if hard assertions remain green. |

Final decision:

```text
allow
```

---

## 6. Example score: D6 seal on PR without trusted exact-head report

Candidate transition:

```text
Post Proof-Depth-Seal: D6 before trusted exact-head bot evidence exists.
```

| Dimension | Score | Reason |
| --- | ---: | --- |
| Project invariant alignment | 0 | Violates the seal-order invariant. |
| Side-effect safety | 0 | Would likely create ledger failure. |
| Evidence path | 0 | Required trusted report evidence is missing. |
| Exact-head confidence | 0 | No trusted exact-head evidence exists yet. |
| Reversibility | 1 | A comment can be followed up, but protocol damage remains. |
| **Total** | **1** | Reject/hold. |

Final decision:

```text
hold
```

Reason:

```text
The move is desirable only after prerequisite evidence exists. Until then, the safe state is hold.
```

---

## 7. Scorecard YAML template

```yaml
scorecard:
  pr: "#000"
  head_sha: "<exact-head-sha>"
  transition: "<candidate transition>"
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
  hard_blockers:
    - ""
  total: 0
  decision: "allow | reject | hold | escalate"
  next_allowed_move: ""
```

---

## 8. Operating rule

```text
A high score can allow a transition, but a hard blocker always wins.
```

The scorecard is not a replacement for judgment.
It is a compact way to force judgment to be explicit.
