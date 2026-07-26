#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  canonicalize,
  digestEvent,
  inspectTraceText,
  replayTraceText,
  sha256
} from "./ltp-inspect.mjs";

const CLEAN_PAYLOAD_DIGEST = sha256(canonicalize({ kind: "fixture", content: "redacted" }));
const CONSTRAINT_DIGEST = sha256(canonicalize({ protected_effects: "disabled", evidence_class: "fixture" }));

function baseEvents() {
  return [
    {
      schema_version: "ltp-project-trace.v1",
      trace_id: "TRACE-ROBIS-FIXTURE-001",
      run_id: "RUN-ROBIS-FIXTURE-001",
      agent_id: "robis-audit-fixture",
      event_id: "evt-001",
      sequence: 1,
      timestamp: "2026-07-27T00:00:00Z",
      source: "SYSTEM",
      action: "start_audit",
      decision: "OBSERVE",
      baseline_status: "MATCH",
      constraint_digest: CONSTRAINT_DIGEST,
      source_payload_digest: CLEAN_PAYLOAD_DIGEST,
      redacted_payload_digest: CLEAN_PAYLOAD_DIGEST,
      previous_event_digest: null,
      parent_event_id: null,
      authorization_event_id: null,
      critical_action: false,
      protected_effect: false,
      authorized: false,
      committed: false,
      resume: false,
      trace_complete: false,
      redaction_status: "clean",
      payload: { evidence_class: "fixture", protected_effects: 0 }
    },
    {
      schema_version: "ltp-project-trace.v1",
      trace_id: "TRACE-ROBIS-FIXTURE-001",
      run_id: "RUN-ROBIS-FIXTURE-001",
      agent_id: "robis-audit-fixture",
      event_id: "evt-002",
      sequence: 2,
      timestamp: "2026-07-27T00:00:01Z",
      source: "REPOSITORY",
      action: "inspect_revision",
      decision: "ALLOW",
      baseline_status: "MATCH",
      constraint_digest: CONSTRAINT_DIGEST,
      source_payload_digest: CLEAN_PAYLOAD_DIGEST,
      redacted_payload_digest: CLEAN_PAYLOAD_DIGEST,
      previous_event_digest: null,
      parent_event_id: "evt-001",
      authorization_event_id: null,
      critical_action: false,
      protected_effect: false,
      authorized: false,
      committed: false,
      resume: false,
      trace_complete: false,
      redaction_status: "clean",
      payload: { revision_binding: "exact-head", worktree: "read-only" }
    },
    {
      schema_version: "ltp-project-trace.v1",
      trace_id: "TRACE-ROBIS-FIXTURE-001",
      run_id: "RUN-ROBIS-FIXTURE-001",
      agent_id: "robis-audit-fixture",
      event_id: "evt-003",
      sequence: 3,
      timestamp: "2026-07-27T00:00:02Z",
      source: "CI",
      action: "complete_audit",
      decision: "ALLOW",
      baseline_status: "MATCH",
      constraint_digest: CONSTRAINT_DIGEST,
      source_payload_digest: CLEAN_PAYLOAD_DIGEST,
      redacted_payload_digest: CLEAN_PAYLOAD_DIGEST,
      previous_event_digest: null,
      parent_event_id: "evt-001",
      authorization_event_id: null,
      critical_action: false,
      protected_effect: false,
      authorized: false,
      committed: false,
      resume: false,
      trace_complete: true,
      redaction_status: "clean",
      payload: { result: "fixture-contract-verified" }
    }
  ];
}

function seal(events) {
  let previous = null;
  return events.map((source) => {
    const event = structuredClone(source);
    const payloadDigest = sha256(canonicalize(event.payload ?? null));
    event.source_payload_digest = payloadDigest;
    event.redacted_payload_digest = payloadDigest;
    event.previous_event_digest = previous;
    event.event_digest = digestEvent(event);
    previous = event.event_digest;
    return event;
  });
}

function jsonl(events) {
  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

function runCase(id, expectedVerdict, mutate, { strict = true } = {}) {
  const events = baseEvents();
  const transformed = mutate ? mutate(events) ?? events : events;
  const text = typeof transformed === "string" ? transformed : jsonl(seal(transformed));
  const report = inspectTraceText(text, { strict });
  assert.equal(report.verdict, expectedVerdict, `${id}: ${report.issues.map((item) => item.code).join(", ")}`);
  return { id, expected: expectedVerdict, observed: report.verdict, exit_code: report.exit_code, issue_codes: report.issues.map((item) => item.code) };
}

const results = [];
results.push(runCase("01-clean-complete", "ADMISSIBLE"));
results.push(runCase("02-baseline-drift", "DRIFT", (events) => { events[1].baseline_status = "DRIFT"; }));
results.push(runCase("03-effect-after-non-allow", "REJECTED", (events) => {
  events[1].decision = "BLOCK";
  events[2].protected_effect = true;
  events[2].critical_action = true;
  events[2].authorized = true;
  events[2].committed = true;
  events[2].authorization_event_id = "evt-002";
}));
results.push(runCase("04-partial-valid", "REJECTED", (events) => { events[2].trace_complete = false; }));
results.push(runCase("05-reordered-events", "REJECTED", (events) => [events[1], events[0], events[2]]));

{
  const events = seal(baseEvents());
  events[1].payload.revision_binding = "tampered";
  const report = inspectTraceText(jsonl(events), { strict: true });
  assert.equal(report.verdict, "REJECTED");
  results.push({ id: "06-tampered-event", expected: "REJECTED", observed: report.verdict, exit_code: report.exit_code, issue_codes: report.issues.map((item) => item.code) });
}

results.push(runCase("07-corrupted-tail", "INCONCLUSIVE", () => `${jsonl(seal(baseEvents()))}{"broken":\n`));
results.push(runCase("08-missing-event", "REJECTED", (events) => { events.splice(1, 1); }));
results.push(runCase("09-duplicated-event", "REJECTED", (events) => { events.splice(2, 0, structuredClone(events[1])); }));
results.push(runCase("10-conflicting-duplicate-id", "REJECTED", (events) => { events[2].event_id = events[1].event_id; events[2].action = "different_action"; }));
results.push(runCase("11-broken-parent", "REJECTED", (events) => { events[2].parent_event_id = "evt-missing"; }));

{
  const events = seal(baseEvents());
  events[2].previous_event_digest = "0".repeat(64);
  events[2].event_digest = digestEvent(events[2]);
  const report = inspectTraceText(jsonl(events), { strict: true });
  assert.equal(report.verdict, "REJECTED");
  results.push({ id: "12-broken-previous-hash", expected: "REJECTED", observed: report.verdict, exit_code: report.exit_code, issue_codes: report.issues.map((item) => item.code) });
}

results.push(runCase("13-wrong-identity", "REJECTED", (events) => { events[1].agent_id = "other-agent"; }));
results.push(runCase("14-unsupported-schema", "REJECTED", (events) => { events[1].schema_version = "ltp-project-trace.v2"; }));
results.push(runCase("15-malformed-jsonl", "INCONCLUSIVE", () => "{not-json}\n"));
results.push(runCase("16-sensitive-data-leakage", "REJECTED", (events) => { events[1].payload = { access_token: "ghp_abcdefghijklmnopqrstuvwxyz1234567890AB" }; }));
results.push(runCase("17-replay-nondeterminism", "REJECTED", (events) => { events[1].replay_nonce = "forbidden-nondeterministic-input"; }));
results.push(runCase("18-resume-after-invalid-prefix", "REJECTED", (events) => { events[1].decision = "HOLD"; events[2].resume = true; }));
results.push(runCase("19-critical-web-direct-action", "REJECTED", (events) => {
  events.splice(1, 0, {
    ...structuredClone(events[0]),
    event_id: "evt-auth",
    sequence: 2,
    timestamp: "2026-07-27T00:00:00.500Z",
    source: "HUMAN",
    action: "authorize",
    decision: "ALLOW",
    parent_event_id: "evt-001"
  });
  events[2].sequence = 3;
  events[2].event_id = "evt-web-effect";
  events[2].timestamp = "2026-07-27T00:00:01Z";
  events[2].source = "WEB";
  events[2].action = "send_email";
  events[2].decision = "ALLOW";
  events[2].critical_action = true;
  events[2].protected_effect = true;
  events[2].authorized = true;
  events[2].committed = true;
  events[2].authorization_event_id = "evt-auth";
  events[2].parent_event_id = "evt-auth";
  events[2].trace_complete = false;
  events[3].sequence = 4;
  events[3].parent_event_id = "evt-001";
}));

{
  const missing = path.join(mkdtempSync(path.join(tmpdir(), "robis-ltp-runtime-")), "missing.jsonl");
  const child = spawnSync(process.execPath, [path.resolve("scripts/ltp-inspect.mjs"), "trace", "--strict", "--quiet", "--format", "json", "--color", "never", "--input", missing], { encoding: "utf8" });
  assert.equal(child.status, 2);
  const output = JSON.parse(child.stderr.trim());
  assert.equal(output.verdict, "INCONCLUSIVE");
  results.push({ id: "20-inspector-runtime-failure", expected: "INCONCLUSIVE", observed: output.verdict, exit_code: child.status, issue_codes: output.issues.map((item) => item.code) });
}

const cleanText = jsonl(seal(baseEvents()));
const replayOne = canonicalize(replayTraceText(cleanText, { strict: true }));
const replayTwo = canonicalize(replayTraceText(cleanText, { strict: true }));
assert.equal(replayOne, replayTwo, "Replay outputs must be byte-identical after canonicalization");

const outputDir = process.env.LTP_TEST_OUTPUT_DIR;
if (outputDir) {
  writeFileSync(path.join(outputDir, "ltp-negative-results.json"), `${JSON.stringify({ results, replay_digest: sha256(replayOne) }, null, 2)}\n`);
}

console.log(`✅ LTP inspector: ${results.length} scenarios passed; deterministic replay digest ${sha256(replayOne)}.`);

export { baseEvents, seal, jsonl };
