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

Full `npm run check` and `npm run verify:security` passed, including 353 security contracts and the secret scan. Premium UI passed with the new poster assertions. An additional bounded geometry probe passed 132 combinations: TR/EN/RU × fine/touch × 320/360/390/680/681/768/819/820/900/901/1440px × 100%/200% text.

Browser mutation controls changed only intercepted local test responses, not repository assets:

- An English eyebrow replaced by Turkish fails exactly the four EN pairing/mode localization cases.
- A second-pairing handoff redirected to the first product fails exactly the six second-pairing language/mode flow cases.

The source-bound control result is recorded in `pr426-pairing-negative-controls.json` beside this document.

## Visual acceptance boundary

The initial artifact is historical defect evidence. It cannot approve the repaired UI. A reviewed-change record will cover only inspected repaired captures, exact content bindings and their actual failure set. Global thresholds, toolchain and workflow privileges remain unchanged. Assistant visual inspection is explicitly not an independent human approval or release attestation.

Current-head remote CI evidence is recorded in the PR description after execution. Draft status remains unchanged; no merge or deployment is authorized by this evidence.
