# Mobile phone layout follow-up — 7 September 2026

The owner supplied two mobile screenshots: the installation section occupied most
of the screen and appeared clipped; pairing prices crossed their product titles.

## Scope and baseline

This follow-up is based on PR #346 at
`7799f80b5a6561beec57f2d98f8e8ca58e8c36fa`. Its existing pairing repair renders the
full photograph with the title, catalogue price and set action below it. That
repair is not yet published; the live main was
`e3edcf13de323c3adb80c9c96465f1dd0425eee0` when checked.

The additional phone repair bounds the device by the card content width, removes
its mobile rotation, uses the available card width, and reduces the heading and
decorative device on small screens. The logo and localized screen copy now use
normal flow, with space reserved for the decorative Android pill. The mobile card
uses a solid background without backdrop blur. The screenshot alone does not
establish the cause of its rectangular paint artifact or prove this artifact
resolved on the owner's Android device.

The device slogan follows the existing TR/EN/RU localization path. Build-generated
conversion runtime, HTML asset revision, service-worker references and the
integrity manifest are regenerated together. APK bytes and download behavior are
unchanged.

## Verification

- `npm run check`: PASS, including existing pairing source contracts.
- `npm run verify:security`: PASS, 287 security checks and the secret scan.
- `git diff --check`: PASS.
- Local browser rendering: NOT RUN. Cloud Browser blocked the local preview URL;
  a file URL was also explicitly rejected by its URL policy. No bypass was used.
- CI browser evidence is now available for source head
  `b6f5d45e1ae327142cc38b3018d3e267bc27a4f8`, whose source tree matches the locally
  verified implementation. Visual run [34162660472](https://github.com/safal207/robys-coffee-house-demo/actions/runs/34162660472)
  captured all 43 comparisons twice; both result arrays are identical.
- At that head, 24 workflows passed, the human approval workflow was skipped for
  the draft, and Visual regression stopped at the missing reviewed-change record.
  Its later dependent UI checks did not run; the separate Premium UI, order,
  guest-journey, security, motion and Android smoke workflows passed.

## Screenshot inspection

The [evidence directory](../../qa/evidence/pr-348-mobile-phone/) contains the
original comparison summary, before/after phone-section crops, unmodified social
captures and a provenance manifest. The manifest records crop coordinates and
original image hashes, plus the downloaded archive's SHA-256. Screenshots are from
deterministic Chromium with the default Turkish locale.

At 320, 390, 768 and 1440 CSS pixels, the phone stays within its card; its logo,
slogan and decorative pill are separate. The smaller heading and install actions
are readable. The phone is upright on mobile. The native Turkish slogan replaces
the previous English text within the Turkish page. All menu screenshot comparisons
pass against the existing pairing repair in PR #346.

Four landing-page comparisons change total height with the shorter phone section:

| Width | Before | After |
| --- | ---: | ---: |
| 320 | 8234 | 8074 |
| 390 | 8661 | 8442 |
| 768 | 7673 | 7567 |
| 1440 | 7093 | 6987 |

The five other differences are social-offer crops: one pixel of crop height at
320/1440 and small pixel changes at 360/768/1366. At all six social viewports,
recorded root dimensions, relative child boxes, text, fonts and colors are exactly
equal before/after. Only document Y changes, including its fractional component.
Source inspection confirms no social implementation change. Visual inspection
finds no overlap or content loss; crop rounding and rasterization after the page
shift are the evidence-supported explanation, not a reproduced browser root cause.
The comparator's ratio of 1 for dimension mismatches is a sentinel, not a claim
that every pixel changed.

The new PR #348 reviewed-change record binds the source, runtime, comparator,
configuration and evidence bytes, and accepts exactly these nine differences.
Pixel ceilings are the observed values, with no added tolerance. Existing records,
global limits, capture scripts, masks and workflows remain unchanged. This is
assistant visual inspection, not human attestation or release authorization.

The unchanged `verify-reviewed-visual-change.mjs` accepts both captured summaries.
Isolated negative controls reject an extra failed comparison, one pixel above an
observed ceiling, and a stale runtime binding. Results are in
`qa/evidence/pr-348-mobile-phone/validator-checks.json`. The full `npm run check`
and `npm run verify:security` commands were repeated successfully before publishing
the evidence update.

## Remaining boundary

Review the actual home page in TR, EN and RU at 320, 360, 393, 430, 768 and 1280 CSS
pixels. Check the logo, slogan and decorative pill do not overlap; the device stays
inside the card; the heading and install actions are fully readable. Repeat narrow
layouts with enlarged text. Review both pairing cards and their product dialogs
using the existing PR #346 regression coverage. Physical Android/browser-translation
behavior, enlarged text in this specific phone section, and its EN/RU visual
rendering are not established by these TR captures. A fresh CI comparison is
required after the evidence commit. This document is not a release approval.
