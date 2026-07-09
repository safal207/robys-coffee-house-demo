# Harmonic Temporal Orientation Playbook

> Practical operating guide for applying the Harmonic Temporal Orientation System to pull requests, CI failures, bot evidence, baselines, seals, and merge readiness.

## Purpose

The whitepaper defines the model.

This playbook defines how to use it while working on a real PR.

The goal is to avoid reactive fixes and instead run every action through the same navigation loop:

```text
project invariant -> transition candidate -> real evidence -> orientation decision -> observer note -> tuner rule
```

---

## 1. Minimum PR orientation record

Every meaningful PR action should be expressible as an orientation record.

```yaml
orientation_record:
  pr: "#188"
  head: "<exact-head-sha>"
  time: "<UTC timestamp>"
  project_invariant:
    - "What must remain true?"
  transition_candidate:
    type: "commit | rerun | bot-request | baseline-refresh | seal | merge-command | revert | escalation"
    description: "What are we about to do?"
  real_evidence_before:
    green:
      - "Known passing checks"
    red:
      - "Known failing checks"
    missing:
      - "Evidence not yet present"
  orientation_decision: "allow | reject | hold | escalate"
  reason: "Why this decision is safe or unsafe"
  expected_evidence_after:
    - "Which CI/bot/artifact should prove the transition?"
  observer_note:
    - "What pattern did this reveal?"
  tuner_update:
    - "What rule should improve future decisions?"
```

---

## 2. Decision states

The Orientation Center has four output states.

| State | Meaning | Typical action |
| --- | --- | --- |
| `allow` | Transition preserves higher-priority invariants and has a verifiable evidence path. | Execute the transition. |
| `reject` | Transition might fix one symptom but breaks another invariant. | Do not execute; choose another path. |
| `hold` | Evidence is missing or not exact-head. | Wait, rerun, collect evidence, or trigger the missing report. |
| `escalate` | Invariants conflict or require human judgment. | Ask for explicit human decision. |

---

## 3. Transition type matrix

| Transition type | Required project question | Required real evidence |
| --- | --- | --- |
| Code commit | Does this preserve security, traceability, runtime behavior, and scope? | CI checks and changed-file review. |
| CI rerun | Is the failure likely environmental or pending? | Same head, same workflow, new result. |
| Bot request | Does the bot evidence need exact-head freshness? | Trusted bot comment/check tied to head. |
| Baseline refresh | Is the new baseline a reviewed reality snapshot rather than arbitrary weakening? | CI artifact, run ID, head SHA, hard assertions green. |
| Revert | Which invariant does the revert restore? | Previously failing invariant becomes green. |
| Seal | Are all prerequisite evidence nodes already present? | Ledger accepts seal order and depth. |
| Merge command | Are all protected invariants and required checks satisfied? | Branch protection and protocol evidence green. |

---

## 4. Orientation scoring

Use this lightweight score before applying a transition.

Each dimension is scored from 0 to 2.

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Invariant alignment | Unclear or conflicting | Partially aligned | Clearly preserves the target invariant |
| Side-effect safety | Breaks another invariant | Unknown side effects | No known higher-priority damage |
| Evidence path | No proof path | Indirect proof | Direct CI/bot/artifact proof |
| Exact-head confidence | Not tied to head | Probably current | Exact SHA verified |
| Reversibility | Hard to unwind | Revert possible but costly | Easy or already isolated |

Decision guide:

```text
8-10: allow if no hard blocker exists
5-7: hold or add evidence
0-4: reject or redesign transition
```

---

## 5. Observer checklist

After every failed or surprising transition, the Observer Graph should capture one short note.

```text
What did we think would happen?
What actually happened?
Which invariant did the transition unexpectedly touch?
Was the failure a code issue, governance issue, stale baseline, exact-head issue, or missing evidence issue?
What should the Tuner change?
```

Example observer note:

```text
We treated Lighthouse red as JavaScript-size debt and attempted minification. The transition broke Security and TRACE because those contracts depended on readable source tokens. The actual problem was stale baseline vs accepted PWA/offline runtime size.
```

---

## 6. Tuner rule format

When the Observer notices a repeated or high-value pattern, convert it into a Tuner rule.

```yaml
tuner_rule:
  id: "TUNE-001"
  trigger: "When a local fix would change source shape used by governance contracts"
  rule: "Do not accept the fix unless Security and Traceability evidence remain valid."
  preferred_transition: "Use readable runtime and evidence-backed baseline refresh instead of artificial minification."
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
Lighthouse verifies accepted performance baseline.
AI review contract verifies exact-head review evidence.
```

### Observer note

```text
A red check can be a stale-governance problem, not a broken-runtime problem.
```

### Tuner update

```text
Do not weaken or reshape implementation to satisfy one metric until the Orientation Center checks whether the metric conflicts with higher-priority governance evidence.
```

---

## 8. Guarded template: PR #186 readiness flow

This template is intentionally conservative.

### Project Graph

```text
#186 must not receive D6 seal or merge-ready command until trusted exact-head bot evidence exists.
```

### Required evidence nodes

```text
exact_current_head_sha known
trusted github-actions[bot] AI cooperation report exists
report marker exists
report is tied to exact current head
D6 seal posted after the report
ledger/checks accept the seal
branch protection checks are green
```

### Transition permissions

| Candidate transition | Permission rule |
| --- | --- |
| Trigger AI cooperation report | Allowed if it only requests evidence and does not mutate protected code. |
| Post D6 seal | Hold until trusted exact-head report exists. |
| Post `/merge-ready` | Hold until D6 is accepted and checks/ledger are green. |
| Merge | Human/manual only after protocol evidence is complete. |

### Orientation record example

```yaml
orientation_record:
  pr: "#186"
  project_invariant:
    - "No D6 seal before trusted exact-head cooperation report."
    - "No merge-ready before ledger/checks accept the seal."
  transition_candidate:
    type: "seal"
    description: "Post Proof-Depth-Seal: D6"
  real_evidence_before:
    green: []
    red: []
    missing:
      - "Trusted exact-head github-actions[bot] cooperation report"
  orientation_decision: "hold"
  reason: "D6 would be premature without the required trusted bot evidence."
  expected_evidence_after:
    - "AI cooperation report comment with exact head and trusted identity"
```

---

## 9. Merge readiness checklist

Before any merge-like action, require this final checklist.

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
