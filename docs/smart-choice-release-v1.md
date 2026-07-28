# Roby’s Smart Choice — Release v1 candidate

Status: **release candidate**  
Integration PR: **#288**  
Integrated product commit: `80ea75e752c2cd7d5ca62a9de36346c7ee635834`

## Included

- typed catalog with confirmed-price and availability boundaries;
- deterministic recommendation engine with hard constraints before scoring;
- five-question TR/EN/RU guided choice flow;
- top, economical, and premium recommendation paths;
- cart, bounded upgrades, one optional bump, and honest WhatsApp draft handoff;
- privacy-safe local analytics and versioned Decision Trace;
- controlled experiment and financial guardrails;
- localization, accessibility, mobile, offline, security, and generated-asset release gates;
- owner-only deterministic revenue scenario simulator.

## Integration reconciliation

The release preserves the owner-approved Roby’s identity v4 and synchronizes:

- `brand-photo-logo.css` and all four approved SVG masters at `20260726-approved-v4`;
- exact-revision service-worker caching;
- landing and menu PWA registration at `platform-install-20260727-1`;
- generated HTML and integrity-manifest evidence.

## Verified boundary

The integration workflow performed a real three-way merge against current `main`, rebuilt generated assets, regenerated the integrity manifest, and completed `npm run check` before sealing the product commit.

Smart Choice does not submit a POS order, take payment, claim realized revenue, or treat scenario ranges as forecasts. Public pilot activation remains an explicit owner decision after live visual inspection and catalog confirmation.
