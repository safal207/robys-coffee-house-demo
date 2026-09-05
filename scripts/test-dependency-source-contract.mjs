import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const auditScript = fileURLToPath(new URL("./audit-dependencies.mjs", import.meta.url));
const cases = [];
function verify(name, files, status, expectedOrphans, expectedBuildEdges = []) {
  const root = mkdtempSync(join(tmpdir(), "robys-dependency-source-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const target = join(root, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const run = spawnSync(process.execPath, [auditScript, "--check"], {
      cwd: root, encoding: "utf8", timeout: 10_000
    });
    assert.ifError(run.error);
    assert.equal(run.status, status, `${name}: unexpected exit\n${run.stdout}\n${run.stderr}`);
    const report = JSON.parse(readFileSync(join(root, ".artifacts/dependency-graph.json"), "utf8"));
    assert.deepEqual(report.provenOrphans, [...expectedOrphans].sort(), name);
    assert.deepEqual(
      report.edges.filter(edge => edge.kind === "build-source").map(edge => [edge.source, edge.target]).sort(),
      [...expectedBuildEdges].sort(), `${name}: incorrect source/output linkage`
    );
    cases.push({ name, status: "PASS" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const module of ["conversion", "menu-app"]) {
  const output = `${module}.js`, source = `src/${module}.js`;
  const loaded = {
    "index.html": `<script type="module" src="${output}?v=fixture"></script>`,
    [output]: "console.log('public runtime');\n",
    [source]: "console.log('readable build input');\n"
  };
  verify(`${module}: reachable emitted module retains its source`, loaded, 0, [], [[output, source]]);
  verify(`${module}: arbitrary src orphan is still rejected`, {
    ...loaded, "src/unused.js": "console.log('unused');\n"
  }, 1, ["src/unused.js"], [[output, source]]);
  verify(`${module}: detached pair is not exempt`, {
    ...loaded, "index.html": "<p>No public script reference</p>"
  }, 1, [output, source]);
  verify(`${module}: missing emitted module cannot retain its source`, {
    "index.html": "<p>No emitted runtime</p>", [source]: loaded[source]
  }, 1, [source]);
  verify(`${module}: direct runtime before source-first migration is supported`, {
    "index.html": loaded["index.html"], [output]: loaded[output]
  }, 0, []);
}
verify("unrelated unused public runtime still fails", {
  "index.html": '<script src="used.js"></script>',
  "used.js": "console.log('used');", "unused.js": "console.log('unused');"
}, 1, ["unused.js"]);
console.log(JSON.stringify({ contract: "dependency-build-source", passed: cases.length, cases }, null, 2));
