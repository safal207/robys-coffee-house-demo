# Adaptive Experience Orchestration

Working name: **Adaptive Experience Orchestration (AEO)**  
Origin: Roby’s Coffee House product exploration  
Status: reusable architecture hypothesis

## Purpose

Many digital products make one of two mistakes:

1. they show every person the same static experience;
2. they attempt opaque personalisation optimised only for conversion.

Adaptive Experience Orchestration offers a third approach:

> Give every person an appropriate next path, preserve their freedom, remember useful choices, and deepen the relationship only when evidence shows they are ready.

The system is applicable whenever a product has multiple valid customer intentions and multiple possible depths of relationship.

## Universal model

```text
STABLE ENTRY
↓
EXPLICIT INTENT
↓
ROUTE RECOMMENDATION
↓
STATEFUL EXPERIENCE
↓
REAL-WORLD OR DIGITAL OUTCOME
↓
MEMORY
↓
NEXT NATURAL RELATIONSHIP STEP
```

## Five relationship depths

### 1. Transaction

The person wants to complete a known task quickly.

Examples:

- buy a known product;
- book a known service;
- open a familiar document;
- repeat a previous order.

Product requirement: minimal friction and predictable navigation.

### 2. Discovery

The person needs orientation, trust, examples, or comparison.

Examples:

- first visit to a café or hotel;
- first use of a software product;
- browsing a course catalogue;
- learning what a local service provides.

Product requirement: explain the world without forcing commitment.

### 3. Personalisation

The person wants help choosing.

Examples:

- a product recommender;
- a learning path;
- a travel itinerary;
- a workout selection;
- a service package builder.

Product requirement: reduce decision cost while keeping the reasoning understandable.

### 4. Participation

The person is ready to influence, co-create, vote, test, or join a timed event.

Examples:

- choose the next product drop;
- join a beta;
- vote on an event theme;
- contribute preferences to a shared plan.

Product requirement: every contribution must receive a truthful continuation.

### 5. Belonging

The person returns for identity, ritual, community, collection, status, memory, or a continuing story.

Examples:

- member programmes;
- recurring seasonal events;
- creator communities;
- loyalty worlds;
- alumni or cohort experiences.

Product requirement: relationship value must exceed notification volume and promotional pressure.

## Core components

### 1. Stable Shell

The reliable public surface that never disappears under personalisation.

It contains:

- brand identity;
- primary navigation;
- direct access to core functions;
- truth-bearing information;
- privacy and accessibility controls.

The stable shell prevents experimentation from making the product unfamiliar or inaccessible.

### 2. Intent Capture

The system first asks or observes what the person is trying to do.

Signal priority:

```text
explicit answer
> completed action
> repeated behaviour
> situational context
> broad inference
```

Explicit intent must override a weak inferred preference.

### 3. Audience Router

A deterministic or learned policy that ranks possible routes.

The router must return:

- recommended route;
- evidence used;
- confidence;
- fallback route;
- cooldown state;
- experiment assignment.

It must not silently remove alternatives.

### 4. Experience Modules

Independent routes that can be composed:

- direct transaction;
- introduction;
- guided choice;
- funnel or bundle builder;
- launch or chapter;
- community participation;
- recovery of unfinished state.

Each module is a state machine with explicit entry, exit, success, rejection, and expiry states.

### 5. Truth Layer

A shared source of operational truth:

- price;
- availability;
- date and time;
- eligibility;
- inventory;
- fulfilment capacity;
- policy;
- staff or system confirmation.

No experience may create a claim that the truth layer cannot support.

### 6. Memory Layer

Stores only information needed to continue useful experiences.

Possible scopes:

- session;
- device-local;
- consented account;
- operational order record;
- anonymised analytics.

Memory objects must have:

- purpose;
- owner;
- version;
- expiry;
- deletion path;
- consent classification.

### 7. Experiment Layer

Assigns stable variants and measures outcomes across the whole journey.

An experiment contract includes:

- hypothesis;
- eligible audience;
- variants;
- primary outcome;
- guardrails;
- minimum exposure;
- stopping rule;
- rollback plan.

### 8. Continuation Channels

Notifications, messaging channels, email, bots, or in-product continuation.

A message is valid only when at least one condition is true:

- the person explicitly requested it;
- it completes an unfinished expected event;
- it contains timely operational value;
- it continues a relationship the person joined.

## The six validation graphs

Every experience module is inspected through six graphs.

### Behaviour

```text
state → action → transition → state
```

Questions:

- Is every intended state reachable?
- Does every state have a safe exit?
- Are back, reload, expiry, and retry correct?

### Perception

Questions:

- Does the person understand what is happening?
- Is hierarchy consistent?
- Does the module feel part of the same product?
- Are accessibility and motion preferences respected?

### Product and Money

Questions:

- Is the recommendation compatible?
- Is the value visible?
- Is the price correct?
- Can the outcome be attributed?
- Are margin and fulfilment sustainable?

### Truth and Operations

Questions:

- Is the claim current?
- Can staff or infrastructure fulfil it?
- Do all channels agree?
- What happens when reality changes?

### Desire and Heat

Questions:

- Does the journey increase relevant desire or only add friction?
- Has the person created a reason to return?
- Is a continuation message expected?
- Is frequency adjusted after rejection or silence?

### Wonder and Memory

Questions:

- Is there a meaningful emotional arc?
- Does participation create ownership?
- Does completion leave a memory?
- Is there an honest continuation rather than an endless promotion?

## Route utility model

A simple deterministic score can be used before machine learning:

```text
Route Utility
=
explicit intent
+ successful-path history
+ current relevance
+ novelty value
+ operational feasibility
− interaction cost
− rejection history
− annoyance risk
```

This score should rank routes, not determine price or eligibility unless an independent legitimate policy requires it.

## Example policy

```text
if explicitIntent == "fast":
    recommend transaction

else if unfinishedUsefulState exists:
    offer continuation

else if repeatKnownProduct and timePressure:
    offer repeat transaction

else if highChoiceUncertainty:
    offer guided choice

else if priorParticipation and activeEvent:
    offer chapter continuation

else:
    show stable shell with neutral route choices
```

## Universal event model

Events should represent meaningful state changes, not every cursor movement.

```json
{
  "event": "experience_transition",
  "experience": "chapter-01",
  "from": "WAITING",
  "to": "REVEAL",
  "reason": "user_opened_demo_reveal",
  "route": "participation",
  "variant": "reveal-copy-b",
  "truthVersion": "menu-2026-07",
  "timestamp": "2026-07-29T15:00:00Z"
}
```

Recommended common events:

- route offered;
- route accepted;
- route rejected;
- state continued;
- recommendation accepted;
- outcome confirmed;
- expectation created;
- notification consented;
- notification ignored;
- experience completed;
- next-step intent.

## Universal data contract

```json
{
  "audienceState": {
    "relationshipDepth": "personalisation",
    "explicitIntent": "help-me-choose",
    "preferredRoute": "guided-choice",
    "unfinishedExperiences": [],
    "successfulRoutes": ["transaction"],
    "rejections": {},
    "cooldowns": {},
    "consents": {}
  },
  "context": {
    "locale": "ru-RU",
    "deviceClass": "mobile",
    "timeWindow": "evening"
  },
  "truth": {
    "catalogVersion": "2026-07",
    "availabilityVersion": null
  },
  "experiments": {
    "entry-router": "b"
  }
}
```

## Safety and ethics constraints

### Freedom

- preserve access to the core product;
- provide a visible alternative;
- do not use forced redirects based on weak inference;
- allow reset and preference changes.

### Honesty

- no fake scarcity;
- no invented social proof;
- no simulated personalised knowledge presented as fact;
- no hidden subscription;
- no misleading expiry or urgency.

### Privacy

- collect the minimum useful state;
- distinguish local state, operational records, and analytics;
- define retention and deletion;
- do not infer sensitive traits unless necessary, lawful, consented, and explicitly governed.

### Non-discrimination

- do not personalise prices using opaque willingness-to-pay estimates;
- do not reduce service quality for inferred low-value users;
- do not expose relationship scores to staff as a measure of human worth.

### Wellbeing

- implement cooldowns;
- cap message frequency;
- stop promotional chains after repeated rejection;
- avoid compulsive mechanics where the domain creates health or financial risk.

## Product development sequence

### Phase 1 — Explicit routes

- stable shell;
- four or fewer clear route choices;
- local route memory;
- basic event model.

### Phase 2 — Stateful continuation

- restore unfinished useful state;
- repeat previous successful action;
- provide reset and expiry;
- add versioned truth references.

### Phase 3 — Rule-based router

- deterministic route ranking;
- cooldowns;
- experiment assignment;
- transparent fallbacks.

### Phase 4 — Outcome confirmation

- connect to fulfilment, POS, booking, completion, or another source of truth;
- measure real outcomes rather than proxy clicks.

### Phase 5 — Learned optimisation

Only after trustworthy data exists:

- learn route ranking;
- predict interaction cost;
- optimise timing;
- personalise module length;
- keep constraints and explanations outside the model.

## Domain mappings

### Café or retail

```text
menu → guided choice → bundle → event → loyalty world
```

### Education

```text
course catalogue → orientation → learning-path recommendation → cohort challenge → alumni community
```

### Fitness

```text
known workout → onboarding → adaptive plan → group challenge → long-term identity and ritual
```

### Travel

```text
known booking → destination discovery → itinerary builder → limited event → memory collection and next trip
```

### SaaS

```text
known task → product orientation → workflow assistant → beta participation → expert community
```

## Research questions

- When does route choice outperform automatic personalisation?
- Which signals reliably indicate readiness for a deeper relationship?
- How much state is needed before a router becomes useful?
- Which memory objects create continuity without creating surveillance?
- How should emotional metrics be validated against real value?
- When does a chapter or launch increase loyalty, and when does it merely increase complexity?
- What is the best universal representation of operational truth across domains?
- How can staff-facing and customer-facing state remain synchronised?

## Reusability criterion

A feature belongs to the universal system only if it can be described without Roby’s-specific products, names, colours, or café operations.

Roby’s remains the first reference implementation and test environment. The universal layer should learn from it without erasing the specific warmth and constraints of the café.
