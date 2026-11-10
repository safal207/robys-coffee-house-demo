# Roby's marketing attribution V0 — implementation contract

Status: **source-only / NOT LIVE**. This change provides a bounded, testable UTM parser,
URL builder and privacy-gated event envelope. It does not connect analytics,
track guests, publish a dashboard or claim an order is paid. It must not be
advertised as working marketing reporting.

## Scope

- Canonical source: \`src/marketing-attribution-v0.js\`.
- Focused tests: \`node --test scripts/test-marketing-attribution-v0.mjs\`.
- Allowed input: explicit \`utm_source\` plus optional \`utm_medium\`,
  \`utm_campaign\`, \`utm_content\`, \`utm_term\` on HTTP(S) URLs.
- Each campaign code is normalized to lowercase, max 64 characters, using
  ASCII letters/numbers/period/underscore/hyphen only. Duplicate, malformed,
  personally identifying/free-text values are rejected rather than sent.
- \`resolveUtm\` only uses \`sessionStorage\` with **explicit analytics consent**;
  before consent it reads the current URL only and never accesses storage.
  Consented entries expire after 30 minutes in the same tab. Denied storage
  does not block the menu. Withdrawal calls \`clearUtm\`.
- No cookies, cross-device IDs, network calls, marketing vendor SDK, IP
  enrichment or external transmission.

## Example campaign link

\`https://safal207.github.io/robys-coffee-house-demo/menu-feed.html?utm_source=instagram&utm_medium=social&utm_campaign=november_menu&utm_content=story_01\`

Suggested naming:
- Instagram story: source=instagram, medium=social, campaign=november_menu, content=story_01
- TikTok video: source=tiktok, medium=social, campaign=november_menu, content=video_01
- Table QR: source=table_qr, medium=qr, campaign=in_cafe, content=table_group_a
- Google business profile: source=google, medium=organic, campaign=business_profile

Never embed contact details, names, table-specific visitor identifiers,
order secrets or sensitive values in UTM parameters.

## Explicit funnel definitions

| Event | Authority | Meaning |
| --- | --- | --- |
| landing_view | browser, consented | Instrumented entry; not a unique person |
| menu_item_view | browser, consented | Meets agreed visible-duration threshold; not interest proof |
| menu_item_liked | browser, consented | Like action, not an order |
| menu_item_shared | browser, consented | Share intent, not confirmed delivery |
| cart_item_added | browser, consented | Cart edit, not a paid order |
| checkout_qr_opened | browser, consented | QR/display handoff, not a paid order |
| route_clicked | browser, consented | Navigation intent, not a visit |
| payment_confirmed | **Counter backend only** | Cashier-acknowledged payment; backend audit transition required |

The client module deliberately rejects \`payment_confirmed\`. Calling the
Counter API from a visitor page or showing a QR cannot mint a sale. Any
future attribution join must be made server-side, verify the paid transition,
deduplicate by immutable order/payment transition ID, and keep monetary
amounts from server price records. Anonymous unlinked sales stay **unknown**,
not falsely assigned to a campaign.

## Next integration PR

1. Agree consent/notice with the owner, choose a lawful collection setup
   under Turkish KVKK, then add an accessible TR/EN/RU consent control.
2. Add the approved first-party adapter to site, menu/feed/grid, Smart Choice
   and shared-cart handoff. Use one authoritative event taxonomy across views.
   Bind the campaign snapshot at a defined step; do not trust visitor-supplied
   campaign or prices for payment records.
3. Add a backend collector with origin checks, rate limiting, event schema
   verification, deduplication, retention and deletion; restrict dashboard
   access to the owner. Do not expose SQLite/back-office APIs from GitHub Pages.
4. Verify Counter deployment over TLS with persistent volume, backup/restore
   and actual cashier acceptance before attributing any paid events.
5. Show only measured metrics: eligible consented sessions, add-to-cart rate,
   QR handoff rate, paid orders, average paid basket, attribution coverage,
   unknown source share. Break down by campaign, locale and view mode.
6. Compare feed versus list only after equivalent entry cohorts and funnel
   definitions are available. Do not claim causal lift from simulations.

## Required QA and release gate

- Unit tests on parser, duplicate fields, injection/PII, storage denial,
  expiry, opt-out and server-only payment boundary.
- TR/EN/RU, direct entry, QR, external referral, Back/reload/PWA,
  multiple tabs, denied consent and private browsing.
- No UTM query propagation into guest bearer links, checkout tokens or logs.
- Maintain existing Lighthouse, security, exact-head, integrity, WebKit
  and order-reliability release gates; never bypass a red check.
- Existing \`main\` (as of 2026-11-10) has causal journey-timing failure,
  and PR #483 has a separate JS-budget failure. This V0 does not fix them.
