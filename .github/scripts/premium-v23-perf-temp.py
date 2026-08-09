from pathlib import Path

p = Path("day-night-entry.js")
text = p.read_text(encoding="utf-8")

def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f"missing anchor: {old[:180]!r}")
    text = text.replace(old, new, 1)

# Real Z-depth now carries more of the spatial separation, so keep DOF restrained.
replace_once('    foregroundBlur: "blur(18px)",', '    foregroundBlur: "blur(12px)",')
replace_once('    foregroundBlur: "blur(24px)",', '    foregroundBlur: "blur(16px)",')

# Reduce the filtered near-camera raster area while preserving partial foreground occlusion.
replace_once('''    left: "-42vw",
    bottom: "-28vh",
    width: "92vw",
    height: "74vh",''', '''    left: "-30vw",
    bottom: "-18vh",
    width: "74vw",
    height: "60vh",''')
replace_once('''    transform: "translateZ(46px) rotateX(-1.2deg) rotateY(2.2deg) rotate(-14deg) translate3d(-5vw,5vh,0) scale(1.06)",''', '''    transform: "translateZ(46px) rotateX(-.8deg) rotateY(1.4deg) rotate(-14deg) translate3d(-3vw,3vh,0) scale(1.04)",''')

p.write_text(text, encoding="utf-8", newline="\n")
print("real-3d DOF performance tune applied")
