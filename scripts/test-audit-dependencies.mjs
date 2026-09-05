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
console.log(`Dependency build-edge regression: ${checks}/${checks} PASS`);
