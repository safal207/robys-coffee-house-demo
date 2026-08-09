from pathlib import Path

runtime_path = Path("day-night-entry.js")
runtime = runtime_path.read_text()

replacements = [
    ('    ribbonPeak: .24,\n    goldArcPeak: .28,\n    goldArcEnd: .05,', '    ribbonPeak: .14,\n    goldArcPeak: .22,\n    goldArcEnd: .04,'),
    ('    ribbonPeak: .2,\n    goldArcPeak: .22,\n    goldArcEnd: .04,', '    ribbonPeak: .12,\n    goldArcPeak: .18,\n    goldArcEnd: .03,'),
    ('      const p = phase(t, .42, .7);', '      const p = phase(t, .36, .64);'),
    ('      const rise = phase(t, .36, .64);\n      const settle = phase(t, .8, 1);', '      const rise = phase(t, .32, .58);\n      const settle = phase(t, .82, 1);'),
    ('      const rise = phase(t, .4, .66);\n      const settle = phase(t, .84, 1);', '      const rise = phase(t, .34, .6);\n      const settle = phase(t, .84, 1);'),
    ('      const rise = phase(t, .44, .62);\n      const settle = phase(t, .62, .76);', '      const rise = phase(t, .38, .54);\n      const settle = phase(t, .54, .66);'),
    ('      const rise = phase(t, .54, .76);', '      const rise = phase(t, .46, .66);'),
]

for old, new in replacements:
    if old not in runtime:
        raise SystemExit(f"runtime anchor missing: {old[:160]}")
    runtime = runtime.replace(old, new, 1)

runtime_path.write_text(runtime)

test_path = Path("scripts/premium-depth-smoke.mjs")
test = test_path.read_text()

test_replacements = [
    (
        '      overlayOpacity: Number(getComputedStyle(document.querySelector(".robys-contextual-entry")).opacity),',
        '      overlayOpacity: Number(getComputedStyle(document.querySelector(".robys-contextual-entry")).opacity),\n      overlayAnimationCount: document.querySelector(".robys-contextual-entry")?.getAnimations().length ?? -1,\n      entryState: document.documentElement.dataset.robysEntryState ?? "",',
    ),
    (
        '''      && (focusEvidence.logoFocus?.opacity ?? 0) >= .8
      && (focusEvidence.overlayOpacity ?? 0) >= .98) {''',
        '''      && (focusEvidence.logoFocus?.opacity ?? 0) >= .8
      && (focusEvidence.overlayOpacity ?? 0) >= .98
      && (focusEvidence.overlayAnimationCount ?? -1) === 0
      && focusEvidence.entryState === "brand-frame") {''',
    ),
    (
        '''  assert((focusEvidence?.overlayOpacity ?? 0) >= .98, `${scene}: focus screenshot drifted into handoff fade`);
  assert((focusEvidence?.brownRibbon?.opacity ?? 1) <= .25, `${scene}: espresso ribbon still dominates focal hold: ${focusEvidence?.brownRibbon?.opacity}`);
  assert((focusEvidence?.goldArc?.opacity ?? 1) <= .29, `${scene}: vector gold arc still dominates focal hold: ${focusEvidence?.goldArc?.opacity}`);''',
        '''  assert((focusEvidence?.overlayOpacity ?? 0) >= .98, `${scene}: focus screenshot drifted into handoff fade`);
  assert((focusEvidence?.overlayAnimationCount ?? -1) === 0, `${scene}: overlay exit animation already started during focal hold`);
  assert(focusEvidence?.entryState === "brand-frame", `${scene}: focal hold is not inside brand-frame state: ${focusEvidence?.entryState}`);
  assert((focusEvidence?.brownRibbon?.opacity ?? 1) <= .16, `${scene}: espresso ribbon still dominates focal hold: ${focusEvidence?.brownRibbon?.opacity}`);
  assert((focusEvidence?.goldArc?.opacity ?? 1) <= .23, `${scene}: vector gold arc still dominates focal hold: ${focusEvidence?.goldArc?.opacity}`);''',
    ),
    (
        '      overlayOpacity: focusEvidence.overlayOpacity,\n      brownRibbonOpacity: focusEvidence.brownRibbon.opacity,',
        '      overlayOpacity: focusEvidence.overlayOpacity,\n      overlayAnimationCount: focusEvidence.overlayAnimationCount,\n      entryState: focusEvidence.entryState,\n      brownRibbonOpacity: focusEvidence.brownRibbon.opacity,',
    ),
]

for old, new in test_replacements:
    if old not in test:
        raise SystemExit(f"test anchor missing: {old[:180]}")
    test = test.replace(old, new, 1)

test_path.write_text(test)
