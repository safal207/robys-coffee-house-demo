// Temporary, bounded PR422 source applicator. Remove after the generated sync.
// The branch-only workflow runs all ordinary checks before committing anything.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const edit = (path, transform) => writeFileSync(path, transform(readFileSync(path, 'utf8')));
const replace = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Anchor must occur exactly once: ${before}`);
  return source.replace(before, after);
};
edit('scripts/build.mjs', source => {
  for (const name of ['page', 'cart', 'experiments', 'analytics', 'decision-trace', 'release-qa']) {
    const anchor = `  entryPoints: ["src/smart-choice/${name}.ts"],`;
    source = replace(source, anchor, anchor + '\n  charset: "utf8", // ES modules are UTF-8; retain localized text without ASCII expansion.');
  }
  source = replace(source, 'let menuHtml = readFileSync("menu.html", "utf8");', 'const pairingPostersRevision = createHash("sha256").update(readFileSync("pairing-posters.js")).digest("hex").slice(0, 12);\nconst pairingPostersCssRevision = createHash("sha256").update(readFileSync("pairing-posters.css")).digest("hex").slice(0, 12);\nlet menuHtml = readFileSync("menu.html", "utf8");');
  source = replace(source, 'menuHtml = synchronizeModuleScript(menuHtml, "menu-app.js", menuAppRevision);', 'menuHtml = synchronizeModuleScript(menuHtml, "menu-app.js", menuAppRevision);\nmenuHtml = synchronizeModuleScript(menuHtml, "pairing-posters.js", pairingPostersRevision);\nmenuHtml = synchronizeStylesheet(menuHtml, "pairing-posters.css", pairingPostersCssRevision);');
  source = replace(source, 'let serviceWorker = readFileSync("sw-core-v64.js", "utf8");', 'let serviceWorker = readFileSync("sw-core-v64.js", "utf8");\nserviceWorker = serviceWorker.replace(/(robys-offline-v64-20260910-menu-truth-)[a-f0-9]{12}-/, `$1${pairingPostersRevision}-`);');
  source = replace(source, '  ["menu-app.js", menuAppRevision],', '  ["menu-app.js", menuAppRevision],\n  ["pairing-posters.js", pairingPostersRevision],\n  ["pairing-posters.css", pairingPostersCssRevision],');
  return source;
});
edit('scripts/test-discover-pairing-rotation.mjs', source => replace(source, 'function evaluate(discoveredIds) {\n  const context = { result: null };', 'function evaluate(discoveredIds, search = "") {\n  const context = { result: null, URLSearchParams, window: { location: { search } } };') + '\n// A requested pair is first even when it is already discovered; rotation remains complete.\nconst requested = evaluate(["iced-san-sebastian"], "?pair=iced-san-sebastian");\nassert(JSON.stringify(requested.ids) === JSON.stringify(["iced-san-sebastian", "cool-lime-macaron"]), "requested pair must be first exactly once");\nassert(requested.nextId === "cool-lime-macaron", "requested pair must still rotate");\nfor (const search of ["?pair=unknown", "?pair=", "?pair=%3Cscript%3E"]) {\n  assert(JSON.stringify(evaluate([], search).ids) === JSON.stringify(fresh.ids), "invalid pair must retain the normal rotation");\n}\nconsole.log("PASS DISCOVER-ROTATION-001: requested, discovered and unknown deep links preserve the two-pair rotation.");\n');
edit('scripts/verify-smart-choice-release.mjs', source => source + '\n// Verify that compact encoding changes emitted bytes, not localized program semantics.\nawait import("./test-smart-choice-output-encoding.mjs");\n');
edit('scripts/test-brand-refinement-v5.mjs', source => {
  source = replace(source, "import { chromium } from 'playwright';", "import { chromium } from 'playwright';\nimport { verifyBrandOffline } from './test-brand-offline-v5.mjs';");
  const anchor = '  console.log(`PASS BRAND-REFINEMENT-V5 browser: ${rows.length} language/viewport/page cases`);';
  return replace(source, anchor, anchor + '\n  await context.close();\n  await verifyBrandOffline(browser, base, output, async () => {\n    server.closeAllConnections();\n    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));\n  });');
});
const assets = ['brand-refinement-v5.css', ...['compact', 'header', 'primary'].map(kind => `src/brand/robys-${kind}-smooth-v5.svg`)];
edit('sw-core-v64.js', source => {
  source = replace(source, '-share-v4-', '-share-v4-brand-v5-');
  const anchor = '  "./brand-photo-logo.css?v=20260917-approved-v4-restore",';
  source = replace(source, anchor, anchor + '\n' + assets.map(asset => `  "./${asset}?v=20261001-smooth-v5",`).join('\n'));
  source = replace(source, '  "./pairing-posters.js?v=745da5142f2d",', '  "./pairing-posters.js?v=745da5142f2d",\n  "./pairing-posters.css?v=b9a348de0392",');
  const exact = '    url.pathname.endsWith("/brand-photo-logo.css") ||';
  source = replace(source, exact, exact + '\n' + assets.map(asset => `    url.pathname.endsWith("/${asset}") ||`).join('\n'));
  return replace(source, '    url.pathname.endsWith("/pairing-posters.js") ||', '    url.pathname.endsWith("/pairing-posters.js") ||\n    url.pathname.endsWith("/pairing-posters.css") ||');
});
edit('scripts/verify-brand-refinement-v5.mjs', source => source + '\n// Offline navigation must not depend on having visited each logo surface online.\nconst serviceWorker = read(\'sw-core-v64.js\');\nfor (const asset of [\'brand-refinement-v5.css\', ...[\'compact\', \'header\', \'primary\'].map(kind => `src/brand/robys-${kind}-smooth-v5.svg`)]) {\n  assert.ok(serviceWorker.includes(`"./${asset}?v=${REVISION}"`), `${asset}: active revision must be precached`);\n  assert.ok(serviceWorker.includes(`url.pathname.endsWith("/${asset}")`), `${asset}: cache matching must include the revision`);\n}\nassert.match(serviceWorker, /brand-v5-/);\n');
console.log('Applied bounded PR422 source repair. Generated files must now be rebuilt and all checks must pass.');
