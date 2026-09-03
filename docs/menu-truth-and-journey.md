# Roby’s Menu Truth and Journey Contract

Status: implementation decision for issue #299  
Related ownership decision: #300  
Menu version: `2026-06-30`

## Why this exists

A menu card is not only visual content. It is a promise across several graphs:

```text
product shown
→ price understood
→ action available
→ café can fulfil it
→ guest receives the expected result
```

The previous pairing poster violated that promise by showing a crossed-out `340 ₺` value that was not supported by the current individual menu prices. The current catalogue lists:

```text
Cool Lime: 190 ₺
Macaron: 30 ₺
Individual-item total: 220 ₺
Approved pairing offer: 290 ₺
```

The implementation preserves the separately approved `290 ₺` offer but never presents it as a discount or saving against the `220 ₺` individual-item total.

## Ownership boundary

- Operational authority: Roby’s café management.
- Approved source: approved printed café menu.
- Digital source: `menu-data.js`.
- Truth metadata: `menu-truth.js`.
- Currency: TRY.
- Current verified version: `2026-06-30`.

A named human owner still needs to be confirmed operationally in issue #300. Until then, the role and source boundary is explicit and testable.

## Pricing modes

### `menu-total`

The displayed pairing price must equal the sum of its declared components.

Example:

```text
Iced Caffè Latte: 180 ₺
San Sebastian: 190 ₺
Pairing: 370 ₺
```

### `standalone-approved-offer`

The pairing has a separately approved fixed price. It may differ from the individual-item total, but:

- no crossed-out comparison price is shown;
- no saving or discount is claimed;
- the interface explains that the price is a separate approved offer;
- every component is still declared for auditability.

## Search decision

Menu search is global.

When a visitor begins searching while a category filter is active, the interface returns to `All` before presenting the final results. This prevents a real product in another category from producing a false empty state.

The scope is visible beside the field:

> Search covers all menu categories.

The full menu grid is no longer treated as one large live region. A concise result-count status is announced instead.

## Pairing fulfilment decision

A visual pairing card is no longer a dead end.

```text
pairing viewed
→ Show barista
→ pairing name + current price + pricing explanation
→ directions or close
```

The action is an offline fulfilment aid, not an online order, payment, reservation, or stock guarantee.

## Analytics boundary

Local page analytics may emit:

- `menu_search_expanded_global`;
- `pairing_show_barista`;
- `pairing_directions_click`.

Payloads contain route/action context, pairing ID, language, path, and menu version only. The feature adds no storage, identity, permission request, or direct network request.

## Release gates

The exact-head contract rejects:

- `340 ₺` or any `oldPrice` in pairing posters;
- “Pair of the day” without an owned time-sensitive source;
- a `menu-total` pairing whose component arithmetic does not match;
- a standalone offer without three-language explanation;
- missing global-search escape;
- missing concise status region;
- missing barista/directions path;
- storage, notification, direct network, or unsafe HTML injection in the integrity layer.

## Remaining operational work

- confirm a named menu owner in #300;
- define update SLA and stale-menu escalation;
- carry `menuVersion` into saved Smart Choice sets and Moment Passes;
- test the barista screen with café staff;
- verify the approved offer and printed menu whenever the operational menu changes.
