# Roby’s Smart Choice — Experiment and Financial Guardrail Contract v0.1

Status: **Draft**  
Owner issue: **#256**  
Depends on: **#254, #255**

## 1. Purpose

The Smart Choice experiment layer tests presentation and journey hypotheses without changing the commercial truth of the offer.

Allowed experiment surfaces:

- entry CTA emphasis;
- short versus full guided flow;
- benefit wording;
- question order;
- bump price presentation;
- verified social-proof wording.

An experiment must not autonomously change:

- catalog prices;
- availability;
- product or combo composition;
- discount amounts;
- recommendation hard constraints;
- payment or order-acceptance state.

## 2. Active MVP experiment

`smart-choice-benefit-copy-v1` compares two welcome-screen benefit formulations:

- control: verified fit for preferences and budget;
- treatment: clear choice in approximately 30–45 seconds with visible contents and price.

Both variants use exactly the same:

- catalog version;
- pricing fingerprint;
- availability fingerprint;
- Recommendation Engine;
- cart and bump rules;
- handoff behavior.

The primary metric is `handoff-rate`, not CTA clicks.

## 3. Assignment

- Randomization unit: anonymous browser session.
- Allocation: 50% control / 50% treatment.
- The assignment is deterministic for the same anonymous session seed.
- A valid stored assignment is reused for the session.
- Assignment contains no name, phone, email, precise location, free text, or advertising identifier.
- The compatibility value written for analytics contains only experiment ID and variant ID.
- The experiment runtime loads before the analytics runtime so the first eligible funnel event receives the same stable assignment.

## 4. Kill switches

The platform has three stop paths:

1. `GLOBAL_KILL_SWITCH` disables every experiment in the deployed runtime.
2. `definition.killSwitch` disables one experiment.
3. `window.RobysSmartChoiceExperiments.killSwitch(reasonCode)` immediately disables experiments for the current browser and restores the control wording.

A disabled experiment clears the analytics assignment instead of pretending the visitor remains in a treatment.

## 5. Commerce parity

Every definition carries:

- catalog version;
- deterministic pricing fingerprint;
- deterministic availability fingerprint;
- explicit `pricesIdenticalAcrossVariants = true`;
- explicit `availabilityIdenticalAcrossVariants = true`.

A report with mismatching fingerprints fails the `commerce-parity` guardrail.

Variant payloads are allow-listed. Unknown keys such as `priceMinor`, `discount`, or `availability` are rejected.

## 6. Minimum sample policy

Default MVP policy per variant:

- at least 200 eligible sessions;
- at least 20 primary-metric conversions;
- at least 7 exposure days.

Until every condition is met, the decision is `insufficient-sample`.

## 7. Financial guardrails

Default MVP limits:

| Guardrail | Limit |
|---|---:|
| Minimum gross margin | 55% |
| Maximum discount | 10% |
| Incremental gross profit | Must not be negative |
| Increase in median time to choice | At most 15 seconds |
| Drop in handoff conversion | At most 3 percentage points |

Financial values use integer minor units.

If cost or list-price data is missing, the corresponding guardrail is `unavailable`. Missing financial evidence produces `financial-data-required`; the platform does not guess COGS or margin.

## 8. Report semantics

The experiment report separates:

- observed absolute lift;
- observed relative lift;
- a 95% uncertainty interval;
- minimum-sample status;
- individual guardrail results;
- causal-claim eligibility.

Automatic report decisions are limited to:

- `kill-switched`;
- `invalid-config`;
- `insufficient-sample`;
- `financial-data-required`;
- `guardrail-breach`;
- `inconclusive`;
- `candidate-for-human-review`.

The platform never automatically emits a `winner` decision.

## 9. Causality boundary

A positive observed difference is not automatically causal.

`eligible-for-human-causal-review` requires:

- stable randomized assignment;
- the expected analytics event schema;
- sufficient sample;
- no unavailable financial guardrail;
- no breached guardrail;
- a positive lower bound of the configured 95% interval.

Even then, a human must review instrumentation integrity, concurrent changes, exclusions, novelty effects, sample-ratio mismatch, and operational context before promotion.

## 10. Social proof

`verified-popular-choice` is forbidden unless the experiment definition contains an approved evidence ID. The placeholder social-proof experiment is disabled and kill-switched until such evidence exists.

## 11. Public debug API

```js
window.RobysSmartChoiceExperiments.getAssignment();
window.RobysSmartChoiceExperiments.getDefinition();
window.RobysSmartChoiceExperiments.getVariantPayload();
window.RobysSmartChoiceExperiments.killSwitch("operator");
window.RobysSmartChoiceExperiments.clearLocalKillSwitch();
```

The analysis function is also exposed for owner/admin tooling, but it does not transmit data or alter prices.

## 12. Out of scope

- automatic price optimization;
- automatic discount publication;
- automatic declaration of a winning variant;
- external experimentation SDKs;
- cross-device identity;
- social proof without verified evidence;
- causal revenue claims from self-selected cohorts.
