import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const resultsDir = path.resolve(process.env.VISUAL_RESULTS_DIR ?? "visual-results");
const summaryPath = path.join(resultsDir, "summary.json");
const approvalsPath = path.resolve("qa/reviewed-visual-changes.json");
const supplementalApprovalsDir = path.resolve("qa/reviewed-visual-changes.d");

function fail(message) {
  throw new Error(`[VISUAL-001] ${message}`);
}

if (!existsSync(summaryPath)) fail(`Missing comparison summary: ${summaryPath}`);

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const failures = Array.isArray(summary.results)
  ? summary.results.filter((result) => !result.passed)
  : [];

if (failures.length === 0) {
  console.log("✅ VISUAL-001 passed without reviewed exceptions.");
  process.exit(0);
}

if (!existsSync(approvalsPath)) {
  fail(`${failures.length} visual failure(s) have no reviewed-change record.`);
}

function readApprovalDocument(file) {
  const document = JSON.parse(readFileSync(file, "utf8"));
  if (document.version !== 1 || !Array.isArray(document.reviewedChanges)) {
    fail(`Reviewed visual change file is malformed or unsupported: ${file}`);
  }
  return document.reviewedChanges;
}

const reviewedChanges = [...readApprovalDocument(approvalsPath)];
if (existsSync(supplementalApprovalsDir)) {
  const supplementalFiles = readdirSync(supplementalApprovalsDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of supplementalFiles) {
    reviewedChanges.push(...readApprovalDocument(path.join(supplementalApprovalsDir, file)));
  }
}

function blobSha(file) {
  return execFileSync("git", ["hash-object", file], {
    cwd: process.cwd(),
    encoding: "utf8"
  }).trim();
}

function bindingsMatch(change) {
  const bindings = change.contentBindings ?? {};
  const entries = Object.entries(bindings);
  if (entries.length === 0) return false;
  return entries.every(([file, expected]) => existsSync(file) && blobSha(file) === expected);
}

function expectedFailureMatches(expected, actual) {
  if (expected.capture !== actual.id || expected.viewport !== actual.viewport) return false;

  if (typeof expected.reason === "string") {
    return actual.reason === expected.reason;
  }

  if (Number.isFinite(expected.totalPixels) && actual.totalPixels !== expected.totalPixels) {
    return false;
  }

  if (!Number.isFinite(expected.maxDiffPixelRatio)) return false;
  return Number.isFinite(actual.diffPixelRatio)
    && actual.diffPixelRatio <= expected.maxDiffPixelRatio;
}

function failureKey(capture, viewport) {
  return `${capture}\u0000${viewport}`;
}

function indexFailures(items, captureField, label) {
  const indexed = new Map();
  for (const item of items) {
    const key = failureKey(item[captureField], item.viewport);
    if (indexed.has(key)) {
      fail(`${label} contains duplicate capture/viewport key: ${item[captureField]}/${item.viewport}`);
    }
    indexed.set(key, item);
  }
  return indexed;
}

const actualFailuresByKey = indexFailures(failures, "id", "Visual summary");

function expectedFailureSetMatches(change) {
  const expected = change.expectedFailures ?? [];
  if (expected.length !== failures.length) return false;

  const expectedByKey = indexFailures(expected, "capture", `Reviewed change ${change.id}`);
  if (expectedByKey.size !== actualFailuresByKey.size) return false;

  for (const [key, expectedFailure] of expectedByKey) {
    const actualFailure = actualFailuresByKey.get(key);
    if (!actualFailure || !expectedFailureMatches(expectedFailure, actualFailure)) return false;
  }

  return true;
}

function describeActual(failure) {
  const metric = Number.isFinite(failure.diffPixelRatio)
    ? `diff=${failure.diffPixelRatio}`
    : `reason=${failure.reason ?? "unknown"}`;
  return `${failure.id}/${failure.viewport}(${metric})`;
}

function describeExpected(expected) {
  const metric = typeof expected.reason === "string"
    ? `reason=${expected.reason}`
    : Number.isFinite(expected.totalPixels)
      ? `pixels=${expected.totalPixels}`
      : `maxDiff=${expected.maxDiffPixelRatio}`;
  return `${expected.capture}/${expected.viewport}(${metric})`;
}

const boundChanges = reviewedChanges.filter(bindingsMatch);
const candidates = boundChanges.filter(expectedFailureSetMatches);
if (candidates.length !== 1) {
  const actualDetails = failures.map(describeActual).join(", ");
  const approvalDetails = boundChanges.length > 0
    ? boundChanges
      .map((change) => `${change.id}: ${(change.expectedFailures ?? []).map(describeExpected).join(", ") || "no expected failures"}`)
      .join(" | ")
    : "no content-bound approvals";

  fail(
    `Expected exactly one content-bound reviewed change matching all ${failures.length} failure(s), found ${candidates.length}. `
      + `Actual failures: ${actualDetails}. Bound approvals: ${approvalDetails}.`
  );
}

const change = candidates[0];
const expected = change.expectedFailures ?? [];

console.log(`✅ VISUAL-001 reviewed change accepted: ${change.id}`);
console.log(`   Evidence: ${change.reviewUrl}`);
console.log(`   Exact content bindings verified: ${Object.keys(change.contentBindings).join(", ")}`);
console.log(`   Reviewed comparisons: ${expected.length}`);
