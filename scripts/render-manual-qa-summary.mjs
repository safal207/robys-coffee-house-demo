import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const roots = process.argv.slice(2);
const marker = "<!-- robys-manual-qa-summary -->";

function walk(path, matches = []) {
  if (!existsSync(path)) return matches;
  const stat = statSync(path);
  if (stat.isFile()) {
    if (path.endsWith("report.json")) matches.push(path);
    return matches;
  }
  for (const name of readdirSync(path)) walk(resolve(path, name), matches);
  return matches;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ").slice(0, 500);
}

const files = [...new Set(roots.flatMap((root) => walk(root)))].sort();
const rows = [];
let overallPassed = files.length > 0;

for (const file of files) {
  try {
    const report = JSON.parse(readFileSync(file, "utf8"));
    overallPassed = overallPassed && report.passed !== false;

    if (Array.isArray(report.results)) {
      for (const entry of report.results) {
        rows.push({
          suite: report.mode ?? report.package ?? file,
          case: entry.id ?? entry.title ?? "case",
          status: entry.status ?? (entry.passed ? "PASS" : "FAIL"),
          detail: entry.error ?? entry.evidence?.matched ?? entry.evidence?.result ?? ""
        });
      }
      continue;
    }

    if (Array.isArray(report.profiles)) {
      for (const entry of report.profiles) {
        rows.push({
          suite: "cross-browser",
          case: entry.profile ?? entry.browser ?? "profile",
          status: entry.status ?? "UNKNOWN",
          detail: entry.error ?? `${entry.evidence?.resultCount ?? "?"} recommendation card(s)`
        });
      }
      continue;
    }

    rows.push({
      suite: report.package ?? file,
      case: report.sha256 ? "APK contract" : "suite",
      status: report.passed === false ? "FAIL" : "PASS",
      detail: report.sha256 ? `${report.bytes} bytes · ${report.sha256.slice(0, 12)}…` : ""
    });
  } catch (error) {
    overallPassed = false;
    rows.push({ suite: file, case: "report parse", status: "FAIL", detail: error.message });
  }
}

if (files.length === 0) {
  rows.push({ suite: "runner", case: "evidence", status: "FAIL", detail: "No report.json was produced" });
}

const emulatorLogs = roots
  .map((root) => resolve(root, "emulator.log"))
  .filter((path) => existsSync(path));

console.log(marker);
console.log(`## 🧪 Roby’s manual QA · ${overallPassed ? "PASS ✅" : "FAIL ❌"}`);
console.log("");
console.log(`Exact head: \`${process.env.GITHUB_SHA ?? "local"}\``);
console.log("");
console.log("| Suite | Case / profile | Status | Evidence / error |");
console.log("|---|---|:---:|---|");
for (const row of rows) {
  const icon = row.status === "PASS" ? "✅ PASS" : row.status === "FAIL" ? "❌ FAIL" : escapeCell(row.status);
  console.log(`| ${escapeCell(row.suite)} | ${escapeCell(row.case)} | ${icon} | ${escapeCell(row.detail)} |`);
}

for (const logPath of emulatorLogs) {
  const lines = readFileSync(logPath, "utf8").trim().split(/\r?\n/).slice(-35);
  if (lines.length === 0) continue;
  console.log("");
  console.log("<details><summary>Android emulator log tail</summary>");
  console.log("");
  console.log("```text");
  console.log(lines.join("\n").slice(-6000));
  console.log("```");
  console.log("</details>");
}
