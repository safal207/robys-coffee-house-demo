# Harmonic Temporal Orientation Decision Log

> Append-only working log template for recording orientation decisions over time.

## Purpose

The whitepaper explains the system.
The playbook explains how to use it.
This decision log captures what actually happened while applying it.

A decision log entry should make the project trajectory auditable:

```text
where we were -> what transition we considered -> what evidence existed -> what decision was made -> what rule was learned
```

---

## Entry template

```yaml
- id: "HTO-YYYYMMDD-001"
  time_utc: "YYYY-MM-DDTHH:MM:SSZ"
  repo: "owner/repo"
  pr: "#000"
  head_sha: "<exact-head-sha-or-none>"
  actor: "human | assistant | ci | bot"

  project_graph:
    invariant:
      - "What must remain true?"
    forbidden_moves:
      - "What must not be done yet?"

  transition_graph:
    candidate:
      type: "commit | rerun | bot-request | baseline-refresh | seal | merge-command | revert | escalation | documentation"
      description: "What transition is being considered?"
    expected_effect:
      - "What should improve if the transition is valid?"

  real_graph:
    evidence_before:
      green:
        - "Known passing evidence"
      red:
        - "Known failing evidence"
      missing:
        - "Known missing evidence"
    evidence_after:
      green:
        - "Evidence that passed after the transition"
      red:
        - "Evidence that failed after the transition"
      missing:
        - "Evidence still missing"

  orientation_center:
    decision: "allow | reject | hold | escalate"
    reason: "Why this decision was made"
    next_allowed_move: "What can happen next?"

  observer_graph:
    pattern:
      - "What did we notice?"
    anomaly:
      - "What surprised us?"
    risk:
      - "What might repeat?"

  tuner_graph:
    rule_update:
      - "What rule should guide future decisions?"
    threshold_update:
      - "What evidence threshold changed?"
```

---

## Example 1: reject minified runtime transition

```yaml
- id: "HTO-20260709-001"
  time_utc: "2026-07-09T14:55:00Z"
  repo: "safal207/robys-coffee-house-demo"
  pr: "#188"
  head_sha: "fd69d6ace37c5595e9d55eac56202905fa59b93d"
  actor: "assistant"

  project_graph:
    invariant:
      - "Lighthouse should reflect a reviewed performance baseline."
      - "Security and traceability contracts must remain valid."
    forbidden_moves:
      - "Do not sacrifice readable source evidence just to shrink JavaScript transfer size."

  transition_graph:
    candidate:
      type: "commit"
      description: "Minify PWA runtime files to reduce total JavaScript bytes."
    expected_effect:
      - "Lighthouse total_js_bytes should drop below the regression threshold."

  real_graph:
    evidence_before:
      green:
        - "Adversarial browser contract green after offline/Trusted Types fixes."
      red:
        - "Lighthouse performance contract red on total_js_bytes."
      missing: []
    evidence_after:
      green:
        - "Runtime checks remained mostly healthy."
      red:
        - "Security contract failed because source-shape expectations were broken."
        - "Feature traceability failed because evidence fragments disappeared."
        - "Lighthouse still failed."
      missing: []

  orientation_center:
    decision: "reject"
    reason: "The transition tried to fix one metric but broke higher-priority source-governance invariants."
    next_allowed_move: "Restore readable runtime and solve Lighthouse through evidence-backed baseline refresh."

  observer_graph:
    pattern:
      - "A red metric can tempt a local fix that harms global governance."
    anomaly:
      - "Minification did not solve the actual Lighthouse governance issue."
    risk:
      - "Future metric fixes may bypass traceability unless checked first."

  tuner_graph:
    rule_update:
      - "Reject source-shape changes when evidence contracts depend on exact tokens unless the contracts are intentionally updated too."
    threshold_update:
      - "A baseline refresh must cite CI artifact evidence and preserve hard assertions."
```

---

## Example 2: hold D6 seal until exact-head bot evidence

```yaml
- id: "HTO-20260709-002"
  time_utc: "2026-07-09T00:00:00Z"
  repo: "safal207/robys-coffee-house-demo"
  pr: "#186"
  head_sha: "a38213b50786662066fbeeb09e2d0ec36a42d14e"
  actor: "bot"

  project_graph:
    invariant:
      - "D6 seal must only be posted after trusted exact-head AI cooperation evidence exists."
      - "Merge-ready must only be posted after ledger/checks accept the seal."
    forbidden_moves:
      - "Do not post D6 early."
      - "Do not post /merge-ready early."

  transition_graph:
    candidate:
      type: "seal"
      description: "Post Proof-Depth-Seal: D6."
    expected_effect:
      - "Ledger would recognize completed depth if prerequisites exist."

  real_graph:
    evidence_before:
      green: []
      red:
        - "Previous ledger failed because exact-head trusted cooperation report was missing."
      missing:
        - "Trusted github-actions[bot] AI cooperation report for exact head."
    evidence_after:
      green: []
      red: []
      missing:
        - "D6 remains intentionally unposted until evidence exists."

  orientation_center:
    decision: "hold"
    reason: "The required exact-head trusted bot evidence is missing."
    next_allowed_move: "Obtain or trigger the trusted exact-head AI cooperation report."

  observer_graph:
    pattern:
      - "Protocol steps can look ready while a hidden prerequisite is missing."
    anomaly: []
    risk:
      - "Posting a seal out of order creates ledger failure and delays merge readiness."

  tuner_graph:
    rule_update:
      - "Always check trusted identity, exact head, marker, and order before seal transitions."
    threshold_update:
      - "D6 threshold includes trusted exact-head report as a hard prerequisite."
```

---

## Operating rules

1. Keep this log append-only when used for real project decisions.
2. One entry should describe one meaningful orientation decision.
3. A rejected transition is valuable and should be logged.
4. A hold decision is not failure; it prevents premature action.
5. Tuner updates should become future guardrails.
