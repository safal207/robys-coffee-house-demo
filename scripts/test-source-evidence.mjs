import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-source-evidence.mjs");

function runFixture(evidence, source) {
  const root = mkdtempSync(path.join(tmpdir(), "trace-source-001-"));
  try {
    mkdirSync(path.join(root, "qa/traceability"), { recursive: true });
    writeFileSync(path.join(root, "qa/feature-traceability-matrix.json"), JSON.stringify({
      featureFiles: ["qa/traceability/fixture.json"]
    }));
    writeFileSync(path.join(root, "qa/traceability/fixture.json"), JSON.stringify({
      features: [{ id: "FEAT-QA-001", evidence: [evidence] }]
    }));
    writeFileSync(path.join(root, "fixture.js"), source);
    return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectSuccess(label, evidence, source) {
  const result = runFixture(evidence, source);
  if (result.status !== 0) throw new Error(`${label} should pass:\n${result.stderr || result.stdout}`);
}

function expectFailure(label, evidence, source) {
  const result = runFixture(evidence, source);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes("TRACE-SOURCE-001")) {
    throw new Error(`${label} should fail:\n${output}`);
  }
}

expectSuccess("symbol in code", "fixture.js#existingSymbol", "const existingSymbol = true;\n");
expectSuccess("symbol before trailing comment", "fixture.js#existingSymbol", "const existingSymbol = true; // removedSymbol\n");
expectSuccess("slashes inside string", "fixture.js#endpoint", "const endpoint = 'https://example.test/path';\n");
expectFailure("empty source fragment", "fixture.js#", "const value = true;\n");
expectFailure("symbol only in trailing comment", "fixture.js#removedSymbol", "doWork(); // removedSymbol\n");
expectFailure("symbol only in full-line comment", "fixture.js#removedSymbol", "// removedSymbol\n");
expectFailure("symbol only in block comment", "fixture.js#removedSymbol", "/* removedSymbol */\n");

console.log("✅ TRACE-SOURCE-001 mutation tests passed: empty fragments and comment-only symbols fail while code and string literals remain parseable.");
