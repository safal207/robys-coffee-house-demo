# Robis Product Lens Run v1 🌸

This review applies the vendor-neutral Lotus Product Lens to Roby's Coffee House as a **digital-to-physical visit funnel**, not as an ecommerce checkout.

## Scope

```text
homepage / QR / shared menu
→ Taste Journey or menu discovery
→ optional pairing
→ Google Maps or Instagram handoff
→ physical visit
→ in-store purchase
→ repeat visit or voluntary community relationship
```

The repository can prove the digital path through the handoff. It cannot, by itself, prove the physical visit, POS purchase, AOV/LTV effect, refund or complaint rate, or repeat value.

## Current conclusion

**`VALUE_UNPROVEN`** with a runnable review verdict of **`PRODUCT_PATH_REVIEWED_WITH_GAPS`** when all source-state checks pass.

This is not a negative judgment. It means that a coherent value path exists, while realized downstream value is not yet evidenced.

## What is already strong

- The homepage exposes menu, pairing, directions, hours, location, and language choices.
- The menu is searchable, multilingual, category-aware, and displays TRY prices.
- Pairings are optional discovery offers with explicit prices rather than preselected paid extras.
- Taste Journey says “no pressure,” keeps relationship state on the device, and offers another pairing or the full menu.
- Maps and Instagram remain external, visible handoffs rather than hidden actions.
- The repository contains no online payment or one-click charge path, so SamCart-style payment mechanics are reference patterns only.

## Product gaps

### 1. Measurement gap

`analytics.js` keeps events in memory and `dataLayer`, but the repository does not show durable collection or a bridge to POS outcomes. Route clicks and pairing clicks therefore cannot prove visits, purchases, AOV, LTV, retention, refunds, complaints, or repeat value.

### 2. Handoff continuity gap

Maps and Instagram links do not preserve the selected pairing or intended reservation context. The visitor and staff must reconstruct the choice after leaving the site.

### 3. Recovery gap

Taste Journey remembers language, visit stage, and discovered pairings locally. It does not provide an explicit “resume my last choice” path with a clear reset.

### 4. Growth-evidence gap

The repository contains approved and social offer presentations, but no exact experiment, cohort, denominator, observation window, counter-metrics, or causal result. Offer visibility must not be reported as revenue growth.

## SamCart-inspired reading

Useful patterns:

- focused offer presentation;
- separately priced complementary pairing;
- explicit total before commitment;
- recovery of interrupted intent;
- offer-level metrics with refund, churn, and complaint counter-signals.

Not applicable yet:

- checkout;
- one-click charge;
- subscription billing;
- post-purchase upsell.

## ClickFunnels-inspired reading

The useful funnel is:

```text
entry → promise → menu → pairing → handoff → visit → purchase → repeat or exit
```

The biggest break is after the handoff: the repository sees digital intent but not fulfillment or repeat value.

## Bounded experiments

1. **Pairing-to-handoff continuity:** show the chosen pairing before Maps or Instagram handoff; no payment preselection and a visible reset.
2. **Aggregate visit attribution bridge:** use a bounded source or offer code that can be reconciled with aggregate POS outcomes without cross-site identity.
3. **Voluntary resume-last-pairing:** local/session-only recovery with an explicit clear control and no notification pressure.
4. **Pairing evidence experiment:** define exposure, route/reservation proxy, POS outcome, refunds/complaints, cohort, denominator, time window, and rollback before claiming lift.

## Authority boundary

The Product Lens may describe `VALUE_PATH_CLEAR`, `VALUE_UNPROVEN`, `FRICTION_RISK`, `COERCION_RISK`, `RECOVERY_GAP`, or `MEASUREMENT_GAP`. These labels are advisory observations. The lens does not authorize pricing, payment, launch, experiment, deployment, delivery, approval, or merge.
