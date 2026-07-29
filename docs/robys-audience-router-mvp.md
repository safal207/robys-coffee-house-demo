# Roby’s Audience Router MVP

Status: stacked prototype over PR #296  
Epic: #297  
Relationship layer: explicit intent routing

## Purpose

Add one compact decision block to the existing homepage without replacing its hero, menu, brand, or navigation.

The Router answers one question:

> Which valid Roby’s path is most useful to this person right now?

It does not attempt to identify the person, calculate hidden psychological traits, or maximise conversion at any cost.

## Four explicit routes

```text
I know what I want
→ menu.html

I am here for the first time
→ discover.html

Help me choose
→ smart-choice/

Show me something new
→ chapter-01.html
```

The fourth route depends on the Chapter 01 files in draft PR #296. This is why the implementation is delivered as a stacked PR rather than duplicating the Chapter code.

## Placement and design

The Router is inserted immediately after the existing homepage hero.

It deliberately reuses the current homepage language:

- existing `container` width;
- `--ruby`, `--cream`, `--paper`, `--ink`, and `--muted` tokens;
- Oswald display typography and Montserrat body typography;
- existing radius, border, and shadow character;
- familiar red accent;
- one-column mobile cards and visible keyboard focus.

The Chapter route uses a small red-ring marker, but the Router does not alter the approved logo or make the homepage look like a separate microsite.

## State model

Storage key:

`robys-audience-router-v1`

Schema:

```json
{
  "schemaVersion": 1,
  "preferredRoute": "smart",
  "selectedAt": "2026-07-29T00:00:00.000Z",
  "source": "explicit-home-router"
}
```

The state means only:

> This person explicitly selected this route on this device.

It does not mean that the route is permanently correct, that the person has been classified, or that the homepage may redirect automatically.

## Return behaviour

When a saved preference exists:

- the previous card receives a visible border and “last choice” badge;
- a short sentence explains that another route may be chosen;
- a visible reset button removes the preference;
- card order does not change;
- no route opens automatically.

## Events

Local audit events use:

`robys-audience-router-events-v1`

Core events:

```text
route_offered
route_accepted
route_preference_reset
```

`route_offered` is suppressed after the first offer in the same browser session.

`route_accepted` records:

- route identifier;
- destination;
- explicit intent source;
- current page and language.

The module also emits `robys:audience-router` browser events and passes actions into the existing `window.robysAnalytics` interface when it is available.

## Privacy boundary

The MVP stores no:

- name;
- phone number;
- account identifier;
- precise location;
- inferred income;
- demographic profile;
- cross-site advertising identifier.

The Router does not call a network endpoint. Local storage failure must not block access to any route.

## Freedom contract

```text
Router proposes
≠ Router decides

Restored preference
≠ automatic redirect

Past route
≠ permanent classification
```

Required invariants:

- ordinary menu remains available in the original hero and navigation;
- all four routes remain visible;
- the person can select a different route immediately;
- the person can reset the saved preference;
- no route is reordered or hidden in the MVP;
- no notification permission is requested;
- no external message subscription is created.

## Initial evaluation

The first test should answer:

1. Do visitors understand the difference between the four paths?
2. Does the block help uncertain visitors without slowing fast visitors?
3. Which route is selected by new, returning, and novelty-seeking guests?
4. Does the Chapter route attract people who are actually ready for a longer experience?
5. Do visitors interpret “last choice” as helpful memory or unwanted tracking?

## Metrics

Primary:

- route offer-to-accept rate;
- selection share by route;
- time from homepage load to accepted route;
- completion rate inside each destination;
- confirmed offline outcome when that capability exists.

Guardrails:

- time to ordinary menu;
- homepage exit rate;
- reset rate;
- immediate back navigation;
- path abandonment;
- qualitative reports of confusion or surveillance.

## Deliberately excluded

- automatic route ranking;
- machine learning;
- purchase-count gating;
- route reordering;
- route hiding;
- account-level personalisation;
- notification subscription;
- real-time availability;
- dynamic pricing;
- staff or POS integration.

## Next iteration criteria

Do not add automatic recommendations until:

- route meanings are understood in user tests;
- analytics can distinguish accepted routes from real outcomes;
- the ordinary-menu guardrail remains healthy;
- local preference is perceived as useful;
- rejection and reset behaviour is measured.
