from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing expected text in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Shared language persistence + explicit progressive-enhancement marker.
js = Path("experience/experience.js")
text = js.read_text()
if 'const LANGUAGE_KEY = "robys-language";' not in text:
    text = text.replace(
        '  const languages = new Set(["tr", "en", "ru"]);\n',
        '  const languages = new Set(["tr", "en", "ru"]);\n'
        '  const LANGUAGE_KEY = "robys-language";\n\n'
        '  experience.dataset.enhanced = "true";\n',
        1,
    )
if "function storedLanguage()" not in text:
    text = text.replace(
        '  function applyLanguage(language) {\n'
        '    const next = languages.has(language) ? language : "tr";\n',
        '  function storedLanguage() {\n'
        '    try {\n'
        '      const saved = localStorage.getItem(LANGUAGE_KEY);\n'
        '      if (saved && languages.has(saved)) return saved;\n'
        '    } catch {\n'
        '      // Storage can be unavailable in hardened/private browsing contexts.\n'
        '    }\n'
        '    return preferredLanguage();\n'
        '  }\n\n'
        '  function applyLanguage(language, persist = true) {\n'
        '    const next = languages.has(language) ? language : "tr";\n',
        1,
    )
    text = text.replace(
        '    languageButtons.forEach((button) => {\n'
        '      const selected = button.getAttribute("data-lang") === next;\n'
        '      button.classList.toggle("is-active", selected);\n'
        '      button.setAttribute("aria-pressed", String(selected));\n'
        '    });\n'
        '  }\n',
        '    languageButtons.forEach((button) => {\n'
        '      const selected = button.getAttribute("data-lang") === next;\n'
        '      button.classList.toggle("is-active", selected);\n'
        '      button.setAttribute("aria-pressed", String(selected));\n'
        '    });\n\n'
        '    if (persist) {\n'
        '      try {\n'
        '        localStorage.setItem(LANGUAGE_KEY, next);\n'
        '      } catch {\n'
        '        // Language remains active for this page when storage is unavailable.\n'
        '      }\n'
        '    }\n'
        '  }\n',
        1,
    )
    text = text.replace(
        '  applyLanguage(preferredLanguage());\n',
        '  applyLanguage(storedLanguage(), false);\n',
        1,
    )
js.write_text(text)


# 2) No-JS fallback: semantic story content is not statically aria-hidden.
html = Path("experience/index.html")
text = html.read_text()
text = re.sub(
    r'(<article class="story-scene(?: story-scene-final)?" data-scene="[1-6]") aria-hidden="true"',
    r"\1",
    text,
)
html.write_text(text)


# 3) CSS: no-JS readable flow + short landscape viewport layout.
css = Path("experience/experience.css")
text = css.read_text()
if "Progressive enhancement: without JS" not in text:
    text += r'''

@layer experience {
  /* Progressive enhancement: without JS, expose the full story and CTA as normal document flow. */
  .cinematic-experience:not([data-enhanced="true"]) {
    height: auto;
    min-height: 0;
  }

  .cinematic-experience:not([data-enhanced="true"]) .cinematic-stage {
    position: relative;
    height: auto;
    min-height: 0;
    overflow: visible;
    padding: 112px clamp(22px, 7vw, 96px) 72px;
  }

  .cinematic-experience:not([data-enhanced="true"]) .ambient,
  .cinematic-experience:not([data-enhanced="true"]) .grain,
  .cinematic-experience:not([data-enhanced="true"]) .light-sweep,
  .cinematic-experience:not([data-enhanced="true"]) .brand-red-halo,
  .cinematic-experience:not([data-enhanced="true"]) .environment-stack,
  .cinematic-experience:not([data-enhanced="true"]) .route-layer,
  .cinematic-experience:not([data-enhanced="true"]) .bean-field,
  .cinematic-experience:not([data-enhanced="true"]) .product-world,
  .cinematic-experience:not([data-enhanced="true"]) .chapter-rail,
  .cinematic-experience:not([data-enhanced="true"]) .scroll-cue {
    display: none;
  }

  .cinematic-experience:not([data-enhanced="true"]) .story-copy {
    position: relative;
    inset: auto;
    width: min(100%, 760px);
    margin: 0 auto;
    pointer-events: auto;
  }

  .cinematic-experience:not([data-enhanced="true"]) .story-scene {
    position: relative;
    inset: auto;
    width: auto;
    margin: 0 0 clamp(56px, 9vh, 96px);
    opacity: 1;
    visibility: visible;
    transform: none;
    pointer-events: auto;
    transition: none;
  }

  .cinematic-experience:not([data-enhanced="true"]) .story-scene h1,
  .cinematic-experience:not([data-enhanced="true"]) .story-scene h2 {
    max-width: 12ch;
    font-size: clamp(2.5rem, 8vw, 5.5rem);
  }
}

@layer responsive {
  /* Landscape phones and other short viewports must never force a stage taller than the viewport. */
  @media (max-width: 900px) and (max-height: 560px) {
    .cinematic-stage {
      height: 100svh;
      min-height: 0;
    }

    .story-copy { width: 52%; }

    .story-scene {
      left: 20px;
      right: auto;
      top: 52%;
      bottom: auto;
      width: min(46vw, 390px);
      transform: translate3d(0, calc(-50% + 14px), 0);
    }

    .story-scene.is-active { transform: translate3d(0, -50%, 0); }

    .story-scene h1,
    .story-scene h2 {
      max-width: 11ch;
      font-size: clamp(1.9rem, 6vw, 3.1rem);
      line-height: .92;
    }

    .story-scene h2 { font-size: clamp(1.75rem, 5.3vw, 2.8rem); }
    .scene-kicker { margin-bottom: 8px; font-size: .52rem; }
    .scene-body { margin-top: 9px; font-size: .76rem; line-height: 1.34; }
    .scene-note { margin-top: 9px; font-size: .5rem; }

    .product-world {
      inset: 0 0 0 auto;
      width: 50%;
      height: 100%;
      min-height: 0;
    }

    .hero-product { width: min(30vw, 220px); }
    .orbit-outer { width: min(43vw, 360px); }
    .orbit-inner { width: min(32vw, 260px); }
    .steam { top: 16%; }
    .pairing-card { width: clamp(72px, 11vw, 104px); }
    .pairing-card-a { left: 2%; bottom: 10%; }
    .pairing-card-b { right: 2%; top: 16%; }
    .chapter-rail { bottom: max(10px, env(safe-area-inset-bottom)); }
    .scroll-cue { display: none; }
  }
}
'''
css.write_text(text)


# 4) Build pipeline revisioning for experience JS/CSS and the six environment SVGs.
build = Path("scripts/build.mjs")
text = build.read_text()
if "function synchronizeCssUrls" not in text:
    anchor = '''function synchronizeStylesheet(html, fileName, revision) {\n  const pattern = new RegExp(`href="${fileName.replaceAll(".", "\\\\.")}(?:\\\\?v=[^"]*)?"`);\n  if (!pattern.test(html)) throw new Error(`HTML does not load ${fileName}`);\n  return html.replace(pattern, `href="${fileName}?v=${revision}"`);\n}\n'''
    helper = anchor + '''\nfunction synchronizeCssUrls(source, fileName, revision) {\n  const escapedName = fileName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");\n  const pattern = new RegExp(`url\\\\(["']${escapedName}(?:\\\\?v=[^"']*)?["']\\\\)`, "g");\n  if (!pattern.test(source)) throw new Error(`CSS does not load ${fileName}`);\n  pattern.lastIndex = 0;\n  return source.replace(pattern, `url("${fileName}?v=${revision}")`);\n}\n'''
    if anchor not in text:
        raise SystemExit("build stylesheet helper anchor not found")
    text = text.replace(anchor, helper, 1)

if "const experienceRuntimeRevision" not in text:
    anchor = 'const smartChoiceReleaseQaCssRevision = revisionFor("smart-choice/release-qa.css");\n'
    block = anchor + '''\nconst experienceEnvironmentFiles = [\n  "environments/origin.svg",\n  "environments/energy.svg",\n  "environments/moment.svg",\n  "environments/move.svg",\n  "environments/pair.svg",\n  "environments/finale.svg"\n];\nconst experienceEnvironmentRevisions = new Map(\n  experienceEnvironmentFiles.map((fileName) => [fileName, revisionFor(`experience/${fileName}`)])\n);\nlet cinematicEnvironmentSource = readFileSync("experience/cinematic-environments.css", "utf8");\nfor (const [fileName, revision] of experienceEnvironmentRevisions) {\n  cinematicEnvironmentSource = synchronizeCssUrls(cinematicEnvironmentSource, fileName, revision);\n}\nwriteFileSync("experience/cinematic-environments.css", cinematicEnvironmentSource);\n\nconst experienceRuntimeRevision = revisionFor("experience/experience.js");\nconst experienceCssRevision = revisionFor("experience/experience.css");\nconst experienceBrandCssRevision = revisionFor("experience/brand-fidelity.css");\nconst experienceStateCssRevision = revisionFor("experience/experience-state.css");\nconst experienceCinematicCssRevision = revisionFor("experience/cinematic-environments.css");\n'''
    if anchor not in text:
        raise SystemExit("build revision anchor not found")
    text = text.replace(anchor, block, 1)

if "let experienceHtml =" not in text:
    anchor = 'writeFileSync("menu.html", menuHtml);\n'
    block = anchor + '''\nlet experienceHtml = readFileSync("experience/index.html", "utf8");\nexperienceHtml = synchronizeScript(experienceHtml, "experience.js", experienceRuntimeRevision);\nexperienceHtml = synchronizeStylesheet(experienceHtml, "experience.css", experienceCssRevision);\nexperienceHtml = synchronizeStylesheet(experienceHtml, "brand-fidelity.css", experienceBrandCssRevision);\nexperienceHtml = synchronizeStylesheet(experienceHtml, "experience-state.css", experienceStateCssRevision);\nexperienceHtml = synchronizeStylesheet(experienceHtml, "cinematic-environments.css", experienceCinematicCssRevision);\nwriteFileSync("experience/index.html", experienceHtml);\n'''
    if anchor not in text:
        raise SystemExit("build experience HTML anchor not found")
    text = text.replace(anchor, block, 1)

if '["experience/experience.js", experienceRuntimeRevision]' not in text:
    anchor = '  ["smart-choice/release-qa.css", smartChoiceReleaseQaCssRevision]\n]) {\n'
    block = '''  ["smart-choice/release-qa.css", smartChoiceReleaseQaCssRevision],\n  ["experience/experience.js", experienceRuntimeRevision],\n  ["experience/experience.css", experienceCssRevision],\n  ["experience/brand-fidelity.css", experienceBrandCssRevision],\n  ["experience/experience-state.css", experienceStateCssRevision],\n  ["experience/cinematic-environments.css", experienceCinematicCssRevision],\n  ...Array.from(experienceEnvironmentRevisions, ([fileName, revision]) => [`experience/${fileName}`, revision])\n]) {\n'''
    if anchor not in text:
        raise SystemExit("service worker revision array anchor not found")
    text = text.replace(anchor, block, 1)
build.write_text(text)


# 5) SW cache contract: precache experience, exact-revision mutable assets, offline navigation fallback.
sw = Path("sw.js")
text = sw.read_text()
if '"./experience/experience.js"' not in text:
    anchor = '  "./smart-choice/index.html",\n'
    block = anchor + '''  "./experience/",\n  "./experience/index.html",\n  "./experience/experience.js",\n  "./experience/experience.css",\n  "./experience/brand-fidelity.css",\n  "./experience/experience-state.css",\n  "./experience/cinematic-environments.css",\n  "./experience/environments/origin.svg",\n  "./experience/environments/energy.svg",\n  "./experience/environments/moment.svg",\n  "./experience/environments/move.svg",\n  "./experience/environments/pair.svg",\n  "./experience/environments/finale.svg",\n'''
    if anchor not in text:
        raise SystemExit("SW core asset anchor not found")
    text = text.replace(anchor, block, 1)

if '/experience/experience.js' not in text[text.find("const requiresExactRevision"):]:
    anchor = '    url.pathname.endsWith("/discover-rotation.css") ||\n'
    block = anchor + '''    url.pathname.endsWith("/experience/experience.js") ||\n    url.pathname.endsWith("/experience/experience.css") ||\n    url.pathname.endsWith("/experience/brand-fidelity.css") ||\n    url.pathname.endsWith("/experience/experience-state.css") ||\n    url.pathname.endsWith("/experience/cinematic-environments.css") ||\n    url.pathname.includes("/experience/environments/") ||\n'''
    if anchor not in text:
        raise SystemExit("SW exact-revision anchor not found")
    text = text.replace(anchor, block, 1)

if "const isExperience =" not in text:
    anchor = '  const isSmartChoice = url.pathname === `${scopePath}smart-choice/` ||\n    url.pathname === `${scopePath}smart-choice/index.html`;\n'
    block = anchor + '  const isExperience = url.pathname === `${scopePath}experience/` ||\n    url.pathname === `${scopePath}experience/index.html`;\n'
    if anchor not in text:
        raise SystemExit("SW navigation anchor not found")
    text = text.replace(anchor, block, 1)
text = text.replace(
    '      if (isMenu || isDiscover || isSmartChoice || isHome) {',
    '      if (isMenu || isDiscover || isSmartChoice || isExperience || isHome) {',
)
text = text.replace(
    '  if (isSmartChoice) return cachedPage("smart-choice/index.html");\n  if (isHome)',
    '  if (isSmartChoice) return cachedPage("smart-choice/index.html");\n  if (isExperience) return cachedPage("experience/index.html");\n  if (isHome)',
)
sw.write_text(text)


# 6) Security verifier accepts only revisioned experience runtime/styles after build.
sec = Path("scripts/verify-security-contracts.mjs")
text = sec.read_text()
text = text.replace(
    '/<script\\b[^>]*src=["\']experience\\.js["\']/i.test(html)',
    '/<script\\b[^>]*src=["\']experience\\.js\\?v=[a-f0-9]{12}["\']/i.test(html)',
)
old = '      must("CSP-001", html.includes(`href="${stylesheet}"`), `${file} does not load reviewed stylesheet ${stylesheet}`);'
new = '''      const escapedStylesheet = stylesheet.replaceAll(".", "\\\\.");\n      const revisionedStylesheet = new RegExp(`href=["']${escapedStylesheet}\\\\?v=[a-f0-9]{12}["']`, "i");\n      must("CSP-001", revisionedStylesheet.test(html), `${file} does not load reviewed stylesheet ${stylesheet}`);'''
if old in text:
    text = text.replace(old, new, 1)
sec.write_text(text)

print("Applied cinematic review fixes.")
