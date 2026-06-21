# Runtime dependency cleanup — PR #25

Before cleanup: 44 runtime CSS/JS candidates, 15 reachable, 29 proven orphans (20 CSS and 9 JavaScript), 0 suspicious runtime files.

After cleanup: 15 runtime CSS/JS candidates, 15 reachable, 0 proven orphans, 0 suspicious runtime files.

The retained runtime files are:

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

The initial source-level report also showed `src/app.ts -> ./sw.js` as unresolved because the source file lives under `src/`. This is not a runtime break: esbuild emits `app.js` at repository root, where `./sw.js` correctly resolves to root `sw.js`; the generated bundle edge is present.

The full removed-file list is available in the pull request diff and the first dependency-graph artifact.
