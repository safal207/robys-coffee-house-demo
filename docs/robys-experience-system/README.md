# Roby’s Experience System

Status: **working product thesis / design memory**  
Last consolidated: **2026-07-29**  
Related prototype: `chapter-01.html`  
Related pull request: **#296**

## Why this directory exists

This directory preserves the reasoning that led from a menu audit to a broader adaptive experience system.

The goal is not only to remember feature ideas. It is to retain:

- the sequence of product discoveries;
- the decisions and rejected shortcuts;
- the architecture of the current Roby’s experience;
- the backlog and unknowns;
- the reusable system that can later support products beyond Roby’s.

The documents are intentionally written as product memory rather than final marketing copy.

## Current product thesis

Roby’s should not force every visitor through one funnel.

Different people need different levels of relationship:

```text
TRANSACTION
Quickly see the menu and buy

DISCOVERY
Understand the place and popular choices

PERSONALIZATION
Receive help choosing the right product

PARTICIPATION
Influence an offer, event, or launch

BELONGING
Return for chapters, memories, rituals, and community
```

The system therefore contains four customer spaces:

1. **Ordinary Menu** — fast, predictable, complete.
2. **Introduction** — atmosphere, trust, popular products, location.
3. **Smart Choice** — contextual and preference-based product selection.
4. **Roby’s Chapters** — anticipation, participation, Moment Pass, event, memory, continuation.

The homepage remains the stable public entrance. An **Audience Router** proposes the most useful next path but never removes access to the ordinary menu and never silently redirects a person.

## Core architecture

```text
ROBY’S HOME
│
├── I know what I want
│   └── Ordinary Menu
│
├── I am here for the first time
│   └── Introduction
│
├── Help me choose
│   └── Smart Choice
│
└── Show me something new
    └── Roby’s Chapters
```

For returning visitors:

```text
RETURNING VISITOR
↓
Explicit intent?
├── yes → follow that intent
└── no
    ↓
Unfinished useful state?
├── yes → offer to continue
└── no
    ↓
Past successful path?
├── Menu → repeat or recommend
├── Smart Choice → new personal selection
└── Chapter → next sign
```

## The six graphs

The system evolved into six connected graphs.

### 1. Behaviour Graph

```text
state → action → transition → new state → business invariant
```

Checks whether the interaction actually works and whether every state has a valid exit.

### 2. Perception Graph

Checks visual hierarchy, brand fidelity, colour, readability, emotional interpretation, accessibility, and consistency between surfaces.

### 3. Product and Money Graph

Checks product compatibility, pricing truth, margin, upgrades, order bumps, upsells, downsells, availability, and actual purchase attribution.

### 4. Truth, Time, and Operations Graph

Checks whether claims, dates, stock, prices, staff actions, messages, and real café operations agree.

### 5. Desire and Heat Graph

```text
notice → imagine → participate → wait → save → visit → buy → return
```

Builds desire before a sale and treats notifications as continuation of an expected story, not unsolicited pressure.

### 6. Wonder and Celebration Graph

```text
ordinary day
→ first sign
→ intrigue
→ personal role
→ approaching date
→ invitation
→ real-world event
→ memory
→ next chapter
```

Creates anticipation, celebration, recurring symbols, seasonal rhythm, and emotional continuity without copying protected characters or visual styles.

## Non-negotiable principles

1. **The ordinary menu is always available.**
2. **The router proposes; the person chooses.**
3. **No fake scarcity, votes, stock, discounts, testimonials, or countdowns.**
4. **A notification is sent only when it continues an expected or useful event.**
5. **One screen gets at most one prominent personalised recommendation.**
6. **Explicit intent is stronger than inferred behaviour.**
7. **Operational truth must match website, message, staff flow, price, and availability.**
8. **A completed purchase is not the end of the funnel; it may become a memory and the beginning of the next relationship stage.**
9. **Personalisation changes the path, not the person’s price or dignity.**
10. **Start with rules and experiments; automate only after trustworthy evidence exists.**

## Key product objects

### Audience State

A small, transparent state object may remember useful choices on the device:

```json
{
  "relationshipLevel": 2,
  "preferredEntry": "smart-choice",
  "lastCategory": "cold-coffee",
  "lastProduct": "iced-latte",
  "savedChoice": {
    "product": "iced-latte",
    "pairing": "san-sebastian",
    "price": 370,
    "currency": "TRY",
    "menuVersion": "2026-07"
  },
  "chapterHistory": [],
  "currentChapter": null,
  "notificationConsent": {
    "webPush": false,
    "telegram": false,
    "whatsapp": false
  }
}
```

This is interface state, not a secret judgement of a person’s worth.

### Moment Pass

A saved moment connects digital intent to an offline visit:

```text
ROBY’S MOMENT PASS
Chapter 01
A Cool Summer Evening
Iced Latte + San Sebastian
370 ₺
Code: RBY-104
```

A production pass must include a price/menu version, validity state, and a truthful staff confirmation path.

### Chapter

A chapter is a state machine, not a campaign banner:

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

### Experiment Assignment

A visitor must stay in one experiment variant during the experiment. Success is measured through downstream behaviour and guardrails, not click-through rate alone.

## Metrics hierarchy

### Transaction

- time to product;
- route or order intent;
- confirmed purchase;
- average order value;
- gross margin.

### Choice quality

- Smart Choice completion;
- recommendation acceptance;
- later correction or regret;
- repeat of the recommended product.

### Desire

- teaser engagement;
- return before reveal;
- participation;
- anticipation opt-in;
- Moment Pass creation.

### Relationship

- repeat visit;
- chapter completion;
- next-chapter intent;
- shared moment;
- invitation of another person.

### Guardrails

- immediate exits;
- path abandonment;
- notification opt-out;
- repeated rejection;
- complaints;
- time required to reach the ordinary menu.

## Documents

- [`design-journey.md`](./design-journey.md) — how the concept evolved and why.
- [`universal-system.md`](./universal-system.md) — the product-agnostic framework reusable beyond Roby’s.
- [`backlog.md`](./backlog.md) — prioritised implementation, research, and operational backlog.
- [`../robys-chapter-01-mvp.md`](../robys-chapter-01-mvp.md) — the current Chapter 01 prototype and release boundaries.

## Current implementation boundary

The prototype in PR #296 is intentionally closed and unlinked from the production homepage. It validates the chapter state graph and truth boundaries, but it does not yet provide:

- a real public vote;
- real notification subscriptions;
- inventory or POS integration;
- confirmed event hours;
- reservation or payment;
- staff confirmation;
- production analytics;
- a homepage Audience Router.

Do not interpret the prototype as a production launch commitment.

## North-star question

> How many people wanted to return before they had even left Roby’s?

This is not the only business metric, but it captures the intended difference between a menu and a living relationship system.
