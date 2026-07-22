import assert from "node:assert/strict";
import { loadPacket, validatePacket } from "../scripts/validate-robis-causal-deep-audit-v0.1.mjs";

const original = loadPacket();
const clone = () => structuredClone(original);

assert.deepEqual(validatePacket(original), [], "canonical packet must validate");

{
  const packet = clone();
  packet.source_identity.head_sha = "0".repeat(40);
  assert(
    validatePacket(packet).some((error) => error.includes("audited PR 239 head SHA")),
    "wrong exact head must fail closed"
  );
}

{
  const packet = clone();
  packet.verdict.state = "CONFIRMED_DEFECT";
  packet.verdict.gate = "ALLOW_REPORT";
  const errors = validatePacket(packet);
  assert(
    errors.some((error) => error.includes("failed evidence"))
      || errors.some((error) => error.includes("preserve HOLD")),
    "failed evidence must not become an allow verdict"
  );
}

{
  const packet = clone();
  packet.findings[0].reproduction_status = "NOT_RUN";
  assert(
    validatePacket(packet).some((error) => error.includes("confirmed defects must be reproduced")),
    "unreproduced confirmed defect must be rejected"
  );
}

{
  const packet = clone();
  packet.findings[2].impact_class = "MEASURED";
  packet.evidence_ledger = packet.evidence_ledger.filter(
    (entry) => !(entry.type === "measurement" && entry.status === "PASS")
  );
  assert(
    validatePacket(packet).some((error) => error.includes("MEASURED impact")),
    "financial/product measurement claims require successful measurement evidence"
  );
}

{
  const packet = clone();
  packet.authority.prohibited = packet.authority.prohibited.filter((item) => item !== "merge");
  assert(
    validatePacket(packet).some((error) => error.includes("must prohibit: merge")),
    "audit must not expand itself into merge authority"
  );
}

console.log("Robis causal deep-audit negative contract tests passed.");
