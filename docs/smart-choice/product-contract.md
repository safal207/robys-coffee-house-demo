# Roby’s Smart Choice — Product Contract v0.1

Status: **Draft**  
Owner issue: **#248**  
Parent epic: **#247**

## 1. Purpose

Roby’s Smart Choice is a separate guided-order page that helps a guest move from “I do not know what to choose” to a clear, suitable order.

It does **not** replace the public menu or the brand landing page.

The intended product path is:

`context → need → recommendation → combo → one relevant add-on → order handoff`

The MVP must be deterministic, explainable, mobile-first, multilingual, and safe to run before a POS or payment integration exists.

## 2. Product promise

### Guest promise

> Answer a few short questions and receive a clear Roby’s recommendation that fits your intent, preferences, party size, and budget.

### Business promise

> Test whether a guided choice can improve order conversion, average basket value, and add-on acceptance without harming margin, speed, trust, or accessibility.

### Explicit non-promise

Smart Choice does **not** guarantee a 20% revenue increase. A revenue target is an input for planning and experimentation, not a measured result or forecast.

## 3. MVP scope

The MVP includes:

- a separate Smart Choice route/page;
- 4–5 short questions;
- a deterministic recommendation engine;
- a single typed catalog as the source of truth;
- one best recommendation, one economy alternative, and one premium alternative;
- allowed substitutions and upgrades;
- at most one relevant order bump;
- an explicit order handoff state;
- a versioned decision trace;
- funnel analytics without unnecessary personal data;
- Turkish, English, and Russian;
- keyboard, screen-reader, reduced-motion, and narrow-mobile support.

The MVP excludes:

- actual payment processing;
- a claim that a WhatsApp message is a confirmed or paid order;
- autonomous price changes;
- machine-learning personalization;
- hidden discounts;
- collection of unnecessary personal data;
- direct POS/Odoo submission.

## 4. Primary user jobs

A guest may use Smart Choice to:

1. choose coffee quickly;
2. choose breakfast;
3. choose a snack;
4. choose dessert;
5. choose something refreshing;
6. choose for one person, two people, or a family;
7. stay within a preferred budget;
8. understand why a recommendation fits.

## 5. State model

The state machine is the canonical representation of the guided journey.

| State | Name | Meaning | Entry condition | Exit condition |
|---|---|---|---|---|
| S0 | Viewed | Smart Choice page is visible | page rendered | guest starts or exits |
| S1 | Goal selected | guest chooses an intent | valid intent recorded | preference step opened |
| S2 | Preferences captured | temperature, taste, party size, and budget are available or explicitly skipped | required answers complete | engine invocation succeeds |
| S3 | Recommendations shown | ranked candidates are rendered | valid engine result | guest selects, edits, or exits |
| S4 | Main offer selected | one recommendation becomes the basket base | valid recommendation selected | guest configures or continues |
| S5 | Add-on decided | one eligible bump is accepted or declined, or no bump is eligible | bump decision resolved | handoff confirmation opened |
| S6 | Handoff started | the guest starts the available non-POS order handoff | stable order payload created | external handoff begins or fails safely |
| S7 | Repeat order | a future recognized guest repeats or resumes a prior choice | repeat-capable identity/consent exists | future scope |

### Allowed forward transitions

- `S0 → S1`
- `S1 → S2`
- `S2 → S3`
- `S3 → S4`
- `S4 → S5`
- `S5 → S6`
- `S6 → S7` — future only

### Allowed corrective transitions

- `S1 → S0` — restart or exit;
- `S2 → S1` — edit intent;
- `S3 → S2` — edit preferences;
- `S4 → S3` — change recommendation;
- `S5 → S4` — change configuration before handoff.

An invalid transition must fail closed and must not emit a success event for the destination state.

## 6. Inputs

### Required MVP inputs

| Field | Allowed values | Notes |
|---|---|---|
| `intent` | `coffee`, `breakfast`, `snack`, `dessert`, `refresh` | exactly one |
| `temperature` | `hot`, `cold`, `any` | explicit `any` is valid |
| `taste` | `sweet`, `neutral`, `any` | explicit `any` is valid |
| `partySize` | `one`, `two`, `family` | used as a fit signal |
| `budgetBand` | configured bands | locale-facing labels map to minor-unit bounds |
| `locale` | `tr`, `en`, `ru` | no unsupported fallback without logging |

### Optional MVP context

- local time of day;
- session-scoped experiment assignment;
- catalog availability status;
- explicitly configured business-priority weights.

### Not allowed as hidden MVP inputs

- inferred sensitive attributes;
- precise location;
- contacts;
- free-text profiling;
- advertising identifiers;
- unapproved personal history.

## 7. Core domain definitions

### Recommendation

A ranked, explainable candidate produced from catalog data, hard constraints, and weighted fit dimensions.

### Combo

A declared set of menu items with:

- stable component IDs;
- an explicit combo price;
- allowed substitutions;
- explicit upgrade deltas;
- availability rules;
- source status.

### Upgrade

A guest-approved replacement or size change with a visible price delta before confirmation.

### Order bump

One optional, relevant add-on offered after the main recommendation is selected.

MVP rule: no more than one bump may be shown in a single flow.

### Handoff

A transfer of a stable order summary to an external contact channel or future adapter.

A handoff is not equivalent to:

- payment;
- POS acceptance;
- kitchen acceptance;
- order confirmation.

### Decision trace

A versioned, non-authoritative explanation of how the engine filtered, scored, selected, and excluded candidates.

The trace explains a decision. It does not authorize prices or order acceptance.

## 8. Recommendation contract

### Hard constraints

Hard constraints must be applied before scoring:

- item and combo availability;
- confirmed catalog status;
- explicit budget ceiling, except a clearly labeled premium stretch alternative;
- valid component references;
- valid locale content;
- explicit exclusions from combo or bump rules.

A business-priority weight may not override a hard constraint.

### Scoring dimensions

Recommended initial dimensions:

- intent match;
- temperature match;
- taste match;
- budget fit;
- party-size fit;
- time-of-day fit;
- bounded business priority.

Each dimension must expose:

- its weight;
- the candidate contribution;
- the reason code;
- the config version.

### Required output

The engine returns:

- top recommendation;
- economy alternative when available;
- premium alternative when available;
- score breakdown;
- applied hard constraints;
- rejected candidates with reason codes;
- zero or one eligible bump;
- catalog and config versions.

The same normalized input, catalog version, and config version must always produce the same output.

## 9. Price and catalog rules

- The catalog is the only source of item, combo, and upgrade prices.
- Monetary values are stored in integer minor units.
- Displayed TRY values are locale-formatted from minor units.
- DOM text is never an authoritative price source.
- An unavailable or provisional item is excluded by default.
- A combo must not cost more than the same included items purchased separately unless the combo contains clearly declared extra value or content.
- Every discount or upgrade delta is visible before confirmation.
- No paid option is preselected without explicit guest action.

Known fixed-price Roby’s pairings remain catalog facts only when their source and availability are confirmed. The product contract does not create or approve a new price.

## 10. Baseline and comparison design

### Baseline path

The baseline is the existing direct menu/order-discovery path without Smart Choice recommendation logic.

### Treatment path

The treatment is entry into the Smart Choice guided flow.

### Important selection boundary

Guests who voluntarily choose Smart Choice may differ from guests who use the ordinary menu. Therefore, comparing those two self-selected groups alone is not sufficient to claim causal uplift.

A causal claim requires a randomized or otherwise valid controlled experiment with:

- stable assignment;
- equivalent catalog, prices, and availability;
- predefined primary metric;
- predefined guardrails;
- sufficient sample policy;
- documented exclusions;
- uncertainty reporting.

## 11. Event contract

The product contract requires the following canonical events. The detailed schema belongs to issue #254.

| Event | Required transition or meaning |
|---|---|
| `smart_choice_viewed` | page visible, state S0 |
| `smart_choice_started` | `S0 → S1` begins |
| `question_answered` | a valid answer is committed |
| `recommendations_shown` | `S2 → S3` succeeds |
| `recommendation_selected` | `S3 → S4` succeeds |
| `upgrade_selected` | visible upgrade accepted |
| `bump_shown` | one eligible bump rendered |
| `bump_accepted` | bump accepted |
| `bump_declined` | bump declined |
| `order_handoff_started` | `S5 → S6` succeeds |
| `flow_abandoned` | flow ends before S6 |

Every event must contain, where applicable:

- anonymous session ID;
- previous and next state;
- locale;
- catalog version;
- recommendation config version;
- recommendation or rule ID;
- experiment and variant IDs;
- elapsed time;
- basket value before and after the relevant action.

Events must not contain unnecessary PII, free text, or a full phone number.

## 12. KPI definitions

All rates use deduplicated eligible sessions for the defined measurement window.

### 12.1 Smart Choice start rate

`started sessions / eligible Smart Choice page views`

Source events:

- numerator: unique sessions with `smart_choice_started`;
- denominator: unique sessions with `smart_choice_viewed`.

### 12.2 Completion rate

`completed recommendation sessions / started sessions`

A completed recommendation session reaches S3 and emits `recommendations_shown`.

### 12.3 Recommendation acceptance rate

`sessions with recommendation_selected / sessions with recommendations_shown`

### 12.4 Order-bump acceptance rate

`sessions with bump_accepted / sessions with bump_shown`

Sessions with no eligible bump are excluded from the denominator.

### 12.5 Handoff rate

`sessions with order_handoff_started / sessions with recommendations_shown`

This measures handoff initiation, not paid or accepted orders.

### 12.6 Median time to choice

Median elapsed time from `smart_choice_started` to `recommendation_selected` among sessions reaching S4.

### 12.7 Average recommended basket value

`sum of selected basket values at S4 / sessions reaching S4`

This is not realized revenue.

### 12.8 Average handoff basket value

`sum of final basket values at S6 / sessions reaching S6`

This is still not realized revenue until future POS acceptance and payment data exist.

### 12.9 Incremental basket value from bump

`sum(final basket value after accepted bump − basket value before bump) / sessions with bump_shown`

This is a product-flow value metric, not gross profit.

### 12.10 Incremental gross profit per exposed session

Future metric, available only when trustworthy cost and completed-order data exist:

`(treatment gross profit − counterfactual/control gross profit) / eligible exposed sessions`

Without item cost, accepted-order, and valid experimental data, the system must label this metric unavailable.

### 12.11 Revenue uplift

Future causal metric:

`(treatment revenue per eligible session − control revenue per eligible session) / control revenue per eligible session`

It may be reported as causal uplift only under a valid experiment. Otherwise use the label `observed difference`.

## 13. Guardrail metrics

A treatment must not be promoted solely because it increases clicks or selected basket value.

Required guardrails:

- handoff rate must not fall beyond the configured threshold;
- median time to choice must not exceed the configured threshold;
- abandonment rate must not materially worsen;
- accessibility checks remain passing;
- no negative-price or invalid-combo events;
- no offer below the configured minimum gross-margin boundary once costs exist;
- no unapproved discount or price publication;
- no increase in duplicate handoff submissions.

## 14. Revenue-target planning boundary

A cafe owner may later enter current monthly revenue and a target such as +20%.

The system may then:

- calculate the monetary gap;
- decompose the gap into conversion, basket value, and repeat-order hypotheses;
- propose experiments;
- show conservative, expected, and stretch scenarios;
- show missing-data warnings.

The system must not:

- present the target as a forecast;
- publish pricing changes automatically;
- state that generated combos will achieve the target;
- optimize revenue while ignoring margin or conversion loss.

## 15. Missing-data behavior

### No matching recommendation

The system must:

1. explain that no exact match is available;
2. offer the nearest valid alternatives without silently violating budget or availability;
3. provide a safe link to the full menu;
4. emit a no-match reason in the decision trace.

### Missing catalog price

The item or combo is not orderable in Smart Choice.

### Missing availability

Treat the item as unavailable unless the catalog explicitly defines a safe default.

### Missing cost data

Show revenue/basket metrics only and display a warning that gross-profit optimization is unavailable.

### Missing analytics adapter

The flow remains functional using a local/debug event sink. Analytics failure must not block ordering.

## 16. Privacy and consent

The MVP uses an anonymous session identifier and avoids direct personal data.

A future repeat-order feature must require a documented lawful basis and explicit product behavior for consent, retention, access, and deletion.

No sensitive inference may be used to rank food or drink choices.

## 17. Failure semantics

- Engine failure: show a safe full-menu fallback; do not fabricate a recommendation.
- Catalog validation failure: fail closed for affected items and expose a developer-visible error.
- Analytics failure: continue the flow and record a local diagnostic when possible.
- Handoff failure: keep the order summary visible and clearly state that the order was not submitted.
- Invalid state transition: reject transition and avoid emitting destination success events.

## 18. Definition of Done for issue #248

- [x] Product purpose and boundaries are explicit.
- [x] S0–S7 and allowed transitions are defined.
- [x] Required inputs and domain terms are defined.
- [x] Recommendation constraints and output are defined.
- [x] KPI formulas and source events are defined.
- [x] Baseline and causal-claim boundary are defined.
- [x] Missing-data and failure behavior are defined.
- [x] Minimum future data for gross-profit measurement is defined.
- [x] The contract does not create or approve menu prices.

## 19. Follow-up implementation map

- #250 — typed menu, combo, upgrade, and bump catalog;
- #249 — separate Smart Choice page;
- #251 — deterministic recommendation engine;
- #252 — guided questions and recommendation UI;
- #253 — cart, upgrades, and one order bump;
- #254 — event schema and funnel analytics;
- #255 — causal transition graph and decision trace;
- #256 — experiments and financial guardrails;
- #257 — localization, accessibility, and release QA;
- #258 — revenue-goal simulator;
- #259 — POS/Odoo order contract.
