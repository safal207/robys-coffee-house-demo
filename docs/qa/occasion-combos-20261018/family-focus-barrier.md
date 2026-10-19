# Latest-cart focus baseline

Premium feedback job `117779250703` at revision
`a9fe1c31d5582e84c9dc4302d210160b59d0e851` failed the existing
`latest-cart-supersedes-family` scenario. Its baseline had an active element with
an empty ID and scroll position 0; the later snapshot had focus on
`menu-cart-title` with the same scroll position. The delayed family panel stayed
hidden and the newer cart stayed open.

The source explains this interleaving. `openCart()` supplies the cart title as
initial focus. `openDialog()` opens the dialog and schedules that focus on the
next animation frame. The old test waited only for `dialog[open]` before taking
its baseline, allowing legitimate cart focus to arrive during its later two-frame
wait and be misclassified as focus stolen by the delayed family module.

The correction waits for `#menu-cart-title` to own focus before recording the
cart baseline and releasing the older family-module request. It preserves the
delayed request, hidden-family check, open-cart check and exact before/after
focus-and-scroll comparison. No production code or timeout threshold changes.

The source-fixture results from this correction are preserved separately:

- `family-focus-chromium-report.json`: full family suite 25/25 PASS.
- `family-focus-webkit-report.json`: four latest-intent scenarios 4/4 PASS.
- In both cart cases, before and after are exactly
  `{ "scroll": 0, "focus": "menu-cart-title" }`.

The original unmodified case also passed once locally in Chromium; the CI
failure and the source's scheduled focus establish the timing boundary rather
than claiming a deterministic local failure. Firefox 141.0 launched successfully,
but its local `browserContext.newPage()` call did not complete within a bounded
30 second probe, before any scenario assertion. No local Firefox pass is claimed.

These reports identify their own working-tree source hashes and the base
revision above. They precede the subsequent mobile-navigation helper correction
and are not presented as browser coverage of a later release commit.
