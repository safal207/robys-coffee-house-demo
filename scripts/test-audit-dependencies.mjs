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
check("lazy pairing output links its readable view only when reached", {
  "index.html": '<script type="module" src="menu-app.js"></script>',
  "menu-app.js": 'import("./menu-pairing.js?v=fixture");', "src/menu-app.js": 'import("./menu-pairing.js?v=fixture");',
  "menu-pairing.js": "export {};", "src/menu-pairing-view.js": "export {};"
}, [], [["menu-app.js", "src/menu-app.js"], ["menu-pairing.js", "src/menu-pairing-view.js"]]);
check("detached lazy pairing output cannot retain its readable view", {
  "index.html": "<main>Menu</main>", "menu-pairing.js": "export {};", "src/menu-pairing-view.js": "export {};"
}, ["menu-pairing.js", "src/menu-pairing-view.js"]);
check("lazy order UI reaches its source and actual bundled helpers", {
  "index.html": '<script type="module" src="menu-app.js"></script>',
  "menu-app.js": 'import("./menu-order-ui.js?v=fixture");', "src/menu-app.js": 'import("./menu-order-ui.js?v=fixture");',
  "menu-order-ui.js": 'export {};',
  "src/menu-order-ui.js": 'import "./src/order-draft.js"; import "./src/menu-pairing.js";',
  "src/order-draft.js": 'export {};', "src/menu-pairing.js": 'export {};'
}, [], [["menu-app.js", "src/menu-app.js"], ["menu-order-ui.js", "src/menu-order-ui.js"], ["menu-order-ui.js", "src/order-draft.js"], ["menu-order-ui.js", "src/menu-pairing.js"]]);
check("detached order UI cannot retain its source or helpers", {
  "index.html": '<main>Menu</main>', "menu-order-ui.js": 'export {};',
  "src/menu-order-ui.js": 'import "./src/order-draft.js";', "src/order-draft.js": 'export {};'
}, ["menu-order-ui.js", "src/menu-order-ui.js", "src/order-draft.js"]);
check("unreferenced pairing domain remains an orphan", {
  "index.html": '<script type="module" src="menu-app.js"></script>',
  "menu-app.js": "export {};", "src/menu-app.js": "export {};", "src/menu-pairing.js": "export {};"
}, ["src/menu-pairing.js"], [["menu-app.js", "src/menu-app.js"]]);
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

for (const [name, helpers] of [
  ["order-checkout", ["order-ticket", "order-ticket-storage"]],
  ["cashier", ["order-ticket"]]
]) {
  const runtime = `${name}.js`;
  const input = `src/${name}.js`;
  const imported = helpers.map(helper => `import "./${helper}.js";`).join("\n");
  const files = { [runtime]: "export {};", [input]: imported,
    ...Object.fromEntries(helpers.map(helper => [`src/${helper}.js`, "export {}; "])) };
  const buildEdges = [[runtime, input], ...helpers.map(helper => [runtime, `src/${helper}.js`])];
  check(`${name}: reached bundle retains only actual source-relative imported helpers`, {
    "index.html": `<script type="module" src="${runtime}"></script>`, ...files
  }, [], buildEdges);
  check(`${name}: detached bundle and imported helpers remain orphans`, {
    "index.html": "<main>Menu</main>", ...files
  }, Object.keys(files));
  check(`${name}: absent bundle cannot retain source or helpers`, {
    "index.html": `<script type="module" src="${runtime}"></script>`,
    ...Object.fromEntries(Object.entries(files).filter(([path]) => path !== runtime))
  }, Object.keys(files).filter(path => path !== runtime));
  check(`${name}: mentioning helpers without importing them cannot hide orphans`, {
    "index.html": `<script type="module" src="${runtime}"></script>`, ...files,
    [input]: helpers.map(helper => `const unused${helper.replaceAll("-", "")} = "./${helper}.js";`).join("\n")
  }, helpers.map(helper => `src/${helper}.js`), [[runtime, input]]);
}
check("configured server command traverses its real imports", {
  "package.json": JSON.stringify({ scripts: { "counter:start": "node counter/server.mjs" } }),
  "counter/server.mjs": 'import "./auth.mjs";', "counter/auth.mjs": "export {};"
}, []);
check("server files without an actual start command stay orphaned", {
  "package.json": JSON.stringify({ scripts: {} }),
  "counter/server.mjs": 'import "./auth.mjs";', "counter/auth.mjs": "export {};"
}, ["counter/auth.mjs", "counter/server.mjs"]);
for (const name of ["guest", "staff"]) {
  const runtime = `counter/public/${name}.js`;
  const source = `counter/src/${name}.js`;
  const helper = `counter/src/${name}-model.mjs`;
  const files = { [runtime]: "export {};", [source]: `import "./${name}-model.mjs";`, [helper]: "export {};" };
  check(`${name} counter bundle retains only its reached source and imported helper`, {
    [`counter/public/${name}.html`]: `<script type="module" src="./${name}.js"></script>`, ...files
  }, [], [[runtime, source], [runtime, helper]]);
  check(`${name} detached counter bundle remains an orphan`, files, [runtime, source, helper]);
}
console.log(`Dependency build-edge regression: ${checks}/${checks} PASS`);
