import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const bundleRoot = path.resolve(root, process.argv[2] ?? "qa/liminal-artifacts");
const commit = process.env.ROBY_TESTED_COMMIT ?? process.env.GITHUB_SHA ?? "unknown";
const runId = String(process.env.ROBY_SOURCE_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "local");
const attempt = String(process.env.GITHUB_RUN_ATTEMPT ?? "1");
const engineRevision = process.env.LIMINALQA_REVISION ?? "unknown";
const signalNames = ["exact-head-binding", "security-contract", "performance-contract", "browser-lab-policy", "lighthouse-repeatability"];

function fail(message) { throw new Error(message); }
function eq(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function almost(actual, expected, label) {
  const tolerance = Math.max(1e-7, Math.abs(expected) * 1e-10);
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function safe(relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\") ||
      relative.split("/").some((part) => !part || part === "." || part === "..")) {
    fail(`Unsafe evidence path: ${JSON.stringify(relative)}`);
  }
  return relative;
}
function readAbsolute(absolute) {
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) fail(`Not a regular file: ${absolute}`);
    const content = readFileSync(fd);
    if (content.length !== stat.size) fail(`File changed during read: ${absolute}`);
    return { content, bytes: stat.size, sha256: sha(content) };
  } finally {
    closeSync(fd);
  }
}
function read(relative) { return readAbsolute(path.join(bundleRoot, safe(relative))); }
function json(relative) { return JSON.parse(read(relative).content.toString("utf8")); }
function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`Symlink in evidence: ${path.relative(bundleRoot, absolute)}`);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
    else fail(`Unsupported evidence entry: ${path.relative(bundleRoot, absolute)}`);
  }
  return files;
}
function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}
function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}
function stats(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  return {
    min: Math.min(...values), p10: quantile(values, 0.1), median: quantile(values, 0.5),
    p90: quantile(values, 0.9), max: Math.max(...values), mean, standardDeviation,
    coefficientOfVariation: mean === 0 ? 0 : standardDeviation / Math.abs(mean)
  };
}
function lhr(value) {
  if (value?.categories?.performance && value?.audits) return value;
  if (value?.lhr?.categories?.performance && value?.lhr?.audits) return value.lhr;
  return null;
}
function runFrom(relative) {
  const value = lhr(JSON.parse(read(relative).content.toString("utf8")));
  if (!value) fail(`${relative}: not an LHR`);
  const result = {
    source: relative.slice("lighthouse-raw/".length),
    finalUrl: value.finalUrl ?? value.requestedUrl ?? "",
    performance: Number(value.categories.performance.score) * 100,
    lcp: Number(value.audits["largest-contentful-paint"]?.numericValue),
    tbt: Number(value.audits["total-blocking-time"]?.numericValue),
    cls: Number(value.audits["cumulative-layout-shift"]?.numericValue),
    fcp: Number(value.audits["first-contentful-paint"]?.numericValue),
    speedIndex: Number(value.audits["speed-index"]?.numericValue),
    interactive: Number(value.audits.interactive?.numericValue)
  };
  if (!result.finalUrl.includes("index.html") && !result.finalUrl.endsWith("/")) fail(`${relative}: unexpected URL`);
  for (const [name, value2] of Object.entries(result)) {
    if (!["source", "finalUrl"].includes(name) && !Number.isFinite(value2)) fail(`${relative}: invalid ${name}`);
  }
  return result;
}
function classify(profile, metrics, budgets) {
  const instability = [];
  if (metrics.performance.max - metrics.performance.min > 15) instability.push(`performance range ${(metrics.performance.max - metrics.performance.min).toFixed(1)} points exceeds 15`);
  if (metrics.tbt.p90 - metrics.tbt.p10 > 500) instability.push(`TBT p90-p10 spread ${(metrics.tbt.p90 - metrics.tbt.p10).toFixed(0)} ms exceeds 500 ms`);
  if (metrics.tbt.mean > 100 && metrics.tbt.coefficientOfVariation > 0.35) instability.push(`TBT coefficient of variation ${metrics.tbt.coefficientOfVariation.toFixed(2)} exceeds 0.35`);
  if (metrics.lcp.p90 - metrics.lcp.p10 > 1000) instability.push(`LCP p90-p10 spread ${(metrics.lcp.p90 - metrics.lcp.p10).toFixed(0)} ms exceeds 1000 ms`);
  const hard = budgets[profile];
  const breaches = [];
  if (metrics.performance.median / 100 < hard.performance) breaches.push(`performance median ${metrics.performance.median.toFixed(1)} < ${hard.performance * 100}`);
  if (metrics.lcp.median > hard.lcp) breaches.push(`LCP median ${metrics.lcp.median.toFixed(0)} ms > ${hard.lcp} ms`);
  if (metrics.tbt.median > hard.tbt) breaches.push(`TBT median ${metrics.tbt.median.toFixed(0)} ms > ${hard.tbt} ms`);
  if (metrics.cls.median > hard.cls) breaches.push(`CLS median ${metrics.cls.median.toFixed(3)} > ${hard.cls}`);
  if (metrics.fcp.median > hard.fcp) breaches.push(`FCP median ${metrics.fcp.median.toFixed(0)} ms > ${hard.fcp} ms`);
  if (metrics.speedIndex.median > hard.speed_index) breaches.push(`Speed Index median ${metrics.speedIndex.median.toFixed(0)} ms > ${hard.speed_index} ms`);
  return { verdict: breaches.length ? "new_bug" : instability.length ? "flake" : "stable", breaches, instability };
}

if (!/^[0-9a-f]{40}$/i.test(commit)) fail("Exact 40-character commit SHA required");
if (!/^\d+$/.test(runId) || !/^\d+$/.test(attempt)) fail("Numeric run ID and attempt required");
for (const forbidden of ["verification.json", "evidence-quality.json"]) {
  try { lstatSync(path.join(bundleRoot, forbidden)); fail(`Producer supplied ${forbidden}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

const manifestRead = read("manifest.json");
const manifest = JSON.parse(manifestRead.content.toString("utf8"));
eq(manifest.schema, "robys.evidence.manifest.v1", "manifest schema");
eq(manifest.algorithm, "sha256", "manifest algorithm");
eq(manifest.bundleId, `${commit}-${runId}-${attempt}`, "bundle ID");
eq(manifest.testedCommit, commit, "manifest commit");
eq(String(manifest.sourceRunId), runId, "manifest run");
eq(String(manifest.runAttempt), attempt, "manifest attempt");
if (!Array.isArray(manifest.files) || !manifest.files.length) fail("Empty manifest");

const manifestPaths = manifest.files.map((record) => safe(record.path));
unique(manifestPaths, "manifest paths");
eq(JSON.stringify(manifestPaths), JSON.stringify([...manifestPaths].sort((a, b) => a.localeCompare(b))), "manifest ordering");
const actualPaths = walk(bundleRoot).map((absolute) => path.relative(bundleRoot, absolute).replaceAll(path.sep, "/"))
  .filter((relative) => relative !== "manifest.json").sort();
eq(JSON.stringify(actualPaths), JSON.stringify([...manifestPaths].sort()), "manifest completeness");

const byPath = new Map();
for (const record of manifest.files) {
  if (!Number.isInteger(record.bytes) || record.bytes < 0 || !/^[0-9a-f]{64}$/i.test(record.sha256)) fail(`${record.path}: invalid manifest record`);
  const actual = read(record.path);
  eq(actual.bytes, record.bytes, `${record.path} bytes`);
  eq(actual.sha256, record.sha256, `${record.path} SHA`);
  byPath.set(record.path, record);
}
for (const required of ["exact-head.json", "security.log", "performance.log", "compose-policy.json", "lighthouse-repeatability.json", "input-signals.json", "decision.json", "liminalqa-core-tests.log", "adapter-build.log"]) {
  if (!byPath.has(required)) fail(`Missing ${required}`);
}

const exact = json("exact-head.json");
eq(exact.schema, "robys.exact-head.v1", "exact schema");
eq(exact.requested, commit, "requested commit");
eq(exact.checkedOut, commit, "checked-out commit");
eq(exact.matches, true, "exact match");
eq(String(exact.sourceRunId), runId, "exact run");

const compose = json("compose-policy.json");
eq(compose.schema, "robys.browser-lab-policy.v1", "compose schema");
eq(compose.testedCommit, commit, "compose commit");
eq(String(compose.sourceRunId), runId, "compose run");
eq(compose.allLoopback, true, "loopback policy");
eq(compose.allImagesPinned, true, "digest policy");
eq(JSON.stringify(Object.keys(compose.services).sort()), JSON.stringify(["chromium", "firefox", "site"]), "compose services");
for (const [service, ports] of [["site", 1], ["chromium", 2], ["firefox", 2]]) {
  eq(compose.services[service].imagePinned, true, `${service} image`);
  eq(compose.services[service].publishedPorts.length, ports, `${service} ports`);
  for (const port of compose.services[service].publishedPorts) eq(port.hostIp, "127.0.0.1", `${service} host`);
}
eq(compose.services.chromium.platform, "linux/amd64", "Chromium platform");
eq(compose.services.firefox.platform, "linux/amd64", "Firefox platform");

const input = json("input-signals.json");
eq(input.schema, "robys.liminalqa.input.v2", "input schema");
eq(input.tested_commit, commit, "input commit");
eq(String(input.source_run_id), runId, "input run");
const inputNames = input.tests.map((test) => test.name);
unique(inputNames, "signal names");
eq(JSON.stringify([...inputNames].sort()), JSON.stringify([...signalNames].sort()), "signal set");
for (const test of input.tests) {
  const record = byPath.get(safe(test.evidence_path));
  if (!record) fail(`${test.name}: missing evidence`);
  eq(record.bytes, test.evidence_bytes, `${test.name} bytes`);
  eq(record.sha256, test.evidence_sha256, `${test.name} SHA`);
  eq(test.run_count, test.name === "lighthouse-repeatability" ? 12 : 1, `${test.name} run count`);
}

const budgets = JSON.parse(readFileSync(path.join(root, "lighthouse", "budgets.json"), "utf8"));
const report = json("lighthouse-repeatability.json");
eq(report.schema, "robys.lighthouse.repeatability.v1", "Lighthouse schema");
eq(report.testedCommit, commit, "Lighthouse commit");
eq(String(report.sourceRunId), runId, "Lighthouse run");
eq(report.minimumRunsPerProfile, 6, "measured runs policy");
eq(report.warmupRunsPerProfile, 1, "warm-up policy");
eq(report.configuredRunsPerProfile, 7, "configured runs policy");
eq(JSON.stringify(report.profiles.map((profile) => profile.profile).sort()), JSON.stringify(["desktop", "mobile"]), "profile set");

const qualityProfiles = report.profiles.map((profile) => {
  const prefix = `lighthouse-raw/${profile.profile}/raw/`;
  const rawPaths = [...byPath.keys()].filter((candidate) => candidate.startsWith(prefix) && candidate.endsWith(".json")).sort();
  eq(rawPaths.length, 7, `${profile.profile} raw run count`);
  unique(rawPaths.map((relative) => byPath.get(relative).sha256), `${profile.profile} raw SHA values`);
  const allRuns = rawPaths.map(runFrom);
  eq(profile.warmupRuns.length, 1, `${profile.profile} warm-up count`);
  eq(profile.runs.length, 6, `${profile.profile} measured count`);
  eq(profile.runCount, 6, `${profile.profile} reported count`);
  eq(profile.warmupRuns[0].source, allRuns[0].source, `${profile.profile} first-run warm-up binding`);
  eq(JSON.stringify(profile.runs.map((run) => run.source).sort()), JSON.stringify(allRuns.slice(1).map((run) => run.source).sort()), `${profile.profile} measured source binding`);
  const measured = allRuns.slice(1);
  const metrics = {
    performance: stats(measured.map((run) => run.performance)), lcp: stats(measured.map((run) => run.lcp)),
    tbt: stats(measured.map((run) => run.tbt)), cls: stats(measured.map((run) => run.cls)),
    fcp: stats(measured.map((run) => run.fcp)), speedIndex: stats(measured.map((run) => run.speedIndex)),
    interactive: stats(measured.map((run) => run.interactive))
  };
  for (const [metric, values] of Object.entries(metrics)) {
    for (const [name, value] of Object.entries(values)) almost(profile.metrics[metric][name], value, `${profile.profile}.${metric}.${name}`);
  }
  const recomputed = classify(profile.profile, metrics, budgets);
  eq(profile.verdict, recomputed.verdict, `${profile.profile} verdict`);
  eq(JSON.stringify(profile.budgetBreaches), JSON.stringify(recomputed.breaches), `${profile.profile} breaches`);
  eq(JSON.stringify(profile.instabilityReasons), JSON.stringify(recomputed.instability), `${profile.profile} instability`);
  return {
    profile: profile.profile, warmupRuns: 1, measuredRuns: 6, uniqueRawHashes: 7,
    warmup: { source: allRuns[0].source, performance: allRuns[0].performance, lcp: allRuns[0].lcp, tbt: allRuns[0].tbt },
    verdict: recomputed.verdict,
    medians: Object.fromEntries(Object.entries(metrics).map(([name, value]) => [name, value.median]))
  };
});
const overall = qualityProfiles.some((profile) => profile.verdict === "new_bug") ? "new_bug"
  : qualityProfiles.some((profile) => profile.verdict === "flake") ? "flake" : "stable";
eq(report.overallVerdict, overall, "overall Lighthouse verdict");

const decision = json("decision.json");
eq(decision.schema, "robys.liminalqa.decision.v2", "decision schema");
eq(decision.input_schema, input.schema, "decision input schema");
eq(decision.tested_commit, commit, "decision commit");
eq(String(decision.source_run_id), runId, "decision run");
eq(decision.source_revision, engineRevision, "engine revision");
eq(decision.suite_decision.suite, input.suite, "suite");
eq(decision.suite_decision.merge_policy, "allow", "decision policy");
eq(decision.suite_decision.block_reason, "", "block reason");
if (!Number.isFinite(decision.suite_decision.confidence) || decision.suite_decision.confidence < 0 || decision.suite_decision.confidence > 1) fail("Invalid decision confidence");
const decisionNames = decision.test_decisions.map((test) => test.name);
unique(decisionNames, "decision names");
eq(JSON.stringify([...decisionNames].sort()), JSON.stringify([...inputNames].sort()), "decision/input names");
const inputByName = new Map(input.tests.map((test) => [test.name, test]));
for (const test of decision.test_decisions) {
  const source = inputByName.get(test.name);
  eq(test.verdict, source.verdict, `${test.name} verdict`);
  eq(test.signals.run_count, source.run_count, `${test.name} run count`);
}
eq(decision.suite_decision.summary.total_tests, input.tests.length, "total tests");
eq(decision.suite_decision.summary.stable_tests, input.tests.filter((test) => test.verdict === "stable").length, "stable tests");
const evidenceNames = decision.evidence.map((item) => item.name);
unique(evidenceNames, "adapter evidence names");
eq(JSON.stringify([...evidenceNames].sort()), JSON.stringify([...inputNames].sort()), "adapter/input names");
for (const item of decision.evidence) {
  const source = inputByName.get(item.name);
  eq(item.verified, true, `${item.name} adapter verification`);
  eq(item.path, source.evidence_path, `${item.name} path`);
  eq(item.bytes, source.evidence_bytes, `${item.name} bytes`);
  eq(item.sha256, source.evidence_sha256, `${item.name} SHA`);
}
eq(overall, "stable", "accepted Lighthouse verdict");
eq(input.tests.every((test) => test.verdict === "stable"), true, "stable signal set");

const quality = {
  schema: "robys.evidence.quality.v2", bundleId: manifest.bundleId, testedCommit: commit,
  sourceRunId: runId, runAttempt: attempt, evaluatedAt: new Date().toISOString(),
  overall: "pass", freshRunnerRecomputation: true,
  manifest: { files: manifest.files.length, bytes: manifest.files.reduce((sum, record) => sum + record.bytes, 0), sha256: manifestRead.sha256, complete: true },
  bindings: { requiredSignals: signalNames.length, inputSignals: input.tests.length, adapterEvidence: decision.evidence.length, exactHead: true, exactRun: true, sourceRevision: engineRevision },
  lighthouse: { overallVerdict: overall, warmupPolicy: "first-chronological-run", profiles: qualityProfiles },
  decision: { policy: decision.suite_decision.merge_policy, confidence: decision.suite_decision.confidence, stableTests: decision.suite_decision.summary.stable_tests, totalTests: decision.suite_decision.summary.total_tests },
  verifier: { workflowRunId: process.env.GITHUB_RUN_ID ?? null, job: process.env.GITHUB_JOB ?? null, runnerName: process.env.RUNNER_NAME ?? null, runnerOs: process.env.RUNNER_OS ?? null }
};
const qualityBytes = Buffer.from(`${JSON.stringify(quality, null, 2)}\n`);
writeFileSync(path.join(bundleRoot, "evidence-quality.json"), qualityBytes);
const verification = {
  schema: "robys.evidence.verification.v2", bundleId: manifest.bundleId, testedCommit: commit,
  sourceRunId: runId, runAttempt: attempt, verified: true,
  verificationMode: "fresh-runner-recomputation", verifiedFiles: manifest.files.length,
  manifestBytes: manifestRead.bytes, manifestSha256: manifestRead.sha256,
  qualityReportBytes: qualityBytes.length, qualityReportSha256: sha(qualityBytes),
  verifiedAt: new Date().toISOString(), verifierJob: process.env.GITHUB_JOB ?? "local",
  verifierRunner: process.env.RUNNER_NAME ?? "local"
};
writeFileSync(path.join(bundleRoot, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`);
console.log(JSON.stringify({ bundleId: manifest.bundleId, verifiedFiles: manifest.files.length, profiles: qualityProfiles, policy: decision.suite_decision.merge_policy }, null, 2));
