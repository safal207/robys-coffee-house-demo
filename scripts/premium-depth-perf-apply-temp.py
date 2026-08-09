from pathlib import Path

path = Path("day-night-entry.js")
text = path.read_text(encoding="utf-8")

def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f"missing runtime anchor:\n{old[:220]}")
    text = text.replace(old, new, 1)

replace_once('''    depthHazeBlur: "blur(8px)",''', '''    depthHazeBlur: "none",''')
replace_once('''    foregroundBlur: "blur(14px)",
    foregroundPeak: .5,''', '''    foregroundBlur: "blur(12px)",
    foregroundPeak: .42,''')
replace_once('''    depthHazeBlur: "blur(11px)",''', '''    depthHazeBlur: "none",''')
replace_once('''    foregroundBlur: "blur(18px)",
    foregroundPeak: .62,''', '''    foregroundBlur: "blur(14px)",
    foregroundPeak: .5,''')

replace_once(
'''  const depthHaze = createSplineLayer({
    inset: "-22%",
    background: theme.depthHaze,
    filter: theme.depthHazeBlur,
    opacity: "0",
    transform: "translate3d(-1.6vw,.8vh,0) scale(1.08)",
    zIndex: "0"
  }, "robys-entry-depth-haze");''',
'''  const depthHaze = createSplineLayer({
    inset: "-10%",
    background: theme.depthHaze,
    filter: theme.depthHazeBlur,
    opacity: ".64",
    transform: "scale(1.025)",
    zIndex: "0"
  }, "robys-entry-depth-haze");''')

replace_once(
'''  const foregroundOccluder = createSplineLayer({
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
  }, "robys-entry-foreground-occluder");''',
'''  const foregroundOccluder = createSplineLayer({
    left: "-22vw",
    bottom: "-10vh",
    width: "66vw",
    height: "54vh",
    borderRadius: "52% 48% 46% 54%",
    background: theme.foregroundVolume,
    filter: theme.foregroundBlur,
    opacity: "0",
    transform: "rotate(-18deg) translate3d(-4vw,4vh,0) scale(1.08)",
    transformOrigin: "50% 50%",
    zIndex: "7"
  }, "robys-entry-foreground-occluder");''')

replace_once(
'''    animateSafe(depthHaze, poseSeries((t) => {
      const p = smoothPose(t);
      const settle = phase(t, .72, 1);
      return {
        opacity: phase(t, 0, .38) * mix(.78, .62, settle),
        transform: `translate3d(${mix(-1.6, .7, p).toFixed(3)}vw,${mix(.8, -.4, p).toFixed(3)}vh,0) scale(${mix(1.08, 1.025, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

''', '')

replace_once(
'''        transform: `rotate(${mix(-18, -12.5, p).toFixed(3)}deg) translate3d(${mix(-8, 3.2, p).toFixed(3)}vw,${mix(7, 1.2, p).toFixed(3)}vh,0) scale(${mix(1.16, 1.045, p).toFixed(4)})`''',
'''        transform: `rotate(${mix(-18, -13.5, p).toFixed(3)}deg) translate3d(${mix(-4, 1.8, p).toFixed(3)}vw,${mix(4, .6, p).toFixed(3)}vh,0) scale(${mix(1.08, 1.02, p).toFixed(4)})`''')

path.write_text(text, encoding="utf-8", newline="\n")

# Align the dedicated depth contract with the performance-safe implementation:
# the far plane is gradient-softened and static, while real CSS blur is reserved
# for the smaller near-camera foreground occluder.
test_path = Path("scripts/premium-depth-smoke.mjs")
test = test_path.read_text(encoding="utf-8")

def test_replace(old: str, new: str):
    global test
    if old not in test:
        raise SystemExit(f"missing test anchor:\n{old[:220]}")
    test = test.replace(old, new, 1)

test_replace(
'''  assert(depthBlur >= 6 && depthBlur <= 12, `${scene}: background haze blur out of range: ${depthBlur}px`);
  assert(foregroundBlur >= 12 && foregroundBlur <= 20, `${scene}: foreground blur out of range: ${foregroundBlur}px`);
  assert(foregroundBlur > depthBlur, `${scene}: foreground must be softer than background haze`);''',
'''  assert(depthBlur === 0, `${scene}: background haze must stay gradient-softened without a large CSS blur texture`);
  assert(foregroundBlur >= 12 && foregroundBlur <= 16, `${scene}: foreground blur out of range: ${foregroundBlur}px`);
  assert(foregroundBlur > depthBlur, `${scene}: foreground must be softer than the far plane`);''')

test_replace(
'''  assertTransformOpacityOnly(evidence.depthHaze, `${scene} depth haze`);
  assertTransformOpacityOnly(evidence.foreground, `${scene} foreground`);''',
'''  assert(evidence.depthHaze.animationKeyframes.length === 0, `${scene}: far haze should be static to avoid full-screen filtered animation cost`);
  assert(String(evidence.depthHaze.background).includes("radial-gradient"), `${scene}: far haze must retain soft gradient depth`);
  assertTransformOpacityOnly(evidence.foreground, `${scene} foreground`);''')

test_replace(
'''    depthModel: "background haze -> hero material/specular -> foreground occluder -> sharp logo",''',
'''    depthModel: "static gradient-softened background haze -> hero material/specular -> compact blurred foreground occluder -> sharp logo",''')

test_replace(
'''  console.log(`✅ MOTION-DEPTH-001 passed: Day ${day.depthBlurPx}/${day.foregroundBlurPx}px depth/foreground blur, Night ${night.depthBlurPx}/${night.foregroundBlurPx}px; sharp canonical logo, static blur, three-plane z hierarchy and specular focus are certified.`);''',
'''  console.log(`✅ MOTION-DEPTH-001 passed: gradient-softened far plane + Day ${day.foregroundBlurPx}px / Night ${night.foregroundBlurPx}px foreground DOF; sharp canonical logo, static blur, three-plane z hierarchy and specular focus are certified.`);''')

test_path.write_text(test, encoding="utf-8", newline="\n")
print("premium depth performance pass applied")
