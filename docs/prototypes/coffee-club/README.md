# Coffee Club: inventory and integration preview

Base: `59f127c69983eae57215868679d8fa46bab89931`. Draft-only continuation of #496. Separate from #495.

## Existing capability and reuse decision

| Capability | Evidence | Decision |
| --- | --- | --- |
| TR/EN/RU catalog, photos, list/grid/feed, details, nutrition | `menu-catalog.js`, `src/menu-feed-model.js`, `docs/menu-nutrition.md` | Reuse catalog and image paths; no copied item data or prices |
| Personal likes and viewed items | `src/menu-feed-engagement.js` | Read existing shared browser state; not public popularity, purchase history or identity |
| Taste waves, collections, family and takeaway sets | `src/menu-taste-wave.js`, `src/menu-feed-collections.js` | Reuse menu links; do not copy recommendation logic |
| Guided selection and cart | `smart-choice/index.html`, `src/smart-choice/shared-order.ts` | Link to Smart Choice and canonical feed; no second cart |
| Checkout and QR | `docs/order-checkout.md` | Keep guest checkout; QR alone is not payment or proof of purchase |
| Counter staff, paid order and barista workflow | `counter/README.md` | Local/opt-in service exists; static site does not confirm purchases |
| Revenue planning | `docs/smart-choice/revenue-simulator-contract.md` | Existing simulator is a planning scenario, not actual sales data |
| Marketing analytics | `analytics.js`, drafts #484 and #485 | Existing local events; no new events or PII collection in preview |
| Owner access and menu CMS | Drafts #486–#489, gate #488 | Separate staff trust boundary; do not use staff sessions for members |
| Customer identity, paid order history, rewards, push/email | #496 and future scope | Not connected. Add only after production design and café approval |

## Prototype

Serve the checkout root with a local static HTTP server and open
`/docs/prototypes/coffee-club/index.html`. The page is unlinked, noindex and has
no network submission. It reads the same origin's menu likes and views using
the existing engagement module. Passport marks are manual, local, reversible
and isolated from menu storage. Existing product links return to the
canonical feed, and stories link to existing pairings.

Focused check: `npm run test:menu-feed` (includes the new unit suite).
Before publication, independently verify 320px/mobile layouts, TR/EN/RU,
back-navigation, storage failure and actual source-to-preview behavior.
No account, personal-data ingestion, service-worker edits, reward or sales
integration is introduced. Do not merge or deploy this unlinked prototype
without review of the intended publication boundary.

## Next stages

1. Finish #495; independently validate the QR/menu-first guest experience.
2. Review the prototype with Reyhan, including whether device-local preferences
   are useful; keep menu access anonymous.
3. Design server-side member identity (email magic link or one-time code),
   account deletion and independent marketing channel consents (KVKK/İYS review).
4. Link actual paid Counter order IDs with explicit guest authorization;
   add an idempotent ledger for rewards, including refund/reversal handling.
5. Calculate owner-approved offer economics with actual COGS, control groups
   and opt-out metrics; never turn views, likes or QR drafts into revenue.
6. Add email stories and optional push under #496 using an approved provider,
   separate consent, frequency caps, unsubscribes and no PII in analytics.

The full sales/member integration needs an approved hosted backend and
verified order data. No additional paid plugin is used by this prototype.
