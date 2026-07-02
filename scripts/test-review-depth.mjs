import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(ROOT, "evaluate-review-depth.mjs");
const BASE = JSON.parse(readFileSync(path.join(ROOT, "../qa/review-depth-policy.json"), "utf8"));

function run(files, signals = {}, mutator) {
  const directory = mkdtempSync(path.join(tmpdir(), "rrm-depth-"));
  try {
    const policy = structuredClone(BASE);
    mutator?.(policy);
    const policyPath = path.join(directory, "policy.json");
    writeFileSync(policyPath, JSON.stringify(policy, null, 2));
    return spawnSync(process.execPath, [
      SCRIPT,
      "--policy", policyPath,
      "--files-json", JSON.stringify(files),
      "--signals-json", JSON.stringify(signals)
    ], { encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectDepth(label, expected, files, signals = {}) {
  const result = run(files, signals);
  if (result.status !== 0) throw new Error(`${label} should pass:\n${result.stderr || result.stdout}`);
  const payload = JSON.parse(result.stdout);
  if (payload.depth !== expected) throw new Error(`${label}: expected ${expected}, got ${payload.depth}`);
}

function expectFailure(label, expectedText, files, signals = {}, mutator) {
  const result = run(files, signals, mutator);
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedText)) {
    throw new Error(`${label} should fail with ${expectedText}:\n${output}`);
  }
}

function expectImportSafe() {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `import(${JSON.stringify(pathToFileURL(SCRIPT).href)})`],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || result.stderr.trim()) {
    throw new Error(`module import should be side-effect free:\n${result.stderr || result.stdout}`);
  }
}

expectImportSafe();
expectDepth("documentation-only", "L1", ["README.md", "docs/product-copy.md"]);
expectDepth("product runtime", "L2", ["src/order-flow.ts", "menu.html"]);
expectDepth("workflow governance", "L3", [".github/workflows/review-route-preflight.yml"]);
expectDepth("deploy sensitivity", "L4", [".github/workflows/deploy-production.yml"]);
expectDepth("nested migration sensitivity", "L4", ["src/migrations/add-order-index.ts"]);
expectDepth("unknown file fails closed", "L3", ["custom.asset"]);
expectDepth("security signal raises depth", "L4", ["README.md"], { securityImpact: "high" });
expectFailure("path traversal", "escapes repository root", ["../secret.txt"]);
expectFailure("invalid signal", "risk has invalid value", ["README.md"], { risk: "extreme" });
expectFailure("deploy floor mutation", "non-negotiable floor deploy-sensitive", ["README.md"], {}, (policy) => {
  policy.pathRules.find((rule) => rule.id === "deploy-sensitive").level = "L1";
});
expectFailure("fallback floor mutation", "non-negotiable floor fallback", ["README.md"], {}, (policy) => {
  policy.pathRules.find((rule) => rule.id === "fallback").level = "L1";
});
expectFailure("security signal floor mutation", "signal floor securityImpact.high", ["README.md"], {}, (policy) => {
  policy.signalFloors.securityImpact.high = "L1";
});

console.log("✅ RRM-DEPTH-001 mutation tests passed: import safety, L1-L4 routing, nested migrations, signal floors, path containment and non-negotiable policy floors.");
