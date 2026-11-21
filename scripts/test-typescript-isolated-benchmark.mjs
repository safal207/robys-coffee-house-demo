import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the benchmark does not change Roby's production TypeScript dependency or build path", () => {
  const packageJson = JSON.parse(read("package.json"));
  const build = read("scripts/build.mjs");
  assert.equal(packageJson.devDependencies.typescript, "5.8.3");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.match(build, /import ts from "typescript"/);
  assert.equal(packageJson.scripts["bench:typescript"], undefined, "Benchmark is CI-only, no production script");
});

test("each compiler is an isolated and strictly identified executable", () => {
  const source = read("scripts/benchmark-typescript.mjs");
  for (const [id, version] of [
    ["typescript-5-current", "5.8.3"],
    ["typescript-6-compat", "6.0.3"],
    ["typescript-7-native", "7.0.2"]
  ]) {
    assert.ok(source.includes(`["${id}", "${version}"]`), `Missing compiler identity: ${id}`);
  }
  assert.match(source, /\.typescript-bench\/ts6\/node_modules\/\.bin\/tsc/);
  assert.match(source, /\.typescript-bench\/ts7\/node_modules\/\.bin\/tsc/);
  assert.match(source, /versions\.set\(candidate\.id, reported\)/);
  assert.match(source, /\["--noEmit", "--pretty", "false"\]/);
  assert.match(source, /TS_BENCH_SAMPLES/);
});

test("workflow is read-only, compares three OS, and records real samples", () => {
  const workflow = read(".github/workflows/typescript-isolated-benchmark.yml");
  assert.match(workflow, /permissions:\s*\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /git diff --exit-code -- \./);
  assert.match(workflow, /run: npm install --prefix \.typescript-bench\/ts6 .* typescript@6\.0\.3/);
  assert.match(workflow, /typescript@7\.0\.2/);
  assert.match(workflow, /node scripts\/benchmark-typescript\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test("causal regression graph registers every new QA artifact", () => {
  const graph = JSON.parse(read("qa/causal-regression-graph.json"));
  const files = [".github/workflows/typescript-isolated-benchmark.yml",
    "scripts/benchmark-typescript.mjs", "scripts/test-typescript-isolated-benchmark.mjs"];
  for (const path of files) {
    const owners = graph.components.filter(component => component.paths.includes(path)).map(component => component.id);
    assert.deepEqual(owners, ["qa-registry"], `Unmapped or multiply owned ${path}`);
  }
});
