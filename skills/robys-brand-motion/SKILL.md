---
name: robys-brand-motion
version: 1.0.0
description: Design and implement branded motion experiences for Roby's Coffee House across Web and Android WebView, including entry/splash, loading, payment, success, and contextual Morning/Day/Night scenes.
---

# Roby's Brand Motion

## Purpose
Create motion that makes Roby's feel like a living premium café brand rather than a website wrapped in an app.

Use this skill when the user asks to:
- create or improve a Roby's splash / entry animation;
- design Morning / Day / Night entry scenes;
- animate loading, payment, order success, pickup-ready, or other state transitions;
- make Web and Android WebView handoff feel native;
- review motion quality, timing, easing, visual continuity, accessibility, or performance;
- turn Roby's brand rules into reusable motion tokens or components.

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
Default visual language unless the active Roby's brandbook says otherwise:
- warm paper-white / cream base;
- graphite / near-black typography;
- restrained muted red accent;
- generous negative space;
- editorial café photography and illustration;
- soft natural light;
- subtle depth;
- no neon glow, excessive glassmorphism, loud 3D, or hyperactive motion.

When an official Roby's brandbook or current design tokens are available, they override these defaults.

## Motion system
Treat motion as a state system, not a decorative video.

Canonical journey:
ENTRY -> LOADING -> READY -> ACTION -> PAYMENT -> SUCCESS / ERROR

Every animation must have:
1. trigger;
2. start state;
3. end state;
4. duration;
5. easing;
6. interruption rule;
7. reduced-motion behavior;
8. readiness / completion signal.

## Entry experience
Preferred first-entry structure:
1. Atmosphere
2. Small visual story
3. Brand reveal
4. Seamless handoff into the product

Avoid:
LOGO -> spinner -> white flash -> app

Preferred:
brand atmosphere -> cup/steam motif -> Roby's reveal -> real UI already ready underneath

### Timing
Cold/first launch:
- target total: 1400–1800 ms
- do not exceed 3000 ms because of decoration
- minimum brand-readability window: ~900 ms

Warm/return launch:
- target total: 500–800 ms

Never replay a long splash on every internal navigation.

## Morning / Day / Night
Morning:
- soft sunrise warmth;
- fresh first-cup feeling;
- slower gentle steam;
- greeting may use "Good morning".

Day:
- brighter, cleaner, slightly quicker;
- urban café rhythm;
- greeting may use "Welcome back".

Night:
- deeper warm background;
- restrained amber/soft lamp mood;
- calmer movement;
- greeting may use "Good evening".

Contextual scenes should share the same motion grammar so they feel like one brand.

## Signature motif
Primary motif: cup + steam + wordmark.

Possible choreography:
- cup appears with subtle scale 0.96 -> 1.00;
- steam rises in 1–3 restrained strokes;
- wordmark reveals only after the scene feels settled;
- final frame should visually connect to the first product screen.

Do not make steam cartoonish unless the approved Roby's illustration style supports it.

## Web implementation
Default implementation order:
1. SVG + CSS/WAAPI for lightweight deterministic motion.
2. GSAP when choreography/timeline complexity justifies it.
3. Lottie for designer-authored vector sequences.
4. Rive for state-machine-driven interactive animation.

Prefer GPU-friendly properties:
- transform
- opacity

Avoid layout-heavy animation of:
- width/height
- top/left
when transforms can achieve the same result.

Respect:
`prefers-reduced-motion`

## Android WebView handoff
Goal: no white flash, no sudden swap, no "website in a shell" feeling.

Preferred flow:
SYSTEM_SPLASH
-> ROBYS_NATIVE_BRAND_FRAME
-> WEBVIEW_LOADING_BEHIND
-> FIRST_MEANINGFUL_WEB_FRAME_CONFIRMED
-> ATOMIC_HANDOFF
-> WEB ENTRY CONTINUES/FINISHES
-> PRODUCT READY

Rules:
- Do not dismiss native shell merely on page-start.
- Dismiss only after the WebView has a confirmed meaningful visual frame.
- Keep native and web backgrounds visually identical during overlap.
- Avoid double-playing the same full animation.
- Use native shell for continuity, web layer for product-level motion.

## Payment motion
Use the same brand grammar as entry.

Suggested states:
PAYMENT_READY
-> PROCESSING
-> SUCCESS

Roby's-specific concept:
- subtle payment/NFC cue;
- coffee level or steam can express progress;
- success resolves into a calm check / completed cup state;
- error should remain calm and recoverable, not aggressive.

Motion must never hide payment truth, amount, error state, or required user action.

## Quality bar
Before accepting motion, verify:

### Brand
- unmistakably Roby's;
- consistent with current brandbook;
- not derivative of Sber or another reference brand.

### UX
- no blocked interaction longer than necessary;
- no white flash;
- no jarring jump between splash and content;
- animation communicates state, not just decoration.

### Performance
- smooth on representative Android devices;
- no obvious dropped frames;
- minimal blocking JS;
- assets compressed and cached;
- graceful slow-network behavior.

### Accessibility
- reduced-motion path exists;
- text remains legible;
- no seizure-risk flashes;
- animation is not the sole carrier of critical information.

### QA
Capture:
- cold start;
- warm start;
- slow network;
- offline / failed load;
- background -> foreground;
- rotation if supported;
- Android back behavior;
- payment success/error if present.

## Review rubric (100)
Brand coherence: 20
Narrative / state clarity: 20
Transition continuity: 20
Performance: 15
Accessibility: 10
WebView handoff quality: 10
Failure / recovery behavior: 5

Any white flash, broken handoff, blocked screen, or hidden critical payment state caps the score at 69.

## Default response pattern
When asked to design a Roby's motion:
1. identify the state transition;
2. state the emotional goal;
3. define the visual story;
4. provide timing/easing;
5. define Web/WebView implementation;
6. define reduced-motion behavior;
7. provide acceptance criteria;
8. if code is requested, implement the smallest production-ready version first.

## Recommended supporting skills / concepts
When available, combine with:
- motion-design principles;
- GSAP timeline implementation;
- web animation quality/performance;
- animation audit / microinteraction review;
- interface polish;
- Rive state machines for interactive motion.

These are supporting references; the Roby's brandbook remains authoritative.
