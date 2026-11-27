# DESSERT-002 — Dessert Story sales validation

Status: PROTOCOL ONLY / NOT LAUNCHED. Baseline code: 26a9283ddee6a40e8b5b04a5123b9272e2aa7e1c, draft PR #527 (33/33 CI at review). No changes to main, PR #527, deployment, runtime, or customer data.

## Evidence and limits
- menu-catalog.js: Chocolate Cake price 190 TRY at baseline; price is not margin.
- src/dessert-story.js: robys-dessert-funnel.v1 sessionStorage aggregate counters, keyed by feed/list/grid and tr/en/ru; repeated actions can increment counts. No cross-session sales attribution or unique experimental denominators.
- counter-config.json: enabled=false, checkoutUrl=null. A QR created is not a paid order. No real conversion or revenue records inspected.

## Decision and hypothesis
Does the three-frame story improve paid cake conversion and overall contribution per eligible session versus the ordinary card? Allocate 50/50 at the first opportunity to show the same cake, before the treatment is rendered. Persist assignment for the experiment session, across views, locale changes and reloads. Use intention-to-treat: include every assigned eligible session, even if no swipe occurs. Separate staff/test traffic and exclude stockout periods by predefined rules, applied to both groups. A: ordinary photo, standard cart. B: story with finale CTA and social actions. Same catalog price, availability, placement, other checkout mechanics and traffic period. No extra discounts, no change to other items. Session-level allocation is provisional: repeat visitors and multi-device exposure may dilute the effect; document this limitation. Do not equate repeated sessions with distinct people.

## Measurement contract
Primary: unique eligible assigned sessions with >=1 fulfilled paid cake order / all eligible assigned sessions per arm. Reconcile actual POS paid/refunded status before using revenue. A purchase counts once in the conversion numerator; units and net revenue are separate. Fixed analysis window and reconciliation lag selected before launch based on cafe operations. Experiment-scoped opaque session token and separate order token only if approved and necessary for reconciliation; no customer identity, raw QR or payment details in experiment logs. No live tracking enabled by this protocol.
Secondary: unique session-level cake card exposure, story completion (B only), add to cart, QR created, fulfilled order. Like/share attempts are engagement; not successful external shares. Count each stage once per session, preserve raw event counts separately. Define exposure with same viewability rule in both arms. Primary denominator is assigned eligibility, not post-treatment exposure. Capture all-order net revenue and contribution per eligible session to detect substitution from other products. Guardrails: no regression in checkout integrity, duplicate orders, cancellations/refunds, accessibility, mobile latency, or other dessert contribution. Measure total basket contribution after variable costs; require approved ingredient/operating cost inputs before reporting profit.

## Synthetic sensitivity — NOT measured results
Assume 1000 eligible sessions per arm, control conversion 5%, one cake per converted session, 190 TRY per cake, no refunds, discounts or tax adjustments. Expected gross cake sales:
| B conversion | Paid units | Gross TRY | Delta vs A TRY |
|---:|---:|---:|---:|
| 4% | 40 | 7600 | -1900 |
| 5% | 50 | 9500 | 0 |
| 6% | 60 | 11400 | 1900 |
| 6.5% | 65 | 12350 | 2850 |
| 8% | 80 | 15200 | 5700 |
Arithmetic: units=N*p; gross=units*190; delta=gross-9500. No claim about likely effect. Incremental contribution = incremental fulfilled units * contribution per unit - incremental costs - displaced contribution. Actual total basket contribution is the decision metric alongside primary paid conversion.
Planning illustration: two-sided alpha .05, power .80, independent sessions, pA=.05, pB=.065. Normal two-proportion approximation n=ceil((1.959964*sqrt(2*pbar*(1-pbar))+.841621*sqrt(pA*(1-pA)+pB*(1-pB)))^2/(pB-pA)^2)=3780 per arm (7560 total), pbar=.0575. Recalculate after observing actual baseline and traffic with approved methodology, account for clustering and incomplete reconciliation. Do not stop early after seeing favorable results. If cafe traffic is insufficient, use a feasibility pilot and report uncertainty rather than claiming statistical proof.

## QA before launch
1. Assignment determinism and 50/50 split checks; no reassignment after refresh/back, view or locale changes; no control story requests.
2. Same price/product/availability in both variants; no treatment changes to ordinary buying path.
3. Dedupe stage events and order callbacks; no conversion from duplicate clicks, abandoned QR, canceled/refunded order, or blocked storage.
4. Verify active-document error remains visible; test WebKit, Firefox, Chromium; real mobile acceptance and existing 33 workflow gates.
5. Reconcile POS sample manually against approved experiment tokens; verify consent/retention, no personal/payment data in telemetry.
6. Negative controls: stockout, offline, checkout failure, repeated order token, concurrent tabs and language switch.
7. Check assignment balance, missing paid-status reconciliation and per-arm guardrails before interpreting outcome.

## Go/no-go
GO for implementation of an isolated disabled-by-default experiment only after owner approves privacy, allocation and POS reconciliation. GO for rollout only if predeclared test supports positive paid conversion, contribution is favorable and guardrails pass. Otherwise iterate or retain ordinary card. Current decision: NO-GO for production experiment or claim of sales uplift. No runtime implementation, CI or real customer test is asserted here.
