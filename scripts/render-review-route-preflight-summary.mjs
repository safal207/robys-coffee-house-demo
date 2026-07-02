import { appendFileSync, readFileSync } from "node:fs";

function fail(message) {
  throw new Error(`RRM-PREFLIGHT-001: ${message}`);
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("expected --depth-result, --roster-result and --route-result");
    }
    args.set(key, value);
  }
  return args;
}

function readJson(filePath) {
  if (!filePath) fail("missing result file path");
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
    .replace(/[
]+/g, " ");
}

const args = parseArgs(process.argv.slice(2));
const depth = readJson(args.get("--depth-result"));
const roster = readJson(args.get("--roster-result"));
const route = readJson(args.get("--route-result"));
if (depth.contract !== "RRM-DEPTH-001") fail("unexpected depth result");
if (roster.contract !== "RRM-ROSTER-001") fail("unexpected roster result");
if (route.contract !== "RRM-ROUTE-001") fail("unexpected route result");
if (depth.depth !== roster.depth || depth.depth !== route.depth) {
  fail("depth, roster and route results disagree");
}

const reviewerRows = roster.reviewers.map((reviewer) => (
  `| ${escapeCell(reviewer.label)} | ${escapeCell(reviewer.status)} | ${reviewer.binding ? "binding" : "advisory"} | ${reviewer.countsTowardBinding ? "yes" : "no"} |`
));
const fileRows = depth.matchedRules.map((entry) => (
  `| <code>${escapeCell(entry.file)}</code> | ${escapeCell(entry.ruleId)} | ${escapeCell(entry.level)} |`
));
const stageRows = route.decision === "SELECTED"
  ? route.stages.map((stage, index) => (
      `| ${index + 1} | ${escapeCell(stage.id)} | ${escapeCell(stage.kind)} | ${escapeCell(stage.actor)} | ${escapeCell(stage.role || "-")} |`
    ))
  : [];
const rosterIcon = roster.decision === "READY" ? "✅" : "🟡";
const routeIcon = route.decision === "SELECTED" ? "✅" : "🟡";
const routeReason = route.decision === "SELECTED"
  ? route.rationale
  : (route.reasons || []).join(", ") || "route requirements are not satisfied";
const routeIdentity = route.decision === "SELECTED"
  ? `${route.routeId} / ${route.routeKey}`
  : route.proposedRouteId;
const warnings = roster.runtimeWarnings?.length
  ? roster.runtimeWarnings.join(", ")
  : "none";

const routeSection = route.decision === "SELECTED"
  ? `## Selected route

| Step | Stage | Kind | Actor | Role |
|---:|---|---|---|---|
${stageRows.join("\n")}

**Governance exception required:** ${route.governanceExceptionRequired ? "yes" : "no"}`
  : `## Route escalation

**Missing actors:** ${escapeCell((route.missingActors || []).join(", ") || "none")}  
**Partial actors:** ${escapeCell((route.partialActors || []).join(", ") || "none")}  
**Missing roles:** ${escapeCell((route.missingRoles || []).join(", ") || "none")}`;

const markdown = `# Review Route Preflight

**Depth:** ${escapeCell(depth.depth)} — ${escapeCell(depth.label)}  
**Roster decision:** ${rosterIcon} ${escapeCell(roster.decision)}  
**Route decision:** ${routeIcon} ${escapeCell(route.decision)}  
**Route:** ${escapeCell(routeIdentity || "none")}  
**Selection mode:** ${escapeCell(route.selectionMode)}  
**Authority:** ${escapeCell(route.authority)}  
**Reason:** ${escapeCell(routeReason)}  
**Runtime warnings:** ${escapeCell(warnings)}

## Changed-path classification

| File | Rule | Floor |
|---|---|---:|
${fileRows.join("\n")}

## Runtime reviewer roster

| Reviewer | Runtime status | Authority | Counts toward binding capacity |
|---|---|---|---|
${reviewerRows.join("\n")}

${routeSection}

> Review route selection is advisory. It cannot grant merge authority, approve a side effect or replace PDG exact-head evidence and action gates.
`;

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
} else {
  process.stdout.write(markdown);
}
