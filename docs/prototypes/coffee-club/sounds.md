# Roby's Sounds — local preview

Refs #504 and #502. Stacked on Coffee Club; no live menu edits.
Five editorial moods reuse canonical menu items and map to BiteOS
fresh, study, cozy and friends. This is visual atmosphere only;
genre descriptions are not playlist titles or listening recommendations
from either provider. No real audio, play control, embeds, links, accounts,
OAuth, SDK, listening history, telemetry or new dependencies.
Selection is in memory until reload.

Spotify and Yandex Music remain disabled. Confirm commercial permissions,
region, playlist URL ownership and owner approval before implementing
external links or playback. Venue public performance is a separate license.
No implied partnership. Pairings are editorial, not inventory-verified
or output of the BiteOS advice engine.

Serve the trusted checkout root via local HTTP and open
`docs/prototypes/coffee-club/sounds.html`. Use the Club link to navigate.
Run `npm run test:menu-feed`. Verify all languages, 320/390/1280 widths,
keyboard navigation, contrast, no outbound requests and no public
publication before release. Browser acceptance remains pending.
