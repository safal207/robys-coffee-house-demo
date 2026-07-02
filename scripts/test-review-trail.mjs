import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { recordReviewTrail } from "./record-review-trail.mjs";
import { verifyReviewTrail } from "./verify-review-trail.mjs";

const ROOT = process.cwd();
const SOURCE = JSON.parse(readFileSync("qa/fixtures/review-trails/pr-152-source.json", "utf8"));
const EXPECTED_PATH = "reports/review-trails/PR-152@c11f1721673b.json";
const EXPECTED = JSON.parse(readFileSync(EXPECTED_PATH, "utf8"));
const SCHEMA = JSON.parse(readFileSync("qa/review-trail.schema.json", "utf8"));

function expectFailure(label, expectedText, action) {
  try {
    action();
  } catch (error) {
    if (error.message.includes(expectedText)) return;
    throw new Error(`${label} failed for the wrong reason: ${error.message}`);
  }
  throw new Error(`${label} should fail with ${expectedText}`);
}

const generated = recordReviewTrail(SOURCE, { root: ROOT });
if (`${JSON.stringify(generated, null, 2)}\n` !== readFileSync(EXPECTED_PATH, "utf8")) {
  throw new Error("committed PR-152 trail does not match deterministic recorder output");
}
const result = verifyReviewTrail(EXPECTED, { root: ROOT, schema: SCHEMA });
if (!result.valid || result.outcome !== "MERGED" || result.routeDecision !== "ESCALATE") {
  throw new Error(`unexpected valid trail result: ${JSON.stringify(result)}`);
}

expectFailure("stale evidence head", "bound to a stale head", () => {
  const changed = structuredClone(EXPECTED);
  changed.evidence[0].head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("snapshot digest mutation", "snapshot digest mismatch", () => {
  const changed = structuredClone(EXPECTED);
  changed.evidence.find((item) => item.id === "codex-runtime").snapshot.status = "AVAILABLE";
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("unknown finding evidence", "references unknown evidence", () => {
  const changed = structuredClone(EXPECTED);
  changed.findings.advisory[0].evidenceIds.push("missing-evidence");
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("merged escalation without exception", "merged escalation requires a governance exception", () => {
  const changed = structuredClone(EXPECTED);
  changed.outcome.governanceException = null;
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("repeat escalated route", "cannot be marked repeatable", () => {
  const changed = structuredClone(EXPECTED);
  changed.repeatability.shouldRepeatRoute = true;
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("in-progress merged outcome", "in-progress trail cannot claim a terminal outcome", () => {
  const changed = structuredClone(EXPECTED);
  changed.episodeStatus = "IN_PROGRESS";
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("merged without merge SHA", "merged outcome requires an exact merge SHA", () => {
  const changed = structuredClone(EXPECTED);
  changed.outcome.mergeSha = null;
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("recorded before evidence", "recorded before its latest evidence", () => {
  const changed = structuredClone(EXPECTED);
  changed.recordedAt = "2026-07-02T12:20:00Z";
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

expectFailure("weakened schema", "schema contract changed", () => {
  const changedSchema = structuredClone(SCHEMA);
  changedSchema.properties.contract.const = "RRM-TRAIL-000";
  verifyReviewTrail(EXPECTED, { root: ROOT, schema: changedSchema });
});

expectFailure("repository path escape", "escapes root", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "rrm-trail-"));
  try {
    const changed = structuredClone(SOURCE);
    changed.evidence.push({
      id: "escaped-repository-file",
      kind: "repository",
      ref: "repo:../outside.json",
      observedAt: "2026-07-02T12:30:00Z",
      authority: "supporting"
    });
    writeFileSync(path.join(directory, "outside.json"), "{}\n");
    recordReviewTrail(changed, { root: directory, schemaPath: path.join(ROOT, "qa/review-trail.schema.json") });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const selected = structuredClone(EXPECTED);
selected.route = {
  decision: "SELECTED",
  authority: "route-selection-only",
  selectionMode: "automatic",
  routeId: "route-l3-standard",
  proposedRouteId: null,
  routeKey: "rrm-route.v1:L3:route-l3-standard:coderabbit>codex>human-maintainer",
  governanceExceptionRequired: false,
  reasons: [],
  stages: [
    { sequence: 1, id: "trace-pdg", kind: "check", actor: "system", role: null },
    { sequence: 2, id: "risk-review", kind: "review", actor: "coderabbit", role: "risk_critic" }
  ]
};
selected.outcome.governanceException = null;
selected.repeatability.shouldRepeatRoute = true;
verifyReviewTrail(selected, { root: ROOT, schema: SCHEMA });

expectFailure("route sequence gap", "sequence must be contiguous", () => {
  const changed = structuredClone(selected);
  changed.route.stages[1].sequence = 3;
  verifyReviewTrail(changed, { root: ROOT, schema: SCHEMA });
});

console.log("✅ RRM-TRAIL-001 mutation tests passed: deterministic recording, exact-head evidence, terminal outcomes, escalation governance and route ordering.");
