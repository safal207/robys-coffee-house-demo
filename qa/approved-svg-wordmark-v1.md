# Approved Roby's SVG wordmark v1

## Source of truth

The owner-provided takeaway-cup photograph and the subsequently approved identity boards define the intended visual character.

## Approved assets

- `src/brand/robys-primary-master-v1.svg` — full horizontal wordmark and tagline;
- `src/brand/robys-compact-master-v1.svg` — compact `ROBY'S` wordmark;
- `src/brand/robys-mobile-master-v1.svg` — contained mobile pill lockup;
- `src/brand/robys-mark-master-v1.svg` — standalone organic red `O`.

## Rendering boundary

The visible letterforms are SVG paths. They must not be reconstructed from browser fonts, CSS pseudo-element text, horizontal scaling, or device-specific font fallback.

Existing semantic brand text remains available to assistive technology while the approved SVG assets provide the visual rendering.

## Acceptance criteria

1. Desktop Home and Discover use the primary horizontal lockup without clipping.
2. Mobile Home and Discover use the compact lockup and remain fully contained at 390, 360 and 320 px.
3. Menu uses the primary lockup and the standalone organic mark where appropriate.
4. The red `O`, red apostrophe and black custom letterforms remain optically aligned.
5. Service-worker precache and exact-revision matching include all four master assets.
6. The result is independent of installed fonts and stable across Chromium and WebKit.

## Review status

Approved as the v1 asset direction. Merge authority remains separate and requires all exact-head repository gates to pass.
