# Harmonic Temporal Orientation Playbook

> Practical operating guide for applying the Harmonic Temporal Orientation System to pull requests, CI failures, bot evidence, baselines, seals, and merge readiness.

## Purpose

The whitepaper defines the model. This playbook defines how to use it while working on a real PR.

```text
project invariant -> transition candidate -> real evidence -> orientation decision -> observer note -> tuner rule
```

---

## 1. Minimum PR orientation record

Every meaningful PR action should be expressible as a canonical orientation record accepted by `scripts/validate-harmonic-orientation.mjs`.

```yaml
id: "HTO-YYYYMMDD-001"
time_utc: "YYYY-MM-DDTHH:MM:SSZ"
repo: "owner/repo"
pr: "#000"
head_sha: "<exact-head-sha>"
actor: "human"

project_graph:
  invariant:
    - "What must remain true?"
  forbidden_moves:
    - "What must not happen yet?"

transition_graph:
  candidate:
    type: "commit | rerun | bot-request | baseline-refresh | seal | merge-command | revert | escalation | documentation"
    description: "What transition is being considered?"
  expected_effect:
    - "What should improve if the transition is valid?"

real_graph:
  evidence_before:
    green: []
    red: []
    missing: []
  evidence_after:
    green: []
    red: []
    missing: []

orientation_center:
  decision: "allow | reject | hold | escalate"
  reason: "Why this decision is safe or unsafe"
  next_allowed_move: "What may happen next?"

observer_graph:
  pattern: []
  anomaly: []
  risk: []

tuner_graph:
  rule_update: []
  threshold_update: []

scorecard:
  scores:
    project_invariant_alignment: {value: 0, reason: ""}
    side_effect_safety: {value: 0, reason: ""}
    evidence_path: {value: 0, reason: ""}
    exact_head_confidence: {value: 0, reason: ""}
    reversibility: {value: 0, reason: ""}
  hard_blockers: []
  total: 0
```

---

## 2. Decision states

| State | Meaning | Typical action |
| --- | --- | --- |
| `allow` | Transition preserves higher-priority invariants and has a verifiable evidence path. | Execute the transition. |
| `reject` | Transition breaks a protected invariant or has a reject-class hard blocker. | Do not execute; choose another path. |
| `hold` | Prerequisite evidence is missing or a hold-class blocker exists. | Wait, rerun, collect evidence, or trigger the missing report. |
| `escalate` | Valid invariants conflict and no deterministic hard blocker already decides the move. | Ask for explicit human judgment. |

Hard blockers take precedence over score. Hold-class blockers require `hold`; reject-class blockers require `reject`. A record with a hard blocker must not use `allow` or `escalate`.

---

## 3. Transition type matrix

| Transition type | Required project question | Required real evidence |
| --- | --- | --- |
| Code commit | Does this preserve security, traceability, runtime behavior, and scope? | CI checks and changed-file review. |
| CI rerun | Is the failure likely environmental or pending? | Same head, same workflow, new result. |
| Bot request | Does the bot evidence need exact-head freshness? | Trusted bot comment/check tied to head. |
| Baseline refresh | Is the new baseline reviewed reality rather than arbitrary weakening? | CI artifact, run ID, head SHA, hard assertions green. |
| Revert | Which invariant does the revert restore? | Previously failing invariant becomes green. |
| Seal | Are all prerequisite evidence nodes already present? | Ledger accepts seal order and depth. |
| Merge command | Are all protected invariants and required checks satisfied? | Branch protection and protocol evidence green. |

---

## 4. Orientation scoring

Each dimension is scored from 0 to 2.

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Invariant alignment | Unclear or conflicting | Partially aligned | Clearly preserves the target invariant |
| Side-effect safety | Breaks another invariant | Unknown side effects | No known higher-priority damage |
| Evidence path | No proof path | Indirect proof | Direct CI/bot/artifact proof |
| Exact-head confidence | Not tied to head | Probably current | Exact SHA verified |
| Reversibility | Hard to unwind | Revert possible but costly | Easy or already isolated |

```text
8-10: allow when no hard blocker exists; escalate only for a real invariant conflict
5-7: hold, reject, or escalate according to evidence and conflict
0-4: hold when prerequisite evidence is missing; otherwise reject or escalate
```

---

## 5. Observer checklist

After every failed or surprising transition, capture one short note:

```text
What did we think would happen?
What actually happened?
Which invariant did the transition unexpectedly touch?
Was the failure code, governance, stale baseline, exact-head, or missing evidence?
What should the Tuner change?
```

Example:

```text
We treated Lighthouse red as JavaScript-size debt and attempted minification. The transition broke Security and TRACE because those contracts depended on readable source tokens. The actual problem was stale baseline versus accepted PWA/offline runtime size.
```

---

## 6. Tuner rule format

```yaml
tuner_rule:
  id: "TUNE-001"
  trigger: "When a local fix changes source shape used by governance contracts"
  rule: "Do not accept the fix unless Security and Traceability remain valid."
  preferred_transition: "Use readable runtime and evidence-backed baseline refresh."
  evidence_required:
    - "Security contract success"
    - "Feature traceability contract success"
    - "Relevant performance contract success"
```

---

## 7. Example: PR #188 repair flow

### Project Graph

```text
#188 should repair AI cooperation reporting and offline probe reliability.
It must not break Security, TRACE, PWA behavior, Lighthouse governance, or exact-head review contracts.
```

### Transition Graph

```text
1. Add publish diagnostics.
2. Harden offline browser readiness probe.
3. Wait for service worker registration.
4. Wait for controlled offline page.
5. Fix Trusted Types policy mismatch.
6. Reject minified runtime after it breaks source-shape contracts.
7. Restore readable runtime.
8. Refresh Lighthouse baseline from CI artifact evidence.
9. Request fresh CodeRabbit exact-head review.
```

### Real Graph

```text
Adversarial browser contract verifies offline behavior.
Security contract verifies CSP/source-shape/security invariants.
Feature traceability verifies evidence fragments and state models.
Lighthouse verifies the reviewed performance baseline.
AI review contract verifies exact-head review evidence.
```

### Observer and Tuner

```text
Observer: a red check can be stale governance, not broken runtime.
Tuner: do not reshape implementation for one metric before checking higher-priority contracts.
```

---

## 8. Guarded template: PR #186 readiness flow

This template is intentionally conservative.

```text
#186 must not receive D6 seal or merge-ready command until trusted exact-head bot evidence exists.
```

Required evidence:

```text
exact_current_head_sha known
trusted github-actions[bot] AI cooperation report exists
report marker exists
report is tied to exact current head
D6 seal is posted after the report
ledger/checks accept the seal
branch protection checks are green
```

| Candidate transition | Permission rule |
| --- | --- |
| Trigger AI cooperation report | Allowed when it requests evidence without mutating protected code. |
| Post D6 seal | Hold until trusted exact-head report exists. |
| Post `/merge-ready` | Hold until D6 is accepted and checks/ledger are green. |
| Merge | Human/manual only after protocol evidence is complete. |

Canonical record example:

```yaml
id: "HTO-20260709-002"
time_utc: "2026-07-09T00:00:00Z"
repo: "safal207/robys-coffee-house-demo"
pr: "#186"
head_sha: "a38213b50786662066fbeeb09e2d0ec36a42d14e"
actor: "bot"
project_graph:
  invariant:
    - "No D6 seal before trusted exact-head cooperation report."
    - "No merge-ready before ledger/checks accept the seal."
  forbidden_moves:
    - "Do not post D6 or /merge-ready early."
transition_graph:
  candidate:
    type: "seal"
    description: "Post Proof-Depth-Seal: D6"
  expected_effect:
    - "Ledger accepts D6 only after prerequisites."
real_graph:
  evidence_before:
    green: []
    red: []
    missing:
      - "Trusted exact-head github-actions[bot] cooperation report"
  evidence_after:
    green: []
    red: []
    missing: []
orientation_center:
  decision: "hold"
  reason: "Required trusted exact-head evidence is missing."
  next_allowed_move: "Obtain the trusted exact-head bot report."
observer_graph:
  pattern: ["Protocol step blocked by missing prerequisite."]
  anomaly: []
  risk: ["Early seal causes ledger failure."]
tuner_graph:
  rule_update: ["Check trusted identity, exact head, marker, and order before seal transitions."]
  threshold_update: ["D6 requires trusted exact-head report."]
scorecard:
  scores:
    project_invariant_alignment: {value: 0, reason: "Premature D6 violates order."}
    side_effect_safety: {value: 0, reason: "Could create ledger failure."}
    evidence_path: {value: 0, reason: "Required evidence is missing."}
    exact_head_confidence: {value: 0, reason: "No trusted exact-head evidence."}
    reversibility: {value: 1, reason: "Protocol noise remains after correction."}
  hard_blockers: ["trusted_exact_head_evidence_required_but_missing"]
  total: 1
```

---

## 9. Merge readiness checklist

```text
[ ] Current head SHA is known.
[ ] Required evidence is exact-head.
[ ] Required bot identity is trusted.
[ ] No protected invariant is missing.
[ ] All required CI checks are green or intentionally non-blocking.
[ ] Any baseline refresh has source artifact/run ID.
[ ] Any seal has correct order and depth.
[ ] Observer has no unresolved high-risk pattern.
[ ] Tuner has no rule blocking the transition.
[ ] Human action is explicitly requested when required.
```

---

## 10. One-line operating rule

```text
Never accept a transition because it makes one check green; accept it only when it preserves the project graph and reality verifies it.
```
