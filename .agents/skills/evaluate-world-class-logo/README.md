# `evaluate-world-class-logo`

Repository-local skill for rigorous logo and identity-system evaluation.

## Recommended Robis sequence

```text
audit-website-design
→ evaluate-world-class-logo
→ test-responsive-design
→ verify-design-findings
```

## Typical invocation

```text
Use evaluate-world-class-logo to audit the Roby's primary, compact and mark-only logo variants at the current exact head. Test favicon, mobile header, storefront, cup, monochrome, reverse and offline-delivery contexts. Separate identity-design findings from SVG, CSS and cache implementation defects.
```

## Scoring formula

For each dimension, assign a rating from 0 to 5.

```text
weighted points = (rating / 5) × dimension weight
```

The total is capped at 100. Fatal P0 failures override the numeric score and block a release recommendation.

## Applied audit

- [Roby's world-class logo audit](../../../docs/brand/robys-world-class-logo-audit.md)
- [Roby's logo release checklist](../../../docs/brand/robys-logo-release-checklist.md)
