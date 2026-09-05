# Roby's Brand and Motion Tokens

These values make Roby's motion work deterministic across agents and implementations.

## Source rule

Values in the **repository-derived** sections below are copied from current approved source on `main`. Do not replace them with approximate colors, fonts, shadows, or easing curves.

If current approved source changes, update this reference in the same change that adopts the new brand value.

## Core color tokens

| Semantic token | Value | Repository source |
| --- | --- | --- |
| `color.brand.red` | `#E21B23` | `brand-photo-logo.css`, `styles.css` |
| `color.brand.wordmarkInk` | `#111111` | `brand-photo-logo.css`, `styles.css` |
| `color.brand.wordmarkPaper` | `#FFFFFF` | `brand-photo-logo.css`, `styles.css` |
| `color.text.ink` | `#2F2725` | `styles.css` |
| `color.surface.dark` | `#241C1B` | `styles.css` |
| `color.surface.cream` | `#F4F1EC` | `styles.css` |
| `color.surface.paper` | `#FFFDF9` | `styles.css` |
| `color.text.muted` | `#756B67` | `styles.css` |
| `color.border.subtle` | `rgba(47,39,37,.14)` | `styles.css` |

Use the core tokens for the global entry shell unless an approved surface-specific design explicitly overrides them.

## Surface and depth tokens

| Semantic token | Value | Repository source |
| --- | --- | --- |
| `shadow.surface` | `0 22px 70px rgba(36,28,27,.14)` | `styles.css` |
| `shadow.brand.mobile` | `0 10px 26px rgba(17,17,17,.16)` | `brand-photo-logo.css` |
| `radius.brand.mobile` | `999px` | `brand-photo-logo.css` |

Do not add a glow around the Roby's identity unless a separately approved design introduces one.

## Typography tokens

| Semantic token | Value | Repository source |
| --- | --- | --- |
| `type.display` | `"Oswald", Arial, sans-serif` | `styles.css` |
| `type.sans` | `"Montserrat", Arial, sans-serif` | `styles.css` |

The Discover surface also uses `Georgia, "Times New Roman", serif` for editorial display copy. Treat that as a surface-specific choice, not a replacement for the global Roby's type tokens.

## Approved identity assets

Use the existing SVG identity rather than reconstructing the wordmark with text.

| Usage | Approved asset |
| --- | --- |
| Compact identity | `src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4` |
| Header identity | `src/brand/robys-header-master-v1.svg?v=20260726-approved-v4` |
| Primary identity | `src/brand/robys-primary-master-v1.svg?v=20260726-approved-v4` |
| Mark | `src/brand/robys-mark-master-v1.svg?v=20260726-approved-v4` |

The query revision is part of the currently approved identity contract. If the asset revision changes, inspect the brand change before updating this table.

## Repository-derived motion primitives

These curves and durations already exist in the shipped Roby's interface.

| Primitive | Value | Existing use |
| --- | --- | --- |
| `motion.curve.expressive` | `cubic-bezier(.16,1,.3,1)` | hero content entrance |
| `motion.curve.tactile` | `cubic-bezier(.2,.7,.2,1)` | buttons and gallery image motion |
| `motion.curve.handoff` | `ease` | language-change handoff |
| `motion.duration.expressive` | `900ms` | hero content entrance |
| `motion.duration.tactile` | `250ms` | button transform |
| `motion.duration.handoff` | `160ms` | language-change opacity/filter |
| `motion.duration.gallery` | `550ms` | gallery image transform |

## Semantic motion mapping for v1.1

The semantic names below intentionally reuse shipped curves instead of introducing visually similar new ones.

| Semantic token | Value | Rationale |
| --- | --- | --- |
| `motion.ease.enter` | `cubic-bezier(.16,1,.3,1)` | maps to shipped expressive entrance |
| `motion.ease.exit` | `cubic-bezier(.2,.7,.2,1)` | maps to shipped tactile curve |
| `motion.ease.ambient` | `cubic-bezier(.2,.7,.2,1)` | restrained reusable ambient motion |
| `motion.ease.success` | `cubic-bezier(.16,1,.3,1)` | positive settle without bounce |
| `motion.ease.handoff` | `ease` | matches existing fast UI handoff |

Do not introduce spring, bounce, elastic, or overshoot easing for the entry identity without an explicit design decision and visual review.

## Entry timing policy

These are Roby's motion-system policy values. They are not claimed to be pre-existing runtime values.

| Semantic token | Value |
| --- | ---: |
| `motion.entry.cold.target` | `1600ms` |
| `motion.entry.cold.min` | `1400ms` |
| `motion.entry.cold.maxTarget` | `1800ms` |
| `motion.entry.warm.target` | `700ms` |
| `motion.entry.warm.min` | `500ms` |
| `motion.entry.warm.maxTarget` | `800ms` |
| `motion.entry.maxDecorativeBlock` | `3000ms` |
| `motion.handoff.fade` | `160ms` |
| `motion.identity.scaleStart` | `0.96` |
| `motion.identity.scaleEnd` | `1.00` |

The `3000ms` value is a failure boundary for decorative blocking, not a target duration. If product readiness takes longer, move into an honest loading or failure state instead of extending the splash.

## Reduced-motion contract

The existing Discover surface collapses transitions and animations under `prefers-reduced-motion: reduce` to `0.01ms` and one iteration.

For Roby's entry motion:

- decorative motion may collapse to `0.01ms`;
- animation iteration count must be `1`;
- readiness gates must still run;
- success and error truth must still appear;
- the native-to-web handoff must still avoid a white flash.

## Discover editorial palette

These tokens exist on the current Discover surface and may be used only when a motion concept intentionally belongs to that editorial surface.

| Semantic token | Value | Repository source |
| --- | --- | --- |
| `discover.color.ink` | `#241C1B` | `discover.css` |
| `discover.color.paper` | `#F6F0E8` | `discover.css` |
| `discover.color.card` | `#FFFAF3` | `discover.css` |
| `discover.color.accent` | `#A9482E` | `discover.css` |
| `discover.color.muted` | `#756A67` | `discover.css` |
| `discover.color.line` | `rgba(36,28,27,.16)` | `discover.css` |

Do not silently mix the Discover accent `#A9482E` with the canonical brand red `#E21B23` in the global splash. Choose the surface deliberately.

## Determinism rule

When a required token is missing:

1. inspect current approved repository source;
2. reuse an existing compatible token when possible;
3. if a new token is necessary, name it semantically and document whether it is source-derived or newly proposed;
4. do not invent an approximate value and present it as canonical Roby's branding.
