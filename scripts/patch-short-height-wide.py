from pathlib import Path

replacements = {
    "experience/experience.css": (
        "@media (max-width: 1024px) and (max-height: 560px) {",
        "@media (max-height: 560px) {",
    ),
    "experience/brand-fidelity.css": (
        "@media (max-width: 1024px) and (max-height: 560px) {",
        "@media (max-height: 560px) {",
    ),
}

for name, (old, new) in replacements.items():
    path = Path(name)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{name}: expected exactly one short-height media query, got {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"patched {name}")
