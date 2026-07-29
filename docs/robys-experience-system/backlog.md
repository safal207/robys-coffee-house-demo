# Roby’s Experience System Backlog

Status: living backlog  
Last consolidated: 2026-07-29  
Scope: current website, Smart Choice, Audience Router, Chapters, messaging, operations, and universalisation

## How to use this backlog

Each item should eventually have:

- owner;
- status;
- evidence or source;
- affected graph;
- acceptance criteria;
- release boundary;
- metric and guardrail;
- operational dependencies.

Priority meanings:

- **P0** — trust, safety, price, legal, or production-breaking issue.
- **P1** — blocks a valid customer or business journey.
- **P2** — important quality, conversion, accessibility, or maintainability issue.
- **P3** — useful experiment or enhancement.
- **Research** — decision requires evidence before implementation.

---

# A. Immediate truth and integrity

## P1 — Resolve pairing price anomaly

Known example from the audit:

```text
Cool Lime + Macaron pairing: 290 ₺
Known component total: 220 ₺
```

Tasks:

- confirm authoritative source of both component prices;
- determine whether 290 ₺ is a data defect, different size, or a distinct offer;
- remove or explain the mismatch;
- add an automated invariant comparing pairing price with its declared pricing mode;
- show savings only when a real offer exists.

Acceptance:

- every pairing has a declared `pricingMode`;
- displayed price agrees with authoritative menu data;
- no unexplained premium or fake discount.

## P1 — Define menu truth ownership

Tasks:

- name the person or system responsible for price updates;
- add menu version and last-updated date;
- define expiry behaviour for saved choices and Moment Passes;
- define what happens when a price changes after save.

## P1 — Separate prototype and production claims

Tasks:

- keep Chapter 01 closed and unlinked until release inputs are confirmed;
- preserve `noindex,nofollow` while it remains a prototype;
- visually label simulated visit, local vote, local consent, and unconnected availability;
- prevent demonstration codes from being interpreted as reservations.

---

# B. Existing menu and homepage integrity

## P1 — Remove dead-end pairing cards

Current pairing cards provide image, copy, and price but no complete commercial action.

Tasks:

- add one primary next action;
- candidate actions: save pairing, show barista, get directions, or choose pairing;
- define the minimal offline fulfilment path;
- add event attribution.

Acceptance:

```text
pairing viewed
→ explicit action
→ offline or digital outcome
```

## P1 — Fix search/category false-empty state

Current search remains constrained by the active category. Searching for a product in another category can incorrectly show no results.

Tasks:

- decide whether search is global or category-scoped;
- make the scope visible;
- reset or expand category when global search begins;
- add cross-category tests.

## P2 — Synchronise category state with browser history

Tasks:

- implement `hashchange` and/or `popstate` handling;
- confirm back, forward, reload, and direct hash entry;
- preserve search and category contracts.

## P2 — Replace reconstructed CSS brand mark

Tasks:

- use approved master SVG across homepage, menu, Chapter, and future modules;
- remove pseudo-element logo reconstruction;
- prevent multiple unofficial red shades from becoming logo geometry;
- add brand-boundary tests.

## P2 — Improve mobile touch targets

Known risk areas:

- category chips around 38 px high;
- language controls around 32–34 px on narrow screens.

Tasks:

- increase interactive target size;
- test one-handed mobile use;
- preserve visual density without reducing accessibility.

## P2 — Reduce screen-reader announcement noise

Current menu root uses `aria-live="polite"` while full menu content can rerender during search.

Tasks:

- move live announcement to a concise result-count region;
- avoid announcing the entire menu on every input;
- test with screen-reader navigation.

## P2 — Clarify booking path

Current CTA opens a generic Instagram profile.

Tasks:

- define whether booking exists;
- provide a direct message template with date, time, and party size if supported;
- show that booking is valid only after café confirmation;
- add WhatsApp or another channel only after operational ownership is confirmed.

## P2 — Validate time-sensitive claims

Examples:

- “Today’s Pairing”;
- “Popular Today”;
- “Dish of the day”.

Tasks:

- connect claims to live or regularly owned data;
- otherwise rewrite them as stable editorial content;
- add expiry and fallback states.

---

# C. Design-system alignment

## P1 — Align Chapter visual language with the existing Roby’s shell

Prototype feedback: emotionally promising, but visibly different from the current homepage.

Tasks:

- derive exact shared header, typography, spacing, buttons, cards, and responsive rules;
- use the same photographic treatment;
- preserve increased cinematic intensity only inside chapter-specific moments;
- prevent the chapter from feeling like an unrelated microsite.

Acceptance:

> Familiar Roby’s on entry; deeper emotional intensity after voluntary entry.

## P2 — Create experience design tokens

Tokens needed:

- stable brand palette;
- seasonal accent token;
- chapter state token;
- motion intensity levels;
- card elevation levels;
- emotional background treatments;
- reduced-motion alternatives.

## P2 — Define red-ring governance

Research and brand tasks:

- determine whether the ring is a chapter symbol, loading/progress state, or brand extension;
- ensure it does not alter or replace the official logo;
- test recognition and meaning with users;
- define closed, marked, approaching, open, and completed states.

## P3 — Create original seasonal symbol library

Potential symbol classes:

- wave;
- spark;
- leaf;
- moon;
- star;
- warm glow.

Do not create character merchandise until the world and symbols demonstrate real audience pull.

---

# D. Audience Router MVP

## P1 — Add an explicit four-route chooser

Candidate prompt:

> What is easiest for you right now?

Routes:

- I know what I want → Ordinary Menu;
- Help me choose → Smart Choice;
- I am here for the first time → Introduction;
- Show me something new → current Chapter or seasonal experience.

Constraints:

- compact block, not a homepage takeover;
- ordinary menu remains the primary safe route;
- store choice locally;
- visible option to change the choice.

## P1 — Define router state schema and versioning

Tasks:

- settle field names;
- add schema version;
- define migration and reset;
- define expiry for unfinished states;
- distinguish local, account, analytics, and operational data.

## P1 — Implement deterministic route policy

First policy should use:

1. explicit intent;
2. unfinished useful state;
3. past successful route;
4. current context;
5. rejection cooldown.

Do not use machine learning in MVP.

## P2 — Add continuation of unfinished useful state

Examples:

- last viewed product;
- unfinished Smart Choice;
- saved pairing;
- unfinished Chapter;
- pending voting result.

Each continuation card needs:

- reason for appearing;
- continue action;
- dismiss action;
- expiry.

## P2 — Add cooldown and rejection memory

Initial rule hypothesis:

```text
route rejected once → hide for session
route rejected twice → 14-day cooldown
notification ignored twice → reduce frequency
promotional continuation rejected → stop chain
```

Validate with real user behaviour before making permanent.

## P2 — Add transparent route diagnostics for QA

Developer-only view should show:

- candidate routes;
- evidence;
- score;
- chosen route;
- fallback;
- experiment variant;
- cooldown decisions.

Never expose a creepy behavioural profile to ordinary visitors or staff.

## Research — Relationship-level thresholds

Investigate whether Chapters should be invited after:

- second confirmed purchase;
- third confirmed purchase;
- completed Smart Choice;
- repeated novelty interest;
- explicit “show me something new” action.

Avoid a hard purchase-count rule if earlier behaviour provides stronger evidence.

---

# E. Smart Choice

## P1 — Expand product data model

Current menu data is too thin for trustworthy personalisation.

Add structured fields where operationally known:

- size or volume;
- hot/cold;
- caffeine level;
- sweetness;
- allergens;
- dietary flags;
- milk options;
- flavour profile;
- preparation time;
- availability;
- pairing compatibility;
- margin band;
- source/version.

Unknown fields must remain unknown rather than guessed.

## P1 — Define recommendation explanation

Every recommendation should explain:

- which stated preference mattered;
- why the product fits;
- what could be changed;
- alternative fast route to the full menu.

## P2 — Add compatibility graph

Example edges:

```text
cold coffee → compatible desserts
tea → compatible pastry
sandwich → compatible drinks
refresher → compatible small sweet
```

Constraints:

- availability;
- allergy and dietary conflict;
- preparation capacity;
- already-selected items;
- current menu version.

## P2 — Add “repeat or surprise me” return path

For a returning user with a known successful choice:

```text
[Repeat last choice]
[Show me something new]
```

## Research — Weather and context value

Measure whether weather, time, and day improve recommendation acceptance after explicit preferences are already known.

Do not assume contextual data is automatically useful.

---

# F. Commerce and checkout-inspired mechanics

## P1 — Define one-click selection without online payment

MVP flow:

```text
select
→ build set
→ calculate truthful total
→ save
→ show barista / get directions
```

## P2 — Implement central order-bump rules

Rules should be centrally managed rather than hardcoded into every card.

Example:

```text
category = cold-coffee
→ offer San Sebastian
when available
and not already selected
and no known conflict
```

## P2 — Implement upgrade semantics

An upgrade replaces the base item and shows only the incremental price.

Tests:

- old item removed;
- new item added;
- total changes only by the difference;
- existing bump remains compatible;
- analytics distinguishes upgrade from an added item.

## P2 — Define one upsell and one meaningful downsell maximum

Guardrail:

```text
two offer rejections → STOP
```

## P2 — Recover abandoned choices locally

Tasks:

- store set and menu version;
- offer continuation on return;
- expire after menu change or operational cutoff;
- never message externally without consent.

## Research — Actual purchase confirmation

Candidate methods:

- POS integration;
- staff button;
- scanned QR;
- unique digital combo code;
- receipt code.

Compare reliability, staff cost, fraud risk, and privacy.

---

# G. Chapters and desire system

## P1 — Complete Chapter 01 product decisions

Required before customer-facing release:

- authoritative date;
- start and end time;
- product composition;
- price ownership;
- actual availability model;
- staff briefing;
- code confirmation flow;
- QR destination;
- fallback if product sells out;
- privacy and retention rules.

## P1 — Integrate Chapter with the shared design system

Keep the state graph, but rebuild presentation using production components.

## P2 — Add chapter truth object

Suggested fields:

```json
{
  "chapterId": "summer-cool-evening-01",
  "state": "draft",
  "opensAt": null,
  "closesAt": null,
  "menuVersion": "2026-07",
  "availabilitySource": null,
  "price": 370,
  "currency": "TRY",
  "staffFlowVersion": null
}
```

## P2 — Build real voting service or explicitly keep voting local

Decide:

- identity model;
- duplicate-vote policy;
- result visibility;
- moderation;
- close time;
- auditability;
- what happens when the losing choice still appears elsewhere.

## P2 — Build Moment Pass lifecycle

States:

```text
created
→ active
→ shown
→ fulfilled
→ expired
→ invalidated
```

## P2 — Build post-visit memory

Only after outcome confirmation:

- saved chapter;
- date;
- selected items;
- optional reaction;
- next-chapter invitation.

## P3 — Create annual season framework

Working themes:

- winter: Light Returns;
- spring: The World Wakes Up;
- summer: Adventure of Coolness;
- autumn: Returning Home.

Treat these as narrative containers, not launch commitments.

## Research — Chapter length

Test whether users prefer:

- one-screen reveal;
- three-step micro-story;
- full eight-state chapter;
- different lengths by relationship stage.

---

# H. Continuation channels

## P1 — Choose first production channel

Candidates:

- Telegram bot/channel;
- Web Push/PWA;
- WhatsApp initiated by the user;
- Instagram as visual discovery.

Evaluation:

- consent clarity;
- technical effort;
- delivery reliability;
- segmentation;
- staff workload;
- regional user preference.

## P1 — Define message eligibility contract

A message may be sent only when it is:

- explicitly requested;
- expected continuation;
- operationally useful;
- tied to a joined relationship.

## P2 — Implement frequency and suppression rules

Track:

- delivered;
- opened;
- ignored;
- rejected;
- unsubscribed;
- converted to real outcome.

## P2 — Build channel-specific roles

Working model:

- Telegram: interactive story and voting;
- Web Push: time-sensitive continuation;
- WhatsApp: personal confirmation and questions;
- Instagram: visual discovery and atmosphere.

Avoid duplicating every message across every channel.

---

# I. Analytics and experiments

## P1 — Create common event taxonomy

Core events:

- route offered;
- route accepted;
- route rejected;
- state continued;
- recommendation accepted;
- Moment Pass created;
- route opened;
- barista code shown;
- purchase confirmed;
- chapter completed;
- next-step intent.

## P1 — Define offline attribution

Do not declare funnel success based only on clicks or saved passes.

## P2 — First homepage route experiment

Variants:

- A: ordinary menu primary;
- B: Smart Choice primary;
- C: popular pairing primary;
- D: compact chapter teaser.

Guardrails:

- time to menu;
- immediate exit;
- path abandonment;
- notification rejection;
- customer complaints.

## P2 — Test invitation timing

Compare Chapter invitation:

- on first explicit novelty request;
- after Smart Choice completion;
- after second confirmed purchase;
- after third confirmed purchase;
- after prior chapter participation.

## P2 — Test chapter depth

Measure:

- teaser open;
- return before reveal;
- voting participation;
- Moment Pass creation;
- confirmed visit;
- next-chapter intent.

## P2 — Build experiment contracts in repository

Each experiment gets a versioned Markdown or JSON contract with hypothesis, variants, metrics, guardrails, and stopping rule.

---

# J. Operations and staff

## P1 — Define barista experience

Tasks:

- what the barista sees;
- how a code is checked;
- how fulfilment is confirmed;
- what happens if stock differs;
- how long the interaction may take;
- how training is delivered.

## P1 — Create offline fallback

The system must still work if:

- internet is weak;
- QR fails;
- phone battery is low;
- saved pass is a screenshot;
- staff panel is unavailable.

## P2 — Create event readiness checklist

Before a chapter opens:

- product tested;
- price confirmed;
- stock confirmed;
- staff briefed;
- physical signs ready;
- links and QR tested;
- all channels agree;
- fallback ready;
- owner assigned.

## P2 — Define cancellation and change policy

If a chapter changes or cannot be fulfilled:

- update all surfaces;
- invalidate or explain saved passes;
- notify only affected opted-in users;
- offer a truthful alternative;
- preserve trust over short-term conversion.

---

# K. Privacy, accessibility, and governance

## P1 — Data map

Document every field by:

- purpose;
- storage location;
- retention;
- consent;
- deletion;
- access.

## P1 — Consent separation

Do not merge consent for:

- local storage;
- analytics;
- Web Push;
- Telegram;
- WhatsApp;
- user-generated content.

## P2 — Router reset and explanation

Provide:

- reset personalisation;
- change preferred route;
- disable continuation suggestions;
- basic explanation of why a block appeared.

## P2 — Accessibility across experience modules

Test:

- keyboard;
- focus order;
- screen readers;
- reduced motion;
- contrast;
- touch targets;
- language switching;
- cognitive load;
- error recovery.

---

# L. Universal product extraction

## P2 — Extract product-agnostic schema

Separate:

- route definitions;
- state-machine definitions;
- truth adapter;
- event taxonomy;
- experiment assignment;
- cooldown policy;
- consent adapter;
- fulfilment confirmation.

## P2 — Create a second reference domain

Choose one domain beyond café, such as:

- education;
- fitness;
- travel;
- local services;
- SaaS onboarding.

Map the same relationship depths and identify which components remain universal.

## P3 — Package a reusable router library

Only after the first production test validates the architecture.

Potential interfaces:

```text
registerRoute()
rankRoutes()
recordOutcome()
applyCooldown()
restoreExperience()
resolveTruth()
assignExperiment()
```

## Research — Product name and positioning

Working concepts:

- Adaptive Experience Orchestration;
- Relationship Router;
- Experience Graph Engine;
- Desire and Journey OS;
- Contextual Product Journey.

Do not finalise the name before proving the system on at least two domains.

---

# Suggested first delivery sequence

## Release 0 — Documentation and integrity

- preserve this product memory;
- disposition current P1 menu issues;
- keep Chapter prototype closed;
- define truth ownership.

## Release 1 — Explicit Audience Router

- compact four-route block;
- local preference;
- change/reset;
- route analytics;
- ordinary menu always available.

## Release 2 — Smart continuation

- resume last product or Smart Choice;
- “repeat or surprise me”;
- cooldowns;
- stable experiment assignment.

## Release 3 — Confirmed offline outcome

- staff/POS/QR proof of purchase;
- real Moment Pass lifecycle;
- price/menu versioning.

## Release 4 — First real Chapter

- shared Roby’s design system;
- real event date and availability;
- one continuation channel;
- operational readiness gate;
- post-visit memory.

## Release 5 — Universal extraction

- reusable schemas and interfaces;
- second-domain reference implementation;
- comparison report and product decision.

---

# Definition of success

The system succeeds when:

- fast users reach a product faster;
- uncertain users make a more confident choice;
- returning users receive useful continuity;
- interested users voluntarily enter deeper experiences;
- chapters produce confirmed visits and future intent;
- notifications are expected rather than resented;
- experiments can remove weak ideas as easily as they add attractive ones;
- the architecture can be reused without copying Roby’s identity.
