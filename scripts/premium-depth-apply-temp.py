from pathlib import Path

path = Path("day-night-entry.js")
text = path.read_text(encoding="utf-8")

def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f"missing anchor:\n{old[:180]}")
    text = text.replace(old, new, 1)

replace_once(
'''    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,252,245,.18)) drop-shadow(0 8px 18px rgba(32,8,7,.16))",
    coldDuration: 1_180,''',
'''    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,252,245,.18)) drop-shadow(0 8px 18px rgba(32,8,7,.16))",
    depthHaze: "radial-gradient(ellipse at 74% 34%, rgba(255,220,167,.18) 0%, rgba(167,72,34,.09) 34%, rgba(45,13,12,0) 66%), linear-gradient(145deg, rgba(74,26,18,.62), rgba(45,13,12,.1) 54%, rgba(82,29,18,.48))",
    depthHazeBlur: "blur(8px)",
    foregroundVolume: "radial-gradient(ellipse at 68% 26%, rgba(240,69,61,.42) 0%, rgba(143,16,28,.72) 35%, rgba(58,9,12,.94) 72%, rgba(32,7,8,.98) 100%)",
    foregroundBlur: "blur(14px)",
    foregroundPeak: .5,
    specularEdge: "linear-gradient(98deg, rgba(255,231,194,0) 4%, rgba(255,226,181,.14) 31%, rgba(255,244,221,.9) 51%, rgba(246,174,94,.52) 64%, rgba(255,231,194,0) 94%)",
    specularShadow: "0 0 12px rgba(255,235,205,.36), 0 0 34px rgba(238,163,83,.22)",
    specularPeak: .8,
    haloBlur: "blur(22px)",
    focusBlur: "blur(13px)",
    coldDuration: 1_180,''')

replace_once(
'''    focus: "radial-gradient(ellipse at center, rgba(255,226,179,.78) 0%, rgba(242,191,126,.56) 30%, rgba(165,88,44,.28) 52%, rgba(55,19,12,.08) 72%, rgba(13,5,5,0) 84%)",
    markFilter: "drop-shadow(0 8px 24px rgba(133,13,24,.28))",
    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,232,197,.08)) drop-shadow(0 10px 24px rgba(0,0,0,.32))",
    coldDuration: 1_480,''',
'''    focus: "radial-gradient(ellipse at center, rgba(255,226,179,.88) 0%, rgba(242,191,126,.66) 28%, rgba(165,88,44,.34) 50%, rgba(55,19,12,.08) 72%, rgba(13,5,5,0) 84%)",
    markFilter: "drop-shadow(0 8px 24px rgba(133,13,24,.28))",
    wordmarkFilter: "drop-shadow(0 1px 0 rgba(255,232,197,.08)) drop-shadow(0 10px 24px rgba(0,0,0,.32))",
    depthHaze: "radial-gradient(ellipse at 76% 36%, rgba(232,169,96,.12) 0%, rgba(113,48,25,.08) 36%, rgba(13,5,5,0) 68%), linear-gradient(145deg, rgba(31,10,8,.72), rgba(13,5,5,.18) 54%, rgba(42,15,10,.58))",
    depthHazeBlur: "blur(11px)",
    foregroundVolume: "radial-gradient(ellipse at 66% 24%, rgba(151,27,36,.3) 0%, rgba(92,8,19,.72) 36%, rgba(28,4,7,.96) 72%, rgba(10,3,4,.995) 100%)",
    foregroundBlur: "blur(18px)",
    foregroundPeak: .62,
    specularEdge: "linear-gradient(98deg, rgba(248,199,132,0) 4%, rgba(238,181,111,.08) 31%, rgba(255,218,162,.66) 51%, rgba(197,105,51,.36) 64%, rgba(248,199,132,0) 94%)",
    specularShadow: "0 0 10px rgba(244,193,124,.22), 0 0 38px rgba(157,81,36,.2)",
    specularPeak: .62,
    haloBlur: "blur(24px)",
    focusBlur: "blur(15px)",
    coldDuration: 1_480,''')

replace_once(
'''  const ambient = createSplineLayer({
    inset: "-18%",
    background: theme.ambient,
    opacity: "0",
    transform: "scale(1.035)"
  }, "robys-entry-ambient");''',
'''  const depthHaze = createSplineLayer({
    inset: "-22%",
    background: theme.depthHaze,
    filter: theme.depthHazeBlur,
    opacity: "0",
    transform: "translate3d(-1.6vw,.8vh,0) scale(1.08)",
    zIndex: "0"
  }, "robys-entry-depth-haze");

  const ambient = createSplineLayer({
    inset: "-18%",
    background: theme.ambient,
    opacity: "0",
    transform: "scale(1.035)",
    zIndex: "1"
  }, "robys-entry-ambient");''')

replace_once(
'''    opacity: "0",
    transform: "rotate(-11deg) scale(1.08)"
  }, "robys-entry-red-surface");''',
'''    opacity: "0",
    transform: "rotate(-11deg) scale(1.08)",
    zIndex: "3"
  }, "robys-entry-red-surface");

  const specularEdge = createSplineLayer({
    left: "-18vw",
    bottom: "7vh",
    width: "94vw",
    height: "22vh",
    borderRadius: "50%",
    background: theme.specularEdge,
    boxShadow: theme.specularShadow,
    opacity: "0",
    transform: "rotate(-8deg) translate3d(5vw,4vh,0) scale(1.04)",
    transformOrigin: "50% 50%",
    zIndex: "4"
  }, "robys-entry-specular-edge");''')

replace_once(
'''    opacity: "0",
    transform: "rotate(8deg) translate3d(5vw,-2vh,0) scale(1.04)"
  }, "robys-entry-brown-ribbon");''',
'''    opacity: "0",
    transform: "rotate(8deg) translate3d(5vw,-2vh,0) scale(1.04)",
    zIndex: "2"
  }, "robys-entry-brown-ribbon");''')

replace_once(
'''    opacity: "0",
    transform: "rotate(19deg) translate3d(4vw,-3vh,0) scale(1.08)"
  }, "robys-entry-gold-arc");''',
'''    opacity: "0",
    transform: "rotate(19deg) translate3d(4vw,-3vh,0) scale(1.08)",
    zIndex: "5"
  }, "robys-entry-gold-arc");''')

replace_once(
'''    background: theme.lightVeil,
    opacity: "0",
    transform: "translate3d(11%,0,0) rotate(7deg)"
  }, "robys-entry-light-veil");''',
'''    background: theme.lightVeil,
    opacity: "0",
    transform: "translate3d(11%,0,0) rotate(7deg)",
    zIndex: "6"
  }, "robys-entry-light-veil");

  const foregroundOccluder = createSplineLayer({
    left: "-38vw",
    bottom: "-24vh",
    width: "92vw",
    height: "78vh",
    borderRadius: "52% 48% 46% 54%",
    background: theme.foregroundVolume,
    filter: theme.foregroundBlur,
    opacity: "0",
    transform: "rotate(-18deg) translate3d(-8vw,7vh,0) scale(1.16)",
    transformOrigin: "50% 50%",
    zIndex: "7"
  }, "robys-entry-foreground-occluder");''')

replace_once(
'''    inset: "0",
    background: theme.vignette,
    opacity: ".85"
  }, "robys-entry-vignette");''',
'''    inset: "0",
    background: theme.vignette,
    opacity: ".85",
    zIndex: "8"
  }, "robys-entry-vignette");''')

replace_once(
'''    gap: "12px",
    isolation: "isolate",
    willChange: "transform, opacity",
    pointerEvents: "none"
  });''',
'''    gap: "12px",
    isolation: "isolate",
    willChange: "transform, opacity",
    pointerEvents: "none",
    zIndex: "10"
  });''')

replace_once('''    background: theme.halo,
    filter: "blur(20px)",''', '''    background: theme.halo,
    filter: theme.haloBlur,''')
replace_once('''    background: theme.focus,
    filter: "blur(16px)",''', '''    background: theme.focus,
    filter: theme.focusBlur,''')

replace_once(
'''  logoStage.append(logoHalo, logoFocus, mark, wordmark);
  overlay.append(ambient, redSurface, brownRibbon, goldArc, lightVeil, vignette, logoStage);''',
'''  logoStage.append(logoHalo, logoFocus, mark, wordmark);
  overlay.append(depthHaze, ambient, brownRibbon, redSurface, specularEdge, goldArc, lightVeil, foregroundOccluder, vignette, logoStage);''')

replace_once(
'''    overlay,
    ambient,
    redSurface,
    brownRibbon,
    goldArc,
    lightVeil,
    logoStage,''',
'''    overlay,
    depthHaze,
    ambient,
    redSurface,
    brownRibbon,
    specularEdge,
    goldArc,
    lightVeil,
    foregroundOccluder,
    logoStage,''')

replace_once(
'''    overlay,
    ambient,
    redSurface,
    brownRibbon,
    goldArc,
    lightVeil,
    logoStage,''',
'''    overlay,
    depthHaze,
    ambient,
    redSurface,
    brownRibbon,
    specularEdge,
    goldArc,
    lightVeil,
    foregroundOccluder,
    logoStage,''')

replace_once(
'''  document.documentElement.dataset.robysEntryFamily = "contextual-v1";
  document.documentElement.dataset.robysEntryTempo = sceneName;''',
'''  document.documentElement.dataset.robysEntryFamily = "contextual-v1";
  document.documentElement.dataset.robysEntryTempo = sceneName;
  document.documentElement.dataset.robysEntryDepth = "premium-v1";
  document.documentElement.dataset.robysEntryDepthPlanes = "3";''')

replace_once(
'''  requestAnimationFrame(() => {
    animateSafe(ambient, poseSeries((t) => {''',
'''  requestAnimationFrame(() => {
    animateSafe(depthHaze, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .72, 1);
      return {
        opacity: phase(t, 0, .38) * mix(.78, .62, settle),
        transform: `translate3d(${mix(-1.6, .7, p).toFixed(3)}vw,${mix(.8, -.4, p).toFixed(3)}vh,0) scale(${mix(1.08, 1.025, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(ambient, poseSeries((t) => {''')

replace_once(
'''    animateSafe(brownRibbon, poseSeries((t) => {
      const p = smoothPose(t);''',
'''    animateSafe(specularEdge, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: peak(t, .1, .56, 1, theme.specularPeak, .28),
        transform: `rotate(${mix(-8, -4.8, p).toFixed(3)}deg) translate3d(${mix(5, -1.2, p).toFixed(3)}vw,${mix(4, .4, p).toFixed(3)}vh,0) scale(${mix(1.04, 1.005, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(brownRibbon, poseSeries((t) => {
      const p = smoothPose(t);''')

replace_once(
'''    animateSafe(logoStage, poseSeries((t) => {''',
'''    animateSafe(foregroundOccluder, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .72, 1);
      return {
        opacity: phase(t, .04, .34) * mix(theme.foregroundPeak, theme.foregroundPeak * .74, settle),
        transform: `rotate(${mix(-18, -12.5, p).toFixed(3)}deg) translate3d(${mix(-8, 3.2, p).toFixed(3)}vw,${mix(7, 1.2, p).toFixed(3)}vh,0) scale(${mix(1.16, 1.045, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(logoStage, poseSeries((t) => {''')

path.write_text(text, encoding="utf-8", newline="\n")
print("premium depth pass applied")
