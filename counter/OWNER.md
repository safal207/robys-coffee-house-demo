# Roby's private owner dashboard (Counter-host only)

**Status: experimental / not deployed / no real owner credential provisioned.**
This implementation is stacked on marketing PRs #484 → #485 and remains a
Draft PR until exact-head Counter/order-reliability, integrity, security,
and independent review pass.

## What this provides

- Separate owner authentication: robys_owners and robys_owner_sessions
  live in the existing private Counter SQLite database. They do not change
  the cashier/barista users role constraint. Owner cookies cannot authorize
  any staff queue, order payment or status change.
- Browser dashboard: GET /owner on the private Counter host responds with
  mobile-friendly, server-rendered HTML. No JavaScript or third-party
  assets. TR/EN/RU copy is included.
- Cashier-confirmed payments only: order records with paid_at plus a
  matching audit.action=pay. Count and sum by Turkish calendar day.
  Date range is strictly bounded to 93 days and [from,to) dates.
- Account operations: hidden-password interactive provisioning, a separate
  owner session cookie, CSRF-protected logout, session revocation on
  password rotation, one-hour expiry, throttling, no-store, restrictive CSP.

## Provisioning on a private machine or hosted volume

Use the same persistent COUNTER_DB as the Counter service.
Run with Node.js 24.19+ in a trusted interactive shell:

    node counter/provision.mjs reyhan owner

The command asks for a private password twice, without echo. There are
no default accounts or passwords. Never record or commit credentials.
For a hosted volume, provision from an authorized operational shell with
the same private mount and service identity, not a public request.

Start Counter with its documented configuration. Open locally at
http://127.0.0.1:8787/owner, or on a reviewed private HTTPS Counter origin.
GitHub Pages does not host this route. Public Counter remains disabled
in the GitHub Pages counter-config.json.

## Explicit limitations

- Cashier-acknowledged gross TRY is NOT bank settlement, net profit,
  refund reconciliation or tax accounting.
- Instagram/TikTok/QR attribution is NOT linked to paid Counter orders.
  Unknown sources stay unknown. QR display is NOT a sale.
- This report does NOT provide photo management, a menu CMS, third-party
  analytics, live visitor totals or marketing events. Those require
  further implementation and privacy review.
- Source-only UTM/consent modules from PR #485 remain inactive here.

## Required QA and release gate

    npm run test:counter
    npm run check
    npm run verify:security
    npm run verify:performance

Test in disposable SQLite fixtures without uploading credentials:
authentication, 401/403 role separation, CSRF, session expiry/rotation,
zero-data state, paid audit authority, duplicate fields, injection,
security headers and TLS cookies. Verify mobile browsers and
operation over HTTPS; do not relax red checks.

## Next steps

1. Owner approves account use and secret provisioning on private hosting.
2. Validate backup/restore, TLS origin, and independent security review.
3. Obtain consent and privacy review before any production behavior capture.
4. Implement collector and server-side paid-to-UTM attribution with
   explicit unknown-source coverage.
5. Then add owner photo/menu editing with validation, rollback and audit.
