# Roby's Rewards ledger: offline boundary proof

Independent draft following #496–#499. No account, runtime route, real reward,
financial commitment or production database is introduced.

## Event semantics

The pure replay model receives only trusted events from a future server
adapter, never a browser or arbitrary client. The adapter must use
Counter payment authority, authenticated member ownership from #498, and
actual eligible paid receipt/cashier redemption evidence. No stamp for
a view, like, QR draft or reward-only order. Test-generated IDs are synthetic.

- Earn one stamp for one verified eligible paid order (not number of cups).
- Redeem a configurable number of stamps for one confirmed reward receipt.
- Refund a previously earned order once. If credit was already redeemed,
  retain negative balance until future eligible purchases cover the debt.
- Duplicate event IDs are idempotent only for identical semantics.
  Duplicate order events cannot grant additional stamps.
- The reward-use count is capped globally per immutable policy version.

The example policy uses three stamps purely to keep test fixtures short.
Actual threshold, eligible products, cap, expiration, terms, transfers and
refund behavior require owner agreement. The cap is a count, not a monetary
limit; derive it conservatively from approved maximum expense in #499,
and account for outstanding commitments before authorizing any offer.

## Production blockers

The proof is deterministic, not a transactional database or authentication
implementation. A real adapter needs a unique durable global order claim,
append-only storage, transactional check-and-append with concurrent replay,
trusted event origin, owner policy approval, authorization, immutable policy
versions, reversal/partial-refund and redemption cancellation semantics,
expiry, account deletion and anti-abuse policy. Never surface all members'
balances to a customer. Do not present available rewards as a promise if
program-wide capacity is exhausted. This model deliberately blocks repeated
earn after any refund; partial refunds and requalification are unsupported.

Do not connect to the menu, Counter or marketing delivery until the earlier
PR chain and client release are validated. No external service or paid
dependency is added.

Run `node --test scripts/test-club-reward-ledger.mjs`. Also registered under
the existing Smart Choice revenue simulator test command. Local focused
checks in the coding tool are not a full repository test run.
