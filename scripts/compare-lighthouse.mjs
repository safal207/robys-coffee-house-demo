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
if (summary.schema_version !== 2 || !summary.pages || typeof summary.pages !== "object") {
  throw new Error("Lighthouse summary must use page-scoped schema_version 2");
}

const budgets = readJson(budgetsPath);
const targets = readJson(targetsPath);
const baselineDocument = statSync(baselinePath, { throwIfNoEntry: false })?.isFile()
  ? readJson(baselinePath)
  : null;
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

const baselineStatus = !baselineDocument
  ? "missing"
  : baselineDocument.schema_version !== 2
    ? "legacy-unscoped"
    : baselineDocument?.[profile]?.pages
      ? "available"
      : "missing-profile";

const baselineProfile = baselineStatus === "available" ? baselineDocument[profile] : null;

for (const [page, pageSummary] of Object.entries(summary.pages)) {
  const current = pageSummary?.values ?? {};
  for (const [metric, mode] of Object.entries(targetModes)) {
    const value = Number(current[metric]);
    const target = Number(targets[profile]?.[metric]);
    if (!Number.isFinite(value) || !Number.isFinite(target)) continue;
    const missed = mode === "min" ? value < target : value > target;
    if (missed) targetWarnings.push({ page, metric, current: value, target, mode });
  }

  const jsBytes = Number(current.total_js_bytes);
  const jsLimit = Number(budgets[profile]?.total_js_bytes);
  const jsPassed = Number.isFinite(jsBytes) && Number.isFinite(jsLimit) && jsBytes <= jsLimit;
  const check = {
    page,
    metric: "total_js_bytes",
    status: jsPassed ? "pass" : "error",
    current: Number.isFinite(jsBytes) ? jsBytes : null,
    limit: Number.isFinite(jsLimit) ? jsLimit : null,
    kind: "hard-max"
  };
  hardChecks.push(check);
  if (!jsPassed) violations.push(check);
}

const heroBytes = Number(summary.shared_values?.hero_file_bytes);
const heroLimit = Number(budgets[profile]?.hero_file_bytes);
const heroPassed = Number.isFinite(heroBytes) && Number.isFinite(heroLimit) && heroBytes <= heroLimit;
const heroHardCheck = {
  page: null,
  metric: "hero_file_bytes",
  status: heroPassed ? "pass" : "error",
  current: Number.isFinite(heroBytes) ? heroBytes : null,
  limit: Number.isFinite(heroLimit) ? heroLimit : null,
  kind: "hard-max"
};
hardChecks.push(heroHardCheck);
if (!heroPassed) violations.push(heroHardCheck);

function compare({ page, metric, now, before, limit, kind }) {
  if (!Number.isFinite(now) || !Number.isFinite(before)) {
    regressionComparisons.push({
      page,
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
    page,
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

if (baselineStatus === "available") {
  for (const [page, pageSummary] of Object.entries(summary.pages)) {
    const baselinePage = baselineProfile.pages?.[page];
    if (!baselinePage?.values) {
      const missing = { page, metric: null, status: "error", kind: "missing-baseline-page" };
      violations.push(missing);
      continue;
    }
    const current = pageSummary.values ?? {};
    const baseline = baselinePage.values ?? {};
    compare({ page, metric: "performance", now: Number(current.performance), before: Number(baseline.performance), limit: Number(regressionRules.performance_points ?? 3), kind: "score-drop" });
    compare({ page, metric: "lcp", now: Number(current.lcp), before: Number(baseline.lcp), limit: Number(regressionRules.lcp_percent ?? 15), kind: "percent-growth" });
    compare({ page, metric: "tbt", now: Number(current.tbt), before: Number(baseline.tbt), limit: Number(regressionRules.tbt_percent ?? 15), kind: "percent-growth" });
    compare({ page, metric: "cls", now: Number(current.cls), before: Number(baseline.cls), limit: Number(regressionRules.cls_absolute ?? 0.02), kind: "absolute-growth" });
    compare({ page, metric: "total_js_bytes", now: Number(current.total_js_bytes), before: Number(baseline.total_js_bytes), limit: Number(regressionRules.total_js_bytes_percent ?? 5), kind: "percent-growth" });
  }

  compare({
    page: null,
    metric: "hero_file_bytes",
    now: Number(summary.shared_values?.hero_file_bytes),
    before: Number(baselineProfile.shared_values?.hero_file_bytes),
    limit: Number(regressionRules.hero_file_bytes_percent ?? 5),
    kind: "percent-growth"
  });
}

const report = {
  schema_version: 2,
  profile,
  generated_at: new Date().toISOString(),
  baseline_status: baselineStatus,
  current: {
    shared_values: summary.shared_values ?? {},
    pages: summary.pages
  },
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
