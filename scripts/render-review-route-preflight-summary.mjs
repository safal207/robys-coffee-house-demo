import { appendFileSync, readFileSync } from "node:fs";

function fail(message) {
  throw new Error(`RRM-PREFLIGHT-001: ${message}`);
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("expected --depth-result and --roster-result");
    args.set(key, value);
  }
  return args;
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${filePath} is invalid: ${error.message}`);
  }
}

function escapeCell(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replace(/[\r\n]+/g, " ");
}

const args = parseArgs(process.argv.slice(2));
const depth = readJson(args.get("--depth-result"));
const roster = readJson(args.get("--roster-result"));
if (depth.contract !== "RRM-DEPTH-001") fail("unexpected depth result");
if (roster.contract !== "RRM-ROSTER-001") fail("unexpected roster result");
if (depth.depth !== roster.depth) fail("depth and roster results disagree");

const reviewerRows = roster.reviewers.map((reviewer) => (
  `| ${escapeCell(reviewer.label)} | ${escapeCell(reviewer.status)} | ${reviewer.binding ? "binding" : "advisory"} | ${reviewer.countsTowardBinding ? "yes" : "no"} |`
));
const fileRows = depth.matchedRules.map((entry) => (
  `| <code>${escapeCell(entry.file)}</code> | ${escapeCell(entry.ruleId)} | ${escapeCell(entry.level)} |`
));
const decisionIcon = roster.decision === "READY" ? "✅" : "🟡";
const markdown = `# Review Route Preflight

**Depth:** ${escapeCell(depth.depth)} — ${escapeCell(depth.label)}  
**Roster decision:** ${decisionIcon} ${escapeCell(roster.decision)}  
**Authority:** ${escapeCell(roster.authority)}  
**Reason:** ${escapeCell(roster.reasons.join(", ") || "binding capacity available")}

## Changed-path classification

| File | Rule | Floor |
|---|---|---:|
${fileRows.join("\n")}

## Runtime reviewer roster

| Reviewer | Runtime status | Authority | Counts toward binding capacity |
|---|---|---|---|
${reviewerRows.join("\n")}

> Route memory and roster preflight are advisory to route selection. They do not grant merge authority; PDG and exact-head action gates remain authoritative.
`;

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
} else {
  process.stdout.write(markdown);
}
