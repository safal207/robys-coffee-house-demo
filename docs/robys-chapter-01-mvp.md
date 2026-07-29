# Roby's Chapter 01 MVP

## Purpose

This branch contains a closed, unlinked prototype of the first Roby's story chapter:

### Chapter 01 — A Cool Summer Evening / Летний вечер прохлады / Serin Bir Yaz Akşamı

The prototype tests whether a visitor can move from curiosity to emotional participation, anticipation, psychological ownership, a simulated visit and interest in the next chapter.

It does **not** create an order, payment, reservation, real vote, push subscription, WhatsApp subscription or Telegram subscription.

## Preview route

`chapter-01.html`

The page is intentionally not linked from the production home page. It also carries `noindex,nofollow`.

## State graph

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

Every state can be inspected with the fixed prototype controls at the bottom of the page.

## Implemented

- master SVG logo rather than a CSS reconstruction;
- Russian, Turkish and English copy;
- first-sign teaser interaction;
- four emotional-entry choices;
- two-option vote without invented public percentages;
- local-only continuation-channel preference;
- waiting and anticipation scene;
- honest reveal with the current 370 ₺ menu-total explanation;
- Moment Pass with a locally generated code;
- Web Share / clipboard fallback;
- Google Maps route action;
- barista-display mode;
- simulated visit confirmation;
- memory and reaction state;
- post-credit next-chapter hook;
- local persistence through `localStorage`;
- local audit event queue and `robys:chapter-event` browser events;
- reduced-motion support;
- keyboard-operable native controls and visible focus treatment.

## Local state

State key:

`robys-chapter-01-state-v1`

Audit events key:

`robys-chapter-01-events-v1`

Development helpers:

```js
window.robysChapter01.getState();
window.robysChapter01.getEvents();
window.robysChapter01.setScene("reveal");
window.robysChapter01.reset();
```

## Analytics event graph

The prototype records events such as:

```text
chapter_prototype_loaded
chapter_first_sign_opened
chapter_mood_selected
chapter_vote_submitted
chapter_channel_selected
chapter_result_optin_saved
chapter_reveal_viewed
moment_pass_created
moment_pass_shared
moment_pass_route_opened
moment_pass_barista_opened
chapter_visit_simulated
chapter_reaction_recorded
chapter_post_credit_viewed
next_chapter_interest_saved
```

Events are local evidence only. No network analytics endpoint is called.

## Truth contracts

The experience must not be promoted to production until these values have authoritative owners:

- actual launch date and opening hours;
- actual product availability;
- actual number of available sets, when displayed;
- current menu prices and menu version;
- whether the pairing has a real discount;
- barista procedure;
- staff confirmation mechanism;
- QR destination;
- Telegram / WhatsApp / Web Push consent and delivery flows;
- data-retention and privacy rules;
- production analytics destination.

## Release invariants

```text
site copy
= push copy
= Telegram copy
= physical product
= price at the cafe
= availability
= barista instructions
= Moment Pass
```

The chapter remains `DRAFT` if any equality cannot be demonstrated.

## Manual review checklist

### Teaser

- The regular menu remains available.
- Opening the first sign persists after reload.
- Repeated clicks do not create duplicate visual state.
- No browser notification permission is requested on arrival.

### Mood

- Exactly one mood is selected at a time.
- The continuation button stays disabled before selection.
- The response changes with the selected mood and language.

### Vote

- Exactly one option is selected at a time.
- No fake vote totals or percentages are displayed.
- A visitor can choose no subscription.
- The selected channel is described as local-only in the prototype.

### Reveal

- The visible total is 370 ₺.
- The UI explicitly says it is the sum of two menu items, not a discount.
- No unsupported stock claim is shown.

### Moment Pass

- The code persists after reload.
- Sharing and routing do not create an order.
- The pass clearly identifies itself as a prototype.
- The barista screen uses the same code as the pass.

### Completion

- A completed state cannot be interpreted as a real purchase in the prototype.
- The reaction is optional.
- The post-credit screen offers continuation without forcing subscription.

### Accessibility and resilience

- All native controls are reachable with a keyboard.
- Focus remains visible.
- Content remains readable at 320 px width.
- Reduced-motion preference removes decorative movement.
- Local-storage failure does not prevent the experience from running.

## Deliberately excluded from this PR

- production-home-page entry point;
- real-time inventory;
- POS integration;
- actual QR generation;
- staff dashboard;
- real push registration;
- Telegram bot;
- WhatsApp automation;
- real public voting backend;
- discounts or scarcity claims;
- customer-facing deployment.

## Recommended next validation

1. Run a live, moderated test with five people who have not seen the concept.
2. Ask what they think will happen before every click.
3. Measure teaser-to-mood, mood-to-vote and reveal-to-pass completion.
4. Ask whether the experience felt warm, childish, manipulative, premium or confusing.
5. Show the pass to a real barista and test whether the offline handoff is understandable in under five seconds.
6. Only after the handoff succeeds, design the real consent and notification channels.
