import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const outputRoot = path.join(root, ".artifacts", "lighthouse-repeatability");
const transient = path.join(root, ".lighthouseci");
const testedCommit = process.env.ROBY_TESTED_COMMIT ?? process.env.GITHUB_SHA ?? "unknown";
const sourceRunId = process.env.ROBY_SOURCE_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "local";
const budgets = JSON.parse(readFileSync(path.join(root, "lighthouse", "budgets.json"), "utf8"));

function assertExactCommit(value) {
  if (!/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`ROBY_TESTED_COMMIT must be an exact 40-character SHA, got ${JSON.stringify(value)}`);
  }
}

function run(command, args, logPath) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 128 * 1024 * 1024
  });
  const output = [
    `$ ${command} ${args.join(" ")}`,
    `exitCode=${result.status ?? "null"}`,
    result.stdout ?? "",
    result.stderr ?? "",
    result.error ? `spawnError=${result.error.message}` : ""
  ].filter(Boolean).join("\n");
  writeFileSync(logPath, `${output}\n`, "utf8");
  if (result.status !== 0) {
    throw new Error(`Lighthouse collection failed; inspect ${path.relative(root, logPath)}`);
  }
}

function collect(profile, configPath) {
  const profileRoot = path.join(outputRoot, profile);
  const rawRoot = path.join(profileRoot, "raw");
  mkdirSync(profileRoot, { recursive: true });
  rmSync(transient, { recursive: true, force: true });
  run(
    "npx",
    ["--yes", "@lhci/cli@0.15.1", "collect", `--config=${configPath}`],
    path.join(profileRoot, "collect.log")
  );
  if (!existsSync(transient)) {
    throw new Error(`LHCI did not create ${path.relative(root, transient)} for ${profile}`);
  }
  cpSync(transient, rawRoot, { recursive: true });
  rmSync(transient, { recursive: true, force: true });
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function lhrFromJson(value) {
  if (value?.categories?.performance && value?.audits) return value;
  if (value?.lhr?.categories?.performance && value?.lhr?.audits) return value.lhr;
  return null;
}

function loadRuns(profile) {
  const rawRoot = path.join(outputRoot, profile, "raw");
  const runs = [];
  for (const file of walk(rawRoot).filter((candidate) => candidate.endsWith(".json"))) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const lhr = lhrFromJson(parsed);
    if (!lhr) continue;
    const finalUrl = lhr.finalUrl ?? lhr.requestedUrl ?? "";
    if (!finalUrl.includes("index.html") && !finalUrl.endsWith("/")) continue;
    runs.push({
      source: path.relative(outputRoot, file).replaceAll(path.sep, "/"),
      finalUrl,
      performance: Number(lhr.categories.performance.score) * 100,
      lcp: Number(lhr.audits["largest-contentful-paint"]?.numericValue),
      tbt: Number(lhr.audits["total-blocking-time"]?.numericValue),
      cls: Number(lhr.audits["cumulative-layout-shift"]?.numericValue),
      fcp: Number(lhr.audits["first-contentful-paint"]?.numericValue),
      speedIndex: Number(lhr.audits["speed-index"]?.numericValue),
      interactive: Number(lhr.audits.interactive?.numericValue)
    });
  }
  if (runs.length < 6) {
    throw new Error(`${profile}: expected at least 6 valid Lighthouse runs, found ${runs.length}`);
  }
  for (const [index, run] of runs.entries()) {
    for (const [metric, value] of Object.entries(run)) {
      if (["source", "finalUrl"].includes(metric)) continue;
      if (!Number.isFinite(value)) throw new Error(`${profile} run ${index + 1}: invalid ${metric}`);
    }
  }
  return runs;
}

function quantile(values, q) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined
    ? sorted[base]
    : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function stats(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  return {
    min: Math.min(...values),
    p10: quantile(values, 0.1),
    median: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    max: Math.max(...values),
    mean,
    standardDeviation,
    coefficientOfVariation: mean === 0 ? 0 : standardDeviation / Math.abs(mean)
  };
}

function summarizeProfile(profile, runs) {
  const hard = budgets[profile];
  const metrics = {
    performance: stats(runs.map((run) => run.performance)),
    lcp: stats(runs.map((run) => run.lcp)),
    tbt: stats(runs.map((run) => run.tbt)),
    cls: stats(runs.map((run) => run.cls)),
    fcp: stats(runs.map((run) => run.fcp)),
    speedIndex: stats(runs.map((run) => run.speedIndex)),
    interactive: stats(runs.map((run) => run.interactive))
  };

  const instabilityReasons = [];
  if (metrics.performance.max - metrics.performance.min > 15) {
    instabilityReasons.push(`performance range ${(metrics.performance.max - metrics.performance.min).toFixed(1)} points exceeds 15`);
  }
  if (metrics.tbt.p90 - metrics.tbt.p10 > 500) {
    instabilityReasons.push(`TBT p90-p10 spread ${(metrics.tbt.p90 - metrics.tbt.p10).toFixed(0)} ms exceeds 500 ms`);
  }
  if (metrics.tbt.mean > 100 && metrics.tbt.coefficientOfVariation > 0.35) {
    instabilityReasons.push(`TBT coefficient of variation ${metrics.tbt.coefficientOfVariation.toFixed(2)} exceeds 0.35`);
  }
  if (metrics.lcp.p90 - metrics.lcp.p10 > 1000) {
    instabilityReasons.push(`LCP p90-p10 spread ${(metrics.lcp.p90 - metrics.lcp.p10).toFixed(0)} ms exceeds 1000 ms`);
  }

  const budgetBreaches = [];
  if (metrics.performance.median / 100 < hard.performance) budgetBreaches.push(`performance median ${metrics.performance.median.toFixed(1)} < ${hard.performance * 100}`);
  if (metrics.lcp.median > hard.lcp) budgetBreaches.push(`LCP median ${metrics.lcp.median.toFixed(0)} ms > ${hard.lcp} ms`);
  if (metrics.tbt.median > hard.tbt) budgetBreaches.push(`TBT median ${metrics.tbt.median.toFixed(0)} ms > ${hard.tbt} ms`);
  if (metrics.cls.median > hard.cls) budgetBreaches.push(`CLS median ${metrics.cls.median.toFixed(3)} > ${hard.cls}`);
  if (metrics.fcp.median > hard.fcp) budgetBreaches.push(`FCP median ${metrics.fcp.median.toFixed(0)} ms > ${hard.fcp} ms`);
  if (metrics.speedIndex.median > hard.speed_index) budgetBreaches.push(`Speed Index median ${metrics.speedIndex.median.toFixed(0)} ms > ${hard.speed_index} ms`);

  const verdict = budgetBreaches.length ? "new_bug" : instabilityReasons.length ? "flake" : "stable";
  const stability = verdict === "stable" ? 1 : verdict === "flake" ? 0.65 : 0.45;
  const flakeProbability = verdict === "flake" ? 0.7 : verdict === "new_bug" && instabilityReasons.length ? 0.35 : 0;

  return {
    profile,
    runCount: runs.length,
    verdict,
    stability,
    flakeProbability,
    flakeScore: flakeProbability,
    instabilityReasons,
    budgetBreaches,
    metrics,
    runs
  };
}

function formatMetric(metric, digits = 0) {
  return `${metric.median.toFixed(digits)} (p10 ${metric.p10.toFixed(digits)}, p90 ${metric.p90.toFixed(digits)}, min ${metric.min.toFixed(digits)}, max ${metric.max.toFixed(digits)})`;
}

assertExactCommit(testedCommit);
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
collect("mobile", "lighthouse/lighthouserc.repeatability.mobile.cjs");
collect("desktop", "lighthouse/lighthouserc.repeatability.desktop.cjs");

const profiles = ["mobile", "desktop"].map((profile) => summarizeProfile(profile, loadRuns(profile)));
const overallVerdict = profiles.some((profile) => profile.verdict === "new_bug")
  ? "new_bug"
  : profiles.some((profile) => profile.verdict === "flake")
    ? "flake"
    : "stable";
const generatedAt = new Date().toISOString();
const report = {
  schema: "robys.lighthouse.repeatability.v1",
  testedCommit,
  sourceRunId,
  generatedAt,
  minimumRunsPerProfile: 6,
  configuredRunsPerProfile: 8,
  overallVerdict,
  profiles
};
writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const markdown = `# Lighthouse repeatability — Roby's\n\n- Tested commit: \`${testedCommit}\`\n- Source run: \`${sourceRunId}\`\n- Verdict: **${overallVerdict}**\n- Generated: ${generatedAt}\n\n| Profile | Runs | Verdict | Performance | LCP | TBT | Interactive |\n|---|---:|---|---:|---:|---:|---:|\n${profiles.map((profile) => `| ${profile.profile} | ${profile.runCount} | ${profile.verdict} | ${formatMetric(profile.metrics.performance, 1)} | ${formatMetric(profile.metrics.lcp)} ms | ${formatMetric(profile.metrics.tbt)} ms | ${formatMetric(profile.metrics.interactive)} ms |`).join("\n")}\n\n## Classification\n\n${profiles.map((profile) => `### ${profile.profile}\n\n- Budget breaches: ${profile.budgetBreaches.length ? profile.budgetBreaches.join("; ") : "none"}\n- Instability: ${profile.instabilityReasons.length ? profile.instabilityReasons.join("; ") : "none"}`).join("\n\n")}\n\nThis report classifies repeated exact-head measurements. A median budget breach is a \`new_bug\`; excessive cross-run spread without a median breach is a \`flake\`.\n`;
writeFileSync(path.join(outputRoot, "report.md"), markdown, "utf8");
console.log(JSON.stringify({ testedCommit, sourceRunId, overallVerdict, profiles: profiles.map(({ profile, runCount, verdict, budgetBreaches, instabilityReasons }) => ({ profile, runCount, verdict, budgetBreaches, instabilityReasons })) }, null, 2));
