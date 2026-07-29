import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const workflowRoot = path.join(root, ".github", "workflows");
const findings = [];

for (const entry of readdirSync(workflowRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
  const absolute = path.join(workflowRoot, entry.name);
  const text = readFileSync(absolute, "utf8");
  const lower = text.toLowerCase();
  const referencesLighthouseEvidence =
    lower.includes("lighthouse-live-summary.json") ||
    lower.includes("lighthouse-summary.json") ||
    lower.includes("update live lighthouse summary") ||
    lower.includes("update lighthouse audit summary");
  if (!referencesLighthouseEvidence) continue;

  const mutationSignals = [];
  if (/contents\s*:\s*write/i.test(text)) mutationSignals.push("contents: write");
  if (/\bgit\s+commit\b/i.test(text)) mutationSignals.push("git commit");
  if (/\bgit\s+push\b/i.test(text)) mutationSignals.push("git push");
  if (/\bgh\s+(api|repo|release)\b/i.test(text) && /contents|commits|refs/i.test(text)) mutationSignals.push("write-capable gh command");
  if (/\[skip ci\]/i.test(text)) mutationSignals.push("[skip ci] evidence commit");
  if (/persist-credentials\s*:\s*true/i.test(text)) mutationSignals.push("persisted checkout credentials");

  if (mutationSignals.length) {
    findings.push({ workflow: `.github/workflows/${entry.name}`, mutationSignals });
  }
}

if (findings.length) {
  console.error("Mutable Lighthouse evidence publishers are forbidden. Evidence must be uploaded as exact-head artifacts, not committed by a bot to main.");
  for (const finding of findings) {
    console.error(`- ${finding.workflow}: ${finding.mutationSignals.join(", ")}`);
  }
  process.exit(1);
}

console.log("PASS: no workflow mutates repository history to publish Lighthouse evidence.");
