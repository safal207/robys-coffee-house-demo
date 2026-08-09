from pathlib import Path

path = Path("scripts/premium-depth-smoke.mjs")
text = path.read_text(encoding="utf-8")

repls = [
    (
        '      overlayPerspective: getComputedStyle(document.querySelector(".robys-contextual-entry")).perspective,\n',
        '      overlayPerspective: getComputedStyle(document.querySelector(".robys-contextual-entry")).perspective,\n      overlayOpacity: Number(getComputedStyle(document.querySelector(".robys-contextual-entry")).opacity),\n'
    ),
    (
        '    if ((focusEvidence.mark?.opacity ?? 0) >= .92\n      && (focusEvidence.wordmark?.opacity ?? 0) >= .72\n      && (focusEvidence.logoFocus?.opacity ?? 0) >= .68) {\n',
        '    if ((focusEvidence.overlayOpacity ?? 0) >= .92\n      && (focusEvidence.mark?.opacity ?? 0) >= .92\n      && (focusEvidence.wordmark?.opacity ?? 0) >= .72\n      && (focusEvidence.logoFocus?.opacity ?? 0) >= .68) {\n'
    ),
    (
        '  assert((focusEvidence?.mark?.opacity ?? 0) >= .92, `${scene}: late focal mark never resolved`);\n',
        '  assert((focusEvidence?.overlayOpacity ?? 0) >= .92, `${scene}: focal evidence was captured after overlay fade began: ${focusEvidence?.overlayOpacity}`);\n  assert((focusEvidence?.mark?.opacity ?? 0) >= .92, `${scene}: late focal mark never resolved`);\n'
    ),
    (
        '  assert((focusEvidence?.goldArc?.opacity ?? 1) <= .37, `${scene}: vector gold arc still dominates late focus: ${focusEvidence?.goldArc?.opacity}`);\n',
        '  assert((focusEvidence?.goldArc?.opacity ?? 1) <= .37, `${scene}: vector gold arc still dominates late focus: ${focusEvidence?.goldArc?.opacity}`);\n  assert((focusEvidence.overlayOpacity * focusEvidence.mark.opacity) >= .86, `${scene}: effective mark visibility is too weak before handoff`);\n  assert((focusEvidence.overlayOpacity * focusEvidence.wordmark.opacity) >= .68, `${scene}: effective wordmark visibility is too weak before handoff`);\n  assert((focusEvidence.overlayOpacity * focusEvidence.logoFocus.opacity) >= .62, `${scene}: effective focus pocket is too weak before handoff`);\n'
    ),
    (
        '      markOpacity: focusEvidence.mark.opacity,\n',
        '      overlayOpacity: focusEvidence.overlayOpacity,\n      markOpacity: focusEvidence.mark.opacity,\n'
    ),
]

for old, new in repls:
    if old not in text:
        raise SystemExit(f"missing anchor: {old[:180]!r}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8", newline="\n")
print("effective late-focus evidence hardened")
