# Roby's: one guest journey

Owner intent, 7 September 2026: finish the guest's need with a clear, comfortable order. Helpful additions are optional. Screen completion alone is not product completion.

## Product contract

The containing system is **need → suitable portions → visible total → one editable order → barista view**. The persistent order is the centre; the guided selection, ordinary menu and pairing cards are entry points. A guest may switch between them, change their mind, remove an item, undo removal and continue without re-entering the order.

At entry the guest may be uncertain, busy, alone or choosing for others. At the end they have the exact quantities and a readable total to show the barista. The application does not know that the café has accepted the order, received payment or satisfied the guest; it must not claim any of those events.

## Causal findings and refactor

| Divergence from intent | Cause | Implemented transition |
| --- | --- | --- |
| Group recommendations often ended empty or contained one drink | Party labels were eligibility tags; there was no quantity calculation | Explicit 1/2/3/4 guests; repeat a complete base portion per guest before filtering by the total budget; show component quantities |
| Menu opened with an empty order after guided selection | Independent menu and Smart Choice stores | Reuse #341's canonical order, migration/recovery and route entry; add every calculated line atomically |
| A coffee need could lead with an unsolicited dessert | More expensive sets scored well against an upper budget | Prefer the requested drink; a set remains a visible alternative rather than the default response to a drink need |
| The final screen shared only a selection or simply closed | No common completion action | Explicit Review → Show the barista → Edit, using the same quantities and prices |
| Repeated add taps could duplicate a selection | No stable selection receipt | A successful add becomes Review my order; preserve its receipt across reload; choosing a new variant creates a new receipt |
| Search missed items outside the active category | Category and search were intersected | Search the whole multilingual menu; category-name matches show that category; choosing a category clears search |
| Pairing imagery hid product and price details | Decorative overlays and cropping displaced content | Port the reviewed pairing implementation from #342: full image, readable contents/price and explicit set dialog action |
| Green tests coexisted with a broken guest path | Local screen contracts and negative group fixtures did not establish group completion | Add production-catalog consistency coverage and actual UI paths for two/three guests, including menu continuation and barista view |

## Choice and addition rules

- A count is explicit. Legacy `family` does not imply an invented family size; the UI asks for the missing count again.
- The initial group option uses the same base choice for each guest and says so. Different preferences can be assembled in the common order from the full menu. This is not individual preference inference.
- Quantities and price appear before adding. The guided budget covers that selection for all guests; existing order items and explicit extras are labelled as separate.
- Do not display alternatives above the chosen budget in the normal guest UI. The versioned engine may still expose clearly classified stretch alternatives to existing diagnostic consumers.
- Optional extras are not preselected and never gate barista view. One coffee accompaniment may be offered with both its own price and the resulting total. An existing food/dessert/set suppresses that prompt. A decline persists for the tab session and does not change the order.
- Three Iced Lattes are 540 TRY. One optional macaron produces 570 TRY, not three automatic macarons. All amounts are derived from the existing menu prices.
- Both menu cart controls and the guided-selection completion use the same order dialog. No partial-selection WhatsApp action or technical JSON payload is presented as the guest's completion step.

## Boundaries preserved

The live takeaway splash from #343 and current menu prices remain. Android APK/runtime certification stays in #345. This change does not merge Android diagnostic work from #342.

The approved standalone Cool Lime + macaron offer remains 290 TRY in the menu; the misleading crossed-out price disappears with the pairing renderer. The guided engine still excludes its unresolved component-priced combo. These are different pricing contracts; the application must not invent a discount or component reconciliation. A named café owner and current price/availability authority remain operational work in #300/#299.

Legacy carts use #341's explicit migration decision and preserve unreadable/newer storage. New group lines are split into menu items only if their canonical prices sum exactly to the displayed selection total; otherwise the addition fails without partially changing the order. This prevents a future discounted set from silently losing its price contract.

QR transfer to a second device and POS/Odoo acknowledgement are not supplied by a local counter view. They remain separate acceptance items in #340 and #259. Neither those issues nor the whole older PR stack should be marked complete solely because this web journey passes.

## Verification and evidence status

Baseline: main `e3edcf13de323c3adb80c9c96465f1dd0425eee0`. Reused shared-order work: #341 `5b01276b99db719cae2fc72f29d38eb00c9953f4`. Selected pairing implementation: #342 `d794605c99f5bc7d002506e975da72bcf580c829`. The integration preserves the deployed takeaway entry and avoids overwriting the separate Android investigation.

`test:guest-journey` covers 2,160 production-catalog input combinations across TR/EN/RU and 1–4 guests. For each returned choice it checks portions, budget, editor price, canonical order addition and reload. Explicit examples cover optional addition/removal/undo, rejection of invalid quantities and atomic failure at the quantity limit. No-match remains valid for insufficient budgets and incompatible preferences; returning a result for every input is not the success criterion.

`Complete guest journey` CI captures 12 actual-input paths (TR/EN/RU × 2/3 guests × 320/390 px), screenshots of the order/barista states, repeated-click/reload behaviour, menu continuation, global search, declined additions and runtime errors. The report binds the checkout commit and tested runtime digests. Existing shared-order, responsive, security, integrity and takeaway checks remain required; no passing screenshots or CI results are claimed before those runs finish.

Local browser preview was blocked by the environment's automatic permission review. Local source/domain checks are distinct from pending CI browser evidence and from a public deployment. Production verification must re-check the published bytes and a real guest path after release.

## Product measurements

Measure successful selections, complete additions, abandoned steps, corrections/removals and opening the barista view separately. An optional-addition rate is meaningful only alongside completion and guest feedback. Opening the counter screen is a handoff attempt, not a sale. The existing Smart Choice analytics remains selection-scoped; it must not be presented as complete cross-route revenue attribution.

Relevant checkout references: optional extras after the main choice and a visible order summary, from the official ClickFunnels checkout documentation and SamCart Global Order Bumps documentation. No revenue uplift or customer-emotion claims are inferred from those sources.
