from pathlib import Path

# 1) Keep every narrative scene in the accessibility tree while only the active
# scene remains visually interactive. Hidden CTAs stay out of the tab order.
js = Path("experience/experience.js")
text = js.read_text()
old = '''    scenes.forEach((scene, sceneIndex) => {\n      const selected = sceneIndex === index;\n      scene.classList.toggle("is-active", selected);\n      scene.setAttribute("aria-hidden", String(!selected));\n    });\n'''
new = '''    scenes.forEach((scene, sceneIndex) => {\n      const selected = sceneIndex === index;\n      scene.classList.toggle("is-active", selected);\n\n      if (selected) scene.setAttribute("aria-current", "step");\n      else scene.removeAttribute("aria-current");\n\n      scene.querySelectorAll("a").forEach((link) => {\n        if (!(link instanceof HTMLAnchorElement)) return;\n        if (selected) {\n          link.removeAttribute("tabindex");\n          link.removeAttribute("aria-hidden");\n        } else {\n          link.tabIndex = -1;\n          link.setAttribute("aria-hidden", "true");\n        }\n      });\n    });\n'''
if old not in text:
    raise SystemExit("experience.js scene activation anchor not found")
js.write_text(text.replace(old, new, 1))

# 2) In enhanced mode, opacity handles visual transitions; visibility must not
# remove inactive headings/paragraphs from assistive-technology navigation.
css = Path("experience/experience.css")
text = css.read_text()
marker = "/* Accessibility: inactive cinematic scenes remain available to assistive technology. */"
if marker not in text:
    text += '''\n\n@layer experience {\n  /* Accessibility: inactive cinematic scenes remain available to assistive technology. */\n  .cinematic-experience[data-enhanced="true"] .story-scene {\n    visibility: visible;\n    transition:\n      opacity 380ms ease,\n      transform 640ms cubic-bezier(.2,.78,.2,1);\n  }\n}\n'''
css.write_text(text)

# 3) Unlayered brand fidelity rules outrank named CSS layers. Put the short-height
# cup override in this same unlayered sheet so 320x480 and similar layouts shrink.
brand = Path("experience/brand-fidelity.css")
text = brand.read_text()
marker = "/* Short landscape: keep the immutable cup inside its half-stage column. */"
if marker not in text:
    insert = '''\n@media (max-width: 900px) and (max-height: 560px) {\n  /* Short landscape: keep the immutable cup inside its half-stage column. */\n  .hero-product--cup {\n    width: min(30vw, 220px);\n  }\n\n  .brand-mark-echo {\n    width: min(34vw, 280px);\n  }\n}\n'''
    reduced = "\n@media (prefers-reduced-motion: reduce) {"
    if reduced not in text:
        raise SystemExit("brand-fidelity reduced-motion anchor not found")
    text = text.replace(reduced, insert + reduced, 1)
brand.write_text(text)

# 4) Localize user-facing chapter labels with the existing TR/EN/RU mechanism.
html = Path("experience/index.html")
text = html.read_text()
labels = {
    '<p class="scene-kicker">01 · ORIGIN</p>': '<p class="scene-kicker" data-tr="01 · KÖKEN" data-en="01 · ORIGIN" data-ru="01 · ИСТОК">01 · KÖKEN</p>',
    '<p class="scene-kicker">02 · ENERGY</p>': '<p class="scene-kicker" data-tr="02 · ENERJİ" data-en="02 · ENERGY" data-ru="02 · ЭНЕРГИЯ">02 · ENERJİ</p>',
    '<p class="scene-kicker">03 · MOMENT</p>': '<p class="scene-kicker" data-tr="03 · AN" data-en="03 · MOMENT" data-ru="03 · МОМЕНТ">03 · AN</p>',
    '<p class="scene-kicker">04 · MOVE</p>': '<p class="scene-kicker" data-tr="04 · HAREKET" data-en="04 · MOVE" data-ru="04 · ДВИЖЕНИЕ">04 · HAREKET</p>',
    '<p class="scene-kicker">05 · PAIR</p>': '<p class="scene-kicker" data-tr="05 · EŞLİK" data-en="05 · PAIR" data-ru="05 · СОЧЕТАНИЕ">05 · EŞLİK</p>',
    '<p class="scene-kicker">06 · TAKEAWAY</p>': '<p class="scene-kicker" data-tr="06 · YANINA AL" data-en="06 · TAKEAWAY" data-ru="06 · С СОБОЙ">06 · YANINA AL</p>',
}
for old_label, new_label in labels.items():
    if old_label not in text:
        raise SystemExit(f"chapter label anchor not found: {old_label}")
    text = text.replace(old_label, new_label, 1)
html.write_text(text)

print("Applied second-round cinematic review fixes.")
