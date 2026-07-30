import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const bundleRoot = path.resolve(root, process.argv[2] ?? "qa/liminal-artifacts");
const testedCommit = process.env.ROBY_TESTED_COMMIT ?? process.env.GITHUB_SHA ?? "unknown";
const sourceRunId = process.env.ROBY_SOURCE_RUN_ID ?? process.env.GITHUB_RUN_ID ?? "local";
const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
const sourceRevision = process.env.LIMINALQA_REVISION ?? "unknown";
const requiredSignals = [
  "exact-head-binding",
  "security-contract",
  "performance-contract",
  "browser-lab-policy",
  "lighthouse-repeatability"
];

function fail(message) {
  throw new Error(message);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeRelative(relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(`Unsafe evidence path: ${JSON.stringify(relativePath)}`);
  }
  return relativePath;
}

function readRegularFileNoFollow(absolute) {
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) fail(`Evidence is not a regular file: ${absolute}`);
    const content = readFileSync(descriptor);
    if (content.length !== metadata.size) fail(`Evidence size changed during read: ${absolute}`);
    return { content, bytes: metadata.size, sha256: sha256Bytes(content) };
  } finally {
    closeSync(descriptor);
  }
}

function readBundle(relativePath) {
  const safe = safeRelative(relativePath);
  return readRegularFileNoFollow(path.join(bundleRoot, safe));
}

function readJson(relativePath) {
  const { content } = readBundle(relativePath);
  return JSON.parse(content.toString("utf8"));
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const metadata = lstatSync(absolute);
    if (metadata.isSymbolicLink()) fail(`Evidence bundle contains a symlink: ${path.relative(bundleRoot, absolute)}`);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
    else fail(`Unsupported evidence entry: ${path.relative(bundleRoot, absolute)}`);
  }
  return files;
}

function unique(values, label) {
  const set = new Set(values);
  if (set.size !== values.length) fail(`${label} contains duplicates`);
  return set;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertAlmostEqual(actual, expected, label) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) fail(`${label}: non-finite value`);
  const tolerance = Math.max(1e-7, Math.abs(expected) * 1e-10);
  if (Math.abs(actual - expected) > tolerance) fail(`${label}: expected ${expected}, got ${actual}`);
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

function lhrFromJson(value) {
  if (value?.categories?.performance && value?.audits) return value;
  if (value?.lhr?.categories?.performance && value?.lhr?.audits) return value.lhr;
  return null;
}

function extractRun(lhr, source) {
  const run = {
    source,
    finalUrl: lhr.finalUrl ?? lhr.requestedUrl ?? "",
    performance: Number(lhr.categories.performance.score) * 100,
    lcp: Number(lhr.audits["largest-contentful-paint"]?.numericValue),
    tbt: Number(lhr.audits["total-blocking-time"]?.numericValue),
    cls: Number(lhr.audits["cumulative-layout-shift"]?.numericValue),
    fcp: Number(lhr.audits["first-contentful-paint"]?.numericValue),
    speedIndex: Number(lhr.audits["speed-index"]?.numericValue),
    interactive: Number(lhr.audits.interactive?.numericValue)
  };
  for (const [metric, value] of Object.entries(run)) {
    if (metric === "source" || metric === "finalUrl") continue;
    if (!Number.isFinite(value)) fail(`${source}: invalid ${metric}`);
  }
  if (!run.finalUrl.includes("index.html") && !run.finalUrl.endsWith("/")) {
    fail(`${source}: unexpected final URL ${run.finalUrl}`);
  }
  return run;
}

function recomputeProfile(profile, reportProfile, manifestByPath, budgets) {
  const prefix = `lighthouse-raw/${profile}/raw/`;
  const rawPaths = [...manifestByPath.keys()]
    .filter((candidate) => candidate.startsWith(prefix) && candidate.endsWith(".json"))
    .sort();
  assertEqual(rawPaths.length, 6, `${profile} raw Lighthouse run count`);
  unique(rawPaths, `${profile} raw paths`);

  const rawHashes = [];
  const runs = rawPaths.map((relativePath) => {
    const record = manifestByPath.get(relativePath);
    rawHashes.push(record.sha256);
    const parsed = JSON.parse(readBundle(relativePath).content.toString("utf8"));
    const lhr = lhrFromJson(parsed);
    if (!lhr) fail(`${relativePath}: not a Lighthouse result`);
    return extractRun(lhr, relativePath.slice("lighthouse-raw/".length));
  });
  unique(rawHashes, `${profile} raw Lighthouse SHA-256 values`);

  assertEqual(reportProfile.runCount, 6, `${profile} reported run count`);
  assertEqual(reportProfile.runs.length, 6, `${profile} reported run array`);
  const reportedSources = reportProfile.runs.map((run) => run.source).sort();
  assertEqual(JSON.stringify(reportedSources), JSON.stringify(runs.map((run) => run.source).sort()), `${profile} raw/report source binding`);

  const metrics = {
    performance: stats(runs.map((run) => run.performance)),
    lcp: stats(runs.map((run) => run.lcp)),
    tbt: stats(runs.map((run) => run.tbt)),
    cls: stats(runs.map((run) => run.cls)),
    fcp: stats(runs.map((run) => run.fcp)),
    speedIndex: stats(runs.map((run) => run.speedIndex)),
    interactive: stats(runs.map((run) => run.interactive))
  };

  for (const [metricName, values] of Object.entries(metrics)) {
    for (const [statName, value] of Object.entries(values)) {
      assertAlmostEqual(reportProfile.metrics[metricName][statName], value, `${profile}.${metricName}.${statName}`);
    }
  }

  const hard = budgets[profile];
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
  assertEqual(reportProfile.verdict, verdict, `${profile} recomputed verdict`);
  assertEqual(JSON.stringify(reportProfile.budgetBreaches), JSON.stringify(budgetBreaches), `${profile} budget breaches`);
  assertEqual(JSON.stringify(reportProfile.instabilityReasons), JSON.stringify(instabilityReasons), `${profile} instability reasons`);

  return {
    profile,
    runs: runs.length,
    uniqueRawHashes: new Set(rawHashes).size,
    verdict,
    medians: Object.fromEntries(Object.entries(metrics).map(([name, value]) => [name, value.median])),
    ranges: {
      performance: metrics.performance.max - metrics.performance.min,
      lcpP90P10: metrics.lcp.p90 - metrics.lcp.p10,
      tbtP90P10: metrics.tbt.p90 - metrics.tbt.p10
    }
  };
}

if (!/^[0-9a-f]{40}$/i.test(testedCommit)) fail("ROBY_TESTED_COMMIT must be an exact 40-character SHA");
if (!sourceRunId.trim()) fail("ROBY_SOURCE_RUN_ID must not be empty");
if (!/^\d+$/.test(runAttempt)) fail(`Invalid run attempt: ${runAttempt}`);

for (const forbidden of ["verification.json", "evidence-quality.json"]) {
  try {
    lstatSync(path.join(bundleRoot, forbidden));
    fail(`Producer bundle must not contain verifier output ${forbidden}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const manifestRead = readBundle("manifest.json");
const manifest = JSON.parse(manifestRead.content.toString("utf8"));
assertEqual(manifest.schema, "robys.evidence.manifest.v1", "manifest schema");
assertEqual(manifest.algorithm, "sha256", "manifest algorithm");
assertEqual(manifest.testedCommit, testedCommit, "manifest tested commit");
assertEqual(String(manifest.sourceRunId), String(sourceRunId), "manifest source run");
assertEqual(String(manifest.runAttempt), String(runAttempt), "manifest run attempt");
assertEqual(manifest.bundleId, `${testedCommit}-${sourceRunId}-${runAttempt}`, "manifest bundle ID");
if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail("Manifest files must be non-empty");

const manifestPaths = manifest.files.map((record) => safeRelative(record.path));
unique(manifestPaths, "manifest paths");
const sortedManifestPaths = [...manifestPaths].sort((left, right) => left.localeCompare(right));
assertEqual(JSON.stringify(manifestPaths), JSON.stringify(sortedManifestPaths), "manifest path ordering");

const actualPaths = walk(bundleRoot)
  .map((absolute) => path.relative(bundleRoot, absolute).replaceAll(path.sep, "/"))
  .filter((relativePath) => relativePath !== "manifest.json")
  .sort();
assertEqual(JSON.stringify(actualPaths), JSON.stringify(sortedManifestPaths), "manifest completeness");

const manifestByPath = new Map();
for (const record of manifest.files) {
  if (!Number.isInteger(record.bytes) || record.bytes < 0) fail(`${record.path}: invalid byte count`);
  if (!/^[0-9a-f]{64}$/i.test(record.sha256)) fail(`${record.path}: invalid SHA-256`);
  const actual = readBundle(record.path);
  assertEqual(actual.bytes, record.bytes, `${record.path} bytes`);
  assertEqual(actual.sha256, record.sha256, `${record.path} SHA-256`);
  manifestByPath.set(record.path, record);
}

for (const requiredPath of [
  "exact-head.json",
  "security.log",
  "performance.log",
  "compose-policy.json",
  "lighthouse-repeatability.json",
  "input-signals.json",
  "decision.json",
  "liminalqa-core-tests.log",
  "adapter-build.log"
]) {
  if (!manifestByPath.has(requiredPath)) fail(`Missing required evidence file: ${requiredPath}`);
}

const exactHead = readJson("exact-head.json");
assertEqual(exactHead.schema, "robys.exact-head.v1", "exact-head schema");
assertEqual(exactHead.requested, testedCommit, "exact-head requested");
assertEqual(exactHead.checkedOut, testedCommit, "exact-head checked out");
assertEqual(exactHead.matches, true, "exact-head match");
assertEqual(String(exactHead.sourceRunId), String(sourceRunId), "exact-head source run");

const compose = readJson("compose-policy.json");
assertEqual(compose.schema, "robys.browser-lab-policy.v1", "compose policy schema");
assertEqual(compose.testedCommit, testedCommit, "compose tested commit");
assertEqual(String(compose.sourceRunId), String(sourceRunId), "compose source run");
assertEqual(compose.allLoopback, true, "compose loopback policy");
assertEqual(compose.allImagesPinned, true, "compose digest policy");
assertEqual(JSON.stringify(Object.keys(compose.services).sort()), JSON.stringify(["chromium", "firefox", "site"]), "compose services");
for (const [service, expectedPorts] of [["site", 1], ["chromium", 2], ["firefox", 2]]) {
  const value = compose.services[service];
  assertEqual(value.imagePinned, true, `${service} pinned image`);
  assertEqual(value.publishedPorts.length, expectedPorts, `${service} published port count`);
  for (const port of value.publishedPorts) assertEqual(port.hostIp, "127.0.0.1", `${service} host IP`);
}
assertEqual(compose.services.chromium.platform, "linux/amd64", "Chromium platform");
assertEqual(compose.services.firefox.platform, "linux/amd64", "Firefox platform");

const input = readJson("input-signals.json");
assertEqual(input.schema, "robys.liminalqa.input.v2", "input schema");
assertEqual(input.tested_commit, testedCommit, "input tested commit");
assertEqual(String(input.source_run_id), String(sourceRunId), "input source run");
if (!Array.isArray(input.tests)) fail("Input tests must be an array");
const inputNames = input.tests.map((test) => test.name);
unique(inputNames, "input signal names");
assertEqual(JSON.stringify([...inputNames].sort()), JSON.stringify([...requiredSignals].sort()), "required input signals");
for (const test of input.tests) {
  const record = manifestByPath.get(safeRelative(test.evidence_path));
  if (!record) fail(`${test.name}: evidence path is absent from manifest`);
  assertEqual(record.bytes, test.evidence_bytes, `${test.name} evidence bytes`);
  assertEqual(record.sha256, test.evidence_sha256, `${test.name} evidence SHA-256`);
  if (!["stable", "flake", "known_issue", "new_bug"].includes(test.verdict)) fail(`${test.name}: unsupported verdict`);
  if (!Number.isInteger(test.run_count) || test.run_count < 1) fail(`${test.name}: invalid run count`);
}

const budgets = JSON.parse(readFileSync(path.join(root, "lighthouse", "budgets.json"), "utf8"));
const lighthouse = readJson("lighthouse-repeatability.json");
assertEqual(lighthouse.schema, "robys.lighthouse.repeatability.v1", "Lighthouse schema");
assertEqual(lighthouse.testedCommit, testedCommit, "Lighthouse tested commit");
assertEqual(String(lighthouse.sourceRunId), String(sourceRunId), "Lighthouse source run");
assertEqual(lighthouse.minimumRunsPerProfile, 6, "minimum runs per profile");
assertEqual(lighthouse.configuredRunsPerProfile, 6, "configured runs per profile");
if (!Array.isArray(lighthouse.profiles)) fail("Lighthouse profiles must be an array");
const profileNames = lighthouse.profiles.map((profile) => profile.profile);
assertEqual(JSON.stringify([...profileNames].sort()), JSON.stringify(["desktop", "mobile"]), "Lighthouse profile set");
const qualityProfiles = lighthouse.profiles.map((profile) => recomputeProfile(profile.profile, profile, manifestByPath, budgets));
const recomputedOverall = qualityProfiles.some((profile) => profile.verdict === "new_bug")
  ? "new_bug"
  : qualityProfiles.some((profile) => profile.verdict === "flake")
    ? "flake"
    : "stable";
assertEqual(lighthouse.overallVerdict, recomputedOverall, "Lighthouse overall verdict");

const decision = readJson("decision.json");
assertEqual(decision.schema, "robys.liminalqa.decision.v2", "decision schema");
assertEqual(decision.input_schema, input.schema, "decision input schema");
assertEqual(decision.tested_commit, testedCommit, "decision tested commit");
assertEqual(String(decision.source_run_id), String(sourceRunId), "decision source run");
assertEqual(decision.source_revision, sourceRevision, "decision source revision");
assertEqual(decision.suite_decision.suite, input.suite, "decision suite");
assertEqual(decision.suite_decision.merge_policy, "allow", "decision merge policy");
assertEqual(decision.suite_decision.block_reason, "", "decision block reason");
if (!Number.isFinite(decision.suite_decision.confidence) || decision.suite_decision.confidence < 0 || decision.suite_decision.confidence > 1) {
  fail("Decision confidence must be in [0,1]");
}

const decisionNames = decision.test_decisions.map((test) => test.name);
unique(decisionNames, "decision test names");
assertEqual(JSON.stringify([...decisionNames].sort()), JSON.stringify([...inputNames].sort()), "decision/input test names");
const inputByName = new Map(input.tests.map((test) => [test.name, test]));
for (const test of decision.test_decisions) {
  const source = inputByName.get(test.name);
  assertEqual(test.verdict, source.verdict, `${test.name} decision verdict`);
  assertEqual(test.signals.run_count, source.run_count, `${test.name} decision run count`);
}
assertEqual(decision.suite_decision.summary.total_tests, input.tests.length, "decision total tests");
assertEqual(decision.suite_decision.summary.stable_tests, input.tests.filter((test) => test.verdict === "stable").length, "decision stable tests");
assertEqual(decision.suite_decision.summary.flaky_tests, input.tests.filter((test) => test.verdict === "flake").length, "decision flaky tests");
assertEqual(decision.suite_decision.summary.blocking_failures, input.tests.filter((test) => test.verdict === "new_bug").length, "decision blocking failures");

if (!Array.isArray(decision.evidence)) fail("Decision evidence must be an array");
const evidenceNames = decision.evidence.map((item) => item.name);
unique(evidenceNames, "decision evidence names");
assertEqual(JSON.stringify([...evidenceNames].sort()), JSON.stringify([...inputNames].sort()), "decision evidence/input names");
for (const item of decision.evidence) {
  const source = inputByName.get(item.name);
  assertEqual(item.verified, true, `${item.name} adapter verification`);
  assertEqual(item.path, source.evidence_path, `${item.name} decision evidence path`);
  assertEqual(item.bytes, source.evidence_bytes, `${item.name} decision evidence bytes`);
  assertEqual(item.sha256, source.evidence_sha256, `${item.name} decision evidence SHA-256`);
}

assertEqual(recomputedOverall, "stable", "recomputed Lighthouse acceptance");
assertEqual(input.tests.every((test) => test.verdict === "stable"), true, "all current-run signals stable");

const quality = {
  schema: "robys.evidence.quality.v1",
  bundleId: manifest.bundleId,
  testedCommit,
  sourceRunId,
  runAttempt,
  evaluatedAt: new Date().toISOString(),
  overall: "pass",
  freshRunnerRecomputation: true,
  manifest: {
    files: manifest.files.length,
    bytes: manifest.files.reduce((sum, record) => sum + record.bytes, 0),
    sha256: manifestRead.sha256,
    complete: true,
    uniquePaths: manifestPaths.length
  },
  bindings: {
    requiredSignals: requiredSignals.length,
    inputSignals: input.tests.length,
    adapterEvidence: decision.evidence.length,
    exactHead: true,
    exactRun: true,
    sourceRevision
  },
  lighthouse: {
    overallVerdict: recomputedOverall,
    profiles: qualityProfiles
  },
  decision: {
    policy: decision.suite_decision.merge_policy,
    confidence: decision.suite_decision.confidence,
    stableTests: decision.suite_decision.summary.stable_tests,
    totalTests: decision.suite_decision.summary.total_tests
  },
  verifier: {
    workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    job: process.env.GITHUB_JOB ?? null,
    runnerName: process.env.RUNNER_NAME ?? null,
    runnerOs: process.env.RUNNER_OS ?? null
  }
};
const qualityBytes = Buffer.from(`${JSON.stringify(quality, null, 2)}\n`, "utf8");
writeFileSync(path.join(bundleRoot, "evidence-quality.json"), qualityBytes);

const verification = {
  schema: "robys.evidence.verification.v2",
  bundleId: manifest.bundleId,
  testedCommit,
  sourceRunId,
  runAttempt,
  verified: true,
  verificationMode: "fresh-runner-recomputation",
  verifiedFiles: manifest.files.length,
  manifestBytes: manifestRead.bytes,
  manifestSha256: manifestRead.sha256,
  qualityReportBytes: qualityBytes.length,
  qualityReportSha256: sha256Bytes(qualityBytes),
  verifiedAt: new Date().toISOString(),
  verifierJob: process.env.GITHUB_JOB ?? "local",
  verifierRunner: process.env.RUNNER_NAME ?? "local"
};
writeFileSync(path.join(bundleRoot, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  bundleId: manifest.bundleId,
  verifiedFiles: manifest.files.length,
  manifestSha256: manifestRead.sha256,
  profiles: qualityProfiles.map(({ profile, runs, verdict, medians }) => ({ profile, runs, verdict, medians })),
  policy: decision.suite_decision.merge_policy,
  confidence: decision.suite_decision.confidence
}, null, 2));
