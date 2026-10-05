# PR #426 visual and pairing review

## Initial evidence

- Inspected source head: `1f8bebf1d8352114750e04869d9f3c8f8db91a3e`.
- Exact baseline: `fbda46da5e267de07e45202edeb9c35ff220fd93`.
- Visual run: https://github.com/safal207/robys-coffee-house-demo/actions/runs/37311566759
- Artifact: `visual-ui-ux-37311566759`, ID `11345822648`.
- ZIP SHA256: `01763b558722579da484111dda2cd07394ab54c7f96ad15990923460bb0c42db`.
- Both preserved attempts report the same seven failures among 43 comparisons; locked toolchain unchanged.

| Capture | Viewport | Observed difference | Disposition |
| --- | --- | --- | --- |
| menu-full | phone-320 | 11669 → 11654px height | Poster has a single-letter Sebastian wrap and action/chip crowding; fix before accepting the intended localized poster changes. |
| menu-full | phone-390 | 11424 → 11408px height | Intended localized copy and revised poster geometry; verify corrected layout. |
| menu-full | tablet-768 | 13215 → 13199px height | Intended localized copy and revised poster geometry; verify corrected layout. |
| menu-full | desktop-1440 | 219122 / 9972000 changed pixels | Both posters are clipped within a masonry column, also visible in the baseline; repair the current UI rather than accept clipping. |
| menu-share | phone-320 | 2449 / 143080 changed pixels | Same content and 280×511 crop; text rasterization changes with upstream document geometry. No missing action, clipping or copy change. |
| menu-share | phone-360-short | 2079 / 158720 changed pixels | Same content and 320×496 crop; same bounded rendering difference. |
| menu-share | phone-390 | 724 / 176750 changed pixels | Same content and 350×505 crop; same bounded rendering difference. |

Original full-page captures were compared in paired segments, including pairing cards, following product rows, share section and footer. All three failed share crops and their diff images were inspected. A changed-page-height result is not treated as a 100% UI failure.

## Repairs

- Span the featured section across the desktop masonry columns.
- Use the actual poster container width for typography and a grid for title/price placement.
- Allow the poster to grow for localized/enlarged text; reserve a separate bottom region for the action arrow.
- Rebuild stylesheet cache revisions, service-worker namespace and integrity manifest through the declared build.
- Assert independent TR/EN/RU fixtures for inline eyebrow, kicker, label, explanation prefix, tasting heading/notes and all three action labels.
- Exercise both pairing IDs in each language and native/fallback dialog mode: 12 flows, with exact product-name fixtures, controlled/expanded state, keyboard activation, focus return and unchanged cart count.
- Extend Premium UI with both-poster text containment, title/price separation and chip/action separation at 100%/200% text, including fine-pointer desktop at 901/1440px.

## Executed local verification

Full `npm run check` and `npm run verify:security` passed, including 353 security contracts and the secret scan. Premium UI passed 77 checks with the new poster assertions; Adversarial browser passed 38 checks, including 12 localized-copy and 12 pairing-flow cases. An additional bounded geometry probe passed 132 combinations: TR/EN/RU × fine/touch × 320/360/390/680/681/768/819/820/900/901/1440px × 100%/200% text. The expanded UI/UX matrix passed all 24 scenarios without a recheck. Capture/reachability passed 18/18; rapid mobile scrolling passed at 320/390px with stable height and zero repaint difference. Locked-toolchain negative controls passed 26/26.

Browser mutation controls changed only intercepted local test responses, not repository assets:

- An English eyebrow replaced by Turkish fails exactly the four EN pairing/mode localization cases.
- A second-pairing handoff redirected to the first product fails exactly the six second-pairing language/mode flow cases.

The source-bound control result is recorded in `pr426-pairing-negative-controls.json` beside this document.

## Repaired capture inspection

The repaired UI source is `fc72f89cd4e7c05a309d55e4925212dd14364ce3`. The unchanged capture/comparison runner against the exact committed base reports nine failures among 43 comparisons. All four full-page pairs were inspected from the header through the footer in paired segments, and all five failed share crops were inspected alongside their pixel-diff images. This includes the newly affected laptop/desktop share crops after the desktop poster repair.

| Capture | Viewport | Repaired observation | Reviewed scope |
| --- | --- | --- | --- |
| menu-full | phone-320 | 11669 → 11654px | Localized poster text, readable title/price, separate action region; following products, share actions and footer retained. |
| menu-full | phone-390 | 11424 → 11408px | Same bounded localized poster/layout change. |
| menu-full | tablet-768 | 13215 → 13199px | Same bounded localized poster/layout change. |
| menu-full | desktop-1440 | 6925 → 7563px | Featured panel spans both masonry columns, removing clipped posters; following menu content remains present. |
| menu-share | phone-320 | 2449 / 143080 pixels | Same readable content and crop size. |
| menu-share | phone-360-short | 2079 / 158720 pixels | Same readable content and crop size. |
| menu-share | phone-390 | 724 / 176750 pixels | Same readable content and crop size. |
| menu-share | laptop-1366 | 1919 / 368160 pixels | Same readable content and crop size after the desktop layout repair. |
| menu-share | desktop-1440 | 2249 / 375240 pixels | Same readable content and crop size after the desktop layout repair. |

A separate browser geometry probe confirms identical share text, card/copy widths and heights, and the copy's offset within the card at all five widths. The card's document Y changes by −15.1875px on phones and +638.484375px on laptop/desktop. The observed edge-rasterization differences are consistent with this fractional-position change; that causal explanation is an inference, not a claim that a changed crop was pixel-identical.

## Visual acceptance boundary

The initial artifact is historical defect evidence. It cannot approve the repaired UI. The single record `qa/reviewed-visual-changes.d/pr426-pairing-discovery-reviewed.json` covers only the inspected repaired local captures, 23 exact content bindings and their nine-comparison failure set. Its pixel-ratio limits are the actual observed ratios, with no added margin; full-page dimension reasons and crop pixel totals must match exactly. The unchanged verifier accepts the exact inspected set. Six isolated negative controls reject changed bound CSS, an additional comparison, one extra changed share pixel, changed full-page dimensions, changed crop pixel totals, and duplicate matching records; see `pr426-visual-record-negative-controls.json`. Global thresholds, toolchain and workflow privileges remain unchanged. Assistant visual inspection is explicitly not an independent human approval or release attestation.

The reviewed local evidence archive is `pr426-reviewed-visual-captures-fc72f89.zip` (25,373,760 bytes), SHA256 `007425fc5240012b00c2aa1abaefd32ebd7a2e24b9f19c165b283f48d15858dd`. It includes raw baseline/current/diff frames, paired inspection images, the comparison summary, source/capture hashes and share geometry. Inspection provenance: https://github.com/safal207/robys-coffee-house-demo/pull/426#issuecomment-6002667291. These captures are not represented as CI output. The first source-head CI Visual attempt was cancelled without any recorded step, log or artifact; its targeted rerun was requested.

Final-head remote CI evidence is recorded separately in the PR description after execution. Draft status remains unchanged; no merge or deployment is authorized by this evidence.
