# Coffee Club: paid-order linking boundary proof

Refs #496 and #497; independent test-only draft. No runtime activation.

## Existing authority

Counter already authenticates cashier/barista staff, calculates quotes from
its server catalog, records payment acknowledgement and protects guest
order reads with a bearer capability. Reuse this service. A QR, menu
like, browsing history or client-supplied payment status is not a purchase.

## Prototype

The Node 24 test fixture opens a separate temporary SQLite claim ledger.
The trusted test session resolver provides a member ID; it is not a login
implementation. The proof requires both that session and a valid guest
capability for a server-recorded paid order. A unique order ID and immediate
transaction prevent double claims across members. Same-member retries are
idempotent. History returns only the authenticated member's minimal receipts.
Raw bearer keys, email addresses and session tokens are never persisted
in this ledger. Server prices are used, not submitted totals. The production
Counter server, routes, database schema, guest page and owner dashboards
are unchanged.

Run `npm run test:counter` or
`node --test counter/test/club-paid-link.test.mjs` on Node 24.
The test exercises actual Counter store payment/status transitions, guest
capability, cross-member conflict, session revocation and SQLite reopen.
It is store-level integration evidence, not an HTTP or deployment test.

## Before a production pilot

- Complete #497 and #495 technical and visual validation.
- Agree with the café on member authentication, private storage, retention,
  deletion, independent channel consent and hosting. Establish a server-owned
  session; never accept a user-provided member ID.
- Design the real member-to-order claim route: CSRF, origin and rate limits,
  explicit guest authorization, secure session cookie, no bearer leakage,
  recovery and privacy-safe errors. Test HTTP and concurrency.
- Decide whether to support refunds, cancellations, transferred receipts,
  account deletion and anti-replay tombstones. Until these are specified,
  do not issue points or calculate customer monetary entitlement.
- Review the existing owner/Counter draft chain before integrating; avoid
  creating a competing catalog or sales ledger. Confirm actual Counter hosting
  and pilot evidence with Reyhan.

No real rewards, payment collection, member PII, email, push or deployment.
