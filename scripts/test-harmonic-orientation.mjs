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
];

/** Read one JSON fixture. */
async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

/** Throw a readable test failure when a condition is false. */
function assert(condition, message) {
  if (!condition) throw new Error(message);
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

/** Require all negative fixtures to fail for their intended reason. */
async function testInvalidFixtures() {
  for (const fixture of INVALID_FIXTURES) {
    const result = await validateFixture(fixture.path);
    assert(result.ok === false, `Expected invalid fixture to fail: ${fixture.path}`);
    assert(
      result.errors.some((error) => error.includes(fixture.expectedError)),
      `Unexpected validation errors for ${fixture.path}: ${JSON.stringify(result.errors)}`,
    );
  }
}

/** Run the complete positive and negative fixture contract. */
async function main() {
  await testValidFixtures();
  await testInvalidFixtures();
  console.log(JSON.stringify({ ok: true, valid: VALID_FIXTURES.length, invalid: INVALID_FIXTURES.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
