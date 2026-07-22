# Roby's logo release checklist

Use with `evaluate-world-class-logo` and the audit in `robys-world-class-logo-audit.md`.

## Required before identity release

- [ ] Primary, medium, compact, mark-only, favicon and maskable variants have documented use boundaries.
- [ ] No production logo asset contains `<text>` or depends on installed fonts.
- [ ] Favicon remains recognizable at 16 and 32 CSS px.
- [ ] PWA maskable artwork remains inside the safe zone under circle, squircle and rounded-square crops.
- [ ] Apple touch icon is linked and visually matches the same family.
- [ ] Header lockup contains no detail below the documented minimum rendered stroke or text size.
- [ ] Black, white/reverse and single-ink variants exist.
- [ ] Approved red, ink and paper values are defined once and checked across SVG, CSS and PWA assets.
- [ ] Compact and mark-only variants preserve clear space on cream, white and dark-brown backgrounds.
- [ ] Storefront, cup, napkin, stamp and embroidery mockups have been reviewed at realistic size.
- [ ] Turkish, English and Russian interface surroundings do not collide with or visually overpower the logo.
- [ ] SVG viewBox, aspect ratio, cache revision, integrity manifest and Service Worker delivery are current.
- [ ] Category-wall and one-second recall evidence is recorded.
- [ ] Confusing similarity and trademark availability have been reviewed by a qualified professional before legal claims.

Any failed P0 or P1 item blocks a “world-class / release-ready” verdict.
