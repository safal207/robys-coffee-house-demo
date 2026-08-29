# Roby’s Fractal Causal Refactoring

Status: **operational contract v1**  
Scope: **business truth, customer experience, product behavior, delivery evidence and team decisions**

## Purpose

Fractal Causal Refactoring (FCR) finds one recurring rule that produces similar failure modes at several scales, then replaces that rule with a testable operating rule.

The protocol is:

```text
symptoms
→ recurring root rule
→ repository evidence
→ falsifiable hypothesis
→ intervention across multiple scales
→ success metric and guardrails
→ rollback
```

This is not “root cause analysis with a dramatic hat”. A record is valid only when it:

- cites repository evidence;
- separates observation from hypothesis;
- describes recurrence across at least two scales;
- changes at least two scales;
- defines how the hypothesis could be rejected;
- has measurable success criteria and a rollback.

## Why “fractal”

“Fractal” is operational shorthand: the same rule can repeat in a field, screen, workflow, release and management decision.

Example:

```text
Old rule:
a value may be published before its confirmation state is explicit

business truth → profile contains a value without encoded owner attestation
product        → several surfaces consume the value
delivery       → CI validates shape but not owner approval
customer       → polished demo data may look commercially current
```

The refactoring changes the generating rule instead of patching every visible instance:

```text
New rule:
no owner-critical value is production-ready until its attestation
is explicit and machine-checked
```

## Optional “subtle bodies” metaphor

The repository does not make a scientific claim about subtle bodies. As a private thinking aid only:

| Metaphor | Repository meaning |
|---|---|
| Causal layer | assumption, policy or rule that generates decisions |
| Subtle layer | copy, decision path, workflow and interpretation |
| Physical layer | customer UI, code, data and café operation |

Production records use the concrete scales defined in `registry.json`, not spiritual diagnoses.

## Current Roby’s patterns

### 1. Business-truth drift — active

The repository has a canonical business profile and a separate owner-confirmation checklist, but the values do not encode whether the owner confirmed them.

The first refactoring introduces:

- `business-truth-status.json` as the attestation ledger;
- explicit `demo` versus `production` publication mode;
- a fail-closed production rule;
- a report that exposes unresolved owner-critical fields.

All current owner-critical fields are conservatively marked `unverified`. This does not assert that a value is wrong. It states that machine-verifiable owner approval is not present in the repository.

### 2. Mechanism/effect overclaim — monitoring

Smart Choice can explain how a recommendation was produced. That mechanism does not prove that it caused revenue or conversion. The existing mechanism-only boundary remains authoritative.

### 3. Exact-head completion drift — monitoring

Checks and reviews are evidence only for the exact commit they evaluated. A new commit invalidates older readiness evidence.

## Commands

```bash
npm run verify:causal-refactoring
npm run test:causal-refactoring
npm run causal:report
```

`verify:causal-refactoring` validates:

- registry schema and unique causal IDs;
- safe repository-relative evidence paths;
- evidence existence;
- recurrence across at least two scales;
- interventions across at least two scales;
- bounded scores, metrics, guardrails, falsification and rollback;
- business-profile field coverage;
- the fail-closed production attestation rule.

`causal:report` ranks patterns with:

```text
impact × recurrence × confidence ÷ effort
```

The score is a prioritization aid, not proof.

## Moving from demo to production

Do not change `publication_mode` to `production` merely to announce readiness.

For each owner-critical field:

1. confirm the exact value with the café owner;
2. retain accountable evidence outside secrets or personal data;
3. change its attestation to `owner-confirmed`;
4. run the verifier and full repository checks;
5. bind release evidence to the exact current commit.

The production gate fails while any owner-critical field remains unconfirmed.

## Adding a causal pattern

Add one entry to `qa/causal-refactoring/registry.json`.

Use a narrow root rule. “Marketing is weak” is not a cause. “A promotion can launch without a defined audience, offer and measurable conversion event” is testable.

Keep the claim boundary honest:

- repository evidence supports a repository hypothesis;
- owner confirmation supports business truth;
- runtime evidence supports an observed transition;
- a controlled experiment is required for an effect claim.

## Non-goals

FCR does not:

- diagnose people;
- infer hidden motives;
- replace café-owner decisions;
- prove global completeness;
- prove revenue causality from traces;
- permit production claims from demo data;
- override normal security, accessibility, privacy or exact-head review gates.
