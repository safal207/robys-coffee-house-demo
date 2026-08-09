from pathlib import Path

runtime_path = Path("day-night-entry.js")
runtime = runtime_path.read_text()

replacements = [
    (
        '    brownRibbon: "linear-gradient(154deg, rgba(54,17,11,.78) 10%, rgba(91,39,22,.72) 48%, rgba(127,62,31,.62) 76%, rgba(49,15,10,.8) 100%)",',
        '    brownRibbon: "linear-gradient(154deg, rgba(54,17,11,.5) 10%, rgba(91,39,22,.42) 48%, rgba(127,62,31,.32) 76%, rgba(49,15,10,.52) 100%)",',
    ),
    (
        '    ribbonPeak: .42,\n    goldArcPeak: .36,\n    goldArcEnd: .08,',
        '    ribbonPeak: .24,\n    goldArcPeak: .28,\n    goldArcEnd: .05,',
    ),
    (
        '    brownRibbon: "linear-gradient(154deg, rgba(17,6,5,.8) 10%, rgba(38,15,10,.7) 48%, rgba(67,31,17,.58) 76%, rgba(20,7,6,.82) 100%)",',
        '    brownRibbon: "linear-gradient(154deg, rgba(17,6,5,.52) 10%, rgba(38,15,10,.4) 48%, rgba(67,31,17,.3) 76%, rgba(20,7,6,.54) 100%)",',
    ),
    (
        '    ribbonPeak: .36,\n    goldArcPeak: .28,\n    goldArcEnd: .06,',
        '    ribbonPeak: .2,\n    goldArcPeak: .22,\n    goldArcEnd: .04,',
    ),
    (
        '      const p = phase(t, .46, .78);',
        '      const p = phase(t, .42, .7);',
    ),
    (
        '      const rise = phase(t, .4, .7);\n      const settle = phase(t, .78, 1);',
        '      const rise = phase(t, .36, .64);\n      const settle = phase(t, .8, 1);',
    ),
    (
        '      const rise = phase(t, .48, .76);\n      const settle = phase(t, .86, 1);',
        '      const rise = phase(t, .4, .66);\n      const settle = phase(t, .84, 1);',
    ),
    (
        '      const rise = phase(t, .5, .7);\n      const settle = phase(t, .7, .84);',
        '      const rise = phase(t, .44, .62);\n      const settle = phase(t, .62, .76);',
    ),
    (
        '      const rise = phase(t, .6, .84);',
        '      const rise = phase(t, .54, .76);',
    ),
]

for old, new in replacements:
    if old not in runtime:
        raise SystemExit(f"runtime anchor missing: {old[:180]}")
    runtime = runtime.replace(old, new, 1)

runtime_path.write_text(runtime)

test_path = Path("scripts/premium-depth-smoke.mjs")
test = test_path.read_text()

test_replacements = [
    (
        '      overlayPerspective: getComputedStyle(document.querySelector(".robys-contextual-entry")).perspective,',
        '      overlayPerspective: getComputedStyle(document.querySelector(".robys-contextual-entry")).perspective,\n      overlayOpacity: Number(getComputedStyle(document.querySelector(".robys-contextual-entry")).opacity),',
    ),
    (
        '''    if ((focusEvidence.mark?.opacity ?? 0) >= .92
      && (focusEvidence.wordmark?.opacity ?? 0) >= .72
      && (focusEvidence.logoFocus?.opacity ?? 0) >= .68) {''',
        '''    if ((focusEvidence.mark?.opacity ?? 0) >= .98
      && (focusEvidence.wordmark?.opacity ?? 0) >= .95
      && (focusEvidence.logoFocus?.opacity ?? 0) >= .8
      && (focusEvidence.overlayOpacity ?? 0) >= .98) {''',
    ),
    (
        '''  assert((focusEvidence?.mark?.opacity ?? 0) >= .92, `${scene}: late focal mark never resolved`);
  assert((focusEvidence?.wordmark?.opacity ?? 0) >= .72, `${scene}: late focal wordmark never resolved`);
  assert((focusEvidence?.logoFocus?.opacity ?? 0) >= .68, `${scene}: late amber focus pocket never resolved`);
  assert((focusEvidence?.brownRibbon?.opacity ?? 1) <= .43, `${scene}: espresso ribbon still dominates late focus: ${focusEvidence?.brownRibbon?.opacity}`);
  assert((focusEvidence?.goldArc?.opacity ?? 1) <= .37, `${scene}: vector gold arc still dominates late focus: ${focusEvidence?.goldArc?.opacity}`);''',
        '''  assert((focusEvidence?.mark?.opacity ?? 0) >= .98, `${scene}: focal mark never reached its sharp hold`);
  assert((focusEvidence?.wordmark?.opacity ?? 0) >= .95, `${scene}: focal wordmark never reached its sharp hold`);
  assert((focusEvidence?.logoFocus?.opacity ?? 0) >= .8, `${scene}: amber focus pocket never reached focal hold`);
  assert((focusEvidence?.overlayOpacity ?? 0) >= .98, `${scene}: focus screenshot drifted into handoff fade`);
  assert((focusEvidence?.brownRibbon?.opacity ?? 1) <= .25, `${scene}: espresso ribbon still dominates focal hold: ${focusEvidence?.brownRibbon?.opacity}`);
  assert((focusEvidence?.goldArc?.opacity ?? 1) <= .29, `${scene}: vector gold arc still dominates focal hold: ${focusEvidence?.goldArc?.opacity}`);''',
    ),
    (
        '      focusOpacity: focusEvidence.logoFocus.opacity,\n      brownRibbonOpacity: focusEvidence.brownRibbon.opacity,',
        '      focusOpacity: focusEvidence.logoFocus.opacity,\n      overlayOpacity: focusEvidence.overlayOpacity,\n      brownRibbonOpacity: focusEvidence.brownRibbon.opacity,',
    ),
]

for old, new in test_replacements:
    if old not in test:
        raise SystemExit(f"test anchor missing: {old[:180]}")
    test = test.replace(old, new, 1)

test_path.write_text(test)
