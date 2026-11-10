# Roby's analytics V1 — consent + collector + paid KPI sources

**Status: PROTOTYPE SOURCE ONLY; NOT DEPLOYED; NO CLIENT EVENT COLLECTION.**
This change builds source contracts and repeatable tests, not a production-ready
monitoring service or a finished owner dashboard.

## What exists

1. `scripts/marketing-consent-v1.js`: opt-in, decline, withdrawal, expired/invalid
   preferences fail closed, user-visible copy in Turkish, English and Russian.
   Explicit feature flag defaults to off. Refusal must leave all menu and
   order-draft functions usable. Withdrawal clears the campaign snapshot.
2. `scripts/marketing-event-store-v1.mjs`: separate SQLite table containing
   **allowlisted** event/UTM metadata only. No names, contact details, IP address,
   raw URLs, customer ID or payment credentials. Event IDs must be random
   128-bit hex; strict time-window bounds, at-most-once recording and
   configurable retention (90 days by default). No public HTTP listener exists.
3. `scripts/owner-paid-kpi-v1.mjs`: read-only query against a privately
   held Counter SQLite file. It counts **only** paid orders with an explicit
   `pay` audit row and returns counts, cashier-acknowledged gross TRY and
   average basket, grouped by local calendar day (Europe/Istanbul). Empty
   results are zero, not simulated. UTM attribution remains **unknown**.

### Authoritative distinction

- `checkout_qr_opened` = customer viewed a QR. Not evidence of an order.
- `cart_item_added` = a draft change. Not evidence of payment.
- `payment_confirmed` must be derived from a verified Counter audit transition,
  **never** received as a browser-authored analytics event.
- A Counter acknowledgement does not prove card settlement; net margin,
  refunds, discounts, taxes and bank payments are not represented by V1.
- Existing Smart Choice revenue simulator is **scenario-only** and must not
  appear in real sales KPI panels.

## Production release checklist

The following remain missing and are hard blockers:

- Business-owner approval of the privacy notice, purpose, legal basis,
  storage/retention and data-processing obligations, with KVKK review.
- Accessible consent banner/preferences screen on **every relevant entry
  point**, in TR/EN/RU, covering denial/withdrawal without dark patterns.
- Integration into built/public assets, revisioned service-worker cache,
  integrity manifest and live QA. These source-only modules are not shipped.
- A server-side same-origin endpoint with rate limits, bounded payload,
  independent consent enforcement, deduplication and deletion support.
  The event-store function `authorizedConsent` is a trusted-server interface,
  **not** a secure HTTP authorization mechanism by itself.
- Authentication/authorization of an owner-only dashboard. The existing
  Counter roles are `cashier` and `barista`; neither should be promoted
  into unrestricted owner analytics access. No owner dashboard endpoint
  or remote UI is present.
- Verified HTTPS Counter deployment and backups, payment lifecycle smoke,
  independent security review and privacy-specific adversarial tests.
- Separate, authenticated attribution bridge that matches a legitimate
  paid Counter order with a consented campaign, with coverage and unknown
  source reporting. Never trust price or payment status from visitor events.

## Focused tests

```shell
npm run test:marketing:v1
node --test scripts/test-marketing-attribution-v0.mjs
npm run check
npm run verify:security
npm run verify:performance
```

The V1 tests are wired into the existing `test:menu-feed` / `check` suite
and the causal regression dependency graph. Missing/failing checks remain
blocking; neither this PR nor the parent UTM PR may be merged merely because
the source contracts work.

## Next implementation slices

1. Owner-approved consent UI and backend event endpoint, each behind a disabled
   default flag, validated on Chromium/Firefox/WebKit and offline scenarios.
2. Dedicated least-privilege owner role and authenticated metrics endpoint
   with no PII exposure; verify the owner dashboard's zero-data state.
3. Verified Counter payment ↔ UTM attribution, with a clear **unknown** category
   and refund/adjustment model before reporting economic uplift.
4. Controlled A/B measurement of Feed vs List, and only then data-science
   recommendations based on enough actual customer/purchase observations.
