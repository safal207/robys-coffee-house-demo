import { appendFileSync } from "node:fs";

const VALID = new Set(["success", "failure", "pending", "waiting", "blocked"]);
const ICON = {
  success: "✅",
  failure: "❌",
  pending: "🟡",
  waiting: "⚪",
  blocked: "⛔"
};
const CLASS = {
  success: "passed",
  failure: "failed",
  pending: "pending",
  waiting: "waiting",
  blocked: "failed"
};

const stages = [
  { depth: "D0", label: "Claim", detail: "PR readiness claim", defaultStatus: "success" },
  { depth: "D1", label: "Artifacts", detail: "Manifests, code and state graphs", defaultStatus: "success" },
  { depth: "D2", label: "Executable checks", detail: "TRACE-001 and PDG-001 validators", defaultStatus: "success" },
  { depth: "D3", label: "Mutation challenge", detail: "Broken evidence must fail", defaultStatus: "success" },
  { depth: "D4", label: "Independent AI review", detail: "Codex + CodeRabbit + DeepSeek", defaultStatus: "waiting" },
  { depth: "D5", label: "Disposition ledger", detail: "Every current-head finding classified", defaultStatus: "waiting" },
  { depth: "D6", label: "Proof Seal", detail: "Maintainer exact-head Verified Episode", defaultStatus: "waiting" }
];

function statusFor(stage) {
  const value = (process.env[`PDG_${stage.depth}`] || stage.defaultStatus).toLowerCase();
  if (!VALID.has(value)) throw new Error(`Invalid status for ${stage.depth}: ${value}`);
  return value;
}

function escapeMermaid(value) {
  return String(value).replaceAll('"', "'").replace(/[\r\n]+/g, " ");
}

function escapeHtmlInline(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("`", "&#96;")
    .replace(/[\r\n]+/g, " ");
}

const resolved = stages.map((stage) => ({ ...stage, status: statusFor(stage) }));
const firstIncomplete = resolved.find((stage) => stage.status !== "success");
const verdict = firstIncomplete ? "HOLD" : "READY";
const head = escapeHtmlInline(process.env.PDG_HEAD || process.env.GITHUB_SHA || "local");
const branch = escapeHtmlInline(process.env.PDG_BRANCH || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "local");
const blocker = escapeHtmlInline(process.env.PDG_BLOCKER || (firstIncomplete
  ? `${firstIncomplete.depth} ${firstIncomplete.label} is ${firstIncomplete.status}`
  : "none"));

const graphNodes = resolved.map((stage, index) => {
  const id = `N${index}`;
  const text = `${stage.depth} ${escapeMermaid(stage.label)}<br/>${ICON[stage.status]} ${stage.status}`;
  return `  ${id}["${text}"]:::${CLASS[stage.status]}`;
});
const graphEdges = resolved.slice(0, -1).map((_, index) => `  N${index} --> N${index + 1}`);

const rows = resolved.map((stage) => (
  `| ${stage.depth} | ${stage.label} | ${stage.detail} | ${ICON[stage.status]} ${stage.status} |`
));

const markdown = `# CI/CD Proof Status — PDG-001

**Verdict:** ${verdict === "READY" ? "✅ READY" : "🟡 HOLD"}  
**Exact head:** <code>${head}</code>  
**Branch:** <code>${branch}</code>  
**Current blocker:** <span>${blocker}</span>

\`\`\`mermaid
flowchart LR
${graphNodes.join("\n")}
${graphEdges.join("\n")}
  classDef passed fill:#153d24,stroke:#2ea043,color:#ffffff;
  classDef pending fill:#4a3600,stroke:#d29922,color:#ffffff;
  classDef waiting fill:#21262d,stroke:#8b949e,color:#ffffff;
  classDef failed fill:#4c1d1d,stroke:#f85149,color:#ffffff;
\`\`\`

| Depth | Stage | Evidence | Status |
|---:|---|---|---|
${rows.join("\n")}

## Decision rule

A green check is not enough. The PR is ready only when the complete exact-head path reaches **D6**:

\`claim → artifacts → executable checks → mutation challenge → independent reviews → dispositions → Proof Seal\`

${firstIncomplete
  ? `### Next action\n\nComplete **${firstIncomplete.depth} — ${firstIncomplete.label}** before moving further.`
  : "### Next action\n\nThe proof path is complete. The PR may move to Ready after the maintainer confirms the exact head."}
`;

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
} else {
  process.stdout.write(markdown);
}
