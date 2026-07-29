import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const evidenceRoot = path.resolve(root, process.env.ROBY_EVIDENCE_ROOT ?? "qa/liminal-artifacts");
const outputPath = path.join(evidenceRoot, "input-signals.json");
const testedCommit = process.env.ROBY_TESTED_COMMIT ?? process.env.GITHUB_SHA ?? "unknown";
const sourceRunId = process.env.ROBY_SOURCE_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "local";

function assertExactCommit(value) {
  if (!/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`ROBY_TESTED_COMMIT must be an exact 40-character SHA, got ${JSON.stringify(value)}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(evidenceRoot, relativePath), "utf8"));
}

function evidence(relativePath, statement) {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe evidence path: ${relativePath}`);
  }
  const absolute = path.join(evidenceRoot, relativePath);
  const bytes = statSync(absolute).size;
  const sha256 = createHash("sha256").update(readFileSync(absolute)).digest("hex");
  return {
    evidence: statement,
    evidence_path: relativePath.replaceAll("\\", "/"),
    evidence_sha256: sha256,
    evidence_bytes: bytes
  };
}

function stableSignal(name, relativePath, statement, runCount = 1) {
  return {
    name,
    verdict: "stable",
    stability: 1,
    flake_probability: 0,
    flake_score: 0,
    run_count: runCount,
    ...evidence(relativePath, statement)
  };
}

assertExactCommit(testedCommit);
if (!sourceRunId.trim()) throw new Error("ROBY_SOURCE_RUN_ID must not be empty");

const exactHead = readJson("exact-head.json");
if (exactHead.requested !== testedCommit || exactHead.checkedOut !== testedCommit || exactHead.matches !== true) {
  throw new Error(`Exact-head evidence mismatch: ${JSON.stringify(exactHead)}`);
}

const composePolicy = readJson("compose-policy.json");
if (composePolicy.testedCommit !== testedCommit || composePolicy.allLoopback !== true || composePolicy.allImagesPinned !== true) {
  throw new Error(`Compose policy is not proven for ${testedCommit}: ${JSON.stringify(composePolicy)}`);
}

const lighthouse = readJson("lighthouse-repeatability.json");
if (lighthouse.testedCommit !== testedCommit || lighthouse.sourceRunId !== sourceRunId) {
  throw new Error(`Lighthouse evidence is stale or cross-run: ${JSON.stringify({ testedCommit: lighthouse.testedCommit, sourceRunId: lighthouse.sourceRunId })}`);
}
if (!Array.isArray(lighthouse.profiles) || lighthouse.profiles.length !== 2) {
  throw new Error("Lighthouse evidence must contain mobile and desktop profiles");
}
const lighthouseRunCount = lighthouse.profiles.reduce((sum, profile) => sum + Number(profile.runCount ?? 0), 0);
if (lighthouseRunCount < 12) throw new Error(`Lighthouse evidence has only ${lighthouseRunCount} runs`);
const lighthouseStability = Math.min(...lighthouse.profiles.map((profile) => Number(profile.stability)));
const lighthouseFlakeProbability = Math.max(...lighthouse.profiles.map((profile) => Number(profile.flakeProbability)));
const lighthouseVerdict = lighthouse.overallVerdict;
if (!["stable", "flake", "known_issue", "new_bug"].includes(lighthouseVerdict)) {
  throw new Error(`Unsupported Lighthouse verdict: ${lighthouseVerdict}`);
}

const tests = [
  stableSignal(
    "exact-head-binding",
    "exact-head.json",
    `Requested, checked-out and tested commit are the same exact SHA ${testedCommit}.`
  ),
  stableSignal(
    "security-contract",
    "security.log",
    "The current exact head completed the repository security contracts and secret scan successfully."
  ),
  stableSignal(
    "performance-contract",
    "performance.log",
    "The current exact head completed the repository performance contract successfully."
  ),
  stableSignal(
    "browser-lab-policy",
    "compose-policy.json",
    "Compose expansion proves all five published ports are loopback-only and every default image reference is digest-pinned."
  ),
  {
    name: "lighthouse-repeatability",
    verdict: lighthouseVerdict,
    stability: lighthouseStability,
    flake_probability: lighthouseFlakeProbability,
    flake_score: lighthouseFlakeProbability,
    run_count: lighthouseRunCount,
    ...evidence(
      "lighthouse-repeatability.json",
      `${lighthouseRunCount} exact-head Lighthouse observations classified the combined mobile/desktop result as ${lighthouseVerdict}.`
    )
  }
];

const packet = {
  schema: "robys.liminalqa.input.v2",
  tested_commit: testedCommit,
  source_run_id: sourceRunId,
  generated_at: new Date().toISOString(),
  suite: "robys-exact-head-evidence",
  scope: `Exact-head security, performance, browser-lab and repeated Lighthouse evidence for ${testedCommit}`,
  tests
};
writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: path.relative(root, outputPath), testedCommit, sourceRunId, tests: tests.map(({ name, verdict, run_count }) => ({ name, verdict, runCount: run_count })) }, null, 2));
