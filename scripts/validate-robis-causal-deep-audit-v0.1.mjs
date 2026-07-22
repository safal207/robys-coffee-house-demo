import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_PACKET = "audits/robis/causal-deep-audit-v0.1/audit-packet.json";
const SHA40 = /^[0-9a-f]{40}$/;
const ALLOWED_STATES = new Set([
  "NOT_RUN",
  "NEEDS_EVIDENCE",
  "PRODUCT_SIGNAL",
  "CONFIRMED_PRODUCT_DEFECT_CANDIDATE",
  "CONFIRMED_DEFECT",
  "BLOCKED_BY_BOUNDARY",
  "INCOMPLETE",
  "HOLD",
  "READY_WITH_ADVISORY_GAPS"
]);
const ALLOWED_GATES = new Set(["ALLOW_REPORT", "ESCALATE", "BLOCK"]);
const FAILURE_EVIDENCE = new Set(["FAIL", "NOT_RUN", "UNAVAILABLE", "STALE", "INCOMPLETE"]);

export function validatePacket(packet) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (packet.schema_version !== "liminalqa-causal-deep-audit-packet-v0.1") {
    fail("unsupported schema_version");
  }
  if (!packet.audit_id) fail("audit_id is required");
  if (!ALLOWED_STATES.has(packet.verdict?.state)) fail("invalid verdict state");
  if (!ALLOWED_GATES.has(packet.verdict?.gate)) fail("invalid verdict gate");

  const mainSha = packet.source_identity?.base_sha;
  const prHead = packet.source_identity?.head_sha;
  if (!SHA40.test(mainSha ?? "")) fail("base_sha must be a 40-character lowercase SHA");
  if (!SHA40.test(prHead ?? "")) fail("head_sha must be a 40-character lowercase SHA");
  if (mainSha !== "2fcc1de1a44093da399968f9474b30e6213bd793") {
    fail("packet is not bound to the audited main SHA");
  }
  if (prHead !== "5af1042be08bf2b2a492b2ce160402b4d758c59d") {
    fail("packet is not bound to the audited PR 239 head SHA");
  }

  const prohibited = new Set(packet.authority?.prohibited ?? []);
  for (const capability of ["merge", "deploy", "contact the cafe or third parties"]) {
    if (!prohibited.has(capability)) fail(`authority boundary must prohibit: ${capability}`);
  }

  const findings = Array.isArray(packet.findings) ? packet.findings : [];
  if (findings.length < 9) fail("expected at least nine bounded findings");
  const findingIds = findings.map((finding) => finding.finding_id);
  if (new Set(findingIds).size !== findingIds.length) fail("finding_id values must be unique");

  for (const finding of findings) {
    if (!finding.finding_id || !finding.title) fail("every finding needs an id and title");
    if (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) {
      fail(`${finding.finding_id}: confidence must be between 0 and 1`);
    }
    if (finding.claim_level === "CONFIRMED_DEFECT" && finding.reproduction_status !== "REPRODUCED") {
      fail(`${finding.finding_id}: confirmed defects must be reproduced`);
    }
    if (!Array.isArray(finding.evidence_refs) || finding.evidence_refs.length === 0) {
      fail(`${finding.finding_id}: evidence_refs are required`);
    }
    if (!Array.isArray(finding.competing_explanations) || finding.competing_explanations.length === 0) {
      fail(`${finding.finding_id}: at least one competing explanation is required`);
    }
    if (!finding.next_discriminating_test) {
      fail(`${finding.finding_id}: next_discriminating_test is required`);
    }
    if (!finding.authority_boundary) {
      fail(`${finding.finding_id}: authority_boundary is required`);
    }
  }

  const ledger = Array.isArray(packet.evidence_ledger) ? packet.evidence_ledger : [];
  const evidenceIds = new Set(ledger.map((entry) => entry.evidence_id));
  for (const finding of findings) {
    for (const ref of finding.evidence_refs ?? []) {
      if (!evidenceIds.has(ref)) fail(`${finding.finding_id}: unknown evidence ref ${ref}`);
    }
  }

  const hasFailureEvidence = ledger.some((entry) => FAILURE_EVIDENCE.has(entry.status));
  if (hasFailureEvidence && packet.verdict?.state !== "HOLD" && packet.verdict?.gate === "ALLOW_REPORT") {
    fail("load-bearing failed evidence cannot produce an ALLOW_REPORT non-HOLD verdict");
  }
  if (packet.verdict?.state !== "HOLD") fail("this exact packet must preserve HOLD");
  if (packet.verdict?.gate !== "ESCALATE") fail("this exact packet must preserve ESCALATE");

  const measuredFindings = findings.filter((finding) => finding.impact_class === "MEASURED");
  const measurementEvidence = ledger.filter(
    (entry) => entry.type === "measurement" && entry.status === "PASS"
  );
  if (measuredFindings.length > 0 && measurementEvidence.length === 0) {
    fail("MEASURED impact requires successful measurement evidence");
  }

  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0) {
    fail("limitations are required");
  }
  if (!packet.next_action?.completion_signal || !packet.next_action?.stop_condition) {
    fail("next_action requires completion_signal and stop_condition");
  }

  return errors;
}

export function loadPacket(path = DEFAULT_PACKET) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  const path = process.argv[2] ?? DEFAULT_PACKET;
  const packet = loadPacket(path);
  const errors = validatePacket(packet);
  if (errors.length > 0) {
    console.error("Robis causal deep-audit validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Validated ${packet.audit_id}: ${packet.findings.length} findings, verdict ${packet.verdict.state}/${packet.verdict.gate}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
