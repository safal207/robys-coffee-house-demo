import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const auditor = fileURLToPath(new URL("./audit-dependencies.mjs", import.meta.url));
let checks = 0;
function check(name, files, expectedOrphans, expectedBuildEdges = []) {
  const root = mkdtempSync(join(tmpdir(), "robys-deps-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const run = spawnSync(process.execPath, [auditor, "--check"], {
      cwd: root, encoding: "utf8", timeout: 10_000
    });
    assert.ifError(run.error);
    assert.equal(run.status, expectedOrphans.length ? 1 : 0, `${name}: ${run.stderr}`);
    const report = JSON.parse(readFileSync(join(root, ".artifacts/dependency-graph.json"), "utf8"));
    assert.deepEqual(report.provenOrphans, [...expectedOrphans].sort(), name);
    assert.deepEqual(report.edges.filter(e => e.kind === "build-source").map(e => [e.source, e.target]), expectedBuildEdges, name);
    checks += 1;
    console.log(`PASS ${name}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const name of ["conversion", "menu-app"]) {
  check(`${name}: reached output links readable input`, {
    "index.html": `<script type="module" src="${name}.js?v=fixture"></script>`,
    [`${name}.js`]: "export {};", [`src/${name}.js`]: "export {};"
  }, [], [[`${name}.js`, `src/${name}.js`]]);
  check(`${name}: detached pair is NOT whitelisted`, {
    "index.html": "<main>Menu</main>", [`${name}.js`]: "export {};",
    [`src/${name}.js`]: "export {};"
  }, [`${name}.js`, `src/${name}.js`]);
  check(`${name}: source without output remains an orphan`, {
    "index.html": "<main>Menu</main>", [`src/${name}.js`]: "export {};"
  }, [`src/${name}.js`]);
}
for (const name of ["menu-stability", "final-qa", "community-reel"]) {
  check(`${name}: reached cache-isolated CSS links canonical input`, {
    "index.html": `<link rel="stylesheet" href="${name}-v2.css?v=fixture">`,
    [`${name}-v2.css`]: "body{color:red}", [`${name}.css`]: "body{color:red}"
  }, [], [[`${name}-v2.css`, `${name}.css`]]);
  check(`${name}: detached stylesheet pair is NOT whitelisted`, {
    "index.html": "<main>Menu</main>", [`${name}-v2.css`]: "body{color:red}",
    [`${name}.css`]: "body{color:red}"
  }, [`${name}-v2.css`, `${name}.css`]);
  check(`${name}: canonical CSS without output remains an orphan`, {
    "index.html": "<main>Menu</main>", [`${name}.css`]: "body{color:red}"
  }, [`${name}.css`]);
}
check("unrelated source and output remain orphans", {
  "index.html": '<script type="module" src="conversion.js"></script>',
  "conversion.js": "export {};", "src/conversion.js": "export {};",
  "unused.js": "export {};", "src/unused.js": "export {};"
}, ["src/unused.js", "unused.js"], [["conversion.js", "src/conversion.js"]]);
check("build script mentioning output does not make it reachable", {
  "index.html": "<main>Menu</main>", "conversion.js": "export {};",
  "src/conversion.js": "export {};",
  "scripts/build.mjs": 'readFileSync("src/conversion.js"); writeFileSync("conversion.js", "");'
}, ["conversion.js", "src/conversion.js"]);
check("root-relative emitted imports remain traversed", {
  "index.html": '<script type="module" src="menu-app.js"></script>',
  "menu-app.js": 'import "./menu-catalog.js";', "menu-catalog.js": "export {};",
  "src/menu-app.js": 'import "./menu-catalog.js";'
}, [], [["menu-app.js", "src/menu-app.js"]]);
check("reached menu links its bundled draft helper", {
  "index.html": '<script type="module" src="menu-app.js"></script>',
  "menu-app.js": "export {};",
  "src/menu-app.js": 'import { normalizeOrderDraft } from "./src/order-draft.js";',
  "src/order-draft.js": "export function normalizeOrderDraft() {}"
}, [], [["menu-app.js", "src/menu-app.js"], ["menu-app.js", "src/order-draft.js"]]);
check("unreferenced draft helper remains an orphan", {
  "index.html": '<script type="module" src="menu-app.js"></script>',
  "menu-app.js": "export {};", "src/menu-app.js": "export {};",
  "src/order-draft.js": "export {};"
}, ["src/order-draft.js"], [["menu-app.js", "src/menu-app.js"]]);
check("detached menu cannot retain its bundled helper", {
  "index.html": "<main>Menu</main>", "menu-app.js": "export {};",
  "src/menu-app.js": 'import "./src/order-draft.js";',
  "src/order-draft.js": "export {};"
}, ["menu-app.js", "src/menu-app.js", "src/order-draft.js"]);
check("missing menu output cannot retain its bundled helper", {
  "index.html": "<main>Menu</main>",
  "src/menu-app.js": 'import "./src/order-draft.js";',
  "src/order-draft.js": "export {};"
}, ["src/menu-app.js", "src/order-draft.js"]);
console.log(`Dependency build-edge regression: ${checks}/${checks} PASS`);
