# Roby’s Smart Choice — Revenue Simulator Contract v0.1

Status: **Draft planning tool**  
Owner issue: **#258**  
Depends on: **#248, #250, #254, #256, #257**

## 1. Purpose and boundary

The simulator helps the café owner decompose a revenue-growth target into explicit planning levers. It is not a forecast, promise, pricing engine or automatic strategy publisher.

The simulator must never:

- change catalog prices, availability, combo composition or order rules;
- treat a requested growth rate as an expected outcome;
- generate a discount merely to close the arithmetic gap;
- claim causal impact without a future controlled experiment;
- publish or send the plan without explicit owner action.

The public Smart Choice flow does not link to this page. The owner tool is `noindex`, stores no personal data and sends no network requests. Direct navigation grants access only to the local planning interface; it does not authorize catalog, price or experiment changes. The browser owner UI is deliberately Russian-only in v0.1; the versioned domain/export API may still format supported locales when called programmatically.

## 2. Input contract

Required:

- ISO currency code;
- current monthly revenue in integer minor units;
- monthly order count;
- average order value in integer minor units;
- requested growth in basis points;
- confirmed and available combo, upgrade and bump IDs.

Optional:

- baseline repeat rate in basis points;
- average COGS per order in integer minor units;
- financial guardrails.

Currency is preserved exactly as supplied. The simulator performs no FX conversion.

## 3. Reconciliation

The simulator compares:

```text
monthly orders × declared average order value
```

with declared monthly revenue.

A difference above 5% produces `review-required` and the missing-data code `reconciled-orders-and-aov`. The requested target still uses the declared revenue, but the result must not be treated as pilot-ready until the source data is reconciled.

## 4. Target arithmetic

```text
target revenue = current revenue × (1 + requested growth)
gap = target revenue − current revenue
additional orders at current AOV = ceil(gap / effective AOV)
required AOV at current orders = ceil(target revenue / current orders)
```

The effective AOV used for decomposition is derived from declared revenue divided by orders, so the arithmetic remains anchored to the owner’s revenue total.

## 5. Scenario model

All scenarios use the same explicit identity:

```text
projected revenue = current revenue × conversion factor × AOV factor × repeat factor
```

The total scenario factor is distributed across levers in logarithmic shares, so the factor product exactly matches the scenario’s planned growth.

| Scenario | Requested-target fraction | Conversion share | AOV share | Repeat share |
|---|---:|---:|---:|---:|
| Conservative | 60% | 50% | 30% | 20% |
| Expected | 100% | 40% | 35% | 25% |
| Stretch | 125% | 30% | 40% | 30% |

The range around each scenario is an explicit realization range, not a statistical confidence interval.

## 6. Financial evidence

Without average COGS per order:

- `revenueOnlyWarning` is required;
- gross-profit and gross-margin conclusions are omitted;
- missing data includes `average-cogs-per-order`.

With COGS:

```text
projected gross profit = projected revenue − projected orders × average COGS per order
projected gross margin = projected gross profit / projected revenue
```

A scenario breaching the configured minimum gross margin is not eligible for execution. When COGS is available, gross profit, incremental gross profit, margin and guardrail status must be visible in both the browser result and the Markdown export.

## 7. Commerce guardrails

The simulator proposes a discount of exactly 0 basis points.

Every hypothesis must preserve:

- catalog price;
- availability;
- composition;
- confirmed source status;
- owner approval.

Only confirmed and available mechanism IDs from the Smart Choice Catalog may appear as eligible combo, upgrade or bump hypotheses.

## 8. Hypothesis contract

Each hypothesis contains:

- stable ID;
- target lever;
- eligibility status;
- linked confirmed mechanism IDs;
- primary metric;
- future experiment ID;
- required evidence;
- explicit guardrail.

A hypothesis is a candidate for a future experiment, not an effect estimate.

## 9. Export contract

JSON schema:

```text
robys.smart-choice-revenue-simulation.v1
```

Model version:

```text
smart-choice-revenue-model.v1
```

Same normalized input produces the same simulation ID and identical JSON. Markdown contains the target, gap, formulas, scenarios, financials when available, hypotheses, missing data and guardrails.

## 10. Required verification

```bash
npm run test:smart-choice-revenue-simulator
npm run verify:smart-choice-revenue-simulator
npm run build
npm run check
```

Tests cover the issue example `3 000 000 ₺ → 3 600 000 ₺`, boundary growth values, reconciliation, revenue-only behavior, gross-profit mode, zero-discount policy, mechanism eligibility and deterministic exports.

## 11. Accepted accessibility and fallback contracts

- The v0.1 browser UI exposes only the locale it actually translates: Russian (`ru-RU`).
- Initial default calculation must not move keyboard or screen-reader focus away from the introduction and form.
- Successful and failed result headings preserve the ID referenced by the results region’s `aria-labelledby`.
- A `<noscript>` fallback exposes the manual target, gap, additional-orders and required-AOV formulas.
- User-initiated calculations may move focus to the new result heading after validation and rendering.

## 12. Scope isolation

Semantic homepage content and behavior are outside #258 and must remain unchanged. A revision-only cache-key update is permitted when it is the exact output required by the repository-wide build and stale-generated-files contract; such a change must be paired with the matching integrity manifest and must not alter public copy, layout or behavior.
