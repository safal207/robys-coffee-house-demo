import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index < 0 ? fallback : argv[index + 1];
};

const profile = argument("profile");
if (profile !== "mobile" && profile !== "desktop") {
  throw new Error("--profile must be mobile or desktop");
}

const summaryPath = resolve(argument("summary", `lighthouse/reports/${profile}-summary.json`));
const baselinePath = resolve(argument("baseline", "lighthouse/baseline.json"));
const budgetsPath = resolve(argument("budgets", "lighthouse/budgets.json"));
const targetsPath = resolve(argument("targets", "lighthouse/targets.json"));
const outputPath = resolve(argument("output", `lighthouse/reports/${profile}-regression-report.json`));

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const summary = readJson(summaryPath);
const budgets = readJson(budgetsPath);
const targets = readJson(targetsPath);
const current = summary.values ?? {};
const baselineDocument = statSync(baselinePath, { throwIfNoEntry: false })?.isFile()
  ? readJson(baselinePath)
  : null;
const baseline = baselineDocument?.[profile] ?? null;
const regressionRules = budgets.regression ?? {};

const hardChecks = [];
const targetWarnings = [];
const regressionComparisons = [];
const violations = [];

const targetModes = {
  performance: "min",
  lcp: "max",
  tbt: "max",
  cls: "max",
  fcp: "max",
  speed_index: "max",
  total_js_bytes: "max"
};

for (const [metric, mode] of Object.entries(targetModes)) {
  const value = Number(current[metric]);
  const target = Number(targets[profile]?.[metric]);
  if (!Number.isFinite(value) || !Number.isFinite(target)) continue;

  const missed = mode === "min" ? value < target : value > target;
  if (missed) targetWarnings.push({ metric, current: value, target, mode });
}

for (const metric of ["total_js_bytes", "hero_file_bytes"]) {
  const value = Number(current[metric]);
  const limit = Number(budgets[profile]?.[metric]);
  const passed = Number.isFinite(value) && Number.isFinite(limit) && value <= limit;
  const check = {
    metric,
    status: passed ? "pass" : "error",
    current: Number.isFinite(value) ? value : null,
    limit: Number.isFinite(limit) ? limit : null,
    kind: "hard-max"
  };
  hardChecks.push(check);
  if (!passed) violations.push(check);
}

function compare(metric, limit, kind) {
  const now = Number(current[metric]);
  const before = Number(baseline?.[metric]);
  if (!Number.isFinite(now) || !Number.isFinite(before)) {
    regressionComparisons.push({
      metric,
      status: "unavailable",
      current: Number.isFinite(now) ? now : null,
      baseline: Number.isFinite(before) ? before : null
    });
    return;
  }

  let delta;
  let violated;
  let appliedLimit = limit;
  let appliedKind = kind;

  if (kind === "score-drop") {
    delta = (now - before) * 100;
    violated = delta < -limit;
  } else if (kind === "absolute-growth") {
    delta = now - before;
    violated = delta > limit;
  } else if (metric === "lcp") {
    const absoluteGrowth = now - before;
    const absoluteFloor = Number(regressionRules.lcp_absolute_floor_ms ?? 250);
    const percentageAllowance = before * limit / 100;
    const allowedGrowth = Math.max(absoluteFloor, percentageAllowance);
    delta = before === 0 ? absoluteGrowth : absoluteGrowth / before * 100;
    appliedLimit = allowedGrowth;
    appliedKind = "percent-with-absolute-floor";
    violated = absoluteGrowth > allowedGrowth;
  } else if (metric === "tbt") {
    const absoluteGrowth = now - before;
    const absoluteFloor = Number(regressionRules.tbt_zero_baseline_absolute_ms ?? 50);
    const percentageAllowance = before * limit / 100;
    const allowedGrowth = Math.max(absoluteFloor, percentageAllowance);
    delta = before === 0 ? absoluteGrowth : absoluteGrowth / before * 100;
    appliedLimit = allowedGrowth;
    appliedKind = "percent-with-absolute-floor";
    violated = absoluteGrowth > allowedGrowth;
  } else if (before === 0) {
    delta = now - before;
    appliedLimit = 0;
    appliedKind = "absolute-zero-baseline";
    violated = delta > 0;
  } else {
    delta = (now - before) / before * 100;
    violated = delta > limit;
  }

  const result = {
    metric,
    status: violated ? "error" : "pass",
    current: now,
    baseline: before,
    delta,
    limit: appliedLimit,
    kind: appliedKind
  };
  regressionComparisons.push(result);
  if (violated) violations.push(result);
}

if (baseline) {
  compare("performance", Number(regressionRules.performance_points ?? 3), "score-drop");
  compare("lcp", Number(regressionRules.lcp_percent ?? 15), "percent-growth");
  compare("tbt", Number(regressionRules.tbt_percent ?? 15), "percent-growth");
  compare("cls", Number(regressionRules.cls_absolute ?? 0.02), "absolute-growth");
  compare("total_js_bytes", Number(regressionRules.total_js_bytes_percent ?? 5), "percent-growth");
  compare("hero_file_bytes", Number(regressionRules.hero_file_bytes_percent ?? 5), "percent-growth");
}

const baselineStatus = baseline ? "available" : "missing";
const report = {
  schema_version: 1,
  profile,
  generated_at: new Date().toISOString(),
  baseline_status: baselineStatus,
  current,
  hard_checks: hardChecks,
  target_warnings: targetWarnings,
  regression_comparisons: regressionComparisons,
  violations,
  passed: baselineStatus === "available" && violations.length === 0
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (baselineStatus !== "available") process.exitCode = 2;
else if (violations.length) process.exitCode = 1;
