---
name: evaluate-world-class-logo
description: Evaluate a logo and identity system against world-class design principles using evidence, responsive tests, optical analysis, strategic fit, production constraints, and independent red-team verification. Use for logo audits, redesign briefs, brand marks, wordmarks, favicons, signage, packaging, social avatars, and identity-system reviews.
---

# Evaluate World-Class Logo

## Purpose

Judge whether a logo can function as a distinctive, durable and production-ready identity system—not whether it is merely attractive.

Use this skill when reviewing:

- symbols, monograms, wordmarks and combination marks;
- responsive logo families and app icons;
- café signs, cups, menus, packaging and merchandise;
- favicons, social avatars, map cards and small UI placements;
- proposed redesigns, SVG masters and implementation changes.

Return findings in the user's language. Keep technical identifiers, selectors and file paths exact.

## Core rule

Never call a logo “world-class” because it resembles a famous brand or because the reviewer likes the style.

A strong verdict requires evidence that the identity is:

1. strategically appropriate;
2. distinctive within its competitive category;
3. recognizable after reduction and brief exposure;
4. optically balanced rather than only geometrically aligned;
5. usable across physical and digital contexts;
6. technically reproducible;
7. culturally and legally low-risk;
8. expandable into a coherent design system.

## Reference lenses

Use famous identities only as analytical lenses, never as templates to imitate:

- **Nike lens:** movement, silhouette and instant recognition;
- **Apple lens:** reduction, proportion and small-size recognition;
- **FedEx lens:** meaningful negative space without gimmick dependence;
- **IBM lens:** repeatable construction and system discipline;
- **Coca-Cola lens:** ownable typography and long-term continuity;
- **Mastercard lens:** simple geometry that survives many media;
- **Chanel lens:** symmetry, monogram discipline and luxury restraint;
- **Uniqlo lens:** grid strength and multilingual identity behavior;
- **Olympic-rings lens:** universal reproduction and multi-context endurance;
- **Airbnb lens:** a proprietary symbol that can become a community device.

Do not award points for visual similarity to these brands. Penalize imitation, category clichés and borrowed distinctiveness.

## Required inputs

Collect the strongest available evidence:

- exact logo asset or repository path;
- current SVG/PNG dimensions and viewBox;
- wordmark, symbol and responsive variants;
- light, dark and one-color versions;
- screenshots of real placements;
- target audience, market, promise and price position;
- main competitors or category conventions;
- usage contexts: storefront, cup, menu, favicon, social avatar, app/PWA, map and print;
- languages and writing systems that appear near the mark.

If evidence is missing, state the limitation. Do not invent consumer research, trademark clearance or conversion impact.

## Evaluation workflow

### 1. Freeze the evaluated artifact

Record:

- exact branch or commit when reviewing a repository;
- exact asset path and blob/hash when possible;
- which variant is being judged;
- whether a screenshot shows the asset itself or a faulty implementation.

Separate these failure classes:

- **identity-design defect:** the source mark is weak;
- **asset defect:** wrong crop, malformed path, poor export or missing variant;
- **implementation defect:** CSS distortion, bad sizing, clipping, contrast or caching;
- **system defect:** variants exist but are inconsistent or undocumented.

Never redesign the source logo to solve a CSS-only failure.

### 2. Strategic fit

Evaluate whether the identity expresses the intended position without relying on accompanying copy.

Check:

- category recognition without becoming generic;
- fit with audience, geography and price tier;
- emotional tone: energetic, calm, premium, local, technical, playful, etc.;
- compatibility with the brand name and verbal identity;
- whether the mark can remain relevant if products, locations or channels expand.

Reject unsupported claims such as “this will increase revenue.” State the measurable hypothesis instead.

### 3. Distinctiveness and memory

Run these conceptual tests:

- **silhouette test:** is the outer form identifiable without internal detail?
- **one-second test:** what remains after a brief look?
- **blur test:** does the mark preserve a unique mass and rhythm when defocused?
- **partial-view test:** can a cropped fragment still feel ownable?
- **category-wall test:** would it disappear among ten competitors?
- **verbal recall test:** can a viewer describe it in one short phrase?

Distinguish simplicity from genericness. A simple mark with no ownable decision is not strong.

### 4. Form and optical construction

Inspect:

- balance of positive and negative space;
- optical centering, not just mathematical centering;
- curve tension, corner quality and tangent continuity;
- stroke and counter consistency;
- overshoots on circular and curved forms;
- internal spacing at small sizes;
- visual weight between symbol and wordmark;
- accidental shapes, visual noise and fragile micro-details;
- whether asymmetry is intentional and controlled.

Zoomed-in path perfection is secondary to how the mark looks at real size.

### 5. Typography and wordmark

Check:

- letterform ownership versus unmodified stock typography;
- kerning pairs, apostrophes, punctuation and diacritics;
- spacing rhythm across the full wordmark;
- alignment and weight relationship with the symbol;
- legibility in uppercase, small caps or condensed constructions;
- behavior in Turkish, English, Russian or other neighboring scripts;
- whether custom letters remain readable before becoming decorative.

Flag CSS-stretched or transform-synthesized wordmarks as production risk unless explicitly approved and tested.

### 6. Responsive identity tests

A world-class mark is a family, not one frozen lockup.

Test or specify variants for:

- 16 px favicon;
- 24–32 px UI mark;
- 44–64 px app/social avatar;
- mobile header;
- desktop header;
- horizontal wordmark;
- stacked lockup;
- symbol-only usage;
- large storefront sign;
- cup, stamp, embroidery and single-ink print.

At every size check:

- recognition;
- legibility;
- counter survival;
- clear space;
- edge clipping;
- visual centering;
- contrast on light and dark backgrounds.

Do not use a large-format master unchanged at favicon size when a simplified responsive variant is required.

### 7. Color and contrast

Evaluate the identity first in black and white. Color must strengthen an already viable form.

Check:

- one-color reproduction;
- reverse/knockout version;
- grayscale differentiation;
- light/dark surfaces;
- common print limitations;
- color-blind ambiguity where color carries meaning;
- consistency of brand colors across SVG, CSS and print specifications.

Do not use ordinary text-contrast rules mechanically for a decorative logo, but ensure nearby functional text and controls remain accessible.

### 8. Production and implementation

For SVG and repository assets verify:

- correct viewBox and no accidental whitespace;
- paths render without external fonts;
- no raster image hidden inside the master unless intentional;
- safe IDs, masks, clipping paths and filters;
- predictable currentColor or explicit-color behavior;
- no CSS distortion of aspect ratio;
- correct cache revision when public bytes change;
- optimized but editable master source;
- accessible text alternative in implementation;
- integrity, build and visual-baseline contracts remain current.

A green screenshot is stability evidence, not proof of logo quality.

### 9. Identity-system expansion

Assess whether the logo can generate a broader system:

- patterns, frames, crops and motion;
- menu/category icons;
- packaging hierarchy;
- photography treatment;
- environmental graphics;
- social templates;
- sub-brand or location architecture.

The system should inherit recognizable principles without stamping the full logo everywhere.

### 10. Cultural, legal and reputational red team

Check for:

- unintended symbols, gestures, letters or political/religious readings;
- confusing similarity to category leaders or local competitors;
- culturally awkward abbreviations or forms;
- AI-generated artifacts or near-copies;
- claims of trademark safety without a professional clearance search.

State “requires trademark review” rather than presenting legal clearance as complete.

## Mandatory stress-test matrix

Use all applicable tests:

| Test | Pass condition |
|---|---|
| 16 px favicon | Distinct silhouette; no collapsed counters |
| 32 px UI | Recognizable without zoom |
| 44–64 px avatar | Optically centered; safe circular crop |
| One color | Meaning survives without gradients |
| Reverse | Works on dark field without thinning |
| Blur/squint | Unique mass remains visible |
| Grayscale | Hierarchy does not depend only on hue |
| Low-quality print | Essential shapes survive gain and bleed |
| Embroidery/stamp | No fragile paths or tiny gaps |
| Storefront distance | Name or symbol reads at expected distance |
| Multilingual context | Neighboring scripts do not create imbalance |
| Motion | Animation reinforces the identity instead of hiding weakness |

## Scoring model

Score 0–5 per dimension, then apply the weight.

| Dimension | Weight |
|---|---:|
| Strategic fit | 15 |
| Distinctiveness | 15 |
| Memorability | 10 |
| Form and negative space | 10 |
| Typography/wordmark | 10 |
| Responsive scalability | 10 |
| Optical quality | 8 |
| Identity-system potential | 8 |
| Cultural/accessibility resilience | 7 |
| Production readiness | 7 |
| **Total** | **100** |

Interpretation:

- **90–100:** exceptional system; still requires real-world validation;
- **80–89:** strong and professional; bounded refinements remain;
- **70–79:** viable but not yet distinctive or robust enough;
- **55–69:** major redesign or system work required;
- **below 55:** identity is unreliable in core contexts.

Do not let a high average hide a fatal failure. A logo that is unreadable, legally risky, culturally harmful or unusable at required sizes cannot receive a release recommendation.

## Severity model

- **P0 — release blocker:** harmful/confusing symbol, severe legal-similarity risk, unusable primary mark, missing source asset, or identity failure in the core business context.
- **P1 — major:** generic category fit, unreadable wordmark, failed mobile/signage variant, inconsistent masters, broken reproduction or inaccessible implementation.
- **P2 — material polish:** kerning, optical balance, responsive clear space, weak secondary variant, color or crop inconsistencies.
- **P3 — refinement:** minor geometry cleanup or optional system extension with no current user harm.

## Evidence rules

Every finding must include:

- exact observed evidence;
- affected context and size;
- why it matters to recognition, trust or production;
- confidence level;
- proposed acceptance test.

Reject findings that are only:

- “looks outdated”;
- “make it more premium”;
- “use a modern font”;
- “simplify it”;
- “famous brands do this.”

Translate taste into a testable design property.

## Required output

Produce this structure:

1. **Verdict** — one paragraph; release-ready, conditionally ready or not ready.
2. **Scorecard** — weighted 100-point result with confidence.
3. **Identity diagnosis** — what the logo is trying to communicate and whether it succeeds.
4. **World-class benchmark** — 3–5 relevant reference lenses and the principle learned from each; no copying proposal.
5. **Stress-test results** — sizes, monochrome, crop, signage and production contexts.
6. **Findings table** — severity, evidence, consequence, correction and acceptance criterion.
7. **Responsive logo family** — required variants and usage boundaries.
8. **Implementation findings** — SVG, CSS, caching, accessibility and source-of-truth issues.
9. **Red-team challenges** — alternative explanations and rejected false positives.
10. **Next bounded action** — the smallest high-value improvement slice.
11. **Evidence boundary** — what remains untested: consumer recall, field signage, trademark clearance, sales or conversion.

## Robis-specific application

When used for Roby's/Robis, always inspect:

- primary wordmark, compact wordmark and standalone red ring/mark;
- apostrophe and letter spacing in `ROBY'S`;
- favicon and PWA icon recognition;
- mobile header below 390 px;
- cream, white and dark-brown backgrounds;
- café storefront distance and cup/napkin reproduction;
- Turkish, English and Russian interface surroundings;
- whether the red circular gesture is ownable rather than a generic coffee-ring cliché;
- SVG source consistency, CSS aspect ratio, cache revision and Service Worker delivery.

Run this skill before `verify-design-findings`. For a complete Robis review, use:

`audit-website-design → evaluate-world-class-logo → test-responsive-design → verify-design-findings`
