# Firefox choice-to-counter follow-up

## Source and existing coverage

Repository: `safal207/robys-coffee-house-demo`. Inspected main:
`4d614bbf0ef26a440d76d4490b227ffad5705895`, including merged #433 and #434.
The Firefox automation and final local runs use test-source commit
`e391a5070c858ba65bca885ea3937b06e1c72bd4`.

At the inspected main, Firefox was present in the pinned Docker browser lab,
its HTTP availability checks and image-drift canary. Those checks did not place
an order. `test-choice-funnel-browser.mjs` and `adversarial-browser.mjs` launched
Chromium; `qa/playwright.config.ts` selected Chromium/WebKit gallery projects.
No Firefox order-to-QR automation was found in the tracked main tree. An older
PR description mentioning a broader audit is not execution evidence for main.

## Reused coverage

The existing choice-funnel runner now accepts `CHOICE_FUNNEL_BROWSER=firefox`.
It still defaults to Chromium and imports the same twenty custom-pairing
regression scenarios. No second implementation of those scenarios or new
browser dependency was added. Reports and screenshots are separated by engine.

| Scenario group | Matrix | Scenarios per engine |
| --- | --- | ---: |
| Landing geometry, images and hot-menu routing | TR/EN/RU × 320/360/390/768/1440 px; 360×640 short screen | 15 |
| Complete keyboard order, cart editing, QR and reload | TR/EN/RU × 390×900 and 1440×900 | 6 |
| Useful entry without JavaScript | 390×844 | 1 |
| Existing custom-pairing regression | Native/fallback dialogs, 27 eligible drinks, twelve desserts, existing selections, grouped edits, variants, capacity, focus, failure/retry and 100/200% text geometry | 20 |
| **Total** | **Each browser** | **42** |

The complete order selects Caffè Latte and Lotus Cheesecake through the actual
disclosure and native radio controls. Unit cost is read independently from the
catalog (currently 180 + 190 = 370 ₺). Product quantity 2 must total 740 ₺; cart
increase must show 1,110 ₺ and decrease must restore 740 ₺. Both committed member
IDs and their quantities are asserted, followed by the same total on the QR.

The order uses Tab/Shift+Tab, arrow keys and Enter, without calling `.focus()`
or `.click()` for its order controls. Accessible names, selected-radio focus
visibility, QR modal forward/reverse wrapping, Escape and focus restoration are
asserted. Opening/closing QR and reloading must preserve the entire committed
draft; the restored pair must again reach a visible QR at the same total.

## Execution and evidence

Final local environment: Node 24.19.0, locked Playwright 1.55.1, Linux x64;
Firefox 141.0 and Chromium 140.0.7339.186. Both source-head checks and the
integrity-manifest hash are recorded in each JSON report. Test-definition hashes
are checked again at completion. Interrupted runs start with `RUNNING`, so a
previous report cannot silently count as a current pass.

| Check | Result | Evidence |
| --- | --- | --- |
| Firefox choice funnel | PASS, 42 scenarios | `firefox-report.json`, `firefox-pairing-report.json` |
| Chromium choice funnel | PASS, 42 scenarios | `chromium-report.json`, `chromium-pairing-report.json` |
| Full required local check | PASS | `validation.json` |
| Security | PASS, 353 contracts and secret scan | `validation.json` |
| Performance | PASS, existing budgets | `validation.json` |

The local container rejects Firefox content-process user namespaces
(`/proc/self/uid_map: EPERM`). Local execution therefore used
`MOZ_DISABLE_CONTENT_SANDBOX=1`; this environment flag is recorded in the Firefox
report. It is not set by the CI job. Application CSP, assertions, security
contracts and performance/visual thresholds remain unchanged. The normal CI
runner uses Node 22 and installs only the Firefox revision from the lockfile.

Representative captures:

- [Mobile pair selection](pairing-390-ru.png)
- [Mobile cart, two pairs and 740 ₺](cart-390-ru.png)
- [Desktop cashier QR and total](qr-1440-ru.png)

`manifest.json` binds the saved evidence by size and SHA-256. This proves file
identity, not independent review. Machine-readable calibration reports are
retained in `calibration.json`; they describe older harness revisions and must
not be counted as final-source product failures or passes.

## Harness calibration, not product fixes

- Firefox can reject `img.decode()` while a lazy image request is unsettled.
  The runner now requires every entry image to be complete with nonzero natural
  width before decoding; decoding and geometry assertions remain mandatory.
- The language initialization fixture previously wrote localStorage in sandboxed
  third-party frames. It now owns only the local top-level document. The
  application exception listener still accepts no exceptions; no error is filtered.
- Firefox restores sequential keyboard position after reload and Tab at the
  final link leaves the document. The helper now navigates in both directions
  instead of assuming a forward-only browser-chrome wrap. Modal wrap assertions
  remain explicit and unchanged in strength.

No customer-facing defect was established by these runs, so no production source,
generated runtime, catalog price, service worker or integrity manifest was changed.

## Reproduce

```bash
npm ci --no-audit --no-fund
npx --no-install playwright install --with-deps chromium firefox
npm run check
npm run verify:security
npm run verify:performance
npm run test:choice-funnel
npm run test:choice-funnel:firefox
```

In a container with the documented namespace restriction, the last command was:

```bash
MOZ_DISABLE_CONTENT_SANDBOX=1 npm run test:choice-funnel:firefox
```

The existing `adversarial-browser.yml` now includes the read-only
`Firefox choice-to-counter` job for PRs, main pushes, its existing schedule and
manual dispatch. It retains logs, reports, screenshots and failure traces for
30 days even on failure. The existing Chromium job and gallery/WebKit gates are
preserved. Workflow execution is separate evidence from the local runs above.

These are local browser checks with service workers blocked and reduced motion,
plus responsive Linux Firefox viewports. They do not certify a physical Android
Firefox device, offline Firefox, cashier fulfilment, payment or sales impact.
No merge, deployment or independent human approval is claimed.
