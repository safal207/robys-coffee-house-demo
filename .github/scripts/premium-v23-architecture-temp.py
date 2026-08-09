from pathlib import Path


def replace_once(path: Path, old: str, new: str):
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing anchor in {path}: {old[:220]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")

# 1) Real 3D context: outer wrapper owns clipping/isolation; inner stage owns perspective/preserve-3d.
p = Path("day-night-entry.js")
replace_once(p,
'''    touchAction: "manipulation",
    isolation: "isolate",
    perspective: "980px",
    perspectiveOrigin: "52% 44%",
    transformStyle: "preserve-3d"
  });
  overlay.className = `robys-contextual-entry robys-${sceneName}-entry`;
  overlay.setAttribute("aria-hidden", "true");

  const depthHaze = createSplineLayer({''',
'''    touchAction: "manipulation",
    isolation: "isolate"
  });
  overlay.className = `robys-contextual-entry robys-${sceneName}-entry`;
  overlay.setAttribute("aria-hidden", "true");

  const sceneStage = applyStyles(document.createElement("div"), {
    position: "absolute",
    inset: "0",
    perspective: "980px",
    perspectiveOrigin: "52% 44%",
    transformStyle: "preserve-3d",
    pointerEvents: "none"
  });
  sceneStage.className = "robys-entry-scene-stage";

  const depthHaze = createSplineLayer({''')
replace_once(p,
'''  const vignette = createSplineLayer({
    inset: "0",
    background: theme.vignette,
    opacity: ".85",
    zIndex: "8"
  }, "robys-entry-vignette");''',
'''  const vignette = createSplineLayer({
    inset: "0",
    background: theme.vignette,
    opacity: ".85",
    transform: "translateZ(46px)",
    zIndex: "8"
  }, "robys-entry-vignette");''')
replace_once(p,
'''  logoStage.append(logoHalo, logoFocus, mark, wordmark);
  overlay.append(depthHaze, ambient, brownRibbon, redSurface, specularEdge, goldArc, lightVeil, foregroundOccluder, vignette, logoStage);

  return {
    overlay,
    depthHaze,''',
'''  logoStage.append(logoHalo, logoFocus, mark, wordmark);
  sceneStage.append(depthHaze, ambient, brownRibbon, redSurface, specularEdge, goldArc, lightVeil, foregroundOccluder, vignette, logoStage);
  overlay.append(sceneStage);

  return {
    overlay,
    sceneStage,
    depthHaze,''')

# 2) Version the public contextual module import so returning PWA users cannot receive stale optics.
p = Path("bootstrap.js")
replace_once(p,
'''    : import("./day-night-entry.js?v=20260809-contextual-v1");''',
'''    : import("./day-night-entry.js?v=20260809-premium-optics-v23");''')

# 3) Rotate SW cache and make day-night-entry exact-revision cache matching explicit.
p = Path("sw.js")
text = p.read_text(encoding="utf-8")
text = text.replace(
'const CACHE_VERSION = "robys-offline-v38-20260809-contextual-entry-v1-10750cdfa32c-58d387ca0c01-96b566c9731e";',
'const CACHE_VERSION = "robys-offline-v39-20260809-premium-optics-v23-10750cdfa32c-58d387ca0c01-96b566c9731e";', 1)
text = text.replace('  "./day-night-entry.js",', '  "./day-night-entry.js?v=20260809-premium-optics-v23",', 1)
anchor = '''  const requiresExactRevision =
    url.pathname.endsWith("/discover-v2.js") ||'''
replacement = '''  const requiresExactRevision =
    url.pathname.endsWith("/day-night-entry.js") ||
    url.pathname.endsWith("/discover-v2.js") ||'''
if anchor not in text:
    raise SystemExit("missing SW exact-revision anchor")
text = text.replace(anchor, replacement, 1)
p.write_text(text, encoding="utf-8", newline="\n")

# 4) Harden premium evidence workflow: exact PR head binding, immutable actions, no cancellation.
p = Path(".github/workflows/premium-depth-certification.yml")
text = p.read_text(encoding="utf-8")
text = text.replace('      - "day-night-entry.js"\n', '      - "bootstrap.js"\n      - "day-night-entry.js"\n      - "sw.js"\n', 1)
# Replace second paths occurrence too.
idx = text.find('      - "day-night-entry.js"\n', text.find('push:'))
if idx == -1:
    raise SystemExit("missing push day-night path")
text = text[:idx] + '      - "bootstrap.js"\n      - "day-night-entry.js"\n      - "sw.js"\n' + text[idx + len('      - "day-night-entry.js"\n'):]
text = text.replace('  group: premium-depth-certification-${{ github.ref }}\n  cancel-in-progress: true',
                    '  group: premium-depth-certification-${{ github.event.pull_request.head.sha || github.sha }}\n  cancel-in-progress: false', 1)
text = text.replace('uses: actions/checkout@v4', 'uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4', 1)
text = text.replace('uses: actions/setup-node@v4', 'uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4', 1)
text = text.replace('uses: actions/upload-artifact@v4', 'uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4', 1)
text = text.replace('name: premium-depth-v22-final-${{ github.sha }}',
                    'name: premium-depth-v23-final-${{ github.event.pull_request.head.sha || github.sha }}', 1)
text = text.replace('name: MOTION-DEPTH-001 premium optics v2.2 final gate',
                    'name: MOTION-DEPTH-001 premium optics v2.3 real-3d gate', 1)
p.write_text(text, encoding="utf-8", newline="\n")

# 5) Harden smoke evidence and prove the inner non-grouping 3D scene context.
p = Path("scripts/premium-depth-smoke.mjs")
text = p.read_text(encoding="utf-8")
text = text.replace('{ cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }',
                    '{ cwd: process.cwd(), stdio: ["ignore", "ignore", "inherit"] }', 1)
old = '''    const stage = select(".robys-entry-logo-stage");
    const mark = stage?.querySelector('img[src*="robys-mark-master-v1.svg"]');'''
new = '''    const overlay = select(".robys-contextual-entry");
    const sceneStage = select(".robys-entry-scene-stage");
    const stage = select(".robys-entry-logo-stage");
    const mark = stage?.querySelector('img[src*="robys-mark-master-v1.svg"]');'''
if old not in text:
    raise SystemExit("missing smoke stage anchor")
text = text.replace(old, new, 1)
old = '''      optics: document.documentElement.dataset.robysEntryOptics ?? "",
      overlayPerspective: getComputedStyle(document.querySelector(".robys-contextual-entry")).perspective,
      overlayOpacity: Number(getComputedStyle(document.querySelector(".robys-contextual-entry")).opacity),
      depthPlanes: document.documentElement.dataset.robysEntryDepthPlanes ?? "",'''
new = '''      optics: document.documentElement.dataset.robysEntryOptics ?? "",
      overlayPresent: Boolean(overlay),
      overlayOpacity: overlay ? Number(getComputedStyle(overlay).opacity) : 0,
      scenePerspective: sceneStage ? getComputedStyle(sceneStage).perspective : "",
      sceneTransformStyle: sceneStage ? getComputedStyle(sceneStage).transformStyle : "",
      outerOverflow: overlay ? getComputedStyle(overlay).overflow : "",
      depthPlanes: document.documentElement.dataset.robysEntryDepthPlanes ?? "",'''
if old not in text:
    raise SystemExit("missing smoke perspective anchor")
text = text.replace(old, new, 1)
text = text.replace('      foreground: style(".robys-entry-foreground-occluder"),\n',
                    '      foreground: style(".robys-entry-foreground-occluder"),\n      vignette: style(".robys-entry-vignette"),\n', 1)
text = text.replace('  assert(evidence.overlayPerspective !== "none", `${scene}: CSS perspective is not active`);',
                    '  assert(evidence.scenePerspective !== "none" && evidence.scenePerspective !== "", `${scene}: inner CSS perspective is not active`);\n  assert(evidence.sceneTransformStyle === "preserve-3d", `${scene}: inner scene is not a real preserve-3d context: ${evidence.sceneTransformStyle}`);\n  assert(evidence.outerOverflow === "hidden", `${scene}: outer clipping wrapper contract changed`);', 1)
text = text.replace('  assert(evidence.foreground.zIndex < evidence.logoStage.zIndex, `${scene}: foreground may occlude the logo`);',
                    '  assert(evidence.foreground.zIndex < evidence.vignette.zIndex, `${scene}: vignette must remain on/above foreground plane`);\n  assert(evidence.vignette.zIndex < evidence.logoStage.zIndex, `${scene}: vignette may occlude the logo focal plane`);\n  assert(evidence.vignette.transform !== "none", `${scene}: vignette is not assigned to the foreground 3D plane`);\n  assert(evidence.foreground.zIndex < evidence.logoStage.zIndex, `${scene}: foreground may occlude the logo`);', 1)
text = text.replace('    focusEvidence = await readDepthEvidence(page);\n    if ((focusEvidence.mark?.opacity ?? 0) >= .98',
                    '    focusEvidence = await readDepthEvidence(page);\n    if (!focusEvidence.overlayPresent) break;\n    if ((focusEvidence.mark?.opacity ?? 0) >= .98', 1)
text = text.replace('    depthModel: "perspective far-plane parallax -> espresso depth -> hero/specular material -> cinematic blurred foreground -> sharp logo focal plane",',
                    '    depthModel: "outer clip -> inner preserve-3d perspective -> far-plane parallax -> espresso/hero/specular material -> cinematic blurred foreground/vignette plane -> sharp logo focal plane",', 1)
text = text.replace('console.log(`✅ MOTION-DEPTH-001 passed: perspective far plane + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px foreground DOF; late sharp-logo focus frames, subdued ribbon/ring, static blur and material specular hierarchy are certified.`);',
                    'console.log(`✅ MOTION-DEPTH-001 passed: real inner preserve-3d perspective + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px foreground DOF; pre-handoff sharp-logo focal hold, subdued ribbon/ring, static blur and material specular hierarchy are certified.`);', 1)
p.write_text(text, encoding="utf-8", newline="\n")

print("premium optics v2.3 architecture migration applied")
