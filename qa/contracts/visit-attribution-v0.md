# Roby's Visit Attribution V0 — POS Bridge

## Status

`BASELINE_ONLY / MANUAL_POS_BRIDGE`

This contract connects website route intent to a checkout record without collecting personal data. It does not authorize an offer experiment, a profit claim, or a `SCALE` decision.

## Visitor flow

1. The visitor activates a Google Maps route link on the Roby's website.
2. The website creates a privacy-safe `campaign_token` matching `^rv_[a-z0-9]{20}$`.
3. The route opens normally in a new tab.
4. The current page displays the full visit code.
5. The visitor shows the code at checkout.
6. The cashier records the exact full token in the POS custom field or order note named `campaign_token`.

The token is random and contains no name, email, phone number, device fingerprint, or precise location.

## Required POS export fields

Each exported order must contain exactly the business fields required by LS Attribution Reference Runtime V0:

| Field | Format | Rule |
|---|---|---|
| `orderId` | string | Stable unique order identifier; deduplicate by this field. |
| `orderedAt` | RFC3339 date-time | Must include timezone offset. |
| `campaignToken` | string | Exact full `rv_...` token shown by the visitor. |
| `grossRevenue` | decimal string | TRY amount, non-negative, maximum two decimal places. |
| `currency` | string | Must be `TRY`. |
| `variableCost` | decimal string | Direct variable cost for the order, maximum two decimal places. |

## Manual bridge

Until the POS supports a dedicated custom field, the cashier may enter the full token into an order note and the daily export adapter may map that note to `campaignToken`.

Do not shorten, hash, normalize, or partially copy the token. A missing or malformed token must remain unmatched rather than being guessed.

## Baseline bundle

The browser exposes:

```js
window.robysVisitAttribution.buildBaselineBundle(posOrders)
```

The returned object is bound to:

- schema `robys-attribution-input.v0`;
- product `PROD-ROBYS-WEB`;
- measurement plan `MPLAN-ROBYS-MENU-TO-VISIT-001`;
- mode `BASELINE`;
- currency `TRY`;
- attribution window `24` hours.

The bundle can be passed directly to the LS Attribution Reference Runtime V0.

## Privacy boundary

Forbidden in the website event and POS attribution export:

- customer name;
- email address;
- phone number;
- device fingerprint;
- precise location;
- free-form customer profile data.

Only the random campaign token and order economics are required.
