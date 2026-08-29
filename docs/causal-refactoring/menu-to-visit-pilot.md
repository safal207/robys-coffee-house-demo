# Roby’s Menu-to-Visit Causal Refactoring v0.1

Status: **draft pilot contract; not empirically verified**  
Parent contract: [`README.md`](README.md)  
Executable profile: `qa/fixtures/causal-refactoring/robys-menu-to-visit-v0.1.json`  
Profile ID: `FCR-ROBY-001`

## 1. Business question

Can a privacy-safe Roby’s Moment handoff increase independently verified café arrivals, attributed sales, and net contribution versus a pre-registered baseline without weakening menu truth, privacy, customer clarity, or barista workflow?

The repository may answer that it contains a testable model. It may not yet answer that the intervention works.

## 2. Fractal diagnosis

The same category error can repeat at every scale:

```text
page view            mistaken for interest
interest             mistaken for intent
intent               mistaken for arrival
arrival              mistaken for sale
gross sale value     mistaken for profit
```

The recurring root rule is:

> An upstream proxy may be promoted into a downstream outcome without evidence native to the downstream state.

The replacement rule is:

> Advance a state only when its own evidence gate passes. Preserve every unsupported downstream state as unproven.

## 3. Causal state chain

```text
DISCOVERY
  -- eligible digital exposure -->
INTENT
  -- explicit product or moment selection -->
COMMITMENT
  -- independent café-side token observation -->
ARRIVAL
  -- approved sale-record reconciliation -->
SALE
  -- declared cost model -->
CONTRIBUTION
  -- pre-registered decision rule -->
LEARNING
```

### First Meaningful Divergence

```text
COMMITMENT -- independent café-side evidence --> ARRIVAL
```

Everything through `COMMITMENT` can originate in the browser. `ARRIVAL` changes the evidence domain and therefore cannot be inferred from a click, directions open, QR/token generation, or a displayed barista card.

More visual polish, stronger copy, or another recommendation cannot repair this boundary.

## 4. State and claim contract

| State | Minimum evidence | Maximum supported claim |
| --- | --- | --- |
| `DISCOVERY` | eligible session or exposure | the experience was shown |
| `INTENT` | explicit pairing or moment selection | a preference was expressed |
| `COMMITMENT` | directions or offline-handoff action | a visit-oriented digital action occurred |
| `ARRIVAL` | independent café-side observation of a valid opaque token | a physical handoff was observed |
| `SALE` | approved sale record reconciled to that token within the declared window | an attributed sale occurred |
| `CONTRIBUTION` | sale value minus declared variable and pilot costs | measured positive or negative net contribution |
| `LEARNING` | pre-registered rule applied to complete evidence | keep, revise, scale, or roll back |

Forbidden substitutions:

```text
page_view         != visit
directions_open   != arrival
token_generated   != sale
gross_revenue     != net_contribution
```

## 5. Candidate Roby’s Moment

The first candidate is:

```text
Iced Latte + San Sebastian
```

This is a candidate identity, not a frozen commercial offer. Price, availability, wording, and menu status must come from owner-approved menu truth at pilot start.

The proposed treatment is:

```text
Roby’s Moment selection
+ privacy-safe opaque handoff token
+ approved café-side observation
+ approved sale reconciliation
```

The current static repository does not provide production ordering, payment, reservation, stock guarantee, or POS integration. A human-readable token or Show barista surface is not authority and is not proof of arrival or sale.

## 6. Privacy-safe linkage

The smallest proposed join uses a random, non-personal, opaque token.

The token must not contain or require:

- name;
- phone;
- email;
- precise location;
- payment data;
- advertising identifiers;
- free text.

Before a pilot, the accountable owner must define:

- token issuer and uniqueness rule;
- café-side observation workflow;
- approved sale-record source;
- attribution window;
- retention and deletion rule;
- duplicate, reuse, expiry, and collision handling;
- who may inspect and reconcile evidence.

No token workflow is production-ready merely because this repository can describe it.

## 7. Experiment contract

Preferred design:

```text
eligible sessions
  -> randomized baseline or treatment
  -> independent café-side observation
  -> approved sale reconciliation
  -> declared cost model
  -> pre-registered decision rule
```

A controlled time-block design is an allowed fallback only when randomization is not operationally valid and its confounders are declared before evidence is inspected.

Primary metric:

```text
net_contribution_per_eligible_session
```

Secondary diagnostics:

- verified arrival rate;
- attributed sale rate;
- commitment-to-arrival conversion;
- arrival-to-sale conversion;
- barista handling time;
- customer confusion rate;
- token failure, duplicate, reuse, and collision rates.

Net contribution must include at least:

- product variable cost;
- promotion or discount cost;
- staff-handling cost;
- measurement operating cost.

Sample size, exclusions, attribution window, uncertainty reporting, and stop rules must be fixed before the result is inspected.

## 8. Decision gates

### `MODEL`

Passes when the registry entry, evidence paths, metrics, guardrails, falsification, and rollback are valid.

### `PILOT`

Remains blocked until all business-owned inputs exist:

- named operational owner;
- approved menu truth at pilot start;
- café staff acceptance of the counter workflow;
- approved token-to-sale reconciliation;
- attribution and retention rules;
- declared costs;
- sample-size and stop rule;
- rollback authority.

### `SCALE`

Allowed only when all are true:

- controlled evidence supports uplift over the pre-registered baseline;
- net contribution is positive;
- uncertainty is reported;
- no material menu-truth, privacy, token-integrity, customer-clarity, or barista-workflow breach occurred;
- the accountable café owner approves scale.

### `ROLLBACK`

Required on any material truth, privacy, integrity, clarity, workflow, or negative-contribution breach even when an upstream proxy improves.

## 9. Optional “bodies” analogy

This is an architectural metaphor, not a medical or scientific ontology:

```text
causal body     = hypothesis, ownership, evidence and decision rule
subtle body     = mood, copy, recommendation and expectation
physical body   = arrival, staff handoff, product and receipt
economic body   = costs, net contribution and repeatable value
```

A beautiful subtle layer cannot substitute for a missing physical or economic layer.

## 10. Claim boundary

After this profile lands, the repository may claim:

- it defines the Roby’s menu-to-visit causal chain;
- it identifies `COMMITMENT → ARRIVAL` as the First Meaningful Divergence;
- it separates browser proxies, physical outcomes, sales, and net contribution;
- it defines a falsifiable pilot and fail-closed decision gates.

It may not claim:

- the current site caused additional café visits;
- the current site increased revenue or profit;
- a production token-to-POS integration exists;
- café staff accepted the workflow;
- the candidate pairing is currently available or priced;
- the pilot has produced an effect.

## 11. Next falsifiable question

> Can an anonymous Roby’s Moment handoff improve attributed sales and net contribution per eligible session versus a pre-registered baseline without worsening menu truth, privacy, customer clarity, or barista handling time?
