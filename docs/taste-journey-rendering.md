# Taste Journey rendering contract

## Decision

Taste Journey renders one complete pairing poster at a time. The poster itself is intentionally non-interactive.

Users move to another recommendation through the existing **Başka bir eşleşme** button. The former nested carousel behavior—arrow-key navigation, swipe gestures, internal autoplay, and carousel ARIA roles—was removed deliberately together with the split-screen card composition.

## Rationale

- one recommendation has one visual source of truth;
- no hidden rotation competes with the recommendation button;
- the artwork is displayed without CSS recoloring or cropping;
- keyboard users retain the normal button interaction through Tab plus Enter or Space;
- reduced motion and screen-reader behavior stay predictable.

## Progressive fallback

JavaScript loads the context-aware poster. When JavaScript is unavailable, `discover.html` presents a visible `<noscript>` message and a direct link to the full menu. The fallback must not embed a second base64 poster because that would duplicate the largest payload in the page HTML.

## Asset contract

Final poster sources live only in `src/pairings-data/final/`. `TASTE-POSTER-001` verifies the exact five-file set, valid and complete WebP data, square dimensions of at least 280 px, unique image contents, non-cropping CSS, absence of the legacy split-screen renderer, and the no-script menu fallback.
