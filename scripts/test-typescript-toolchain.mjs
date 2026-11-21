import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("TS7 is the primary checker while the JS build API stays on TS6", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(pkg.devDependencies["@typescript/native"], "npm:typescript@7.0.2");
  assert.equal(pkg.devDependencies.typescript, "npm:@typescript/typescript6@6.0.2");
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
  assert.equal(lock.packages["node_modules/@typescript/native"].version, "7.0.2");
  assert.equal(lock.packages["node_modules/typescript"].name, "@typescript/typescript6");
  assert.equal(lock.packages["node_modules/typescript"].version, "6.0.2");
  assert.equal(lock.packages["node_modules/@typescript/old"].version, "6.0.3");
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts["typecheck:compat"], "tsc6 --noEmit");
  assert.match(read("scripts/build.mjs"), /import ts from "typescript"/);
  assert.match(pkg.scripts.check, /npm run verify:typescript-toolchain && npm run test:typescript-toolchain && npm run typecheck && npm run typecheck:compat/);
});

test("verification executes each CLI and checks the actual TypeScript 6 compiler API", () => {
  const v = read("scripts/verify-typescript-toolchain.mjs");
  assert.ok(v.includes('invoke("tsc")'));
  assert.ok(v.includes('invoke("tsc6")'));
  assert.ok(v.includes('await import("typescript")'));
  assert.ok(v.includes("ts.transpileModule"));
  assert.ok(v.includes('Version 7.0.2'));
});

test("the dual compiler workflow is read only and rejects generated-file drift", () => {
  const wf = read(".github/workflows/typescript-dual-compiler.yml");
  assert.match(wf, /permissions:\s*\n  contents: read/);
  assert.match(wf, /persist-credentials: false/);
  assert.match(wf, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(wf, /npm ci --no-audit --no-fund/);
  assert.match(wf, /npm run verify:typescript-toolchain/);
  assert.match(wf, /npm run typecheck:compat/);
  assert.match(wf, /git diff --exit-code --/);
  assert.match(wf, /npm run build/);
});

test("graph tracks compiler workflow, verifier and its tests without wildcard ownership", () => {
  const graph = JSON.parse(read("qa/causal-regression-graph.json"));
  for (const path of [
    ".github/workflows/typescript-dual-compiler.yml",
    "scripts/verify-typescript-toolchain.mjs",
    "scripts/test-typescript-toolchain.mjs",
    "docs/qa/typescript7-dual-compiler.md"
  ]) {
    assert.deepEqual(graph.components.filter(c => c.paths.includes(path)).map(c => c.id), ["qa-registry"]);
  }
});

test("both compilers reject deliberate TS2322 without depending on a specific exit code", () => {
  const root = resolve(import.meta.dirname, "..");
  const temp = mkdtempSync(join(tmpdir(), "robys-ts7-negative-"));
  try {
    const bad = join(temp, "intentional-error.ts");
    writeFileSync(bad, "const mustBeString: string = 123;\\n", "utf8");
    for (const name of ["tsc", "tsc6"]) {
      const binary = join(root, "node_modules", ".bin", process.platform === "win32" ? name + ".cmd" : name);
      const result = spawnSync(binary, [
        "--noEmit", "--pretty", "false", "--strict", "--skipLibCheck",
        "--target", "es2020", "--module", "esnext", bad
      ], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
      assert.ifError(result.error);
      assert.notEqual(result.status, null, name + ": compiler did not exit normally");
      assert.notEqual(result.status, 0, name + ": type errors must fail the CI gate");
      assert.match((result.stdout || "") + (result.stderr || ""), /TS2322:/,
        name + ": failure must be a real type-assignment diagnostic");
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
