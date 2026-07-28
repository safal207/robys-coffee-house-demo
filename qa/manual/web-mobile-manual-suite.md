# Roby's Web + Android manual QA suite

**Purpose:** reusable customer-journey checks for the public website, responsive mobile web, Smart Choice, and the signed Android APK.

The cases below are written as manual tests. The companion GitHub workflow executes the same clicks and assertions in Chromium and an Android emulator to produce repeatable evidence. A physical-device pass is still required before public APK promotion.

## Test data

- Public site: `https://safal207.github.io/robys-coffee-house-demo/`
- Menu: `https://safal207.github.io/robys-coffee-house-demo/menu.html`
- Smart Choice: `https://safal207.github.io/robys-coffee-house-demo/smart-choice/`
- APK: reconstructed from `downloads/android-v1.1/part-01.b64` … `part-06.b64`
- Expected package: `com.robys.coffeehouse`
- Expected APK SHA-256: `f188c2f0ab820d514c9c1bd75734e3d76f8203f89d4a1604fd08da43fd7910a6`

## Severity

- **P0:** unusable product, unsafe payment/order implication, corrupted APK.
- **P1:** primary journey blocked; Smart Choice, menu, install, or navigation cannot complete.
- **P2:** important usability, localization, accessibility, or recovery defect.
- **P3:** cosmetic or low-impact inconsistency.

## Web desktop

| ID | Steps | Expected result |
|---|---|---|
| WEB-01 | Open the landing page at 1440×900. | Hero, primary CTA, menu link, address/hours and brand render without same-origin errors. |
| WEB-02 | Switch TR → EN → RU. Reload after each switch. | `html[lang]`, visible copy and saved language remain synchronized. |
| WEB-03 | Open the full menu from the header and hero. | `menu.html` loads and at least 20 products render. |
| WEB-04 | Search `Lotus`, then press Escape. Search a nonsense string. | Lotus results appear; Escape restores the full list; nonsense shows the localized empty state. |
| WEB-05 | Use category controls and deep links (`#hot-coffee`, `#desserts`). | Correct section is reachable; sticky controls do not cover the heading. |
| WEB-06 | Open **Help me choose / Seçmeme yardım et / Помочь выбрать**. | Smart Choice opens at `/smart-choice/` and does not show an endless loading state. |
| WEB-07 | Start Smart Choice. Select one option and continue through all five questions. | Progress moves 1/5 → 5/5; Continue is disabled before a choice and enabled after it. |
| WEB-08 | On step 3 use Back, change the previous answer, then continue. | Previous state is restored; the changed answer replaces the old one. |
| WEB-09 | On results inspect every card. | Each card shows role, components, reasons, total TRY price and the explicit “no order is sent” note. |
| WEB-10 | Choose the best result, reload, then use browser Back. | Selection survives the same session; Back returns to results rather than leaving the app unexpectedly. |
| WEB-11 | Open Full menu from Smart Choice. | Safe exit returns to `menu.html`; no order or payment call occurs. |
| WEB-12 | Navigate by keyboard only. | Skip link, language buttons, option buttons and actions have visible focus and logical order. |

## Responsive mobile web

Run at 320×640 and 390×844.

| ID | Steps | Expected result |
|---|---|---|
| MOB-WEB-01 | Open landing page and scroll top-to-bottom. | No horizontal scrolling, clipped text, overlapping fixed elements or invisible content. |
| MOB-WEB-02 | Open/close the mobile menu and use its links. | Toggle state and `aria-expanded` stay correct; focus remains usable. |
| MOB-WEB-03 | Inspect the bottom quick-action dock. | Exactly Route and Instagram are visible; page content is not hidden behind the dock. |
| MOB-WEB-04 | Open menu, search, change language and scroll categories. | Controls remain reachable with the software keyboard; results do not jump or overflow. |
| MOB-WEB-05 | Complete Smart Choice with one hand. | Primary targets are at least 44 px high; all five steps, results and confirmation fit without horizontal overflow. |
| MOB-WEB-06 | Rotate portrait → landscape → portrait. | State remains; no duplicated UI or broken progress bar. |
| MOB-WEB-07 | Reload midway through Smart Choice. | Current step and answer state recover from the session. |
| MOB-WEB-08 | Use Android browser Back through result → question → welcome. | Back navigation follows the Smart Choice state rather than abruptly closing the page. |

## Android APK

| ID | Steps | Expected result |
|---|---|---|
| APK-01 | Reconstruct the APK from six published parts and calculate SHA-256. | Size is 25,231 bytes; hash matches the approved value; ZIP/APK entries are intact. |
| APK-02 | Install on a clean Android emulator/device. | Package installs as `com.robys.coffeehouse` with no signature or parse error. |
| APK-03 | Launch from the app icon. | Roby's landing page loads inside the app; no blank/white screen or crash. |
| APK-04 | Tap the Smart Choice CTA. | `/smart-choice/` opens inside the same app WebView, not in an unrelated browser tab. |
| APK-05 | Complete all five Smart Choice steps and choose a result. | Recommendation and saved-choice confirmation render; no order/payment is sent. |
| APK-06 | Press Android Back from confirmation and from Smart Choice welcome. | Back traverses web history first; app exits only when no in-app history remains. |
| APK-07 | Tap Google Maps and Instagram. | Supported external links are handed to the correct external app/browser with a safe fallback. |
| APK-08 | Disable network after a successful launch; relaunch and press Refresh. | Cached content or a clear localized offline screen appears; Refresh retries without a crash. |
| APK-09 | Simulate an SSL/network failure. | A localized secure-connection error is shown; unsafe content is not loaded. |
| APK-10 | Background/foreground the app during step 3. | Current page remains usable; no duplicate WebView or lost navigation controls. |

## Release gate

Public release is allowed only when:

1. APK-01 through APK-06 and all WEB/MOB-WEB P0/P1 cases pass.
2. There are no unresolved P0/P1 defects.
3. APK-07 through APK-10 are completed on at least one physical Android device.
4. Prices, availability and “no order/payment” wording have owner approval.
