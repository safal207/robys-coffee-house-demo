# Roby's world-class logo audit

Evaluated artifact: `main@2fcc1de1a44093da399968f9474b30e6213bd793`

Skill: `evaluate-world-class-logo`

## Verdict

**Conditionally ready — 72/100.**

The custom `ROBY'S` wordmark and organic red O form a credible, distinctive foundation. The identity is not yet a world-class system because the favicon/PWA icon uses a different monogram language, brand reds are fragmented, the primary lockup contains micro-tagline detail that cannot survive header sizing, and production variants for one-color, reverse, maskable and physical use are not defined.

## Weighted scorecard

| Dimension | Score |
|---|---:|
| Strategic fit | 12/15 |
| Distinctiveness | 10/15 |
| Memorability | 7/10 |
| Form and negative space | 8/10 |
| Typography / wordmark | 8/10 |
| Responsive scalability | 5/10 |
| Optical quality | 6/8 |
| Identity-system potential | 6/8 |
| Cultural / accessibility resilience | 6/7 |
| Production readiness | 4/7 |
| **Total** | **72/100** |

Confidence: medium-high for repository and digital implementation; low for storefront-distance, physical print, consumer recall and trademark conclusions because no field evidence is present.

## What is already strong

- The main wordmark is built from SVG paths instead of runtime fonts.
- The organic red O gives the name a memorable focal point.
- The apostrophe is explicitly drawn and does not depend on browser typography.
- Primary, compact and mark-only source assets exist.
- The mark SVG has a clean `100 × 100` viewBox.
- The website preserves an accessible brand name while rendering the visual logo as a CSS background.
- Mobile headers switch from the primary lockup to the compact wordmark.

## Findings

| Severity | Finding | Evidence | Consequence | Acceptance criterion |
|---|---|---|---|---|
| P1 | Favicon/PWA identity is a different logo family | `icon.svg` uses font-based R/B characters, a separate tilted oval, frame and slash; `manifest.webmanifest` publishes it as both `any` and `maskable` | Users see a different brand in tabs, installed apps and launchers; SVG text rendering remains font-dependent | Replace with an icon family derived from the approved organic O or compact wordmark; no `<text>` nodes; separate `any` and `maskable` assets; verify 16, 32, 48, 192 and 512 px |
| P1 | Primary lockup is over-detailed for the desktop header | `robys-primary-master-v1.svg` contains `COFFEE HOUSE` and a tiny `FRESH COFFEE POINT` line; CSS renders the full asset at only `286 × 58` | The tagline falls to roughly 6 px height with sub-pixel strokes, becoming visual noise rather than information | Add a medium header lockup without the micro-tagline; reserve the full primary lockup for large menu/signage contexts |
| P1 | Brand color source of truth is fragmented | Logo masters use `#E21B23`; legacy token uses `#d32636`; favicon uses `#b32035`; UI ruby uses `#b84d58` | The identity shifts between logo, interface, PWA and print exports | Publish one approved identity palette with roles; regenerate logo/icon assets and CSS variables from it; automated check rejects unapproved brand reds |
| P1 | No approved one-color and reverse production family | Masters hard-code black + red; no explicit single-ink, white/reverse, stamp or embroidery variant is present | Signage, cups, stamps and low-quality print will be improvised case by case | Add approved black, white/reverse and single-ink variants; test counters and gaps at low-quality print and embroidery simulation |
| P2 | Organic O is memorable in the wordmark but not yet proven ownable alone | Mark is an irregular red ring/cup curve; no category-wall, recall or competitor-similarity evidence exists | It may be remembered as a generic coffee ring when separated from `ROBY'S` | Run a category-wall comparison against local and international café marks plus a one-second verbal-recall test; document confusing similarities; obtain professional trademark review before legal claims |
| P2 | Mobile master mixes identity asset and UI decoration | `robys-mobile-master-v1.svg` bakes a white pill and drop shadow into the SVG and is not the asset used by current responsive CSS | The file cannot cleanly serve print, dark mode or alternate containers and increases variant ambiguity | Keep a pure transparent logo master; implement pill, border and shadow in the consuming UI layer; document whether the old mobile master is deprecated |
| P2 | Tagline/verbal identity is inconsistent | Primary SVG says `FRESH COFFEE POINT`; the brand is `Coffee House`; site schema uses the Turkish promise `İyi kahve. Sakin anlar.` | The identity communicates multiple ungoverned promises | Select one approved verbal hierarchy and define where each phrase may appear; remove non-approved microcopy from logo masters |
| P2 | Icon delivery is incomplete for platform contexts | Only the SVG icon is declared in the manifest; the same file is marked `any maskable`; `apple-touch-icon.png` exists but is not linked from the main document | Cropping and rendering may vary across launchers and iOS | Provide dedicated maskable safe-zone artwork, PNG fallbacks and a linked Apple touch icon; capture real device screenshots |

## World-class benchmark lenses

- **Apple:** one silhouette must survive 16 px without extra framing or type.
- **Nike:** the standalone mark needs instant recognition without the wordmark.
- **Mastercard:** simple geometry should remain consistent across digital, print and physical media.
- **Coca-Cola:** the wordmark and verbal identity should remain governed over time rather than changing by placement.
- **Uniqlo:** multilingual surroundings must not weaken the identity hierarchy.

These are principles, not copying targets.

## Recommended responsive family

1. **Primary large:** `ROBY'S + COFFEE HOUSE`, optional approved tagline only above a documented minimum width.
2. **Medium header:** `ROBY'S + COFFEE HOUSE`, no micro-tagline.
3. **Compact:** `ROBY'S` wordmark.
4. **Mark only:** organic O, after distinctiveness and trademark review.
5. **Favicon:** simplified mark tuned specifically for 16–32 px.
6. **Maskable PWA:** dedicated safe-zone composition, not the favicon reused blindly.
7. **Monochrome:** black and white/reverse masters.
8. **Physical:** single-ink stamp/embroidery master with minimum gap rules.

## Smallest high-value implementation slice

Create one bounded identity-normalization PR that:

- replaces the unrelated `icon.svg` monogram with a path-only icon derived from the approved mark;
- adds separate `any` and `maskable` PWA assets plus Apple touch icon wiring;
- introduces a no-tagline medium header lockup;
- publishes canonical identity color tokens;
- adds screenshot and geometry tests at 16, 32, 48, 192 and 512 px;
- does not redraw the primary wordmark unless those tests prove a source-design defect.

## Evidence boundary

This audit does not prove consumer recall, storefront readability at distance, print durability, trademark availability or commercial impact. Those require physical prototypes, user testing and professional legal clearance.
