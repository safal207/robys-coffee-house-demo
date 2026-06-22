import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const ROOT = process.cwd();
const REPORT = ".artifacts/secret-scan-report.json";
const DIFF_BASE = process.env.SECURITY_DIFF_BASE?.trim();
const ignoredDirectories = new Set([".git", "node_modules", ".artifacts", "coverage", "dist"]);
const ignoredFiles = new Set(["package-lock.json", "scripts/scan-secrets.mjs"]);
const textExtensions = new Set([".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md", ".yml", ".yaml", ".txt", ".xml"]);

const patterns = [
  { id: "PRIVATE_KEY", regex: new RegExp("-{5}BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-{5}", "g") },
  { id: "GITHUB_TOKEN", regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: "GITHUB_FINE_GRAINED", regex: /\bgithub_pat_[A-Za-z0-9_]{80,255}\b/g },
  { id: "OPENAI_KEY", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: "AWS_ACCESS_KEY", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "GOOGLE_API_KEY", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: "SLACK_TOKEN", regex: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
  { id: "STRIPE_SECRET", regex: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  { id: "GENERIC_SECRET", regex: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)\b\s*[:=]\s*["'`]([^"'`\n]{12,})["'`]/gi }
];
const placeholders = /(?:example|sample|dummy|placeholder|replace[_-]?me|changeme|not[_-]?a[_-]?secret|your[_-]|test[_-]?only|redacted)/i;

function repoPath(absolute) {
  return relative(ROOT, absolute).split(sep).join("/");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function redact(value) {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function scanText(source, content, findings) {
  for (const { id, regex } of patterns) {
    regex.lastIndex = 0;
    for (const match of content.matchAll(regex)) {
      const value = match[1] ?? match[0];
      if (placeholders.test(value)) continue;
      const before = content.slice(0, match.index ?? 0);
      const line = before.split("\n").length;
      findings.push({ source, line, pattern: id, redacted: redact(value) });
    }
  }
}

const findings = [];
for (const absolute of walk(ROOT)) {
  const file = repoPath(absolute);
  if (ignoredFiles.has(file)) continue;
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  if (statSync(absolute).size > 1_500_000) continue;
  scanText(file, readFileSync(absolute, "utf8"), findings);
}

let diffScanned = false;
if (DIFF_BASE && /^[0-9a-f]{7,40}$/i.test(DIFF_BASE)) {
  try {
    const diff = execFileSync("git", ["diff", "--unified=0", `${DIFF_BASE}...HEAD`, "--", "."], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    const additions = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n");
    scanText(`git-diff:${DIFF_BASE.slice(0, 12)}...HEAD`, additions, findings);
    diffScanned = true;
  } catch (error) {
    findings.push({ source: "git-diff", line: 0, pattern: "SCAN_ERROR", redacted: String(error.message).slice(0, 160) });
  }
}

const unique = [...new Map(findings.map((finding) => [`${finding.source}:${finding.line}:${finding.pattern}:${finding.redacted}`, finding])).values()];
const report = {
  generatedAt: new Date().toISOString(),
  diffBase: DIFF_BASE || null,
  diffScanned,
  filesScanned: walk(ROOT).filter((file) => textExtensions.has(extname(file).toLowerCase())).length,
  findings: unique
};
mkdirSync(".artifacts", { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

if (unique.length) {
  unique.forEach((finding) => console.error(`❌ [SECRET-001] ${finding.source}:${finding.line} ${finding.pattern} ${finding.redacted}`));
  throw new Error(`Secret scan found ${unique.length} potential leak(s)`);
}

console.log(`✅ SECRET-001 passed: no secrets found${diffScanned ? " in the tree or changed history" : " in the current tree"}.`);
