#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateRecord } from "./validate-harmonic-orientation.mjs";

const VALID_FIXTURES = [
  "docs/examples/harmonic-orientation-record.pr188-minify-reject.json",
  "docs/examples/harmonic-orientation-record.pr188-baseline-allow.json",
  "docs/examples/harmonic-orientation-record.pr186-d6-hold.json",
  "docs/examples/harmonic-orientation-record.conflict-escalate.json",
];

const INVALID_FIXTURES = [
  "docs/examples/harmonic-orientation-record.invalid-score-mismatch.json",
  "docs/examples/harmonic-orientation-record.invalid-allow-hard-blocker.json",
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function validateFixture(filePath) {
  const record = await readJson(filePath);
  return validateRecord(record, filePath);
}

async function testValidFixtures() {
  for (const fixture of VALID_FIXTURES) {
    const result = await validateFixture(fixture);
    assert(result.ok === true, `Expected valid fixture to pass: ${fixture}\n${JSON.stringify(result, null, 2)}`);
  }
}

async function testInvalidFixtures() {
  for (const fixture of INVALID_FIXTURES) {
    const result = await validateFixture(fixture);
    assert(result.ok === false, `Expected invalid fixture to fail: ${fixture}`);
    assert(result.errors.length > 0, `Invalid fixture should include errors: ${fixture}`);
  }
}

async function main() {
  await testValidFixtures();
  await testInvalidFixtures();
  console.log(JSON.stringify({ ok: true, valid: VALID_FIXTURES.length, invalid: INVALID_FIXTURES.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
