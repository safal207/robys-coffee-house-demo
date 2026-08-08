---
name: robys-brand-motion
description: "Design, implement, and review Roby's Coffee House motion across Web and Android WebView. Use this skill for Roby's splash or entry animation, Morning/Day/Night scenes, loading, payment, success or error motion, WebView handoff, motion tokens, easing and timing, reduced-motion behavior, performance, or motion QA."
---

# Roby's Brand Motion

Skill version: 1.1.0.

## Purpose

Create motion that makes Roby's feel like a living premium café brand rather than a website wrapped in an app.

Use this skill when work involves:

- creating or improving a Roby's splash or entry animation;
- designing Morning, Day, or Night entry scenes;
- animating loading, payment, order success, pickup-ready, or error states;
- making Web and Android WebView handoff feel continuous and native;
- reviewing motion quality, timing, easing, visual continuity, accessibility, or performance;
- turning Roby's brand rules into reusable motion tokens or components.

## Authority and source of truth

Before proposing visual or motion values, read the references in this skill and inspect the current repository source when the task changes shipped UI.

Authority order:

1. current approved Roby's brand assets and runtime tokens in the repository;
2. [brand and motion tokens](references/tokens.md);
3. [localization contract](references/localization.md);
4. [motion state machine](references/motion-states.md);
5. this skill's qualitative guidance.

If a reference conflicts with newer approved repository assets, the newer approved repository source wins. Update the reference instead of silently inventing a replacement value.

## Core principle

Do not copy another brand's visual identity. Extract interaction principles only.

Roby's motion should express:

- Warm
- Smooth
- Short
- Tactile
- Premium-simple
- Café/editorial rather than techno/gaming

## Brand direction

Use the exact core palette, typography, approved identity assets, and semantic motion tokens in `references/tokens.md`.

The visual language should favor:

- warm paper and cream surfaces;
- graphite and near-black typography;
- the approved Roby's red accent;
- generous negative space;
- editorial café photography and illustration;
- soft natural light;
- subtle depth;
- restrained rather than hyperactive motion.

Avoid neon glow, excessive glassmorphism, loud 3D, generic fintech styling, or effects that compete with the coffee and brand identity.

## Motion system

Treat motion as a state system, not a decorative video.

Canonical product journey:

`ENTRY -> LOADING -> READY -> ACTION -> PAYMENT -> SUCCESS | ERROR`

Every animation must define:

1. trigger;
2. start state;
3. end state;
4. duration;
5. easing token;
6. interruption rule;
7. reduced-motion behavior;
8. readiness or completion signal;
9. failure and recovery behavior when the transition can fail.

Use `references/motion-states.md` for the canonical entry and payment graphs.

## Entry experience

Preferred first-entry structure:

1. Atmosphere
2. Small visual story
3. Brand reveal
4. Seamless handoff into the product

Avoid this sequence:

`LOGO -> spinner -> white flash -> app`

Prefer this sequence:

`brand atmosphere -> cup/steam motif -> Roby's reveal -> confirmed product frame -> handoff`

### Timing

For cold or first launch:

- target total brand sequence: 1600 ms;
- acceptable target band: 1400–1800 ms;
- decorative motion must never hold the user beyond 3000 ms;
- readiness and error handling are independent from decorative timing.

For warm or return launch:

- target total: 700 ms;
- acceptable target band: 500–800 ms.

Never replay a long splash on every internal navigation.

## Morning, Day, and Night

Morning should feel fresh and calm:

- soft sunrise warmth;
- first-cup energy without urgency;
- gentle steam and natural light;
- localized greeting only when all supported locales are present.

Day should feel brighter and slightly quicker:

- clean café light;
- urban rhythm;
- more direct transition into the product;
- no extra decorative delay when the interface is already ready.

Night should feel deeper and quieter:

- warm low-light atmosphere;
- restrained amber warmth where compatible with approved palette;
- calmer ambient movement;
- no loss of text contrast or payment-state clarity.

All three scenes must share the same motion grammar so they feel like one brand, not three unrelated themes.

## Signature motif

Primary motif: cup + steam + approved Roby's identity.

Possible choreography:

- cup starts at scale `0.96` and settles at `1.00`;
- steam rises in one to three restrained strokes;
- wordmark reveals only after the composition settles;
- final frame visually connects to the first product screen;
- brand assets come from the approved SVG paths listed in `references/tokens.md`.

Do not redraw the Roby's wordmark with text or a substitute font when an approved SVG asset is available.

## Web implementation

Default implementation order:

1. SVG + CSS or Web Animations API for lightweight deterministic motion.
2. GSAP when timeline choreography is complex enough to justify it.
3. Lottie for designer-authored vector sequences.
4. Rive for interactive state-machine-driven motion.

Prefer GPU-friendly properties:

- `transform`;
- `opacity`.

Avoid layout-heavy animation of properties such as `width`, `height`, `top`, and `left` when transforms can express the same result.

Use the semantic easing and duration tokens in `references/tokens.md`; do not choose a new curve merely because it looks close.

Respect `prefers-reduced-motion` and preserve readiness, success, error, and payment truth even when decorative motion is collapsed.

## Android WebView handoff

Goal: no white flash, no sudden swap, and no "website in a shell" feeling.

Preferred flow:

`SYSTEM_SPLASH -> ROBYS_NATIVE_BRAND_FRAME -> WEBVIEW_LOADING_BEHIND -> FIRST_MEANINGFUL_WEB_FRAME_CONFIRMED -> ATOMIC_HANDOFF -> WEB_ENTRY_FINISHES -> READY`

Rules:

- do not dismiss the native shell merely on page-start;
- dismiss only after a meaningful WebView visual frame is confirmed;
- keep native and web backgrounds visually equivalent during overlap;
- avoid double-playing the same full animation;
- use the native shell for continuity and the web layer for product-level motion;
- preserve the existing SSL, navigation, and lifecycle safety boundaries of the Android wrapper.

## Payment motion

Use the same brand grammar as entry.

Canonical payment states:

`PAYMENT_READY -> PROCESSING -> SUCCESS | ERROR -> RECOVERY`

Roby's-specific expression may use:

- a subtle payment or NFC cue;
- coffee level or steam to express non-critical progress;
- a calm completed-cup or check state for success;
- a recoverable, non-aggressive error treatment.

Motion must never hide or delay critical payment truth, amount, error state, confirmation, or required user action.

## Localization

Roby's customer-facing motion supports Turkish, English, and Russian.

Follow `references/localization.md` whenever motion contains text. Do not ship an English-only greeting or hard-code customer copy inside an animation asset when the same text can be supplied by the application's localization layer.

## Quality bar

Before accepting motion, verify all sections below.

### Brand

- unmistakably Roby's;
- uses approved identity assets and deterministic tokens;
- consistent with the current brand source;
- not derivative of Sber or another reference brand.

### UX

- no blocked interaction longer than necessary;
- no white flash;
- no jarring jump between splash and content;
- animation communicates state rather than merely decorating waiting time.

### Performance

- smooth on representative Android devices;
- no obvious dropped frames;
- minimal blocking JavaScript;
- compressed and cacheable assets;
- graceful slow-network behavior;
- no regression caused by eager loading of optional motion assets.

### Accessibility

- reduced-motion path exists;
- text remains legible;
- no seizure-risk flashes;
- animation is not the sole carrier of critical information;
- focus and input remain correct across the handoff.

### QA

Capture or test:

- cold start;
- warm start;
- slow network;
- offline or failed load;
- background to foreground;
- rotation when supported;
- Android Back behavior;
- reduced-motion mode;
- payment success and error when present.

## Review rubric (100)

| Dimension | Points |
| --- | ---: |
| Brand coherence | 20 |
| Narrative and state clarity | 20 |
| Transition continuity | 20 |
| Performance | 15 |
| Accessibility | 10 |
| WebView handoff quality | 10 |
| Failure and recovery behavior | 5 |

Any white flash, broken handoff, blocked screen, unbounded splash, or hidden critical payment state caps the score at 69.

## Default response pattern

When asked to design a Roby's motion:

1. identify the state transition;
2. state the emotional goal;
3. define the visual story;
4. select exact tokens for timing, easing, color, and assets;
5. define Web or WebView implementation;
6. define reduced-motion behavior;
7. define failure and recovery behavior;
8. provide acceptance criteria;
9. when code is requested, implement the smallest production-ready version first.

## Supporting tools and techniques

When available, combine this skill with motion-design principles, GSAP timeline implementation, web-animation performance guidance, animation audits, interface-polish review, and Rive state machines.

Those tools are supporting techniques. The Roby's repository and its approved brand assets remain authoritative.
