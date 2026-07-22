#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateRecord } from "./validate-harmonic-orientation.mjs";

const VALID_FIXTURES = [
  { path: "docs/examples/harmonic-orientation-record.pr188-minify-reject.json", decision: "reject" },
  { path: "docs/examples/harmonic-orientation-record.pr188-baseline-allow.json", decision: "allow" },
  { path: "docs/examples/harmonic-orientation-record.pr186-d6-hold.json", decision: "hold" },
  { path: "docs/examples/harmonic-orientation-record.conflict-escalate.json", decision: "escalate" },
];

const INVALID_FIXTURES = [
  { path: "docs/examples/harmonic-orientation-record.invalid-score-mismatch.json", expectedError: "Scorecard total mismatch" },
  { path: "docs/examples/harmonic-orientation-record.invalid-allow-hard-blocker.json", expectedError: "Hard blockers are present, but decision is allow" },
  { path: "docs/examples/harmonic-orientation-record.invalid-unknown-hard-blocker.json", expectedError: "Unknown hard blocker" },
  { path: "docs/examples/harmonic-orientation-record.invalid-hard-blocker-type.json", expectedError: "scorecard.hard_blockers must be an array" },
  { path: "docs/examples/harmonic-orientation-record.invalid-total-type.json", expectedError: "Scorecard total mismatch" },
  { path: "docs/examples/harmonic-orientation-record.invalid-evidence-type.json", expectedError: "real_graph.evidence_before must be an object" },
  { path: "docs/examples/harmonic-orientation-record.invalid-missing-scorecard.json", expectedError: "Missing required top-level field: scorecard" },
  { path: "docs/examples/harmonic-orientation-record.invalid-escalate-hard-blocker.json", expectedError: "Hard blockers are present, but decision is escalate" },
  { path: "docs/examples/harmonic-orientation-record.invalid-missing-required-hard-blocker.json", expectedError: "Missing required hard blocker" },
  { path: "docs/examples/harmonic-orientation-record.invalid-low-score-allow.json", expectedError: "allow requires score 8..10" },
  { path: "docs/examples/harmonic-orientation-record.invalid-high-score-hold.json", expectedError: "expected allow" },
  { path: "docs/examples/harmonic-orientation-record.invalid-top-level-object-type.json", expectedError: "project_graph must be a non-empty object" },
];

/** Read one JSON fixture. */
async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

/** Clone a JSON-compatible record for mutation tests. */
function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record));
}

/** Throw a readable test failure when a condition is false. */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Require one validation result to fail for the intended reason. */
function assertValidationError(result, source, expectedError) {
  assert(result.ok === false, `Expected invalid record to fail: ${source}`);
  assert(
    result.errors.some((error) => error.includes(expectedError)),
    `Unexpected validation errors for ${source}: ${JSON.stringify(result.errors)}`,
  );
}

/** Validate one fixture through the exported in-memory API. */
async function validateFixture(filePath) {
  return validateRecord(await readJson(filePath), filePath);
}

/** Require all positive fixtures to pass with the expected decision. */
async function testValidFixtures() {
  for (const fixture of VALID_FIXTURES) {
    const result = await validateFixture(fixture.path);
    assert(result.ok === true, `Expected valid fixture to pass: ${fixture.path}\n${JSON.stringify(result, null, 2)}`);
    assert(result.decision === fixture.decision, `Expected ${fixture.path} decision ${fixture.decision}, got ${result.decision}`);
  }
}

/** Require all file-backed negative fixtures to fail for their intended reason. */
async function testInvalidFixtures() {
  for (const fixture of INVALID_FIXTURES) {
    assertValidationError(await validateFixture(fixture.path), fixture.path, fixture.expectedError);
  }
}

/** Require canonical evidence snapshots and every evidence bucket. */
async function testEvidenceCompleteness() {
  const base = await readJson("docs/examples/harmonic-orientation-record.conflict-escalate.json");

  const missingAfter = cloneRecord(base);
  delete missingAfter.real_graph.evidence_after;
  assertValidationError(
    validateRecord(missingAfter, "mutation:missing-evidence-after"),
    "mutation:missing-evidence-after",
    "real_graph.evidence_after is required",
  );

  const missingBucket = cloneRecord(base);
  delete missingBucket.real_graph.evidence_after.missing;
  assertValidationError(
    validateRecord(missingBucket, "mutation:missing-evidence-bucket"),
    "mutation:missing-evidence-bucket",
    "real_graph.evidence_after.missing is required",
  );
}

/** Run the complete positive and negative fixture contract. */
async function main() {
  await testValidFixtures();
  await testInvalidFixtures();
  await testEvidenceCompleteness();
  console.log(JSON.stringify({
    ok: true,
    valid: VALID_FIXTURES.length,
    invalid: INVALID_FIXTURES.length,
    mutations: 2,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
