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

## Verification and remaining boundary

- `npm run check`: PASS, including existing pairing source contracts.
- `npm run verify:security`: PASS, 287 security checks and the secret scan.
- `git diff --check`: PASS.
- Local browser rendering: NOT RUN. Cloud Browser blocked the local preview URL;
  a file URL was also explicitly rejected by its URL policy. No bypass was used.
- No new screenshot evidence or physical Android verification is claimed.
- Existing reviewed visual allowances were not updated or broadened. The changed
  phone section needs fresh screenshot review before release.

Review the actual home page in TR, EN and RU at 320, 360, 393, 430, 768 and 1280 CSS
pixels. Check the logo, slogan and decorative pill do not overlap; the device stays
inside the card; the heading and install actions are fully readable. Repeat narrow
layouts with enlarged text. Review both pairing cards and their product dialogs
using the existing PR #346 regression coverage. The release still requires current
CI and visual evidence; this document is not a release approval.
