# Roby’s Smart Choice — Decision Trace Contract v0.1

Status: **Draft**  
Owner issue: **#255**  
Parent epic: **#247**

## 1. Purpose

Decision Trace explains how a Smart Choice recommendation was produced and which observed state transitions occurred around it.

It answers:

- what explicit, non-PII input was evaluated;
- which catalog and configuration versions were used;
- which hard constraints were applied;
- which candidates existed before and after filtering;
- why a candidate was eligible or excluded;
- how each eligible candidate’s score was composed;
- which recommendation and alternatives were selected;
- whether a bump was eligible and why it was excluded when not eligible;
- which analytics event and timestamp are linked to the decision;
- which S0–S6 transitions were observed.

Decision Trace is diagnostic. It does not authorize prices, mutate the recommendation engine, submit an order, or prove a treatment effect.

## 2. Schema

Current schema:

```text
robys.smart-choice-decision-trace.v1
```

The trace contains:

- deterministic `traceId`;
- runtime, engine, catalog, and config versions;
- normalized input snapshot;
- input diagnostics;
- applied hard constraints;
- premium-stretch limit;
- candidate sets before filtering, after filtering, and rejected;
- candidate-level rejection reasons and score contributions;
- top, economy, and premium selection IDs;
- bump eligibility and exclusion reasons;
- linked `recommendations_shown` event ID and timestamp;
- observed transition events;
- a versioned causal-mechanism graph;
- an explicit mechanism-only causality boundary.

## 3. Input boundary

Allowed input values are the normalized engine fields:

- intent;
- requested temperature;
- requested taste;
- party size;
- budget bounds in integer minor units;
- locale;
- optional time-of-day code;
- optional bounded exclusion codes.

The trace must not include:

- rendered labels or DOM snapshots;
- name, phone, email, contacts, or free text;
- WhatsApp message text;
- precise location;
- advertising identifiers;
- payment credentials.

## 4. Engine independence

The engine remains the source of truth for:

- normalized input;
- hard-constraint outcomes;
- candidate eligibility;
- score contributions;
- top/economy/premium selection;
- chosen bump.

The trace layer receives the already-produced `RecommendationResult`. It may transform and explain that result, but it must not:

- re-rank candidates;
- replace a selected recommendation;
- change a score;
- create a price;
- make an excluded candidate eligible;
- cause a handoff.

The browser debug runtime may invoke the same pure engine function from the stored explicit answers to reconstruct a trace for inspection. That invocation is read-only and does not modify the product flow.

## 5. Candidate explanations

For every candidate, the trace records:

- `candidateId`;
- price in integer minor units;
- eligibility;
- budget class;
- hard-constraint rejection codes;
- score and score breakdown when eligible;
- selection role when selected.

`explainSelection()` returns the selected candidate, role, score, and strongest positive score contributions.

`explainExclusion(candidateId)` returns the exact hard-constraint reason codes, or a fail-closed `candidate-not-in-trace` reason.

## 6. Bump explanations

Every catalog bump is evaluated by the observer against the already-selected top recommendation and normalized input.

Possible exclusion codes include:

- no top recommendation;
- unconfirmed or unavailable bump;
- trigger mismatch;
- target already included;
- active exclusion;
- missing, unconfirmed, or unavailable target;
- budget exceeded.

The selected bump must match the engine result. Trace evaluation does not select a bump itself.

## 7. State and mechanism graph

State nodes:

- S0 viewed;
- S1 intent selected;
- S2 preferences captured;
- S3 recommendations shown;
- S4 recommendation selected;
- S5 bump accepted or declined;
- S6 handoff started;
- S7 repeat order — future.

The graph has two evidence classes:

- `configured-mechanism` — intended product mechanism;
- `observed-transition` — a validated analytics event with exact event ID.

Configured mechanism edges show the path:

```text
explicit context
→ hard constraints
→ scoring
→ stable ranking
→ recommendation
→ guest selection
→ optional bump intervention
→ handoff
```

Observed edges are created only from runtime-validated analytics events.

## 8. Causality boundary

Every trace contains:

```text
claimLevel = mechanism-only
randomizedOrControlledExperimentRequiredForEffectClaim = true
```

The graph explains the configured mechanism and observed transitions. It does not prove that Smart Choice caused an increase in revenue, conversion, basket value, or repeat rate.

A treatment-effect claim requires randomized assignment or another correctly controlled design with predefined metrics, guardrails, exclusions, and uncertainty reporting.

## 9. Stable serialization

`stableSerializeDecisionTrace()` recursively sorts object keys while preserving meaningful array order.

The same recommendation result, catalog, and ordered event set produce the same JSON and deterministic trace ID.

Changing an event, score, candidate, version, or reason changes the trace ID.

## 10. Version handling

`readDecisionTrace()` accepts the current schema only.

An old or unknown trace fails closed with:

- `code: unsupported-version`;
- current supported version;
- found version when available;
- a readable diagnostic.

Invalid current-version data fails closed with `code: invalid-trace` and validation diagnostics.

No unknown version is silently interpreted as the current model.

## 11. Dev/admin renderer

The human-readable renderer is disabled by default.

It can be enabled locally with:

```text
/smart-choice/?traceDebug=1
```

or:

```text
/smart-choice/?adminDebug=1
```

The renderer:

- reads only versioned session data and validated events;
- shows versions, candidate counts, selection, exclusions, bump, and observed transitions;
- states the causality boundary visibly;
- uses `textContent`, not HTML injection;
- does not send network requests.

The public debug API is available as:

```js
window.RobysSmartChoiceDecisionTrace.getTrace();
window.RobysSmartChoiceDecisionTrace.exportJson();
window.RobysSmartChoiceDecisionTrace.renderText();
window.RobysSmartChoiceDecisionTrace.explainSelection();
window.RobysSmartChoiceDecisionTrace.explainExclusion("candidate-id");
window.RobysSmartChoiceDecisionTrace.read(oldTrace);
```

## 12. Acceptance evidence

The automated contract verifies:

- stable versioned JSON and deterministic trace ID;
- trace construction does not mutate the engine result;
- candidate sets before and after filtering;
- selection explanation;
- exclusion explanation;
- score contributions;
- bump eligibility and exclusion reasons;
- exact event ID and timestamp linkage;
- observed S0–S6 graph edges;
- no DOM state in the domain model;
- no `innerHTML` or network call in the debug runtime;
- fail-closed old-version handling;
- visible mechanism-only causality boundary.
