import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
};
const input = resolve(option("input", "lighthouse-artifacts"));
const output = resolve(option("output", "lighthouse-comment.md"));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const files = walk(input);

function json(profile, suffix) {
  const file = files.find((path) => path.endsWith(`${profile}-${suffix}.json`));
  if (!file) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function fmt(metric, value) {
  if (!Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  if (metric === "performance" || metric === "cls") return numeric.toFixed(2);
  if (metric.includes("bytes")) return `${Math.round(numeric / 1024)} KB`;
  return `${Math.round(numeric)} ms`;
}

const names = {
  performance: "Performance",
  lcp: "LCP",
  tbt: "TBT",
  cls: "CLS",
  fcp: "FCP",
  speed_index: "Speed Index",
  total_js_bytes: "Total JS",
  hero_file_bytes: "Hero file",
  hero_transfer_bytes: "Hero transfer",
  hero_request_duration: "Hero request"
};

function deltaText(comparison) {
  if (!Number.isFinite(comparison?.delta)) return "—";
  const suffix = comparison.kind === "absolute-growth" ? "" : comparison.kind === "score-drop" ? " pt" : "%";
  return `${comparison.delta > 0 ? "+" : ""}${comparison.delta.toFixed(2)}${suffix}`;
}

function pageTable(page, values, report) {
  const comparisons = new Map(
    (report?.regression_comparisons ?? [])
      .filter((item) => item.page === page)
      .map((item) => [item.metric, item])
  );
  const warnings = new Set(
    (report?.target_warnings ?? [])
      .filter((item) => item.page === page)
      .map((item) => item.metric)
  );

  const lines = [
    `#### ${page}`,
    "",
    "| Metric | Current | Baseline | Delta | Status |",
    "|---|---:|---:|---:|:---:|"
  ];

  for (const metric of ["performance", "lcp", "tbt", "cls", "fcp", "speed_index", "total_js_bytes"]) {
    const comparison = comparisons.get(metric);
    const icon = comparison?.status === "error" ? "❌" : warnings.has(metric) ? "⚠️" : "✅";
    lines.push(`| ${names[metric]} | ${fmt(metric, values?.[metric])} | ${fmt(metric, comparison?.baseline)} | ${deltaText(comparison)} | ${icon} |`);
  }
  return lines;
}

function block(profile) {
  const summary = json(profile, "summary");
  const report = json(profile, "regression-report");
  const status = json(profile, "status");
  if (!summary) return `### ${profile}\n\nNo summary artifact was produced. ❌`;

  if (summary.schema_version !== 2 || !summary.pages) {
    return `### ${profile}\n\nSummary is not page-scoped schema v2. ❌`;
  }

  const lines = [`### ${profile[0].toUpperCase()}${profile.slice(1)}`, ""];
  for (const [page, data] of Object.entries(summary.pages).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(...pageTable(page, data?.values, report), "");
  }

  const heroComparison = (report?.regression_comparisons ?? []).find((item) => item.page == null && item.metric === "hero_file_bytes");
  lines.push(`Shared hero file: ${fmt("hero_file_bytes", summary.shared_values?.hero_file_bytes)} · baseline ${fmt("hero_file_bytes", heroComparison?.baseline)}`);
  const baselineLabel = report?.baseline_status === "available"
    ? status?.regression_exit === 0 ? "✅" : "❌"
    : `⏳ ${report?.baseline_status ?? "baseline pending"}`;
  lines.push("", `Hard assertions: ${status?.hard_assert_exit === 0 ? "✅" : "❌"} · Regression: ${baselineLabel}`);
  if (Array.isArray(summary.public_urls) && summary.public_urls.length) {
    lines.push(` · Public Lighthouse reports: ${summary.public_urls.map((url, index) => `[report ${index + 1}](${url})`).join(" · ")}`);
  }
  return lines.join("\n");
}

const markdown = [
  "<!-- robys-lighthouse-report -->",
  "## 🚦 Roby’s Lighthouse contract",
  "",
  block("mobile"),
  "",
  block("desktop"),
  "",
  "_Performance regressions are evaluated per audited page; page medians are never pooled across routes._"
].join("\n");

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, markdown + "\n");
console.log(markdown);
