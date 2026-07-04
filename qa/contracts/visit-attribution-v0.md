# Roby's Visit Attribution V0 — POS Bridge

## Status

`BASELINE_ONLY / MANUAL_POS_BRIDGE`

This contract connects website route intent to a checkout record without collecting personal data. It does not authorize an offer experiment, a profit claim, or a `SCALE` decision.

## Visitor flow

1. The visitor activates a Google Maps route link on the Roby's website.
2. The website creates a privacy-safe `campaignToken` matching `^rv_[a-z0-9]{20}$`.
3. The route opens normally in a new tab.
4. The current page displays the full visit code.
5. The visitor shows the code at checkout.
6. The cashier records the exact full token in the POS custom field or order note named `campaignToken`.

The token contains no name, email, phone number, device fingerprint, or location. It consists of:

- seven base-36 characters encoding the UTC route-intent second;
- thirteen cryptographically random base-36 characters.

This lets the offline POS adapter reconstruct the original `visit_intent_created` event from the token alone. The café does not need access to the visitor's browser storage or a tracking server.

## Required POS export fields

Each exported order must contain exactly the business fields required by LS Attribution Reference Runtime V0:

| Field | Format | Rule |
|---|---|---|
| `orderId` | string | Stable unique order identifier; deduplicate by this field. |
| `orderedAt` | RFC3339 date-time | Must include timezone offset. |
| `campaignToken` | string | Exact full self-describing `rv_...` token shown by the visitor. |
| `grossRevenue` | decimal string | TRY amount, non-negative, maximum two decimal places. |
| `currency` | string | Must be `TRY`. |
| `variableCost` | decimal string | Direct variable cost for the order, maximum two decimal places. |

Unknown fields are rejected by the adapter so personal data cannot silently enter the measurement bundle.

## Manual bridge

Until the POS supports a dedicated custom field, the cashier may enter the full token into an order note and the daily export adapter may map that note to `campaignToken`.

Do not shorten, hash, normalize, or partially copy the token. A missing or malformed token must remain unmatched rather than being guessed.

## Build the baseline bundle

From an exported POS JSON array:

```bash
node scripts/build-baseline-from-pos.mjs \
  qa/fixtures/visit-attribution/pos-orders.sample.json \
  baseline-bundle.json
```

The adapter:

1. validates exact POS fields and canonical money;
2. deduplicates identical orders and rejects conflicting duplicates;
3. decodes the route-intent timestamp from every token;
4. reconstructs deterministic web events;
5. emits an LS-compatible baseline bundle with a content-derived run id.

The returned object is bound to:

- schema `robys-attribution-input.v0`;
- product `PROD-ROBYS-WEB`;
- measurement plan `MPLAN-ROBYS-MENU-TO-VISIT-001`;
- mode `BASELINE`;
- currency `TRY`;
- attribution window `24` hours.

The browser also exposes `window.robysVisitAttribution.buildBaselineBundle(posOrders)` for local QA, but the POS-only adapter is the durable café-side bridge.

## Privacy boundary

Forbidden in the website event and POS attribution export:

- customer name;
- email address;
- phone number;
- device fingerprint;
- precise location;
- free-form customer profile data.

Only the random campaign token, its embedded route-intent second, and order economics are required.
