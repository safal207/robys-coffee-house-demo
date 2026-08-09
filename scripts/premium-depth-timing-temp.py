from pathlib import Path

path = Path("day-night-entry.js")
text = path.read_text(encoding="utf-8")
old = "    coldDuration: 1_180,"
new = "    coldDuration: 1_140,"
if text.count(old) != 1:
    raise SystemExit(f"expected one Day coldDuration anchor, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")
print("Day cold duration tuned to 1140 ms")
