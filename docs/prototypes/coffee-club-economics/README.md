# Roby's Rewards: economics planning contract

Refs #496, #497, #498 and the existing Smart Choice revenue simulator.
Unlinked source-only model; no change to any live menu, Counter or catalog.

## Reuse and business hypothesis

Use verified Counter purchases as eligibility evidence, member consent as
identity boundary, canonical product IDs as reward references and existing
owner revenue planning for conversion, average order value and repeat-rate
targets. No duplicate cart, prices, payment processing or customer database.

Proposed sequence: start with non-monetary Coffee Passport; if owner approves
the cost and paid-order pilot, compare a simple stamp reward against a
control group. Do not promise a free drink or grant points until authorization,
refund/reversal semantics, expiry terms, abuse controls and funding are defined.

## Calculation

All money in integer TRY minor units (kuruş). Owner inputs are assumptions,
not measurements. Net sales exclude applicable tax; COGS includes ingredients,
packaging and directly attributable costs, consistently across inputs.
Additional paid orders are incremental attributable purchases excluding
reward redemptions. Displaced paid reward items are modeled separately and
must not already be subtracted in the incremental-orders estimate.

- Contribution per paid order = average net sales minus average order COGS.
- Reward expense = redeemed rewards times reward COGS, plus displaced paid
  item contribution, plus other incremental program cost.
- Scenario incremental contribution = incremental paid orders times order
  contribution minus reward expense.
- Maximum exposure stress = all issued rewards redeemed, all displacing paid
  items, plus other program cost (no repeat uplift assumed for this stress).
- Break-even incremental paid orders = ceiling of expense divided by positive
  contribution per order. A nonpositive denominator blocks the scenario.

For loss-making reward items displacement contribution is floored at zero
as a conservative bound. Include all outstanding redeemable rewards in the
issuance count; this is a pilot stress bound, not an accounting liability.
Unknown costs return missing-data rather than an assumed zero. Negative
scenario contribution or a breached exposure cap blocks the candidate.
Passing arithmetic returns planning-only, never approved or deployable.
Different cost scenarios, tax treatment, fees and overhead require owner review;
this is contribution before fixed overhead, not audited net profit.

## Illustrative example — not Roby's actual financials

100 paid orders at TRY 180 net sales and TRY 70 COGS each;
10 assumed extra paid orders; 10 offered rewards, 5 expected redemptions
including 2 displaced paid item sales. Reward item assumed TRY 110 net
price / TRY 40 COGS; other costs assumed zero and risk cap TRY 1,200.

- Contribution per additional order: TRY 110.
- Expected reward expense: TRY 340.
- Scenario incremental contribution: TRY 760.
- Expected break-even: 4 extra paid orders.
- Full-issuance stress exposure: TRY 1,100; stress break-even 10 orders.
- With no additional paid orders that stress represents TRY 1,100 loss.

All values are illustrative, not owner-approved price or margin data.

## Pilot evidence and guardrails

Owner supplies net sales, costs per qualified product, current paid volume,
reward cost and a maximum exposure budget. Keep original prices unchanged.
Start with a capped pilot and control; compare repeat paid orders,
incremental contribution, reward redemption, unsubscribes and fraud.
Report denominators and distinguish unverified scenarios from observed data.

A future production ledger must enforce unique paid order IDs, atomic
earn/redeem/reversal, member isolation, expiry, bounded exposure and audit.
Respect separate channel consent; no marketing contact or identity storage
is introduced here. No provider or paid dependency added.

Run `node --test scripts/test-club-reward-economics.mjs` or the existing
`npm run test:smart-choice-revenue-simulator` suite.
