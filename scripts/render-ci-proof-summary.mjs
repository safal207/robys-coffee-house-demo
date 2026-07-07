import { appendFileSync } from "node:fs";

const valid = new Set(["success", "failure", "pending", "waiting", "blocked"]);
const icon = { success: "PASS", failure: "FAIL", pending: "PENDING", waiting: "WAITING", blocked: "BLOCKED" };
const stages = [
  ["D0", "Claim", "PR readiness claim", "success"],
  ["D1", "Artifacts", "Manifests, code and state graphs", "success"],
  ["D2", "Executable checks", "TRACE-001 and PDG-001 validators", "success"],
  ["D3", "Mutation challenge", "Broken evidence must fail", "success"],
  ["D4", "Independent AI review", "CodeRabbit binding; supplemental lanes advisory", "waiting"],
  ["D5", "Disposition ledger", "Every current-head finding classified", "waiting"],
  ["D6", "Proof Seal", "Maintainer exact-head Verified Episode", "waiting"]
].map(([depth, label, detail, fallback]) => {
  const status = (process.env[`PDG_${depth}`] || fallback).toLowerCase();
  if (!valid.has(status)) throw new Error(`Invalid status for ${depth}: ${status}`);
  return { depth, label, detail, status };
});

const inline = (value) => String(value).replace(/[<>`"\r\n]/g, " ");
const firstIncomplete = stages.find((stage) => stage.status !== "success");
const verdict = firstIncomplete ? "HOLD" : "READY";
const head = inline(process.env.PDG_HEAD || process.env.GITHUB_SHA || "local");
const branch = inline(process.env.PDG_BRANCH || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "local");
const blocker = inline(process.env.PDG_BLOCKER || (firstIncomplete ? `${firstIncomplete.depth} ${firstIncomplete.label} is ${firstIncomplete.status}` : "none"));
const graph = stages.map((stage, index) => `  N${index}["${stage.depth} ${stage.label}: ${icon[stage.status]}"]`).join("\n");
const edges = stages.slice(0, -1).map((_, index) => `  N${index} --> N${index + 1}`).join("\n");
const rows = stages.map((stage) => `| ${stage.depth} | ${stage.label} | ${stage.detail} | ${icon[stage.status]} |`).join("\n");
const next = firstIncomplete
  ? `Complete ${firstIncomplete.depth} - ${firstIncomplete.label} before moving further.`
  : "The proof path is complete. The maintainer may confirm the exact head.";

const markdown = [
  "# CI/CD Proof Status - PDG-001",
  "",
  `**Verdict:** ${verdict}`,
  `**Exact head:** ${head}`,
  `**Branch:** ${branch}`,
  `**Current blocker:** ${blocker}`,
  "",
  "```mermaid",
  "flowchart LR",
  graph,
  edges,
  "```",
  "",
  "| Depth | Stage | Evidence | Status |",
  "|---:|---|---|---|",
  rows,
  "",
  "## Decision rule",
  "",
  "A green check is not enough. Readiness requires the complete exact-head path through D6.",
  "",
  `**Next action:** ${next}`,
  ""
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, "utf8");
else process.stdout.write(markdown);
