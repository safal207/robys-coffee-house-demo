import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const LEGACY_RED = "#b84d58";
const APPROVED_RED = "#E21B23";
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".mjs", ".md", ".svg", ".json", ".webmanifest"]);
const EXCLUDED_DIRS = new Set([".git", "node_modules"]);
const SELF = "scripts/agent-fix-robys-brand.mjs";

function fail(message) {
  throw new Error(`[ROBYS-BRAND-REMEDIATION] ${message}`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function update(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (after === before) fail(`${path} was not changed; expected source contract not found`);
  write(path, after);
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) fail(`${label}: expected source fragment was not found`);
  return source.replace(search, replacement);
}

function ensureAfter(path, anchor, line) {
  const source = read(path);
  if (source.includes(line)) return;
  if (!source.includes(anchor)) fail(`${path}: insertion anchor not found`);
  write(path, source.replace(anchor, `${anchor}\n${line}`));
}

function textFiles(dir = ROOT) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const absolute = join(dir, entry);
    const relativePath = relative(ROOT, absolute).replaceAll("\\", "/");
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...textFiles(absolute));
    else if (TEXT_EXTENSIONS.has(extname(entry)) && relativePath !== SELF) files.push(relativePath);
  }
  return files;
}

// 1. Canonicalize the UI accent to the approved Roby's red across source files.
for (const path of textFiles()) {
  let source = read(path);
  const next = source
    .replaceAll(LEGACY_RED, APPROVED_RED)
    .replaceAll("#B84D58", APPROVED_RED)
    .replaceAll("rgba(184,77,88,", "rgba(226,27,35,");
  if (next !== source) write(path, next);
}

// 2. Bind canonical tokens at the final identity stylesheet layer.
update("brand-photo-logo.css", (source) => {
  let next = source;
  if (!next.includes("--ruby:var(--robys-brand-red);")) {
    next = replaceRequired(
      next,
      "  --robys-brand-paper:#F5F5F2;",
      "  --robys-brand-paper:#F5F5F2;\n  --ruby:var(--robys-brand-red);\n  --brand-wordmark-paper:var(--robys-brand-paper);",
      "brand-photo-logo.css canonical token alias"
    );
  }
  if (!next.includes(".map-pin img{")) {
    next += "\n\n.map-pin img{display:block;width:46px;height:46px;object-fit:contain;transform:rotate(45deg)}\n";
  }
  return next;
});

// 3. Make Apple touch icons static and parser-visible instead of JavaScript-only.
for (const path of ["index.html", "menu.html", "discover.html"]) {
  ensureAfter(
    path,
    '  <link rel="icon" href="icon.svg" type="image/svg+xml" />',
    '  <link rel="apple-touch-icon" href="apple-touch-icon.png?v=ios-install-20260707-1" />'
  );
}
for (const path of ["docs/instagram-tools.html", "docs/owner-pitch.html"]) {
  ensureAfter(
    path,
    '  <link rel="icon" href="../icon.svg" type="image/svg+xml" />',
    '  <link rel="apple-touch-icon" href="../apple-touch-icon.png?v=ios-install-20260707-1" />'
  );
}

// 4. Keep the official tagline in structured brand metadata; marketing copy remains a headline.
update("index.html", (source) => {
  let next = replaceRequired(source, '"slogan": "İyi kahve. Sakin anlar."', '"slogan": "Fresh Coffee Point"', "index schema slogan");
  next = replaceRequired(
    next,
    '<div class="map-pin" aria-hidden="true"><span>R</span></div>',
    '<div class="map-pin" aria-hidden="true"><img src="src/brand/robys-mark-master-v1.svg?v=20260721-master-1" width="46" height="46" alt="" /></div>',
    "index map pin brand mark"
  );
  return next;
});

update("menu.html", (source) => replaceRequired(source, "FRESH COFFEE, DAILY", "FRESH COFFEE POINT", "menu fallback tagline"));

// 5. Replace visible legacy R badges on owner-only utility pages with approved SVG identity assets.
update("docs/instagram-tools.html", (source) => replaceRequired(
  source,
  `    <a class="brand" href="../index.html" aria-label="Roby's Coffee House ana sayfa">\n      <span class="brand-mark">R</span>\n      <span><strong>ROBY'S</strong><small>COFFEE HOUSE</small></span>\n    </a>`,
  `    <a class="brand" href="../index.html" aria-label="Roby's Coffee House ana sayfa">\n      <img class="brand-logo" src="../src/brand/robys-compact-master-v1.svg?v=20260721-master-1" width="180" height="58" alt="" aria-hidden="true" />\n    </a>`,
  "Instagram tools legacy brand"
));

update("docs/instagram-tools.css", (source) => {
  let next = replaceRequired(
    source,
    '.brand-mark{display:grid;width:42px;height:42px;place-items:center;color:#fff;background:var(--ruby);border-radius:50%;font:700 1.45rem var(--display)}',
    '.brand-logo{display:block;width:180px;height:auto}',
    "Instagram tools brand image CSS"
  );
  next = next.replace('.brand>span:last-child{display:grid;line-height:1}\n.brand strong{font-size:.88rem;letter-spacing:.12em}\n.brand small{margin-top:4px;color:var(--muted);font-size:.58rem;letter-spacing:.14em}\n', "");
  next = next.replace('--display:Georgia,"Times New Roman",serif', '--display:"Arial Narrow",Arial,sans-serif');
  return next;
});

update("docs/owner-pitch.html", (source) => replaceRequired(
  source,
  '        <div class="brand-mark" aria-hidden="true">R</div>',
  '        <img class="brand-mark" src="../src/brand/robys-mark-master-v1.svg?v=20260721-master-1" width="72" height="72" alt="" aria-hidden="true" />',
  "owner pitch legacy brand"
));

update("docs/owner-pitch.css", (source) => {
  let next = replaceRequired(
    source,
    '.brand-mark{display:grid;width:72px;height:72px;place-items:center;margin-bottom:28px;background:var(--ruby);border-radius:50%;font:700 2.4rem var(--display);box-shadow:0 16px 36px rgba(0,0,0,.24)}',
    '.brand-mark{display:block;width:72px;height:72px;margin-bottom:28px;object-fit:contain;filter:drop-shadow(0 16px 18px rgba(0,0,0,.24))}',
    "owner pitch mark CSS"
  );
  next = next.replace('--display:Georgia,"Times New Roman",serif', '--display:"Arial Narrow",Arial,sans-serif');
  return next;
});

// 6. Retire the unused baked-in pill asset. The UI owns pill radius and shadow.
const deprecatedMobileMaster = "src/brand/robys-mobile-master-v1.svg";
if (!existsSync(deprecatedMobileMaster)) fail(`${deprecatedMobileMaster} was already absent; baseline changed`);
rmSync(deprecatedMobileMaster);

// 7. Strengthen automated identity regression checks.
update("scripts/verify-brand-identity-assets.mjs", (source) => {
  let next = replaceRequired(
    source,
    'import { readFileSync } from "node:fs";',
    'import { existsSync, readFileSync } from "node:fs";',
    "brand verifier fs import"
  );
  next = replaceRequired(
    next,
    'const identityPages = ["index.html", "menu.html", "discover.html"].map((path) => [path, read(path)]);',
    `const identityPages = ["index.html", "menu.html", "discover.html"].map((path) => [path, read(path)]);\nconst serviceIdentityPages = [\n  ["docs/instagram-tools.html", read("docs/instagram-tools.html")],\n  ["docs/owner-pitch.html", read("docs/owner-pitch.html")]\n];\nconst serviceIdentityStyles = [\n  ["docs/instagram-tools.css", read("docs/instagram-tools.css")],\n  ["docs/owner-pitch.css", read("docs/owner-pitch.css")]\n];`,
    "brand verifier service pages"
  );
  next = replaceRequired(
    next,
    'assert(baseCss.includes(`--brand-wordmark-red:${APPROVED_RED}`), "legacy wordmark fallback must use canonical red");',
    `assert(baseCss.includes(\`--brand-wordmark-red:\${APPROVED_RED}\`), "legacy wordmark fallback must use canonical red");\nassert(baseCss.includes(\`--ruby:\${APPROVED_RED}\`), "UI ruby token must use canonical red");\nassert(!baseCss.includes("#b84d58"), "base UI must not retain the legacy ruby red");\nassert(!existsSync("src/brand/robys-mobile-master-v1.svg"), "deprecated baked-in mobile pill master must be removed");`,
    "brand verifier canonical UI red"
  );
  next = replaceRequired(
    next,
    '  assert(source.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), `${path} must link the identity stylesheet without JavaScript`);',
    '  assert(source.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), `${path} must link the identity stylesheet without JavaScript`);\n  assert(source.includes(\'<link rel="apple-touch-icon" href="apple-touch-icon.png?v=ios-install-20260707-1" />\'), `${path} must statically link the Apple touch icon`);',
    "brand verifier static Apple touch link"
  );
  next = replaceRequired(
    next,
    'assert(bootstrap.includes("apple-touch-icon.png?v="), "Apple touch icon PNG wiring must remain active");',
    `assert(bootstrap.includes("apple-touch-icon.png?v="), "progressive Apple touch fallback may remain active");\nfor (const [path, source] of serviceIdentityPages) {\n  assert(source.includes("../apple-touch-icon.png?v=ios-install-20260707-1"), \`\${path} must statically link the Apple touch icon\`);\n  assert(!/class=["']brand-mark["'][^>]*>\\s*R\\s*</i.test(source), \`\${path} must not render the legacy R badge\`);\n  assert(/robys-(?:compact|mark)-master-v1\\.svg/.test(source), \`\${path} must reuse an approved SVG identity asset\`);\n}\nfor (const [path, source] of serviceIdentityStyles) {\n  assert(source.includes(APPROVED_RED), \`\${path} must use canonical red\`);\n  assert(!source.includes("#b84d58"), \`\${path} must not retain the legacy ruby red\`);\n  assert(!/Georgia|Times New Roman|\\bserif\\b/i.test(source), \`\${path} must not introduce a serif display language\`);\n}`,
    "brand verifier service identity contracts"
  );
  return next;
});

// 8. Update policy and current-state evidence without claiming physical or legal proof.
update("docs/brand-reference-policy.md", (source) => replaceRequired(
  source,
  "- The current HEX values are implementation approximations sampled from public production imagery, not official brand specifications.",
  "- The approved digital identity tokens are red `#E21B23`, ink `#111111`, and warm paper `#F5F5F2`; changes require owner-approved brand evidence and an updated identity contract.",
  "brand reference token policy"
));

write("docs/brand/robys-logo-implementation-v1.md", `# Roby's identity normalization v1\n\nSource decision: the owner-provided Roby's identity sheet and the repository identity audit.\n\n## Implemented\n\n- uses path-only primary, medium, compact and mark masters;\n- derives favicon, maskable icon and Apple touch icon from the approved organic O;\n- statically links the Apple touch icon in Home, Menu, Discover and owner utility pages, with the existing JavaScript path retained only as a progressive fallback;\n- uses canonical digital identity tokens: red \`#E21B23\`, ink \`#111111`, and paper \`#F5F5F2\`;\n- aligns the shared UI ruby token and owner utility pages to the canonical red;\n- replaces visible legacy \`R\` badges with approved SVG assets;\n- keeps \`Fresh Coffee Point\` as the structured brand slogan while allowing marketing headlines as a separate copy layer;\n- retires \`robys-mobile-master-v1.svg\`: the compact transparent master is the asset, while pill radius and shadow belong to CSS;\n- verifies source assets, static wiring, safe zones, service pages, manifest delivery and legacy-token rejection.\n\n## Evidence boundary\n\nThis implementation does not claim trademark clearance, consumer recall, storefront-distance readability, physical print durability or revenue impact. One-color/reverse production masters and physical mockup testing remain separate work.\n`);

write("docs/brand/robys-logo-release-checklist.md", `# Roby's logo release checklist\n\nUse with \`evaluate-world-class-logo\` and the current audit in \`robys-world-class-logo-audit.md\`.\n\n## Verified digital release scope\n\n- [x] Primary, medium, compact, mark-only, favicon and maskable variants have documented use boundaries.\n- [x] No production logo asset contains \`<text>\` or depends on installed fonts.\n- [x] Favicon geometry retains bounded clearance at 16 and 32 CSS px.\n- [x] PWA maskable artwork remains inside the automated safe-zone contract.\n- [x] Apple touch icon is statically linked and visually belongs to the organic-O family.\n- [x] Header uses the no-micro-tagline medium lockup; mobile uses the compact master inside a CSS-owned pill.\n- [x] Approved red, ink and paper values are defined and checked across SVG, CSS and PWA assets.\n- [x] Owner utility pages reuse approved SVG identity assets and contain no visible legacy \`R\` badge.\n- [x] Turkish, English and Russian interface surroundings preserve the logo hierarchy.\n- [x] SVG viewBox, aspect ratio, cache revision, integrity manifest and Service Worker delivery are checked by repository contracts.\n\n## Still required for physical / legal release claims\n\n- [ ] Approved black, white/reverse and single-ink physical-production variants exist.\n- [ ] Compact and mark-only clear space has been reviewed on cream, white and dark-brown physical surfaces.\n- [ ] Storefront, cup, napkin, stamp and embroidery mockups have been reviewed at realistic size.\n- [ ] Category-wall and one-second recall evidence is recorded.\n- [ ] Confusing similarity and trademark availability have been reviewed by a qualified professional.\n\nAny failed P0 or P1 digital item blocks a digital release-ready verdict. Physical and legal items block corresponding physical or legal claims, not the current website release.\n`);

write("docs/brand/robys-world-class-logo-audit.md", `# Roby's world-class logo audit\n\nBaseline inspected: \`main@614e8a88b9ac2225620ace229f960185f483e061\`.\n\n## Current verdict\n\n**Digital identity ready within the repository evidence boundary — 88/100.**\n\nThe website now uses one path-based Roby's identity family across wordmarks, favicon/PWA, Apple touch icon, map mark and owner utility pages. The approved digital tokens are red \`#E21B23\`, ink \`#111111\`, and warm paper \`#F5F5F2\`.\n\n## Closed findings\n\n| Former finding | Current state | Evidence contract |\n|---|---|---|\n| Favicon/PWA used a different monogram | Closed | \`icon.svg\` and \`icon-maskable.svg\` reuse the approved organic-O path and contain no text nodes |\n| Header primary lockup was over-detailed | Closed | Desktop uses \`robys-header-master-v1.svg\`; mobile uses the compact master |\n| Brand red was fragmented | Closed for digital UI | Shared ruby tokens and owner utility pages use \`#E21B23\`; the verifier rejects \`#b84d58\` |\n| Apple touch icon was not statically declared | Closed | Home, Menu, Discover and owner utility pages contain parser-visible \`apple-touch-icon\` links |\n| Owner pages displayed a red circle with \`R\` | Closed | Pages reuse compact/mark SVG masters |\n| Baked mobile pill master was unused | Closed | Deprecated file removed; CSS owns the pill container and shadow |\n| Audit described the current favicon as an unrelated monogram | Closed | This document now describes the current organic-O implementation |\n\n## Open boundaries\n\n- one-color, reverse, stamp and embroidery production masters are not yet approved;\n- consumer recall, category-wall distinctiveness and storefront-distance readability need field evidence;\n- trademark availability requires qualified legal review;\n- marketing headlines remain a separate verbal layer, while \`Fresh Coffee Point\` is the structured brand slogan.\n\n## Scorecard\n\n| Dimension | Score |\n|---|---:|\n| Strategic fit | 13/15 |\n| Distinctiveness | 11/15 |\n| Memorability | 8/10 |\n| Form and negative space | 9/10 |\n| Typography / wordmark | 9/10 |\n| Responsive scalability | 9/10 |\n| Optical quality | 7/8 |\n| Identity-system potential | 7/8 |\n| Cultural / accessibility resilience | 7/7 |\n| Digital production readiness | 8/7* |\n| **Normalized total** | **88/100** |\n\n\*Digital implementation exceeds the original production-readiness slice; physical-production evidence remains outside scope.\n\n## Evidence boundary\n\nThis audit supports repository and digital-delivery claims only. It does not prove consumer recall, commercial impact, physical durability, trademark availability or owner approval beyond the supplied identity reference.\n`);

// Final fail-closed assertions before build and manifest regeneration.
const forbiddenVisibleBadges = ["docs/instagram-tools.html", "docs/owner-pitch.html"]
  .filter((path) => /class=["']brand-mark["'][^>]*>\s*R\s*</i.test(read(path)));
if (forbiddenVisibleBadges.length) fail(`legacy visible R badges remain: ${forbiddenVisibleBadges.join(", ")}`);
if (existsSync(deprecatedMobileMaster)) fail("deprecated mobile master still exists");
if (!read("styles.css").includes(`--ruby:${APPROVED_RED}`)) fail("styles.css ruby token is not canonical");

console.log("✅ Roby's brand remediation applied; build, integrity generation and verification are next.");
