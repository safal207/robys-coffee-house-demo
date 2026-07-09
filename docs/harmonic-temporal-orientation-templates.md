# Harmonic Temporal Orientation Templates

> Copy-paste templates for applying the Harmonic Temporal Orientation System during PR review, CI repair, evidence collection, baseline refresh, and merge readiness checks.

## 1. PR orientation record

Use this before a meaningful PR action.

```yaml
orientation_record:
  pr: "#<number>"
  head: "<exact-head-sha>"
  timestamp_utc: "<YYYY-MM-DDTHH:mm:ssZ>"
  actor: "human | assistant | bot | ci"
  project_graph:
    invariant:
      - "<what must remain true>"
    forbidden_moves:
      - "<what must not be done yet>"
    success_definition:
      - "<what success means beyond green CI>"
  transition_graph:
    candidate:
      type: "commit | revert | rerun | bot-request | baseline-refresh | seal | merge-command | escalation"
      description: "<what we are about to do>"
    expected_effect:
      - "<which state should change>"
    known_risks:
      - "<what could break>"
  real_graph:
    evidence_before:
      green:
        - "<green check/evidence>"
      red:
        - "<red check/evidence>"
      missing:
        - "<missing proof>"
    evidence_required_after:
      - "<CI/bot/artifact that must confirm the transition>"
  orientation_center:
    decision: "allow | reject | hold | escalate"
    reason: "<why this is the right decision now>"
  observer_graph:
    note:
      - "<pattern or anomaly noticed>"
  tuner_graph:
    rule_update:
      - "<new or reinforced rule>"
```

---

## 2. Compact PR comment template

Use this when leaving a human-readable PR note.

```markdown
### Orientation check

**Project invariant**
- <what must remain true>

**Candidate transition**
- <what action is proposed>

**Real evidence**
- Green: <known passing evidence>
- Red: <known failing evidence>
- Missing: <missing exact-head evidence>

**Decision**
- `allow | reject | hold | escalate`

**Reason**
- <why>

**Next evidence needed**
- <check, artifact, bot report, or human decision>
```

---

## 3. Baseline refresh template

Use this before changing any baseline file.

```yaml
baseline_refresh:
  metric: "<metric name>"
  file: "<baseline file path>"
  previous_value: "<old value>"
  proposed_value: "<new value>"
  source:
    workflow_run_id: "<run id>"
    head_sha: "<exact head sha>"
    artifact: "<artifact name/id>"
    generated_at: "<timestamp>"
  project_invariant:
    - "Baseline refresh must be evidence-backed, not arbitrary."
    - "Hard assertions must remain green."
  required_evidence:
    - "Relevant performance or regression job result"
    - "Hard assertion status"
    - "Security/traceability unaffected if source shape changes"
  orientation_decision: "allow | reject | hold | escalate"
  reason: "<why the new value reflects reviewed reality rather than weakened governance>"
```

---

## 4. Bot evidence template

Use this before accepting bot-driven evidence.

```yaml
bot_evidence:
  pr: "#<number>"
  expected_bot: "github-actions[bot] | coderabbitai | other trusted actor"
  expected_marker: "<marker or report identifier>"
  expected_head: "<exact head sha>"
  observed:
    actor: "<actual actor>"
    marker: "<actual marker>"
    head: "<actual head sha>"
    timestamp_utc: "<timestamp>"
    comment_or_check_id: "<id>"
  decision: "accept | reject | hold"
  reason: "<identity/head/marker freshness result>"
```

---

## 5. Seal readiness template

Use before posting any proof-depth seal.

```yaml
seal_readiness:
  pr: "#<number>"
  head: "<exact head sha>"
  seal:
    id: "PDG-001"
    depth: "D6"
  prerequisites:
    trusted_exact_head_report: "present | missing"
    report_actor: "<actor>"
    report_marker: "<marker>"
    report_head: "<head sha>"
    ledger_previous_state: "<green/red/missing>"
  orientation_decision: "allow | hold | reject"
  reason: "<why seal order is valid or premature>"
```

---

## 6. Merge readiness template

Use before any merge-like command.

```yaml
merge_readiness:
  pr: "#<number>"
  head: "<exact head sha>"
  branch_protection:
    required_checks_green: true
    non_blocking_checks_explained: true
  evidence:
    exact_head_verified: true
    trusted_bot_reports_present: true
    seals_accepted: true
    ledger_green: true
    human_required_action_explicit: true
  observer_risks:
    unresolved_high_risk_patterns: []
  tuner_blocks:
    blocking_rules: []
  orientation_decision: "allow | hold | reject | escalate"
  reason: "<why merge-like action is safe or not safe>"
```

---

## 7. Tuner rule template

Use this when a failure teaches a reusable rule.

```yaml
tuner_rule:
  id: "TUNE-<number>"
  title: "<short rule name>"
  trigger:
    - "<when this rule applies>"
  rule:
    - "<what must be done or forbidden>"
  preferred_transition:
    - "<safer path>"
  rejected_transition:
    - "<path to avoid>"
  evidence_required:
    - "<proof needed before allowing transition>"
  examples:
    - pr: "#<number>"
      observation: "<what happened>"
      learned: "<what changed in future decisions>"
```

---

## 8. Observer note template

Use after surprising CI behavior or a rejected transition.

```yaml
observer_note:
  context: "<PR/check/transition>"
  expected: "<what we expected>"
  observed: "<what happened>"
  affected_invariants:
    - "<invariant touched>"
  classification: "code issue | governance issue | stale baseline | exact-head issue | missing evidence | environmental noise | human decision"
  recommended_tuner_update:
    - "<rule update>"
```

---

## 9. One-screen operating prompt

```text
Before acting, answer:

1. What project invariant am I protecting?
2. What transition am I about to make?
3. What evidence exists right now?
4. What evidence should exist after the transition?
5. Does this break a higher-priority invariant?
6. Decision: allow, reject, hold, or escalate?
7. What should the Observer remember?
8. What should the Tuner adjust?
```
