import { existsSync, readFileSync } from "node:fs";

const removedPaths = [
  ".coderabbit.yaml",
  ".github/workflows/coderabbit-reserve.yml",
  ".github/workflows/coderabbit-reserve-contract.yml",
  ".github/workflows/ai-review-contract.yml",
  ".github/workflows/ai-review-cooperation.yml",
  ".github/workflows/ai-review-cooperation-contract.yml",
  ".github/workflows/ai-review-cooperation-recovery.yml",
  ".github/workflows/ai-review-cooperation-recovery-contract.yml",
  ".github/workflows/ai-review-cooperation-publisher-v2.yml",
  ".github/workflows/ai-review-cooperation-publisher-v2-contract.yml",
  "scripts/coderabbit-reserve.cjs",
  "scripts/test-coderabbit-reserve.cjs",
  "scripts/verify-ai-review-contract.cjs",
  "scripts/test-codex-review-contract.cjs",
  "scripts/verify-ai-review-freshness.mjs",
  "scripts/ai-review-cooperation.py",
  "scripts/test-ai-review-cooperation.py",
  "docs/ai-review-cooperation-policy.md"
];

for (const file of removedPaths) {
  if (existsSync(file)) throw new Error(`removed provider file still exists: ${file}`);
}

const authoritativeFiles = [
  ".github/workflows/review-ledger.yml",
  ".github/workflows/review-route-preflight.yml",
  ".github/pull_request_template.md",
  "qa/proof-depth-graph.json",
  "qa/reviewer-roster.json",
  "qa/review-route-policy.json",
  "scripts/probe-reviewer-roster.mjs",
  "scripts/select-review-route.mjs",
  "scripts/render-ci-proof-summary.mjs",
  "scripts/verify-ai-style-review-matrix.mjs",
  "docs/proof-depth-graph.md",
  "docs/review-route-preflight.md",
  "package.json"
];

for (const file of authoritativeFiles) {
  const content = readFileSync(file, "utf8");
  if (/coderabbit/i.test(content)) throw new Error(`removed provider reference remains in ${file}`);
}

const roster = JSON.parse(readFileSync("qa/reviewer-roster.json", "utf8"));
const human = roster.reviewers.find((reviewer) => reviewer.id === "human-maintainer");
if (!human || human.binding !== true || human.kind !== "human") {
  throw new Error("human maintainer binding authority is missing");
}
if (roster.reviewers.some((reviewer) => reviewer.kind === "ai" && reviewer.binding)) {
  throw new Error("an AI reviewer still has binding authority");
}

console.log("✅ Provider removal guard passed: provider files and active references are gone, and human maintainer authority is binding.");
