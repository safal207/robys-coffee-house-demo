# Roby’s Smart Choice — Analytics Contract v0.1

Status: **Draft**  
Owner issue: **#254**  
Parent epic: **#247**

## 1. Purpose

The analytics layer measures the Smart Choice journey without changing recommendation, cart, pricing, or handoff behavior.

It must answer:

- where guests leave the guided flow;
- whether guests reach a recommendation;
- whether a recommendation is selected;
- whether one optional bump is shown and accepted;
- how the selected and handoff basket values change;
- how long it takes to choose.

It must not claim causal revenue growth from self-selected Smart Choice users alone.

## 2. Event schema

Schema version: `robys.smart-choice-event.v1`

Canonical events:

| Event | Transition | Required event-specific fields |
|---|---|---|
| `smart_choice_viewed` | `S0 → S0` | none |
| `smart_choice_started` | `S0 → S1` | none |
| `question_answered` | `S1 → S1` or `S1 → S2` | `questionId`, `answerCode` |
| `recommendations_shown` | `S2 → S3` | `recommendationId` when a top result exists; otherwise a bounded reason code |
| `recommendation_selected` | `S3 → S4` | `recommendationId`, selected basket value |
| `upgrade_selected` | `S4 → S4` or `S5 → S5` | `ruleId`, basket before/after |
| `bump_shown` | `S4 → S4` | `ruleId` |
| `bump_accepted` | `S4 → S5` | `ruleId`, basket before/after |
| `bump_declined` | `S4 → S5` | `ruleId`, basket before/after |
| `order_handoff_started` | `S4 → S6` or `S5 → S6` | `recommendationId`, final basket value |
| `flow_abandoned` | current state remains current state | bounded `reasonCode` |

The `S4 → S6` handoff transition is retained for the current MVP when a guest skips an unresolved optional bump and opens the WhatsApp draft. It must carry `reasonCode=bump-skipped-by-handoff` and must not be counted as bump acceptance or explicit decline.

## 3. Common properties

Every event contains:

- versioned schema ID;
- unique event ID;
- anonymous session ID;
- monotonic sequence number;
- occurrence time and elapsed time;
- `fromState` and `toState`;
- locale;
- catalog version;
- recommendation config version;
- experiment ID and variant when a valid assignment exists.

Applicable events also contain:

- recommendation ID;
- rule ID;
- internal question and answer codes;
- basket value before and after an action, in integer kuruş.

## 4. Privacy boundary

The schema is allow-listed. Unknown properties are rejected at runtime.

The event contract does not accept:

- names;
- phone numbers;
- email addresses;
- WhatsApp message text;
- free-text answers;
- precise location;
- contacts;
- advertising identifiers;
- inferred sensitive attributes;
- full order-message content.

Question answers are internal codes such as `coffee`, `cold`, `one`, and `400`, never rendered labels or user-entered text.

The anonymous session ID is random, browser-session scoped, and is not a customer identity.

## 5. Deduplication

Events caused by rendering use semantic dedupe keys stored for the browser session.

Examples:

- one page-view event per analytics session;
- one `recommendations_shown` event per answer/locale signature;
- one `bump_shown` event per selected recommendation and bump rule;
- one abandonment event per analytics session.

A repeated render or MutationObserver callback must not create a second semantic event.

Direct user interactions such as answering a question or selecting an upgrade remain separate actions.

## 6. Sinks and adapters

### Default local sink

The MVP writes the latest validated events to:

`sessionStorage["robys-smart-choice-analytics-events.v1"]`

The sink is capped and does not transmit events.

### Console debug sink

Enable locally with either:

- query parameter `?analyticsDebug=1`; or
- `localStorage["robys-smart-choice-analytics-debug"] = "1"`.

### Future provider adapter

The browser exposes:

```js
window.RobysSmartChoiceAnalytics.registerAdapter("matomo-v1", event => {
  // Map the validated event to a future provider.
});
```

The callback receives only an already validated, allow-listed event. The MVP does not include a network endpoint, GA tag, Matomo instance, or third-party SDK.

Analytics adapter failure must never block recommendation, cart, or handoff behavior.

## 7. Funnel metrics

All rates use unique eligible browser sessions inside a defined measurement window.

### Start rate

`started sessions / Smart Choice viewed sessions`

### Completion rate

`sessions with recommendations_shown / started sessions`

### Recommendation acceptance rate

`sessions with recommendation_selected / sessions with recommendations_shown`

### Bump acceptance rate

`sessions with bump_accepted / sessions with bump_shown`

Sessions with no bump shown are excluded from the denominator.

### Handoff rate

`sessions with order_handoff_started / sessions with recommendations_shown`

A handoff is still not payment, POS acceptance, café acceptance, or realized revenue.

### Median time to choice

Median elapsed time from analytics-session start to `recommendation_selected` among sessions reaching S4.

### Average recommended basket value

Average basket value recorded at recommendation selection.

This is not realized revenue.

### Average handoff basket value

Average final basket value at `order_handoff_started`.

This is not realized revenue until future accepted-order and payment data exist.

### Incremental basket from accepted bump

Average of:

`basketAfterMinor − basketBeforeMinor`

for `bump_accepted` events.

## 8. Baseline and causal claims

### Product baseline

The descriptive baseline is the existing direct menu/order-discovery path without Smart Choice guidance.

### Selection warning

Guests who voluntarily enter Smart Choice may differ from guests using the ordinary menu. Therefore:

- descriptive funnel metrics are valid for product operations;
- observed differences between self-selected groups are not causal uplift;
- revenue growth must not be attributed to Smart Choice from this comparison alone.

A causal claim requires a valid controlled experiment with stable assignment, equivalent pricing and availability, predefined metrics and guardrails, sufficient sample policy, and uncertainty reporting.

## 9. Failure behavior

- Invalid events are rejected before publication.
- Unknown fields fail closed.
- Sink errors do not stop the product flow.
- Missing session storage leaves Smart Choice usable.
- Missing external adapters leaves the local debug sink operational.
- Analytics never fabricates recommendation IDs, rule IDs, prices, or conversions.

## 10. Verification

The automated analytics test verifies:

- strict runtime schema validation;
- rejection of phone/free-text fields;
- deterministic serialization;
- semantic render deduplication;
- a valid S0–S6 journey;
- funnel formulas;
- a local memory sink;
- future adapter support;
- absence of direct network transmission in the analytics runtime.
