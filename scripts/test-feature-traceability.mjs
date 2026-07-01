import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-feature-traceability.mjs");

function validFixture() {
  return {
    evidenceText: "const existingSymbol = true;\n",
    extraFeatures: [],
    manifest: {
      version: 1,
      contract: "TRACE-001",
      scope: { layers: ["uiUx", "api", "backend"] },
      allowed: {
        lifecycle: ["implemented"],
        operational: ["degraded"],
        layer: ["implemented", "external", "planned"]
      },
      invariants: [
        { path: "layers.api", equals: "external", min: 1, message: "external API required" },
        { path: "layers.backend", equals: "planned", min: 1, message: "backend plan required" },
        { path: "current.operational", equals: "degraded", min: 1, message: "degraded state required" }
      ],
      milestones: [
        { id: "M-20260701", at: "2026-07-01", ref: "pr:#148", change: "fixture", features: ["FEAT-API-001"] }
      ],
      featureFiles: ["qa/traceability/fixture.json"]
    },
    feature: {
      id: "FEAT-API-001",
      name: "Fixture",
      domain: "qa",
      owner: "qa",
      current: { lifecycle: "implemented", operational: "degraded" },
      layers: { uiUx: "implemented", api: "external", backend: "planned" },
      requirements: ["REQ-API-001-01 fixture requirement"],
      stateModel: {
        initial: "idle",
        states: ["idle", "ready"],
        transitions: ["idle --start--> ready"]
      },
      evidence: ["fixture.txt#existingSymbol"],
      tests: ["mutation fixture"],
      history: [["2026-07-01", "implemented", "pr:#148"]],
      risks: ["fixture risk"],
      nextGate: "fixture gate",
      dependsOn: []
    }
  };
}

function runFixture(mutator) {
  const root = mkdtempSync(path.join(tmpdir(), "trace-001-"));
  try {
    const fixture = validFixture();
    mutator?.(fixture);
    mkdirSync(path.join(root, "qa/traceability"), { recursive: true });
    writeFileSync(path.join(root, "qa/feature-traceability-matrix.json"), JSON.stringify(fixture.manifest, null, 2));
    writeFileSync(
      path.join(root, "qa/traceability/fixture.json"),
      JSON.stringify({ features: [fixture.feature, ...fixture.extraFeatures] }, null, 2)
    );
    writeFileSync(path.join(root, "fixture.txt"), fixture.evidenceText);
    return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectSuccess(label, mutator) {
  const result = runFixture(mutator);
  if (result.status !== 0) {
    throw new Error(`${label} should pass:\n${result.stderr || result.stdout}`);
  }
}

function expectFailure(label, expectedText, mutator) {
  const result = runFixture(mutator);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedText)) {
    throw new Error(`${label} should fail with ${expectedText}:\n${output}`);
  }
}

expectSuccess("valid baseline");
expectSuccess("exact attribute value", (fixture) => {
  fixture.feature.evidence = ["fixture.txt#[data-mode=\"expected\"]"];
  fixture.evidenceText = "<div data-mode=\"expected\"></div>\n";
});
expectFailure("stale evidence fragment", "evidence fragment does not exist", ({ feature }) => {
  feature.evidence = ["fixture.txt#missingSymbol"];
});
expectFailure("substring-only evidence fragment", "evidence fragment does not exist", (fixture) => {
  fixture.feature.evidence = ["fixture.txt#track"];
  fixture.evidenceText = "const tracking = true;\n";
});
expectFailure("wrong attribute value", "evidence fragment does not exist", (fixture) => {
  fixture.feature.evidence = ["fixture.txt#[data-mode=\"expected\"]"];
  fixture.evidenceText = "<div data-mode=\"wrong\"></div>\n";
});
expectFailure("evidence path escape", "evidence escapes repository root", ({ feature }) => {
  feature.evidence = ["../outside.txt#existingSymbol"];
});
expectFailure("unreachable state", "unreachable states", ({ feature }) => {
  feature.stateModel.states.push("orphaned");
});
expectFailure("malformed dependsOn", "invalid dependsOn", ({ feature }) => {
  feature.dependsOn = "FEAT-API-001";
});
expectFailure("dependency cycle", "feature dependency cycle", (fixture) => {
  const second = structuredClone(fixture.feature);
  second.id = "FEAT-API-002";
  second.name = "Second fixture";
  second.requirements = ["REQ-API-002-01 second fixture requirement"];
  second.dependsOn = ["FEAT-API-001"];
  fixture.feature.dependsOn = ["FEAT-API-002"];
  fixture.extraFeatures.push(second);
});
expectFailure("invariant without equals", "invalid manifest invariant", ({ manifest }) => {
  delete manifest.invariants[0].equals;
});
expectFailure("non-positive invariant minimum", "invalid manifest invariant", ({ manifest }) => {
  manifest.invariants[0].min = 0;
});

console.log("✅ TRACE-001 mutation tests passed: exact fragments, root containment, reachability, dependency graph, invariants.");
