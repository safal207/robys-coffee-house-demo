import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const binarySuffix = process.platform === "win32" ? ".cmd" : "";
const warmups = positiveInteger(process.env.TS_BENCH_WARMUPS, 2);
const samples = positiveInteger(process.env.TS_BENCH_SAMPLES, 9);

const candidates = [
  {
    id: "typescript-5-current",
    label: "Current TypeScript",
    binary: resolve(projectRoot, `node_modules/.bin/tsc${binarySuffix}`)
  },
  {
    id: "typescript-6-compat",
    label: "TypeScript 6 compatibility",
    binary: resolve(projectRoot, `.typescript-bench/ts6/node_modules/.bin/tsc6${binarySuffix}`)
  },
  {
    id: "typescript-7-native",
    label: "TypeScript 7 native",
    binary: resolve(projectRoot, `.typescript-bench/ts7/node_modules/.bin/tsc${binarySuffix}`)
  }
];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function execute(candidate, args) {
  const startedAt = performance.now();
  const result = spawnSync(candidate.binary, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    shell: process.platform === "win32"
  });
  const durationMs = performance.now() - startedAt;

  if (result.error) {
    throw new Error(`${candidate.label} could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${candidate.label} exited with ${result.status}.\n${output}`);
  }

  return { durationMs, stdout: result.stdout.trim() };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

const versions = new Map();
for (const candidate of candidates) {
  versions.set(candidate.id, execute(candidate, ["--version"]).stdout);
}

console.log(`Warming each compiler ${warmups} time(s)...`);
for (let warmup = 0; warmup < warmups; warmup += 1) {
  for (const candidate of candidates) {
    execute(candidate, ["--noEmit", "--pretty", "false"]);
  }
}

const timings = new Map(candidates.map((candidate) => [candidate.id, []]));
console.log(`Collecting ${samples} measured run(s) per compiler...`);
for (let sample = 0; sample < samples; sample += 1) {
  const rotatedCandidates = candidates.slice(sample % candidates.length)
    .concat(candidates.slice(0, sample % candidates.length));

  for (const candidate of rotatedCandidates) {
    const { durationMs } = execute(candidate, ["--noEmit", "--pretty", "false"]);
    timings.get(candidate.id).push(durationMs);
  }
}

const baselineMedian = median(timings.get(candidates[0].id));
const results = candidates.map((candidate) => {
  const values = timings.get(candidate.id);
  const medianMs = median(values);
  return {
    id: candidate.id,
    label: candidate.label,
    version: versions.get(candidate.id),
    samplesMs: values.map(round),
    medianMs: round(medianMs),
    minMs: round(Math.min(...values)),
    p95Ms: round(percentile(values, 0.95)),
    maxMs: round(Math.max(...values)),
    speedupVsCurrent: round(baselineMedian / medianMs)
  };
});

console.table(results.map((result) => ({
  compiler: result.label,
  version: result.version,
  medianMs: result.medianMs,
  p95Ms: result.p95Ms,
  speedupVsCurrent: `${result.speedupVsCurrent}x`
})));

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    logicalCpuCount: cpus().length,
    warmups,
    samples
  },
  command: "tsc --noEmit --pretty false",
  results
};

mkdirSync(resolve(projectRoot, ".artifacts"), { recursive: true });
const reportPath = resolve(projectRoot, ".artifacts/typescript-benchmark.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Benchmark report written to ${reportPath}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map((result) =>
    `| ${result.label} | ${result.version} | ${result.medianMs} ms | ${result.p95Ms} ms | ${result.speedupVsCurrent}x |`
  ).join("\n");

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    "## TypeScript compiler benchmark",
    "",
    `Same project and command: \`${report.command}\``,
    "",
    "| Compiler | Version | Median | p95 | Speedup vs current |",
    "|---|---:|---:|---:|---:|",
    rows,
    "",
    `Warmups: ${warmups}; measured runs per compiler: ${samples}.`,
    ""
  ].join("\n"));
}
