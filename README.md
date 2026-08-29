# Roby's Coffee House

A production-oriented, mobile-first web experience for **Roby's Coffee House in Gazipaşa, Antalya**.

**Live site:** <https://safal207.github.io/robys-coffee-house-demo/>

The repository is no longer a one-page mockup. It contains a multilingual storefront, a structured menu, product pairings, discovery journeys, a Smart Choice recommendation flow, PWA support, analytics hooks, accessibility contracts, security checks and an extensive evidence-driven QA pipeline.

## Product surfaces

- `index.html` — multilingual storefront and visit conversion journey
- `menu.html` — menu, prices, categories and pairing offers
- `discover.html` — rotating discovery and taste-journey experience
- `smart-choice/` — recommendation, cart, experiment, decision-trace and revenue-simulation flows
- `instagram-tools.html` — content support tools
- `qa/` — test fixtures, evidence contracts, browser-lab documentation and review artifacts

The customer-facing experience supports **Turkish, English and Russian**, responsive layouts, reduced-motion preferences, keyboard navigation, structured SEO data, installable PWA behavior, offline caching, Google Maps and Instagram entry points.

## Technology

- Semantic HTML and modular CSS
- TypeScript and browser JavaScript
- esbuild for production bundles
- Node.js verification and test scripts
- GitHub Actions quality gates
- Lighthouse performance contracts
- Docker Compose browser lab with Chromium and Firefox

Runtime assets are served as static files. The repository still has a real build step: TypeScript sources are compiled, browser bundles are minified, and asset revision keys are synchronized across HTML and the service worker.

## Local setup

### Requirements

- Node.js 22
- npm
- Python 3 or another static file server
- Docker with Compose only for the optional browser lab

### Install and run

```bash
npm ci --no-audit --no-fund
python3 -m http.server 8080
```

Open `http://localhost:8080`.

Do not rely on `file://` for final verification. Service workers, module loading, routing and several browser security behaviors require an HTTP origin.

## Build

```bash
npm run typecheck
npm run build
```

The build compiles source files such as `src/app.ts` and `src/smart-choice/*.ts`, writes generated browser bundles, and updates revisioned references in HTML and `sw.js`.

Generated JavaScript should not be edited by hand when an equivalent TypeScript source exists.

## Quality gates

### Full repository check

```bash
npm run check
```

This is the broad local gate. It covers type checking, builds, Smart Choice tests, catalog and menu contracts, traceability, review routing, integrity, security-sensitive browser behavior and regression checks.

### Focused checks

```bash
npm run verify:security
npm run verify:performance
npm run verify:integrity
npm run verify:menu-content
npm run verify:smart-choice
npm run test:smart-choice
npm run verify:causal-refactoring
npm run test:causal-refactoring
npm run causal:report
npm run verify:regression
npm run security:audit
```

### Browser lab

```bash
npm run qa:browsers:config
npm run qa:browsers:up
npm run qa:browsers:status
npm run qa:browsers:logs
npm run qa:browsers:down
```

The browser-lab defaults are intended for local QA only. Published ports must remain bound to loopback, image references must remain digest-pinned, and test credentials must never be reused outside the isolated lab.

## Repository rules

1. Treat menu prices, product names, opening hours, location and approved brand assets as owned business data.
2. Change TypeScript sources first, then rebuild generated JavaScript.
3. Keep security-sensitive actions and container images pinned to immutable revisions.
4. Never commit mutable Lighthouse summaries as release evidence; retain exact-run artifacts instead.
5. Do not weaken a failing contract merely to make CI green. Fix the product, test or evidence binding.
6. Preserve Turkish, English and Russian behavior when changing customer-facing copy or navigation.

## Deploy

The site can be deployed from the repository root as static assets. GitHub Pages currently matches the canonical production URL.

For hosts that support response headers, configure security headers at the HTTP layer as well as the document-level CSP. Directives such as `frame-ancestors` cannot be enforced reliably through a `<meta>` tag alone.

After deployment, run the live smoke, integrity and performance checks against the exact published revision.

## Fractal causal refactoring

The repository includes a testable causal-refactoring contract for recurring problems that appear across business truth, customer experience, product code, delivery and team decisions.

The first active pattern is **business-truth drift**: a customer-facing value can exist in the canonical profile before its owner-confirmation state is explicit. The new gate keeps the repository in `demo` publication mode and fails closed if `production` is selected while an owner-critical field remains unconfirmed.

See [`docs/causal-refactoring/README.md`](docs/causal-refactoring/README.md) and run:

```bash
npm run causal:report
```

The registry records hypotheses and controlled risks, not mystical or scientific claims. A mechanism trace explains how a result was produced; it does not by itself prove a customer or revenue effect.

## Business-truth checklist

Before a commercial release, confirm with the café owner:

- opening hours and holiday exceptions
- exact address and map destination
- menu categories, names, availability and prices
- official Instagram, telephone and WhatsApp details
- permission to publish every photograph, video and logo asset
- translations and allergy-related wording
- analytics and consent requirements

## Project status

This repository is an advanced product and QA demonstration, not a finished ordering backend. Customer orders, payments, inventory and personal-data processing must not be implied unless a separately reviewed production service actually provides them.
