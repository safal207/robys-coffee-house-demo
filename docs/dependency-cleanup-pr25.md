# Runtime dependency cleanup — PR #25

Initial report generated from the current repository before deletion.

## Roots

- `index.html`
- `refresh.html`
- `src/app.ts`

## Counts before cleanup

- Runtime CSS/JS candidates: **44**
- Reachable runtime files: **15**
- Suspicious runtime files: **0**
- Proven orphan runtime files: **29**
  - CSS: **20**
  - JavaScript: **9**

## Reachable runtime

- `analytics.js`
- `app.js`
- `catalog-stable.css`
- `conversion.css`
- `conversion.js`
- `final-qa.css`
- `gallery-clean.css`
- `map-live.css`
- `mobile.css`
- `products-extra.js`
- `qa.js`
- `shop.css`
- `shop.js`
- `styles.css`
- `sw.js`

## Proven orphan CSS

- `amenities.css`
- `brand-cup.css`
- `comfort-three-fix.css`
- `compact-layout.css`
- `critical.css`
- `full.css`
- `gallery.css`
- `hero-mobile-fix.css`
- `logo-video-tune.css`
- `map.css`
- `mobile-polish.css`
- `napkin-style.css`
- `optimizations.css`
- `premium.css`
- `responsive.css`
- `reviews.css`
- `ruby-theme.css`
- `site-v10.css`
- `site.css`
- `world-class.css`

## Proven orphan JavaScript

- `amenities.js`
- `compact-layout.js`
- `gallery.js`
- `map.js`
- `premium.js`
- `reviews.js`
- `script.js`
- `shop-stable.js`
- `src/i18n.js`

## Dynamic and unresolved paths

No template-string CSS/JS path matched a runtime file, so there are no suspicious runtime candidates.

The initial report contained one unresolved source reference: `src/app.ts → ./sw.js`. This is not a broken runtime link: esbuild emits `app.js` at repository root, so `./sw.js` resolves from the generated bundle to root `sw.js`, which is reachable and retained.

Only the 29 files listed above are removed in this PR. Media assets and non-runtime source files are outside this cleanup scope.
