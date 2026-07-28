# Smart Choice v1 — manual web and mobile-web test plan

Date: 2026-07-28  
Scope: published Roby's homepage, `/smart-choice/`, and `/smart-choice/simulator.html`  
Platforms:
- Desktop web: Chromium, 1440×1000
- Mobile web: Chromium emulating Pixel 7, portrait
- JavaScript-disabled fallback
- Loaded-page offline continuation

## Release boundary

Smart Choice is a selection assistant. The expected v1 result is a recommendation and a locally saved selection. The flow must not claim that an order, payment, POS action, or café confirmation occurred.

## Test data

Primary happy path in Russian:
- Intent: Coffee / Кофе
- Temperature: Cold / Холодное
- Taste: Sweet / Сладкое
- Party size: One / Один
- Budget: Up to 400 TRY / До 400 ₺

## Manual scenarios

| ID | Area | Scenario | Expected result |
|---|---|---|---|
| WEB-01 | Homepage | Open the homepage | Page loads without fatal browser errors |
| WEB-02 | Entry point | Find and activate the Smart Choice CTA | CTA is visible and opens `/smart-choice/` |
| WEB-03 | Welcome | Open Smart Choice directly | Welcome heading, trust copy, start button and full-menu fallback are visible |
| WEB-04 | Localisation | Switch TR → RU → EN | Heading, controls, footer and document language change consistently |
| WEB-05 | Five-step flow | Complete the Russian happy path | Exactly five questions are shown in sequence and results are produced |
| WEB-06 | Budget transparency | Review results | Price and recommendation type are visible; premium is explicitly labelled when above budget |
| WEB-07 | Select result | Choose the first recommendation | Selection is saved only in the browser session and no order-confirmation wording appears |
| WEB-08 | Browser back | Go back from step 2 | Previous question is restored without losing the flow |
| WEB-09 | Session recovery | Reload during the flow | Current step, answers and language are recovered for the session |
| WEB-10 | Full-menu exit | Open the full-menu link | User can safely leave Smart Choice for the menu |
| WEB-11 | Keyboard | Navigate primary controls with Tab/Enter | Visible focus exists and controls are operable without a pointer |
| WEB-12 | No JavaScript | Open Smart Choice with JavaScript disabled | A readable fallback and full-menu link are available |
| WEB-13 | Offline continuation | Load the page, then go offline and complete the flow | The recommendation flow remains functional without API requests |
| WEB-14 | Error hygiene | Observe console, page errors and failed same-origin resources | No uncaught page errors or unexpected same-origin 4xx/5xx responses |
| MOB-01 | Mobile entry | Open homepage on Pixel 7 viewport | Smart Choice CTA is visible and tappable |
| MOB-02 | Responsive layout | Open welcome, each question, results and selected state | No horizontal scrolling or clipped primary content |
| MOB-03 | Touch targets | Inspect primary and option controls | Main interactive controls are at least approximately 44 px high |
| MOB-04 | Mobile flow | Complete the five-step Russian happy path | All steps can be completed using taps in portrait orientation |
| MOB-05 | Mobile language | Switch languages on the narrow header | Language controls remain visible and usable without overlap |
| MOB-06 | Mobile back/reload | Use browser back and reload mid-flow | State recovery works on the mobile viewport |
| SIM-01 | Simulator smoke | Open owner simulator | Intro, boundary note, inputs and disabled export controls are visible |
| SIM-02 | Simulator calculation | Submit valid default values | Scenario results render and JSON/Markdown exports become enabled |
| SIM-03 | Simulator mobile | Run the calculation on Pixel 7 viewport | Form and result are readable without horizontal overflow |
| SIM-04 | Simulator boundary | Review result wording | Result is described as a scenario, not a forecast or guaranteed growth |

## Severity model

- **Blocker:** route unavailable, flow cannot finish, false order/payment confirmation, destructive data issue.
- **Critical:** core recommendation is materially wrong, budget boundary is hidden, mobile flow unusable.
- **Major:** important feature fails but a safe workaround exists.
- **Minor:** visual, wording, spacing or accessibility defect with limited impact.

## Exit criteria

Release is accepted for web/mobile-web only when:
1. WEB-01 through WEB-14 and MOB-01 through MOB-06 have no Blocker/Critical defects.
2. The five-step flow completes on desktop and mobile.
3. No page claims that a real order or payment was submitted.
4. The simulator clearly remains an owner planning scenario.
5. Any Major/Minor defects are recorded with evidence and an explicit release decision.
