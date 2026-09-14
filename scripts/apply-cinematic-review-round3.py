from pathlib import Path
import re

# 1) Localize non-text accessibility labels alongside visible copy.
js = Path("experience/experience.js")
text = js.read_text()
old = '  const localizedNodes = Array.from(document.querySelectorAll("[data-tr][data-en][data-ru]"));\n'
new = old + '  const localizedAriaNodes = Array.from(document.querySelectorAll("[data-aria-tr][data-aria-en][data-aria-ru]"));\n'
if 'localizedAriaNodes' not in text:
    if old not in text:
        raise SystemExit("localizedNodes anchor not found")
    text = text.replace(old, new, 1)

anchor = '''    localizedNodes.forEach((node) => {\n      const copy = node.getAttribute(`data-${next}`);\n      if (copy !== null) node.textContent = copy;\n    });\n'''
block = anchor + '''\n    localizedAriaNodes.forEach((node) => {\n      const label = node.getAttribute(`data-aria-${next}`);\n      if (label !== null) node.setAttribute("aria-label", label);\n    });\n'''
if 'data-aria-${next}' not in text:
    if anchor not in text:
        raise SystemExit("applyLanguage localization anchor not found")
    text = text.replace(anchor, block, 1)
js.write_text(text)

# 2) Add localized title and aria-label data to initial Turkish markup.
html = Path("experience/index.html")
text = html.read_text()
replacements = {
    '<title>Roby\'s — Yanına Al · Cinematic Experience</title>': '<title data-tr="Roby\'s — Yanına Al · Sinematik Deneyim" data-en="Roby\'s — Take It With You · Cinematic Experience" data-ru="Roby\'s — Возьми с собой · Кинематографическая история">Roby\'s — Yanına Al · Sinematik Deneyim</title>',
    '<header class="experience-header" aria-label="Roby\'s cinematic navigation">': '<header class="experience-header" aria-label="Roby\'s sinematik navigasyonu" data-aria-tr="Roby\'s sinematik navigasyonu" data-aria-en="Roby\'s cinematic navigation" data-aria-ru="Навигация по истории Roby\'s">',
    '<a class="brand-lockup" href="../index.html" aria-label="Roby\'s Coffee House home">': '<a class="brand-lockup" href="../index.html" aria-label="Roby\'s Coffee House ana sayfası" data-aria-tr="Roby\'s Coffee House ana sayfası" data-aria-en="Roby\'s Coffee House home" data-aria-ru="Главная Roby\'s Coffee House">',
    '<div class="language-switcher" aria-label="Language selector">': '<div class="language-switcher" aria-label="Dil seçimi" data-aria-tr="Dil seçimi" data-aria-en="Language selector" data-aria-ru="Выбор языка">',
}
for old_markup, new_markup in replacements.items():
    if old_markup not in text:
        raise SystemExit(f"HTML localization anchor not found: {old_markup}")
    text = text.replace(old_markup, new_markup, 1)
html.write_text(text)

# 3) Make the precached experience complete on a first offline visit. The
# environment URL is build-revisioned, so match its optional query instead of
# relying on the pre-build literal.
sw = Path("sw.js")
text = sw.read_text()
if '"./src/products/gallery-v5/croissant-828.webp"' not in text:
    pattern = re.compile(r'(?P<line>\s*"\./experience/environments/finale\.svg(?:\?v=[^"]+)?",\n)')
    match = pattern.search(text)
    if not match:
        raise SystemExit("experience precache anchor not found")
    block = match.group("line") + '  "./src/products/gallery-v5/croissant-828.webp",\n  "./src/products/gallery-v5/san-sebastian-828.webp",\n'
    text = text[:match.start()] + block + text[match.end():]
sw.write_text(text)

print("Applied final cinematic review fixes.")
