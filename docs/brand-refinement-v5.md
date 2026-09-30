# Screen refinement v5 — smooth letters and compact language control

## Approved scope

The owner approved a smoother Roby's wordmark and a TR / EN / RU control whose border hugs its three buttons. This is an implementation of that visual direction, not a pixel-identical vectorization of the AI concept board.

- Only black R, B, Y and S outlines are refined. The red Organic O, apostrophe, viewBoxes, colors and full lockup geometry are unchanged.
- The original `*-master-v1.svg` assets and the v4 candidate fixtures remain byte-for-byte unchanged. Three `*-smooth-v5.svg` files are additive.
- `brand-refinement-v5.css` follows the original stylesheet on index, menu and discover. The active assets are explicitly preloaded with revision `20261001-smooth-v5`.
- The language control shrink-wraps its contents. Buttons remain at least 44 by 44 CSS pixels. No language storage, menu, cart, or pairing logic is changed.

## Evidence and boundary

`node scripts/verify-brand-refinement-v5.mjs` locks the new letter paths to a SHA-256 value, compares all preserved geometry against the original assets, and checks active page references. The original brand validator now invokes this additional contract; its v4 baseline checks remain intact.

`node scripts/test-brand-refinement-v5.mjs` exercises the actual pages, all three language buttons and ten widths (320–1200 pixels) in Chromium and saves header screenshots plus results. The brand workflow runs it and uploads the evidence. A source change or queued workflow is not a PASS; use results from the exact PR head.

Local full `npm run check` requires the locked dependencies. An offline dependency-cache miss is not recorded as a pass. Local layout-only renderings are not end-to-end browser evidence.

## Rollback

Revert this change as a unit. Removing the three `brand-refinement-v5.css` links and restoring the original three preload URLs returns the visible identity to v4; original SVGs and `brand-photo-logo.css` were never overwritten. Revert corresponding verifier and workflow changes together, then regenerate `integrity-manifest.json` and run the normal checks. Do not roll back unrelated menu or cart work.
