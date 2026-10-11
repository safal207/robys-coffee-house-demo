import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "robys-lighthouse-page-scope-"));
const input = join(root, "lhrs");
const reports = join(root, "reports");
const hero = join(root, "hero.mp4");
const baseline = join(root, "baseline.json");
const legacyBaseline = join(root, "legacy-baseline.json");
const budgets = join(root, "budgets.json");
const targets = join(root, "targets.json");

await import("node:fs").then(({ mkdirSync }) => {
  mkdirSync(input, { recursive: true });
  mkdirSync(reports, { recursive: true });
});
writeFileSync(hero, "hero");

function lhr(page, tbt, run) {
  const url = `http://localhost:4173/${page}.html?entry=off`;
  return {
    lighthouseVersion: "12.6.1",
    requestedUrl: url,
    finalUrl: url,
    userAgent: "synthetic",
    categories: { performance: { score: 0.99 } },
    audits: {
      "largest-contentful-paint": { numericValue: 1000 },
      "total-blocking-time": { numericValue: tbt },
      "cumulative-layout-shift": { numericValue: 0 },
      "first-contentful-paint": { numericValue: 500 },
      "speed-index": { numericValue: 700 },
      "network-requests": {
        details: {
          items: [
            {
              resourceType: "Script",
              url: `http://localhost:4173/app-${page}.js?run=${run}`,
              transferSize: 20000
            }
          ]
        }
      }
    }
  };
}

for (let run = 1; run <= 3; run += 1) {
  writeFileSync(join(input, `index-${run}.json`), JSON.stringify(lhr("index", 5, run)));
  writeFileSync(join(input, `menu-${run}.json`), JSON.stringify(lhr("menu", 180, run)));
}

const summaryPath = join(reports, "mobile-summary.json");
const comparePath = join(reports, "mobile-regression-report.json");

function run(script, args) {
  return spawnSync(process.execPath, [resolve(script), ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
}

const summarize = run("scripts/summarize-lighthouse.mjs", [
  "--profile", "mobile",
  "--input", input,
  "--output", summaryPath,
  "--hero", hero
]);
assert.equal(summarize.status, 0, summarize.stderr || summarize.stdout);

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
assert.equal(summary.schema_version, 2);
assert.equal(summary.total_run_count, 6);
assert.deepEqual(Object.keys(summary.pages), ["index", "menu"]);
assert.equal(summary.pages.index.run_count, 3);
assert.equal(summary.pages.menu.run_count, 3);
assert.equal(summary.pages.index.values.tbt, 5);
assert.equal(summary.pages.menu.values.tbt, 180);

const baselineValues = (tbt) => ({
  performance: 0.99,
  lcp: 1000,
  tbt,
  cls: 0,
  fcp: 500,
  speed_index: 700,
  total_js_bytes: 20000,
  hero_transfer_bytes: null,
  hero_request_duration: null
});

writeFileSync(baseline, JSON.stringify({
  schema_version: 2,
  mobile: {
    shared_values: { hero_file_bytes: 4 },
    pages: {
      index: { values: baselineValues(5) },
      menu: { values: baselineValues(5) }
    }
  }
}, null, 2));

writeFileSync(legacyBaseline, JSON.stringify({
  schema_version: 1,
  mobile: baselineValues(5)
}, null, 2));

writeFileSync(budgets, JSON.stringify({
  mobile: { total_js_bytes: 100000, hero_file_bytes: 100000 },
  regression: {
    performance_points: 3,
    lcp_percent: 15,
    lcp_absolute_floor_ms: 250,
    tbt_percent: 15,
    tbt_zero_baseline_absolute_ms: 50,
    cls_absolute: 0.02,
    total_js_bytes_percent: 5,
    hero_file_bytes_percent: 5
  }
}, null, 2));

writeFileSync(targets, JSON.stringify({
  mobile: {
    performance: 0.9,
    lcp: 2500,
    tbt: 200,
    cls: 0.1,
    fcp: 1800,
    speed_index: 3400,
    total_js_bytes: 140000
  }
}, null, 2));

const compare = run("scripts/compare-lighthouse.mjs", [
  "--profile", "mobile",
  "--summary", summaryPath,
  "--baseline", baseline,
  "--budgets", budgets,
  "--targets", targets,
  "--output", comparePath
]);
assert.equal(compare.status, 1, "negative control must fail the regression gate");

const report = JSON.parse(readFileSync(comparePath, "utf8"));
const indexTbt = report.regression_comparisons.find((item) => item.page === "index" && item.metric === "tbt");
const menuTbt = report.regression_comparisons.find((item) => item.page === "menu" && item.metric === "tbt");
assert.equal(indexTbt?.status, "pass");
assert.equal(menuTbt?.status, "error");
assert.equal(menuTbt?.current, 180);
assert.equal(menuTbt?.baseline, 5);
assert.deepEqual(
  report.violations.map((item) => [item.page, item.metric, item.kind]),
  [["menu", "tbt", "percent-with-absolute-floor"]]
);

const legacyComparePath = join(reports, "legacy-regression-report.json");
const legacyCompare = run("scripts/compare-lighthouse.mjs", [
  "--profile", "mobile",
  "--summary", summaryPath,
  "--baseline", legacyBaseline,
  "--budgets", budgets,
  "--targets", targets,
  "--output", legacyComparePath
]);
assert.equal(legacyCompare.status, 2, "legacy unscoped baseline must fail closed");
const legacyReport = JSON.parse(readFileSync(legacyComparePath, "utf8"));
assert.equal(legacyReport.baseline_status, "legacy-unscoped");
assert.equal(legacyReport.passed, false);

console.log("✅ LIGHTHOUSE-PAGE-001 passed: per-page medians, menu-only negative control, and legacy fail-closed baseline are enforced.");
rmSync(root, { recursive: true, force: true });
