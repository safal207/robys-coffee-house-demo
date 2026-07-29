# Design Journey and Decision Log

This document records how the Roby’s concept evolved. It is not a transcript. It preserves the product reasoning, turning points, and decisions that should survive beyond the original conversation.

## Stage 0 — Starting point: audit the current product as a graph

The work began as a deep audit of the existing Roby’s website and menu.

The initial model was:

```text
state → action → transition → new state → business invariant
```

The purpose was to find more than broken buttons. The audit searched for:

- unreachable or misleading states;
- dead-end product cards;
- visual and brand contradictions;
- price and offer inconsistencies;
- navigation state drift;
- accessibility failures;
- claims that were static but sounded current;
- gaps between website behaviour and real café operations.

### Important finding

A technically functioning page can still fail commercially or emotionally.

A card may render correctly but lead nowhere. A claim may be attractive but not operationally true. A colour may pass contrast checks while still breaking brand consistency. This expanded the original graph.

## Stage 1 — Four checks for every transition

Every important edge began to be evaluated through four lenses:

```text
FUNCTION
Does the transition work?

PERCEPTION
Does the person understand and trust it?

VALUE
Does it create useful customer or business value?

TRUTH
Does it agree with price, availability, time, and operations?
```

This became the foundation for Behaviour, Perception, Product/Money, and Truth/Operations graphs.

## Stage 2 — ClickFunnels and SamCart: make product cards commercially complete

The next question was how to increase revenue without turning the site into an aggressive checkout funnel.

Mechanics adapted from funnel and checkout systems included:

- order bumps;
- upgrades;
- one-step upsells;
- downsells after a meaningful rejection;
- central compatibility rules;
- abandoned-choice recovery;
- branch-level A/B testing;
- purchase attribution.

### Key decision

Roby’s should not imitate an online-course checkout.

The useful abstraction is:

```text
choose
→ improve the choice
→ add one compatible item
→ save or show the selection
→ confirm the offline purchase
```

The number of offers must be limited. A person visiting for coffee must never feel trapped in a sales interview.

### Product insight

The existing pairing cards were visually complete but commercially incomplete. They lacked a next action such as:

- choose this pairing;
- save it;
- show the barista;
- get directions;
- confirm a purchase.

This introduced the concept of **funnel integrity**: every attractive promise must continue into a real action and measurable outcome.

## Stage 3 — PLF and Jeff Walker: desire before notification

The conversation then shifted from conversion mechanics to desire formation.

The central insight was:

> A notification does not warm a cold person. It amplifies desire that already exists.

The adapted sequence became:

```text
notice
→ imagine
→ participate
→ leave something unfinished
→ wait
→ receive the expected continuation
→ buy with pleasure
```

Mechanics introduced:

- pre-prelaunch teasers;
- emotional questions;
- guest voting;
- staged reveal;
- ownership experience;
- notification opt-in tied to a concrete continuation;
- weekly micro-launches;
- a heat model based on meaningful actions.

### Key decision

Do not ask for push permission on first page load.

A person should first create a reason to want the notification:

- learn the voting result;
- know when a saved pairing opens;
- receive a real availability update;
- continue a story they joined.

### Language decision

Internally the team may discuss “warming” and “conversion”, but customer-facing language should remain humane. The product should not describe people as targets to be “finished off” with pushes.

## Stage 4 — Disney, Marvel, and Pixar effects without imitation

The next layer was not visual style. It was the emotional effect created by large American entertainment studios:

- something good is approaching;
- the audience can anticipate a date;
- each release belongs to a larger world;
- simple human emotions matter more than inflated prestige;
- the end of one event contains the beginning of another;
- repeated symbols build recognition and memory.

This became the **Wonder and Celebration Graph**.

### Disney-derived abstraction

```text
calendar
+ approaching celebration
+ physical details
+ family participation
+ memory
```

### Marvel-derived abstraction

```text
chapter
→ connection to a wider season
→ culmination
→ post-credit continuation
```

### Pixar-derived abstraction

```text
simple emotional truth
→ recognisable everyday tension
→ human transformation
```

### Key decision

Do not copy characters, protected visual language, or famous studio aesthetics.

Roby’s should create an original emotional universe rooted in its own brand, products, guests, staff, and physical café.

### Avoided direction

The team explicitly rejected inflated luxury language, false epicness, constant confetti, artificial countdowns, and theatrical staff scripts.

Coffee does not need to save the galaxy. It can still save the second half of someone’s day.

## Stage 5 — Roby’s World Core

The brand idea crystallised as:

> Roby’s is a place of small events worth waiting for.

The product is not only coffee or dessert. It is a transition:

- fatigue → lightness;
- hurry → calm;
- loneliness → meeting;
- ordinary day → small celebration;
- uncertainty → discovery;
- adult seriousness → light adventure.

### Brand behaviour

Roby’s should feel:

- warm;
- observant;
- calm;
- slightly playful;
- non-coercive;
- capable of surprise;
- emotionally honest.

### Recurring symbol

The red Roby’s ring was proposed as a chapter-state symbol:

```text
closed → hidden
marked → first sign
filling → approaching
open → available
checked → completed
```

This remains a hypothesis requiring brand review, not a replacement for the master logo.

## Stage 6 — Chapter 01 prototype

The first chapter was defined as **A Cool Summer Evening**.

Its state graph:

```text
TEASER
→ MOOD
→ VOTE
→ WAITING
→ REVEAL
→ SAVED
→ COMPLETED
→ POST_CREDIT
```

The prototype validated:

- emotional entry before product entry;
- honest voting without fabricated totals;
- anticipation as a real state;
- a Moment Pass as psychological ownership;
- a barista handoff concept;
- memory after the visit;
- post-credit continuation;
- explicit prototype boundaries.

### Important prototype lesson

The first standalone design felt more cinematic than the existing homepage.

The correct conclusion was not to redesign the homepage around the prototype. Instead:

> Outside: familiar Roby’s. Inside the chapter: increasing cinematic and emotional intensity.

All spaces should share the same logo, typography, colour system, components, spacing rhythm, and photographic language.

## Stage 7 — The decisive architectural insight: not everyone needs a chapter

The user recognised that a long emotional chain belongs later in the relationship, often after the second or third purchase, not as the mandatory first visit.

This produced four customer spaces:

1. **Ordinary Menu** — for speed and certainty.
2. **Introduction** — for first-time trust and atmosphere.
3. **Smart Choice** — for decision support and personalisation.
4. **Roby’s Chapters** — for participation, anticipation, and belonging.

### Key decision

The chapter is not a replacement for the menu.

It is a deeper relationship layer.

A new visitor may still enter a chapter early by explicitly choosing “show me something new”, but the system should not force this route.

## Stage 8 — Audience Router

The phrase “each person gets their own” led to the Audience Router.

The router asks:

> Which next path is most useful for this person in this moment?

It prioritises evidence in this order:

1. explicit choice;
2. completed action;
3. observed website behaviour;
4. context such as time, weather, language, and device.

### Non-negotiable router rule

The router recommends. It does not silently redirect.

### MVP first question

```text
What is easiest for you right now?

I know what I want
Help me choose
I am here for the first time
Show me something new
```

### Relationship levels

The system may use interface levels to unlock appropriate capabilities:

```text
0 Unknown visitor
1 Explorer
2 Decided visitor
3 Returning guest
4 Ready participant
5 Member of the world
```

These levels are not value scores and must not affect price or respect.

## Stage 9 — Universalisation

The architecture is broader than café menus.

The reusable core is:

```text
multiple valid customer intents
+ explicit and inferred signals
+ route recommendation
+ stateful continuation
+ truth and operational contracts
+ experimentation
+ progressive relationship depth
```

Possible future domains include:

- retail;
- hospitality;
- education;
- fitness;
- events;
- subscription products;
- local services;
- travel experiences;
- communities;
- creator products.

The universal version is documented separately in `universal-system.md`.

## Decisions currently considered stable

- Keep the current homepage as the stable public shell.
- Keep ordinary menu access fast and universal.
- Treat Smart Choice and Chapters as distinct spaces.
- Use chapters primarily for returning or explicitly interested guests.
- Preserve one shared Roby’s design system across all spaces.
- Use truthful scarcity, pricing, dates, votes, and availability only.
- Tie notifications to prior intent or explicit expectation.
- Measure confirmed offline outcomes, not only clicks.
- Start the router with explicit choices and deterministic rules.
- Keep production and prototype states visibly separate.

## Decisions still open

- How a real purchase is confirmed: POS, staff action, QR, or another method.
- Whether the ring becomes a permanent chapter symbol.
- The exact conditions for inviting a person into Chapters.
- Which notification channel becomes the first production channel.
- How long local state and event history should be retained.
- Whether chapter participation needs accounts or can remain device-local.
- Which first homepage entry experiment is operationally safe.
- How staff will see and fulfil Moment Pass states.
- Whether the first real chapter should use existing menu prices or a true bundle offer.
- What level of user-generated content and moderation is acceptable.

## How to use this log

When proposing a new feature, identify:

1. which stage of the architecture it belongs to;
2. which graph it changes;
3. which stable decision it respects or challenges;
4. which operational truth it depends on;
5. which metric and guardrail will decide whether it survives.

A feature should not be retained merely because it sounds magical. It must produce value without breaking trust, simplicity, or the ordinary-menu path.
