# Reyhan handoff: minimal menu-first patch (2026-11-13)

## Scope
- Homepage primary action is the existing multilingual photo menu, not a checkout flow; Smart Choice stays available as a secondary action.
- Seasonal Halloween badge markup removed from the homepage and menu.
- Google review reading and writing links target the public Roby's Coffee House place ID: `ChIJpdkfSnH13BQRAEJUSGpYxNg`. Review URLs are candidates only: independently verify on Android Chrome, iOS Safari, Firefox, and a signed-in Google account before publishing.
- Route links now include `destination_place_id`; the decorative map's search query names the café instead of only the street.
- Catalog products, prices, photos, images, account rights, and any cashier/owner dashboard remain untouched.

## Human verification and owner sign-off required
1. Reyhan: confirm this Place ID and exact address: Pazarcı mah. Uğur Mumcu cad. Deniz Apartmanı 95/1 AA, Gazipaşa, Antalya. Source: publicly indexed business listing; not owner-signed.
2. Reyhan: provide the official review-sharing URL from Google Business Profile → Read Reviews → Get more reviews → Copy, replacing the candidate write-review link if different.
3. On two mobile OSes and desktop browsers, tap each button and verify Roby's business profile, the reviews tab, and the correct write-review form (including logged-out flows).
4. Approve product photos, product names, prices, hours and reuse rights separately (Issue #488); never infer approval from technical CI.
5. Capture TR/EN/RU snapshots and run manual layout/accessibility regression (including smaller 320px viewports and PWA refresh).
6. Check CI and independent reviewer feedback before changing main or publishing.

## Reference
- Google Maps URLs search and directions with Place IDs: https://developers.google.com/maps/documentation/urls/get-started
- Owner review link procedure: https://support.google.com/business/answer/16816815
- GitHub Issue #488 tracks owner/photo/catalog release gates.
