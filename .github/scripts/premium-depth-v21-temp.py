from pathlib import Path

runtime_path = Path("day-night-entry.js")
runtime = runtime_path.read_text()

replacements = [
    (
        '    brownRibbon: "linear-gradient(154deg, rgba(54,17,11,.99) 10%, rgba(91,39,22,.98) 48%, rgba(127,62,31,.96) 76%, rgba(49,15,10,.99) 100%)",',
        '    brownRibbon: "linear-gradient(154deg, rgba(54,17,11,.78) 10%, rgba(91,39,22,.72) 48%, rgba(127,62,31,.62) 76%, rgba(49,15,10,.8) 100%)",',
    ),
    (
        '''    brownShadow: [
      "inset 0 3px 0 rgba(255,222,166,.88)",
      "inset 0 18px 34px rgba(236,163,91,.14)",
      "0 18px 62px rgba(18,5,4,.28)"
    ].join(","),
    goldBorder: "1px solid rgba(255,230,187,.68)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(255,241,215,.24), rgba(226,155,76,.1) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 16px rgba(255,231,190,.62)",
      "0 0 52px rgba(230,157,82,.36)",
      "inset 0 0 48px rgba(255,228,181,.14)"
    ].join(","),''',
        '''    brownShadow: [
      "inset 0 2px 0 rgba(255,222,166,.34)",
      "inset 0 16px 32px rgba(236,163,91,.07)",
      "0 20px 72px rgba(18,5,4,.18)"
    ].join(","),
    goldBorder: "1px solid rgba(255,230,187,.3)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(255,241,215,.12), rgba(226,155,76,.04) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 10px rgba(255,231,190,.3)",
      "0 0 34px rgba(230,157,82,.16)",
      "inset 0 0 38px rgba(255,228,181,.06)"
    ].join(","),''',
    ),
    (
        '    ribbonPeak: .78,\n    goldArcPeak: .72,\n    goldArcEnd: .24,',
        '    ribbonPeak: .42,\n    goldArcPeak: .36,\n    goldArcEnd: .08,',
    ),
    (
        '    brownRibbon: "linear-gradient(154deg, rgba(17,6,5,.995) 10%, rgba(38,15,10,.99) 48%, rgba(67,31,17,.97) 76%, rgba(20,7,6,.995) 100%)",',
        '    brownRibbon: "linear-gradient(154deg, rgba(17,6,5,.8) 10%, rgba(38,15,10,.7) 48%, rgba(67,31,17,.58) 76%, rgba(20,7,6,.82) 100%)",',
    ),
    (
        '''    brownShadow: [
      "inset 0 2px 0 rgba(236,177,105,.58)",
      "inset 0 18px 38px rgba(181,99,46,.08)",
      "0 20px 78px rgba(0,0,0,.5)"
    ].join(","),
    goldBorder: "1px solid rgba(247,191,113,.46)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(250,201,127,.14), rgba(177,95,42,.06) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 13px rgba(245,185,106,.34)",
      "0 0 54px rgba(157,81,36,.28)",
      "inset 0 0 54px rgba(235,169,92,.08)"
    ].join(","),''',
        '''    brownShadow: [
      "inset 0 2px 0 rgba(236,177,105,.22)",
      "inset 0 18px 38px rgba(181,99,46,.04)",
      "0 22px 82px rgba(0,0,0,.34)"
    ].join(","),
    goldBorder: "1px solid rgba(247,191,113,.2)",
    goldBackground: "radial-gradient(circle at 35% 70%, rgba(250,201,127,.07), rgba(177,95,42,.025) 36%, rgba(0,0,0,0) 68%)",
    goldShadow: [
      "0 0 8px rgba(245,185,106,.18)",
      "0 0 32px rgba(157,81,36,.14)",
      "inset 0 0 44px rgba(235,169,92,.035)"
    ].join(","),''',
    ),
    (
        '    ribbonPeak: .7,\n    goldArcPeak: .58,\n    goldArcEnd: .18,',
        '    ribbonPeak: .36,\n    goldArcPeak: .28,\n    goldArcEnd: .06,',
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
        '      redSurface: style(".robys-entry-red-surface"),\n      specularEdge: style(".robys-entry-specular-edge"),',
        '      redSurface: style(".robys-entry-red-surface"),\n      brownRibbon: style(".robys-entry-brown-ribbon"),\n      goldArc: style(".robys-entry-gold-arc"),\n      specularEdge: style(".robys-entry-specular-edge"),',
    ),
    (
        '''  await page.screenshot({
    path: path.join(resultsDir, `premium-depth-${scene}-mid.png`),
    fullPage: false
  });
  await context.close();

  return {
    scene,
    depthBlurPx: depthBlur,
    foregroundBlurPx: foregroundBlur,
    focusBlurPx: focusBlur,
    evidence
  };''',
        '''  await page.screenshot({
    path: path.join(resultsDir, `premium-depth-${scene}-mid.png`),
    fullPage: false
  });

  let focusEvidence = null;
  const focusStartedAt = Date.now();
  while (Date.now() - focusStartedAt < 1_350) {
    focusEvidence = await readDepthEvidence(page);
    if ((focusEvidence.mark?.opacity ?? 0) >= .92
      && (focusEvidence.wordmark?.opacity ?? 0) >= .72
      && (focusEvidence.logoFocus?.opacity ?? 0) >= .68) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 24));
  }

  assert((focusEvidence?.mark?.opacity ?? 0) >= .92, `${scene}: late focal mark never resolved`);
  assert((focusEvidence?.wordmark?.opacity ?? 0) >= .72, `${scene}: late focal wordmark never resolved`);
  assert((focusEvidence?.logoFocus?.opacity ?? 0) >= .68, `${scene}: late amber focus pocket never resolved`);
  assert((focusEvidence?.brownRibbon?.opacity ?? 1) <= .43, `${scene}: espresso ribbon still dominates late focus: ${focusEvidence?.brownRibbon?.opacity}`);
  assert((focusEvidence?.goldArc?.opacity ?? 1) <= .37, `${scene}: vector gold arc still dominates late focus: ${focusEvidence?.goldArc?.opacity}`);

  await page.screenshot({
    path: path.join(resultsDir, `premium-depth-${scene}-focus.png`),
    fullPage: false
  });
  await context.close();

  return {
    scene,
    depthBlurPx: depthBlur,
    foregroundBlurPx: foregroundBlur,
    focusBlurPx: focusBlur,
    focus: {
      markOpacity: focusEvidence.mark.opacity,
      wordmarkOpacity: focusEvidence.wordmark.opacity,
      focusOpacity: focusEvidence.logoFocus.opacity,
      brownRibbonOpacity: focusEvidence.brownRibbon.opacity,
      goldArcOpacity: focusEvidence.goldArc.opacity
    },
    evidence
  };''',
    ),
    (
        '    day: { depthBlurPx: day.depthBlurPx, foregroundBlurPx: day.foregroundBlurPx, focusBlurPx: day.focusBlurPx },\n    night: { depthBlurPx: night.depthBlurPx, foregroundBlurPx: night.foregroundBlurPx, focusBlurPx: night.focusBlurPx }',
        '    day: { depthBlurPx: day.depthBlurPx, foregroundBlurPx: day.foregroundBlurPx, focusBlurPx: day.focusBlurPx, focus: day.focus },\n    night: { depthBlurPx: night.depthBlurPx, foregroundBlurPx: night.foregroundBlurPx, focusBlurPx: night.focusBlurPx, focus: night.focus }',
    ),
    (
        'console.log(`✅ MOTION-DEPTH-001 passed: gradient-softened far plane + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px foreground DOF; sharp canonical logo, static blur, three-plane z hierarchy and specular focus are certified.`);',
        'console.log(`✅ MOTION-DEPTH-001 passed: perspective far plane + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px foreground DOF; late sharp-logo focus frames, subdued ribbon/ring, static blur and material specular hierarchy are certified.`);',
    ),
]

for old, new in test_replacements:
    if old not in test:
        raise SystemExit(f"test anchor missing: {old[:180]}")
    test = test.replace(old, new, 1)

test_path.write_text(test)
