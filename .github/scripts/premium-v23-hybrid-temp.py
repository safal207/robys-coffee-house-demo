from pathlib import Path


def replace_once(path: Path, old: str, new: str):
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing anchor in {path}: {old[:220]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")

p = Path("day-night-entry.js")

# Keep only lightweight material layers in preserve-3d. Static blur/focus live as 2D optical siblings.
replace_once(p,
'''    transformStyle: "preserve-3d",
    pointerEvents: "none"
  });''',
'''    transformStyle: "preserve-3d",
    pointerEvents: "none",
    zIndex: "0"
  });''')

replace_once(p,
'''    opacity: "0",
    transform: "translateZ(46px) rotateX(-.8deg) rotateY(1.4deg) rotate(-14deg) translate3d(-3vw,3vh,0) scale(1.04)",
    transformOrigin: "50% 50%",
    zIndex: "7"''',
'''    opacity: "0",
    transform: "rotate(-14deg) translate3d(-3vw,3vh,0) scale(1.04)",
    transformOrigin: "50% 50%",
    zIndex: "7"''')

replace_once(p,
'''    background: theme.vignette,
    opacity: ".85",
    transform: "translateZ(46px)",
    zIndex: "8"''',
'''    background: theme.vignette,
    opacity: ".85",
    zIndex: "8"''')

replace_once(p,
'''    width: "min(72vw, 296px)",
    transform: "translate(-50%, -38%) translateZ(76px) scale(.86)",''',
'''    width: "min(72vw, 296px)",
    transform: "translate(-50%, -38%) scale(.86)",''')

replace_once(p,
'''  logoStage.append(logoHalo, logoFocus, mark, wordmark);
  sceneStage.append(depthHaze, ambient, brownRibbon, redSurface, specularEdge, goldArc, lightVeil, foregroundOccluder, vignette, logoStage);
  overlay.append(sceneStage);''',
'''  logoStage.append(logoHalo, logoFocus, mark, wordmark);
  sceneStage.append(depthHaze, ambient, brownRibbon, redSurface, specularEdge, goldArc, lightVeil);
  overlay.append(sceneStage, foregroundOccluder, vignette, logoStage);''')

replace_once(p,
'''        transform: `translateZ(46px) rotateX(${mix(-1.2, -.4, p).toFixed(3)}deg) rotateY(${mix(2.2, .8, p).toFixed(3)}deg) rotate(${mix(-14, -10.5, p).toFixed(3)}deg) translate3d(${mix(-5, 1.2, p).toFixed(3)}vw,${mix(5, 1.2, p).toFixed(3)}vh,0) scale(${mix(1.06, 1.015, p).toFixed(4)})`''',
'''        transform: `rotate(${mix(-14, -11, p).toFixed(3)}deg) translate3d(${mix(-3, .8, p).toFixed(3)}vw,${mix(3, .8, p).toFixed(3)}vh,0) scale(${mix(1.04, 1.01, p).toFixed(4)})`''')

replace_once(p,
'''        transform: `translate(-50%, ${mix(-34, -42, p).toFixed(3)}%) translateZ(76px) scale(${mix(.86, .94, p).toFixed(4)})`''',
'''        transform: `translate(-50%, ${mix(-34, -42, p).toFixed(3)}%) scale(${mix(.86, .94, p).toFixed(4)})`''')

p = Path("scripts/premium-depth-smoke.mjs")
text = p.read_text(encoding="utf-8")

old = '''    const overlay = select(".robys-contextual-entry");
    const sceneStage = select(".robys-entry-scene-stage");
    const stage = select(".robys-entry-logo-stage");'''
new = '''    const overlay = select(".robys-contextual-entry");
    const sceneStage = select(".robys-entry-scene-stage");
    const foregroundElement = select(".robys-entry-foreground-occluder");
    const vignetteElement = select(".robys-entry-vignette");
    const stage = select(".robys-entry-logo-stage");'''
if old not in text:
    raise SystemExit("missing hybrid smoke DOM anchor")
text = text.replace(old, new, 1)

old = '''      outerOverflow: overlay ? getComputedStyle(overlay).overflow : "",
      depthPlanes: document.documentElement.dataset.robysEntryDepthPlanes ?? "",'''
new = '''      outerOverflow: overlay ? getComputedStyle(overlay).overflow : "",
      sceneParentClass: sceneStage?.parentElement?.className ?? "",
      depthParentClass: select(".robys-entry-depth-haze")?.parentElement?.className ?? "",
      foregroundParentClass: foregroundElement?.parentElement?.className ?? "",
      vignetteParentClass: vignetteElement?.parentElement?.className ?? "",
      logoParentClass: stage?.parentElement?.className ?? "",
      depthPlanes: document.documentElement.dataset.robysEntryDepthPlanes ?? "",'''
if old not in text:
    raise SystemExit("missing hybrid smoke evidence anchor")
text = text.replace(old, new, 1)

old = '''  assert(evidence.sceneTransformStyle === "preserve-3d", `${scene}: inner scene is not a preserve-3d context: ${evidence.sceneTransformStyle}`);
  assert(evidence.outerOverflow === "hidden", `${scene}: outer clipping wrapper contract changed`);
  assert(evidence.depthPlanes === "3", `${scene}: expected exactly three logical depth planes`);'''
new = '''  assert(evidence.sceneTransformStyle === "preserve-3d", `${scene}: inner scene is not a preserve-3d context: ${evidence.sceneTransformStyle}`);
  assert(evidence.outerOverflow === "hidden", `${scene}: outer clipping wrapper contract changed`);
  assert(String(evidence.sceneParentClass).includes("robys-contextual-entry"), `${scene}: 3D stage escaped clipping wrapper`);
  assert(evidence.depthParentClass === "robys-entry-scene-stage", `${scene}: material plane is not inside 3D stage`);
  assert(String(evidence.foregroundParentClass).includes("robys-contextual-entry"), `${scene}: blurred foreground must stay outside preserve-3d`);
  assert(String(evidence.vignetteParentClass).includes("robys-contextual-entry"), `${scene}: vignette must stay outside preserve-3d`);
  assert(String(evidence.logoParentClass).includes("robys-contextual-entry"), `${scene}: sharp logo must stay outside preserve-3d`);
  assert(evidence.depthPlanes === "3", `${scene}: expected exactly three logical depth planes`);'''
if old not in text:
    raise SystemExit("missing hybrid smoke structure assertion")
text = text.replace(old, new, 1)

old = '  const expectedForegroundBlur = scene === "night" ? 24 : 18;'
new = '  const expectedForegroundBlur = scene === "night" ? 16 : 12;'
if old not in text:
    raise SystemExit("missing compact blur expectation")
text = text.replace(old, new, 1)

old = '''  assert(evidence.foreground.zIndex < evidence.vignette.zIndex, `${scene}: vignette must remain on/above foreground plane`);
  assert(evidence.vignette.zIndex < evidence.logoStage.zIndex, `${scene}: vignette may occlude the logo focal plane`);
  assert(evidence.vignette.transform !== "none", `${scene}: vignette is not assigned to the foreground 3D plane`);
  assert(evidence.foreground.zIndex < evidence.logoStage.zIndex, `${scene}: foreground may occlude the logo`);'''
new = '''  assert(evidence.foreground.zIndex < evidence.vignette.zIndex, `${scene}: vignette must remain above foreground optical plane`);
  assert(evidence.vignette.zIndex < evidence.logoStage.zIndex, `${scene}: vignette may occlude logo focal plane`);
  assert(evidence.foreground.zIndex < evidence.logoStage.zIndex, `${scene}: foreground may occlude the logo`);'''
if old not in text:
    raise SystemExit("missing hybrid smoke z assertion")
text = text.replace(old, new, 1)

old = '''  assertTransformOpacityOnly(evidence.foreground, `${scene} foreground`);
  assertTransformOpacityOnly(evidence.specularEdge, `${scene} specular edge`);'''
new = '''  assertTransformOpacityOnly(evidence.foreground, `${scene} foreground`);
  for (const frame of evidence.foreground.animationKeyframes) {
    const transform = String(frame.transform ?? "");
    assert(!transform.includes("translateZ"), `${scene}: blurred foreground re-entered 3D compositor`);
    assert(!transform.includes("rotateX"), `${scene}: blurred foreground animates rotateX`);
    assert(!transform.includes("rotateY"), `${scene}: blurred foreground animates rotateY`);
  }
  assertTransformOpacityOnly(evidence.specularEdge, `${scene} specular edge`);'''
if old not in text:
    raise SystemExit("missing hybrid smoke animation assertion")
text = text.replace(old, new, 1)

text = text.replace(
    '    depthModel: "perspective far-plane parallax -> espresso depth -> hero/specular material -> cinematic blurred foreground -> sharp logo focal plane",',
    '    depthModel: "outer clip -> lightweight preserve-3d material stage -> compact static-blur 2D foreground/vignette -> sharp pre-handoff logo focal plane",',
    1,
)
text = text.replace(
    'console.log(`✅ MOTION-DEPTH-001 passed: perspective far plane + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px foreground DOF; late sharp-logo focus frames, subdued ribbon/ring, static blur and material specular hierarchy are certified.`);',
    'console.log(`✅ MOTION-DEPTH-001 passed: lightweight real preserve-3d material stage + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px 2D foreground DOF; strict pre-handoff sharp-logo focal hold and compositor-safe hierarchy are certified.`);',
    1,
)

p.write_text(text, encoding="utf-8", newline="\n")
print("hybrid premium 3D optimization applied")
