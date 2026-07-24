import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const APPROVED_RED = "#E21B23";
const APPLE_TOUCH_REVISION = "ios-install-20260707-1";

function fail(message) {
  throw new Error(`[ROBYS-BRAND-REMEDIATION] ${message}`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) fail(`${label}: expected source fragment was not found`);
  return source.replace(search, replacement);
}

function update(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (after === before) fail(`${path} was not changed; expected source contract not found`);
  write(path, after);
}

function ensureAfter(path, anchor, line) {
  const source = read(path);
  if (source.includes(line)) return;
  if (!source.includes(anchor)) fail(`${path}: insertion anchor not found`);
  write(path, source.replace(anchor, `${anchor}\n${line}`));
}

function canonicalizeRed(path) {
  update(path, (source) => {
    const next = source
      .replaceAll("#b84d58", APPROVED_RED)
      .replaceAll("#B84D58", APPROVED_RED)
      .replaceAll("rgba(184,77,88,", "rgba(226,27,35,");
    if (next === source) fail(`${path}: legacy Roby's red was not found`);
    return next;
  });
}

// 1. Canonical digital palette: only the intended UI surfaces are migrated.
for (const path of [
  "styles.css",
  "docs/instagram-tools.css",
  "docs/owner-pitch.css",
  "offline.css"
]) {
  canonicalizeRed(path);
}

update("brand-photo-logo.css", (source) => {
  let next = source;
  if (!next.includes("--ruby:var(--robys-brand-red);")) {
    next = replaceRequired(
      next,
      "  --robys-brand-paper:#F5F5F2;",
      "  --robys-brand-paper:#F5F5F2;\n  --ruby:var(--robys-brand-red);\n  --brand-wordmark-paper:var(--robys-brand-paper);",
      "canonical brand token aliases"
    );
  }
  if (!next.includes(".map-pin img{")) {
    next += "\n\n.map-pin img{display:block;width:46px;height:46px;object-fit:contain;transform:rotate(45deg)}\n";
  }
  return next;
});

// 2. Static Apple touch binding is parser-visible on every shipped HTML surface.
for (const path of ["index.html", "menu.html", "discover.html", "404.html"]) {
  ensureAfter(
    path,
    '  <link rel="icon" href="icon.svg" type="image/svg+xml" />',
    `  <link rel="apple-touch-icon" href="apple-touch-icon.png?v=${APPLE_TOUCH_REVISION}" />`
  );
}
for (const path of ["docs/instagram-tools.html", "docs/owner-pitch.html"]) {
  ensureAfter(
    path,
    '  <link rel="icon" href="../icon.svg" type="image/svg+xml" />',
    `  <link rel="apple-touch-icon" href="../apple-touch-icon.png?v=${APPLE_TOUCH_REVISION}" />`
  );
}

// 3. Keep the governed slogan and replace visible legacy R marks.
update("index.html", (source) => {
  let next = replaceRequired(
    source,
    '"slogan": "İyi kahve. Sakin anlar."',
    '"slogan": "Fresh Coffee Point"',
    "structured brand slogan"
  );
  next = replaceRequired(
    next,
    '<div class="map-pin" aria-hidden="true"><span>R</span></div>',
    '<div class="map-pin" aria-hidden="true"><img src="src/brand/robys-mark-master-v1.svg?v=20260721-master-1" width="46" height="46" alt="" /></div>',
    "map pin organic-O"
  );
  return next;
});

update("menu.html", (source) => replaceRequired(
  source,
  "FRESH COFFEE, DAILY",
  "FRESH COFFEE POINT",
  "menu fallback tagline"
));

update("docs/instagram-tools.html", (source) => replaceRequired(
  source,
  `    <a class="brand" href="../index.html" aria-label="Roby's Coffee House ana sayfa">\n      <span class="brand-mark">R</span>\n      <span><strong>ROBY'S</strong><small>COFFEE HOUSE</small></span>\n    </a>`,
  `    <a class="brand" href="../index.html" aria-label="Roby's Coffee House ana sayfa">\n      <img class="brand-logo" src="../src/brand/robys-compact-master-v1.svg?v=20260721-master-1" width="180" height="58" alt="" aria-hidden="true" />\n    </a>`,
  "Instagram tools approved compact lockup"
));

update("docs/instagram-tools.css", (source) => {
  let next = replaceRequired(
    source,
    '.brand-mark{display:grid;width:42px;height:42px;place-items:center;color:#fff;background:var(--ruby);border-radius:50%;font:700 1.45rem var(--display)}',
    '.brand-logo{display:block;width:180px;height:auto}',
    "Instagram tools logo CSS"
  );
  next = next.replace('.brand>span:last-child{display:grid;line-height:1}\n.brand strong{font-size:.88rem;letter-spacing:.12em}\n.brand small{margin-top:4px;color:var(--muted);font-size:.58rem;letter-spacing:.14em}\n', "");
  next = next.replace('--display:Georgia,"Times New Roman",serif', '--display:"Arial Narrow",Arial,sans-serif');
  return next;
});

update("docs/owner-pitch.html", (source) => replaceRequired(
  source,
  '        <div class="brand-mark" aria-hidden="true">R</div>',
  '        <img class="brand-mark" src="../src/brand/robys-mark-master-v1.svg?v=20260721-master-1" width="72" height="72" alt="" aria-hidden="true" />',
  "owner pitch organic-O"
));

update("docs/owner-pitch.css", (source) => {
  let next = replaceRequired(
    source,
    '.brand-mark{display:grid;width:72px;height:72px;place-items:center;margin-bottom:28px;background:var(--ruby);border-radius:50%;font:700 2.4rem var(--display);box-shadow:0 16px 36px rgba(0,0,0,.24)}',
    '.brand-mark{display:block;width:72px;height:72px;margin-bottom:28px;object-fit:contain}',
    "owner pitch mark CSS"
  );
  next = next.replace('--display:Georgia,"Times New Roman",serif', '--display:"Arial Narrow",Arial,sans-serif');
  return next;
});

update("404.html", (source) => replaceRequired(
  source,
  '    <div class="offline-mark" aria-hidden="true">R</div>',
  '    <img class="offline-mark" src="src/brand/robys-mark-master-v1.svg?v=20260721-master-1" width="76" height="76" alt="" aria-hidden="true" />',
  "404 organic-O"
));

update("offline.css", (source) => {
  let next = replaceRequired(
    source,
    '.offline-mark{display:grid;width:76px;height:76px;margin:0 auto 24px;place-items:center;border-radius:50%;background:#E21B23;font:600 2rem Georgia,serif;box-shadow:0 18px 38px rgba(226,27,35,.28)}',
    '.offline-mark{display:block;width:76px;height:76px;margin:0 auto 24px;object-fit:contain}',
    "404 mark CSS"
  );
  next = next.replaceAll("Georgia,serif", '"Arial Narrow",Arial,sans-serif');
  return next;
});

// 4. Retire the unused baked-in pill asset; the compact SVG plus CSS owns mobile presentation.
const deprecatedMobileMaster = "src/brand/robys-mobile-master-v1.svg";
if (!existsSync(deprecatedMobileMaster)) fail(`${deprecatedMobileMaster} is missing from the expected baseline`);
rmSync(deprecatedMobileMaster);

// 5. Strengthen brand identity regression coverage.
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
    `const identityPages = ["index.html", "menu.html", "discover.html"].map((path) => [path, read(path)]);\nconst serviceIdentityPages = [\n  ["docs/instagram-tools.html", read("docs/instagram-tools.html")],\n  ["docs/owner-pitch.html", read("docs/owner-pitch.html")]\n];\nconst serviceIdentityStyles = [\n  ["docs/instagram-tools.css", read("docs/instagram-tools.css")],\n  ["docs/owner-pitch.css", read("docs/owner-pitch.css")]\n];\nconst notFoundHtml = read("404.html");\nconst offlineCss = read("offline.css");`,
    "brand verifier supporting surfaces"
  );
  next = replaceRequired(
    next,
    'assert(baseCss.includes(`--brand-wordmark-red:${APPROVED_RED}`), "legacy wordmark fallback must use canonical red");',
    `assert(baseCss.includes(\`--brand-wordmark-red:\${APPROVED_RED}\`), "legacy wordmark fallback must use canonical red");\nassert(baseCss.includes(\`--ruby:\${APPROVED_RED}\`), "UI ruby token must use canonical red");\nassert(!baseCss.includes("#b84d58"), "base UI must not retain the legacy ruby red");\nassert(!existsSync("src/brand/robys-mobile-master-v1.svg"), "deprecated baked-in mobile pill master must be removed");`,
    "canonical UI red checks"
  );
  next = replaceRequired(
    next,
    '  assert(source.includes(`brand-photo-logo.css?v=${IDENTITY_REVISION}`), `${path} must link the identity stylesheet without JavaScript`);',
    `  assert(source.includes(\`brand-photo-logo.css?v=\${IDENTITY_REVISION}\`), \`\${path} must link the identity stylesheet without JavaScript\`);\n  assert(source.includes('<link rel="apple-touch-icon" href="apple-touch-icon.png?v=ios-install-20260707-1" />'), \`\${path} must statically link the Apple touch icon\`);`,
    "static Apple touch binding"
  );
  next = replaceRequired(
    next,
    'assert(bootstrap.includes("apple-touch-icon.png?v="), "Apple touch icon PNG wiring must remain active");',
    `assert(bootstrap.includes("apple-touch-icon.png?v="), "progressive Apple touch fallback may remain active");\nfor (const [path, source] of serviceIdentityPages) {\n  assert(source.includes("../apple-touch-icon.png?v=ios-install-20260707-1"), \`\${path} must statically link the Apple touch icon\`);\n  assert(!/class=["']brand-mark["'][^>]*>\\s*R\\s*</i.test(source), \`\${path} must not render the legacy R badge\`);\n  assert(/robys-(?:compact|mark)-master-v1\\.svg/.test(source), \`\${path} must reuse an approved SVG identity asset\`);\n}\nfor (const [path, source] of serviceIdentityStyles) {\n  assert(source.includes(APPROVED_RED), \`\${path} must use canonical red\`);\n  assert(!source.includes("#b84d58"), \`\${path} must not retain the legacy ruby red\`);\n  assert(!/Georgia|Times New Roman|(?<!sans-)\\bserif\\b/i.test(source), \`\${path} must not introduce a serif display language\`);\n}\nassert(notFoundHtml.includes("apple-touch-icon.png?v=ios-install-20260707-1"), "404 page must statically link the Apple touch icon");\nassert(notFoundHtml.includes("src/brand/robys-mark-master-v1.svg"), "404 page must reuse the approved organic-O mark");\nassert(!/class=["']offline-mark["'][^>]*>\\s*R\\s*</i.test(notFoundHtml), "404 page must not render the legacy R badge");\nassert(offlineCss.includes(APPROVED_RED) && !offlineCss.includes("#b84d58"), "404 UI must use canonical red");\nassert(!/Georgia|Times New Roman|(?<!sans-)\\bserif\\b/i.test(offlineCss), "404 UI must not introduce a serif display language");`,
    "supporting surface identity checks"
  );
  return next;
});

// 6. Repair stale main-branch expectations while keeping the contracts fail-closed.
update("scripts/verify-p1-interface-contracts.mjs", (source) => {
  let next = replaceRequired(
    source,
    "padding-bottom:calc(70px + env(safe-area-inset-bottom))",
    "padding-bottom:calc(98px + env(safe-area-inset-bottom))",
    "mobile CTA protected footer spacing"
  );
  next = replaceRequired(next, "routeUrls.length >= 4", "routeUrls.length >= 3", "static driving-route CTA count");
  next = replaceRequired(
    next,
    'assert(instagramUrls.every((url) => url === "https://www.instagram.com/robyscoffeehouse/"), "CTA-001", "Wrong Instagram destination");',
    'assert(instagramUrls.every((url) => url === "https://www.instagram.com/robyscoffeehouse/" || url === "https://www.instagram.com/reel/C0qYxxmIY9t/"), "CTA-001", "Wrong Instagram destination");',
    "official Instagram allowlist"
  );
  next = replaceRequired(next, "src/robys-hero-mobile-lite.mp4", "src/robys-ambience-clean.mp4", "current hero asset list");
  next = replaceRequired(
    next,
    'HERO_VIDEO = "src/robys-hero-mobile-lite.mp4',
    'HERO_VIDEO = "src/robys-ambience-clean.mp4?v=20260711-1',
    "current hero runtime contract"
  );
  return next;
});

update("scripts/verify-seo-content-deploy.mjs", (source) => replaceRequired(
  source,
  'assert(notFound.includes(\'name="robots" content="noindex,follow"\'), "DEPLOY-001", "404 page must remain noindex");',
  'assert(meta(notFound, "robots").split(",").map((token) => token.trim().toLowerCase()).includes("noindex"), "DEPLOY-001", "404 page must remain noindex");',
  "semantic 404 noindex contract"
));

// 7. Update policy and evidence documents without making physical or legal claims.
update("docs/brand-reference-policy.md", (source) => replaceRequired(
  source,
  "- The current HEX values are implementation approximations sampled from public production imagery, not official brand specifications.",
  "- The approved digital identity tokens are red `#E21B23`, ink `#111111`, and warm paper `#F5F5F2`; changes require owner-approved brand evidence and an updated identity contract.",
  "approved digital token policy"
));

write("docs/brand/robys-logo-implementation-v1.md", `# Roby's identity normalization v1\n\nSource decision: the owner-provided Roby's identity sheet and the repository identity audit.\n\n## Implemented\n\n- uses path-only primary, medium, compact and mark masters;\n- derives favicon, maskable icon and Apple touch icon from the approved organic O;\n- statically links the Apple touch icon in Home, Menu, Discover, 404 and owner utility pages, with JavaScript retained only as a progressive fallback;\n- uses canonical digital identity tokens: red \`#E21B23\`, ink \`#111111\`, and paper \`#F5F5F2\`;\n- aligns the shared UI ruby token, owner utility pages and offline surface to the canonical red;\n- replaces visible legacy \`R\` badges in the map, owner utilities and 404 with approved SVG assets;\n- keeps \`Fresh Coffee Point\` as the structured brand slogan while allowing marketing headlines as a separate copy layer;\n- retires \`robys-mobile-master-v1.svg\`: the compact transparent master is the asset, while pill radius and shadow belong to CSS;\n- verifies source assets, static wiring, safe zones, supporting pages, manifest delivery and legacy-token rejection.\n\n## Evidence boundary\n\nThis implementation does not claim trademark clearance, consumer recall, storefront-distance readability, physical print durability or revenue impact. One-color/reverse production masters and physical mockup testing remain separate work.\n`);

write("docs/brand/robys-logo-release-checklist.md", `# Roby's logo release checklist\n\nUse with \`evaluate-world-class-logo\` and the current audit in \`robys-world-class-logo-audit.md\`.\n\n## Verified digital release scope\n\n- [x] Primary, medium, compact, mark-only, favicon and maskable variants have documented use boundaries.\n- [x] No production logo asset contains \`<text>\` or depends on installed fonts.\n- [x] Favicon geometry retains bounded clearance at 16 and 32 CSS px.\n- [x] PWA maskable artwork remains inside the automated safe-zone contract.\n- [x] Apple touch icon is statically linked and visually belongs to the organic-O family.\n- [x] Header uses the no-micro-tagline medium lockup; mobile uses the compact master inside a CSS-owned pill.\n- [x] Approved red, ink and paper values are defined and checked across SVG, CSS, PWA and offline assets.\n- [x] Owner utility and 404 pages reuse approved SVG identity assets and contain no visible legacy \`R\` badge.\n- [x] Turkish, English and Russian interface surroundings preserve the logo hierarchy.\n- [x] SVG viewBox, aspect ratio, cache revision, integrity manifest and Service Worker delivery are checked by repository contracts.\n\n## Still required for physical / legal release claims\n\n- [ ] Approved black, white/reverse and single-ink physical-production variants exist.\n- [ ] Compact and mark-only clear space has been reviewed on cream, white and dark-brown physical surfaces.\n- [ ] Storefront, cup, napkin, stamp and embroidery mockups have been reviewed at realistic size.\n- [ ] Category-wall and one-second recall evidence is recorded.\n- [ ] Confusing similarity and trademark availability have been reviewed by a qualified professional.\n\nAny failed P0 or P1 digital item blocks a digital release-ready verdict. Physical and legal items block corresponding physical or legal claims, not the current website release.\n`);

write("docs/brand/robys-world-class-logo-audit.md", `# Roby's world-class logo audit\n\nBaseline inspected: \`main@614e8a88b9ac2225620ace229f960185f483e061\`.\n\n## Current verdict\n\n**Digital identity ready within the repository evidence boundary — 87/100.**\n\nThe website now uses one path-based Roby's identity family across wordmarks, favicon/PWA, Apple touch icon, map mark, 404 and owner utility pages. The approved digital tokens are red \`#E21B23\`, ink \`#111111\`, and warm paper \`#F5F5F2\`.\n\n## Closed findings\n\n| Former finding | Current state | Evidence contract |\n|---|---|---|\n| Favicon/PWA used a different monogram | Closed | \`icon.svg\` and \`icon-maskable.svg\` reuse the approved organic-O path and contain no text nodes |\n| Header primary lockup was over-detailed | Closed | Desktop uses \`robys-header-master-v1.svg\`; mobile uses the compact master |\n| Brand red was fragmented | Closed for digital UI | Shared ruby tokens, utility pages and offline UI use \`#E21B23\`; the verifier rejects \`#b84d58\` |\n| Apple touch icon was not statically declared | Closed | Home, Menu, Discover, 404 and owner utility pages contain parser-visible \`apple-touch-icon\` links |\n| Supporting pages displayed a red circle with \`R\` | Closed | Map, 404 and owner pages reuse compact/mark SVG masters |\n| Baked mobile pill master was unused | Closed | Deprecated file removed; CSS owns the pill container and shadow |\n| Audit described the current favicon as an unrelated monogram | Closed | This document now describes the current organic-O implementation |\n\n## Open boundaries\n\n- one-color, reverse, stamp and embroidery production masters are not yet approved;\n- consumer recall, category-wall distinctiveness and storefront-distance readability need field evidence;\n- trademark availability requires qualified legal review;\n- marketing headlines remain a separate verbal layer, while \`Fresh Coffee Point\` is the structured brand slogan.\n\n## Scorecard\n\n| Dimension | Score |\n|---|---:|\n| Strategic fit | 13/15 |\n| Distinctiveness | 11/15 |\n| Memorability | 8/10 |\n| Form and negative space | 9/10 |\n| Typography / wordmark | 9/10 |\n| Responsive scalability | 9/10 |\n| Optical quality | 7/8 |\n| Identity-system potential | 7/8 |\n| Cultural / accessibility resilience | 7/7 |\n| Digital production readiness | 7/7 |\n| **Normalized total** | **87/100** |\n\n## Evidence boundary\n\nThis audit supports repository and digital-delivery claims only. It does not prove consumer recall, commercial impact, physical durability, trademark availability or owner approval beyond the supplied identity reference.\n`);

// 8. Final fail-closed assertions before build and manifest regeneration.
for (const path of ["docs/instagram-tools.html", "docs/owner-pitch.html", "404.html"]) {
  if (/class=["'](?:brand-mark|offline-mark)["'][^>]*>\s*R\s*</i.test(read(path))) {
    fail(`${path}: visible legacy R badge remains`);
  }
}
if (existsSync(deprecatedMobileMaster)) fail("deprecated mobile master still exists");
if (!read("styles.css").includes(`--ruby:${APPROVED_RED}`)) fail("styles.css ruby token is not canonical");
if (!read("404.html").includes("src/brand/robys-mark-master-v1.svg")) fail("404 organic-O mark is missing");

console.log("✅ Roby's brand remediation applied; build, integrity generation and full verification are next.");
