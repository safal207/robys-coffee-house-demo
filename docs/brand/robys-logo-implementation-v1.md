# Roby's identity normalization v1

Source decision: the uploaded Roby's identity sheet and `evaluate-world-class-logo` audit.

## Implemented

- replaced the unrelated font-based favicon/PWA monogram with the approved organic red O;
- split PWA delivery into separate `any` and `maskable` SVG assets;
- introduced `robys-header-master-v1.svg`, a medium header lockup without the micro-tagline;
- kept the full primary lockup for large menu/signage placement and the compact wordmark for mobile;
- published canonical digital identity tokens:
  - red `#E21B23`;
  - ink `#111111`;
  - paper `#F5F5F2`;
- revised Service Worker precache and exact-revision delivery;
- added fail-closed source, manifest, safe-zone and size-matrix checks for 16, 32, 48, 192 and 512 px.

## Evidence boundary

This slice does not claim trademark clearance, consumer recall, storefront-distance readability, physical print durability or revenue impact. Dedicated PNG fallbacks, one-color/reverse masters and physical-production tests remain separate follow-up work.
