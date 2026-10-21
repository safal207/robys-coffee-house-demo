"""One-shot reproduction of the reviewed menu reconciliation; never edits main."""
from pathlib import Path
import subprocess

root = Path.cwd()
main = "7f2eff58bd3b8249a8880ab6d09e7ef9bf87f8e9"

def change(path, before, after):
    target = root / path
    text = target.read_text()
    assert text.count(before) == 1, (path, before, text.count(before))
    target.write_text(text.replace(before, after, 1))

change("menu-feed.css", "@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}",
       "@media(prefers-reduced-motion:no-preference){html{scroll-behavior:auto}")
change("menu-feed.css", ".feed-status{position:fixed;", ".feed-status{pointer-events:none;position:fixed;")
css = root / "menu-feed.css"
css.write_text(css.read_text() + "\n/* Native focus/scroll-into-view stays immediate; only explicit next/previous\n   card actions request smooth motion. Noninteractive announcements never\n   intercept a tap, and auto-revealed controls clear the fixed menu chrome. */\n.feed-card :is(button,select,a){scroll-margin-top:calc(var(--feed-top-offset) + 12px);scroll-margin-bottom:calc(96px + env(safe-area-inset-bottom))}\n")
change("scripts/test-menu-feed-browser.mjs", '''    await chooseCategory(page, "hot-coffee");
    await page.locator('[data-product-id="hot-coffee:espresso"] .feed-add').click();''', '''    await chooseCategory(page, "hot-coffee");
    assert.equal(await page.locator("html").evaluate(node => getComputedStyle(node).scrollBehavior), "auto",
      "Native control reveal must not start competing smooth scroll animations");
    if (moduleName === "storage") {
      assert.equal(await page.locator("#feed-status").evaluate(node => getComputedStyle(node).pointerEvents), "none",
        "The noninteractive recovery announcement must never intercept the retry tap");
    }
    // A real locator click must settle above fixed chrome; do not force it or
    // dismiss the recovery announcement to make the scenario pass.
    await page.locator('[data-product-id="hot-coffee:espresso"] .feed-add').click();''')

# Source programs remain byte-for-byte identical to the released programs.
# The canonical existing compiler only minifies their delivered versions.
for name in ("pairing-posters", "qa"):
    original = subprocess.check_output(["git", "show", f"{main}:{name}.js"])
    (root / f"src/{name}.js").write_bytes(original)
for name, variable in (("pairing-posters", "pairingPostersRevision"), ("qa", "qaRevision")):
    line = f'const {variable} = revisionFor("{name}.js");'
    change("scripts/build.mjs", line,
           f'writeFileSync("{name}.js", compileMenuRuntime(readFileSync("src/{name}.js", "utf8")));\n' + line)
helper = root / "scripts/menu-runtime-source.mjs"
helper.write_text(helper.read_text() + '''
// Keep source-level behavior checks tied to the actual production bytes.
export function readVerifiedAuthoredRuntime(name) {
  assert.ok(["qa", "pairing-posters"].includes(name), "Unsupported authored runtime");
  const source = readFileSync(`src/${name}.js`, "utf8");
  assert.equal(readFileSync(`${name}.js`, "utf8"), compileMenuRuntime(source),
    `Generated ${name}.js is stale; run npm run build`);
  return source;
}
''')
for path in ("scripts/verify-regression-contracts.mjs", "scripts/verify-p1-interface-contracts.mjs", "scripts/test-hero-playback.mjs"):
    target = root / path
    text = target.read_text()
    assert 'readFileSync("qa.js", "utf8")' in text
    target.write_text('import { readVerifiedAuthoredRuntime } from "./menu-runtime-source.mjs";\n' +
                      text.replace('readFileSync("qa.js", "utf8")', 'readVerifiedAuthoredRuntime("qa")'))
change("scripts/verify-pairing-cta.mjs", "import { readVerifiedMenuSource }", "import { compileMenuRuntime, readVerifiedMenuSource }")
line = 'const pairingRuntime = readFileSync("pairing-posters.js", "utf8");'
change("scripts/verify-pairing-cta.mjs", line, line + '\nconst pairingSource = readFileSync("src/pairing-posters.js", "utf8");\nassert.equal(pairingRuntime, compileMenuRuntime(pairingSource), "Poster runtime must match the authored source after a canonical build");')
change("scripts/verify-pairing-cta.mjs", 'assert.match(pairingRuntime, /media\\.setAttribute', 'assert.match(pairingSource, /media\\.setAttribute')
change("scripts/verify-pairing-cta.mjs", 'assert.match(pairingRuntime, /removeExperiencePanel', 'assert.match(pairingSource, /removeExperiencePanel')
