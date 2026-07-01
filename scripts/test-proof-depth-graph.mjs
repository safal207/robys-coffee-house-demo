import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(ROOT, "verify-proof-depth-graph.mjs");
const BASE = JSON.parse(readFileSync(path.join(ROOT, "../qa/proof-depth-graph.json"), "utf8"));

function runFixture(mutator) {
  const root = mkdtempSync(path.join(tmpdir(), "pdg-001-"));
  try {
    const graph = structuredClone(BASE);
    mutator?.(graph);
    writeFileSync(path.join(root, "graph.json"), JSON.stringify(graph, null, 2));
    return spawnSync(process.execPath, [SCRIPT, "graph.json"], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectSuccess(label, mutator) {
  const result = runFixture(mutator);
  if (result.status !== 0) throw new Error(`${label} should pass:\n${result.stderr || result.stdout}`);
}

function expectFailure(label, expectedText, mutator) {
  const result = runFixture(mutator);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedText)) {
    throw new Error(`${label} should fail with ${expectedText}:\n${output}`);
  }
}

expectSuccess("valid proof graph");
expectFailure("stage skipping", "proof stage skip", (graph) => {
  graph.edges.find((edge) => edge.from === "CHECK-TRACE" && edge.to === "CHALLENGE-MUTATION").to = "REVIEW-CODEX";
});
expectFailure("orphan proof node", "outside a complete proof path", (graph) => {
  graph.nodes.push({ id: "ARTIFACT-ORPHAN", kind: "artifact", depth: 1, label: "orphan", origin: "observed" });
});
expectFailure("insufficient reviewer independence", "independent reviewers", (graph) => {
  graph.nodes.find((node) => node.id === "REVIEW-JULES").independenceKey = "coderabbit";
  graph.nodes.find((node) => node.id === "REVIEW-CODEX").independenceKey = "coderabbit";
});
expectFailure("stale binding", "must be exact-head bound", (graph) => {
  delete graph.nodes.find((node) => node.id === "REVIEW-CODEX").freshness;
});
expectFailure("inferred binding authority", "inferred knowledge cannot grant binding authority", (graph) => {
  graph.nodes.find((node) => node.id === "DISPOSITION-LEDGER").origin = "inferred";
});
expectFailure("missing proof seal", "has no proof seal", (graph) => {
  graph.edges.find((edge) => edge.relation === "sealed-by").relation = "resolved-by";
});
expectFailure("back edge", "proof stage skip", (graph) => {
  graph.edges.push({ from: "DECISION-PROOF-SEAL", to: "CLAIM-READY", relation: "advises", authority: "advisory" });
});

console.log("✅ PDG-001 mutation tests passed: depth, reachability, independence, freshness, inferred authority and proof seal.");
