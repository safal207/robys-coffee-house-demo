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

## Explicit Living Context preview

Independent mood, music-inspired palette and menu-card presentation.
Uses the same four layout codes as BiteOS robysSocialLook.ts at
8e81e52626cc066ef803de0cb1b6990ef147ad3e. Existing mood codes map to
BiteOS adaptive moods; this is code alignment, not a runtime connection.
Music preference is a manual editorial choice and may override the mood
pairing. No device app detection, listening history, provider data, or
external recommendations. All suggestions use existing catalog IDs and
are not verified stock or personalized prices. Four presentations affect
only the local Sounds shelf; ordinary full menu stays unchanged.
Reset restores initial choices. No persistence, provider connection,
identity or network submission. Automated model tests cover combinations,
unknown fields and missing catalog items. Browser QA still required.
