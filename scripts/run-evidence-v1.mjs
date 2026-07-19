import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const contractPath = path.join(root, "qa", "evidence-contract.v1.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const outputDir = path.resolve(root, process.env.ROBYS_EVIDENCE_DIR ?? contract.artifactDirectory);
const logsDir = path.join(outputDir, "logs");
const runLive = process.env.ROBYS_RUN_LIVE === "1";
const dryRun = process.env.ROBYS_EVIDENCE_DRY_RUN === "1";
const startedAt = new Date().toISOString();

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gitHead() {
  const explicit = process.env.ROBYS_EXACT_HEAD || process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA;
  if (explicit) return { sha: explicit, source: "environment" };
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const sha = result.status === 0 ? result.stdout.trim() : "unknown";
  return { sha: sha || "unknown", source: result.status === 0 ? "git" : "unavailable" };
}

function validSha(sha) {
  return /^[0-9a-f]{40}$/i.test(sha);
}

function runStage(stage) {
  const logPath = path.join(logsDir, `${stage.id}.log`);
  if (stage.live && !runLive) {
    const result = {
      ...stage,
      status: "SKIPPED",
      reason: "ROBYS_RUN_LIVE is not enabled; production state remains separate from exact-head evidence.",
      durationMs: 0,
      log: path.relative(outputDir, logPath)
    };
    writeFileSync(logPath, `${result.reason}\n`, "utf8");
    return result;
  }

  if (dryRun) {
    const result = {
      ...stage,
      status: "DRY_RUN",
      reason: "ROBYS_EVIDENCE_DRY_RUN=1; command was validated but not executed.",
      durationMs: 0,
      log: path.relative(outputDir, logPath)
    };
    writeFileSync(logPath, `npm run ${stage.npmScript}\n${result.reason}\n`, "utf8");
    return result;
  }

  const began = Date.now();
  const execution = spawnSync("npm", ["run", stage.npmScript], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024
  });
  const status = execution.status === 0 ? "PASSED" : "FAILED";
  const output = [
    `$ npm run ${stage.npmScript}`,
    `exitCode=${execution.status ?? "null"}`,
    execution.stdout ?? "",
    execution.stderr ?? "",
    execution.error ? `spawnError=${execution.error.message}` : ""
  ].filter(Boolean).join("\n");
  writeFileSync(logPath, `${output}\n`, "utf8");
  return {
    ...stage,
    status,
    exitCode: execution.status,
    signal: execution.signal,
    durationMs: Date.now() - began,
    log: path.relative(outputDir, logPath)
  };
}

function copyKnownReports() {
  const candidates = [
    [".artifacts/security-contract-report.json", "security-contract-report.json"],
    [".artifacts/performance-contract-report.json", "performance-contract-report.json"],
    [".artifacts/integrity-report.json", "integrity-report.json"],
    ["integrity-manifest.json", "integrity-manifest.json"],
    ["live-smoke-report.json", "live-smoke-report.json"],
    ["live-integrity-report.json", "live-integrity-report.json"],
    ["lighthouse-summary.json", "lighthouse-summary.json"],
    ["lighthouse-live-summary.json", "lighthouse-live-summary.json"]
  ];
  const copied = [];
  for (const [sourceRelative, targetName] of candidates) {
    const source = path.join(root, sourceRelative);
    if (!existsSync(source) || !statSync(source).isFile()) continue;
    const target = path.join(outputDir, targetName);
    copyFileSync(source, target);
    copied.push({ source: sourceRelative, artifact: targetName });
  }
  return copied;
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(logsDir, { recursive: true });

const head = gitHead();
const exactHead = {
  sha: head.sha,
  valid: validSha(head.sha),
  source: head.source,
  repository: process.env.GITHUB_REPOSITORY ?? null,
  ref: process.env.GITHUB_REF ?? null,
  workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  generatedAt: startedAt
};
writeJson(path.join(outputDir, "exact-head.json"), exactHead);

const stages = contract.stages.map(runStage);
const copiedReports = copyKnownReports();
const requiredFailures = stages.filter((stage) => stage.required && stage.status === "FAILED");
const requiredUnproven = stages.filter((stage) => stage.required && !["PASSED", "DRY_RUN"].includes(stage.status));
const requestedLive = stages.filter((stage) => stage.live && runLive);
const allRequestedLivePassed = requestedLive.length > 0 && requestedLive.every((stage) => stage.status === "PASSED");

let verdict;
let rationale;
if (!exactHead.valid || requiredUnproven.length) {
  verdict = "BLOCKED";
  rationale = !exactHead.valid
    ? "A valid 40-character exact-head SHA was not available."
    : `${requiredUnproven.length} required exact-head stage(s) are not proven green.`;
} else if (dryRun) {
  verdict = "DRY_RUN_ONLY";
  rationale = "The runner and artifact graph were exercised without executing repository gates.";
} else if (allRequestedLivePassed) {
  verdict = "READY_WITH_PRODUCTION_EVIDENCE";
  rationale = "Required exact-head stages and requested production-bound stages passed; deployment byte-equivalence still requires an explicit binding.";
} else {
  verdict = "READY_WITH_ADVISORY_GAPS";
  rationale = "All required exact-head stages passed; production-bound evidence was skipped or remains separate from the reviewed head.";
}

const causalGraph = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  nodes: [
    { id: "exact-head", type: "identity", status: exactHead.valid ? "PROVEN" : "MISSING", evidence: "exact-head.json" },
    ...stages.map((stage) => ({
      id: stage.id,
      type: stage.scope === "production" ? "production-check" : "exact-head-check",
      status: stage.status,
      evidence: stage.log
    })),
    { id: "pythia-verdict", type: "decision", status: verdict, evidence: "pythia-verdict.json" }
  ],
  edges: [
    ...stages.filter((stage) => stage.scope === "exact-head").map((stage) => ({ from: "exact-head", to: stage.id, relation: "BINDS" })),
    ...stages.map((stage) => ({ from: stage.id, to: "pythia-verdict", relation: stage.required ? "REQUIRED_INPUT" : "ADVISORY_INPUT" }))
  ],
  boundary: "Production checks describe the deployed site and do not prove that deployed bytes equal the pull-request head unless a separate deployment binding is supplied."
};
writeJson(path.join(outputDir, "causal-graph.json"), causalGraph);

const pythia = {
  schemaVersion: 1,
  verdict,
  rationale,
  exactHead: exactHead.sha,
  requiredFailures: requiredFailures.map(({ id, status }) => ({ id, status })),
  advisoryGaps: stages.filter((stage) => !stage.required && stage.status !== "PASSED").map(({ id, status, reason }) => ({ id, status, reason })),
  authorityBoundary: "This verdict reports evidence. It does not approve, merge, deploy, or waive human authorization.",
  generatedAt: new Date().toISOString()
};
writeJson(path.join(outputDir, "pythia-verdict.json"), pythia);

const lotus = `# Robis Evidence Run v1\n\n- Exact head: \`${exactHead.sha}\`\n- Verdict: **${verdict}**\n- Generated: ${new Date().toISOString()}\n- Host: ${os.platform()} ${os.release()} / Node ${process.version}\n\n## Pythia rationale\n\n${rationale}\n\n## Evidence stages\n\n| Stage | Scope | Required | Status | Duration |\n|---|---|---:|---|---:|\n${stages.map((stage) => `| ${stage.id} | ${stage.scope} | ${stage.required ? "yes" : "no"} | ${stage.status} | ${stage.durationMs} ms |`).join("\n")}\n\n## Lotus audit boundary\n\n- Evidence is bound to the exact head only where the stage scope is \`exact-head\`.\n- Production stages are never silently promoted to exact-head evidence.\n- A skipped live stage is an advisory gap, not a pass.\n- The runner has no merge, approval, deployment, or external execution authority beyond the listed npm scripts.\n`;
writeFileSync(path.join(outputDir, "lotus-final-report.md"), lotus, "utf8");

const runSummary = {
  schemaVersion: 1,
  name: contract.name,
  startedAt,
  completedAt: new Date().toISOString(),
  exactHead,
  dryRun,
  runLive,
  stages,
  copiedReports,
  verdict
};
writeJson(path.join(outputDir, "run-summary.json"), runSummary);

const files = walkFiles(outputDir)
  .filter((file) => path.basename(file) !== "manifest.json")
  .map((file) => ({
    path: path.relative(outputDir, file).replaceAll(path.sep, "/"),
    bytes: statSync(file).size,
    sha256: sha256(file)
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

writeJson(path.join(outputDir, "manifest.json"), {
  schemaVersion: 1,
  algorithm: "sha256",
  exactHead: exactHead.sha,
  verdict,
  generatedAt: new Date().toISOString(),
  files
});

console.log(JSON.stringify({ verdict, exactHead: exactHead.sha, artifactDirectory: path.relative(root, outputDir), stages: stages.map(({ id, status }) => ({ id, status })) }, null, 2));
if (verdict === "BLOCKED") process.exitCode = 1;
