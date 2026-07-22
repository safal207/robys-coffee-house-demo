import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const providerSlug = ["code", "rabbit"].join("");
const removedProviderPattern = new RegExp(providerSlug, "i");
const removedPaths = [
  `.${providerSlug}.yaml`,
  `.github/workflows/${providerSlug}-reserve.yml`,
  `.github/workflows/${providerSlug}-reserve-contract.yml`,
  ".github/workflows/ai-review-contract.yml",
  ".github/workflows/ai-review-cooperation.yml",
  ".github/workflows/ai-review-cooperation-contract.yml",
  ".github/workflows/ai-review-cooperation-recovery.yml",
  ".github/workflows/ai-review-cooperation-recovery-contract.yml",
  ".github/workflows/ai-review-cooperation-publisher-v2.yml",
  ".github/workflows/ai-review-cooperation-publisher-v2-contract.yml",
  `scripts/${providerSlug}-reserve.cjs`,
  `scripts/test-${providerSlug}-reserve.cjs`,
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

const skippedDirectories = new Set([".git", "node_modules", "visual-results", ".lighthouseci"]);
const maximumTextFileBytes = 2 * 1024 * 1024;

function scanDirectory(directory = ".") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    const repositoryPath = path.relative(".", fullPath).split(path.sep).join("/");

    if (removedProviderPattern.test(repositoryPath)) {
      throw new Error(`removed provider reference remains in repository path: ${repositoryPath}`);
    }
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;

    const metadata = statSync(fullPath);
    if (metadata.size > maximumTextFileBytes) continue;
    const bytes = readFileSync(fullPath);
    if (bytes.includes(0)) continue;
    if (removedProviderPattern.test(bytes.toString("utf8"))) {
      throw new Error(`removed provider reference remains in repository content: ${repositoryPath}`);
    }
  }
}

scanDirectory();

const roster = JSON.parse(readFileSync("qa/reviewer-roster.json", "utf8"));
const human = roster.reviewers.find((reviewer) => reviewer.id === "human-maintainer");
if (!human || human.binding !== true || human.kind !== "human") {
  throw new Error("human maintainer binding authority is missing");
}
if (roster.reviewers.some((reviewer) => reviewer.kind === "ai" && reviewer.binding)) {
  throw new Error("an AI reviewer still has binding authority");
}

console.log("✅ Provider removal guard passed: provider files, paths and active references are gone, and human maintainer authority is binding.");
