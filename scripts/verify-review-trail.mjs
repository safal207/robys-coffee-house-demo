import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HEAD_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEPTHS = new Set(["L1", "L2", "L3", "L4"]);
const EPISODE_STATUSES = new Set(["IN_PROGRESS", "COMPLETED", "ABORTED"]);
const OUTCOME_STATUSES = new Set(["PENDING", "MERGED", "CLOSED_UNMERGED", "BLOCKED"]);
const ROUTE_DECISIONS = new Set(["SELECTED", "ESCALATE"]);
const STAGE_KINDS = new Set(["check", "review", "decision", "gate"]);
const EVIDENCE_KINDS = new Set(["repository", "github", "manual"]);
const EVIDENCE_AUTHORITIES = new Set(["supporting", "binding"]);
const GITHUB_REF_PATTERN = /^github:(?:pull|comment|review|actions\/run)\/[1-9][0-9]*$/;
const MANUAL_REF_PATTERN = /^manual:[A-Za-z0-9_.-]+$/;

function fail(message) {
  throw new Error(`RRM-TRAIL-001: ${message}`);
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("expected --trail, --schema and optional --root");
    args.set(key, value);
  }
  return args;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error.message}`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
}

function assertExactKeys(value, required, allowed, label) {
  assertObject(value, label);
  for (const key of required) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${label} contains unexpected ${key}`);
  }
}

function assertString(value, label, minimumLength = 1) {
  if (typeof value !== "string" || value.trim().length < minimumLength) fail(`${label} must be a non-empty string`);
}

function assertDateTime(value, label) {
  assertString(value, label);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || !value.includes("T")) fail(`${label} must be an ISO date-time`);
  return timestamp;
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

export function digestSnapshot(snapshot) {
  return `sha256:${createHash("sha256").update(stableStringify(snapshot)).digest("hex")}`;
}

function digestFile(filePath) {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

function isOutsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

function repositoryEvidencePath(ref, root) {
  if (typeof ref !== "string" || !ref.startsWith("repo:")) {
    fail(`repository evidence ref must start with repo: ${ref}`);
  }
  const relativePath = ref.slice("repo:".length).replaceAll("\\", "/");
  if (!relativePath || path.posix.isAbsolute(relativePath)) {
    fail(`repository evidence path is invalid: ${relativePath}`);
  }

  const lexicalRoot = path.resolve(root);
  const lexicalTarget = path.resolve(lexicalRoot, relativePath);
  if (isOutsideRoot(lexicalRoot, lexicalTarget)) {
    fail(`repository evidence escapes root: ${relativePath}`);
  }
  if (!existsSync(lexicalTarget)) {
    fail(`repository evidence does not exist: ${relativePath}`);
  }

  const realRoot = realpathSync(lexicalRoot);
  const realTarget = realpathSync(lexicalTarget);
  if (isOutsideRoot(realRoot, realTarget)) {
    fail(`repository evidence resolves outside root: ${relativePath}`);
  }
  const targetStat = statSync(realTarget);
  if (!targetStat.isFile()) {
    fail(`repository evidence is not a file: ${relativePath}`);
  }

  return {
    relativePath,
    absolutePath: realTarget,
    bytes: targetStat.size
  };
}

function validateSchemaContract(schema) {
  assertObject(schema, "schema");
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") fail("unsupported JSON schema draft");
  if (schema.type !== "object" || schema.additionalProperties !== false) fail("schema root must be a closed object");
  if (schema.properties?.contract?.const !== "RRM-TRAIL-001") fail("schema contract changed");
  if (schema.properties?.schemaVersion?.const !== 1) fail("schema version changed");
  const required = [
    "contract", "schemaVersion", "trailId", "repository", "prNumber", "head", "taskType",
    "episodeStatus", "depth", "route", "evidence", "findings", "outcome", "repeatability", "recordedAt"
  ];
  if (!Array.isArray(schema.required) || !required.every((key) => schema.required.includes(key))) {
    fail("schema required fields are incomplete");
  }
}

function validateRoute(route) {
  const keys = [
    "decision", "authority", "selectionMode", "routeId", "proposedRouteId", "routeKey",
    "governanceExceptionRequired", "reasons", "stages"
  ];
  assertExactKeys(route, keys, keys, "route");
  if (!ROUTE_DECISIONS.has(route.decision)) fail(`route has invalid decision ${route.decision}`);
  if (route.authority !== "route-selection-only") fail("route authority must remain route-selection-only");
  if (!new Set(["automatic", "override"]).has(route.selectionMode)) fail("route selectionMode is invalid");
  if (typeof route.governanceExceptionRequired !== "boolean") fail("route governanceExceptionRequired must be boolean");
  if (!Array.isArray(route.reasons)) fail("route reasons must be an array");
  unique(route.reasons, "route reason");
  route.reasons.forEach((reason, index) => assertString(reason, `route.reasons[${index}]`));
  if (!Array.isArray(route.stages)) fail("route stages must be an array");

  if (route.decision === "SELECTED") {
    assertString(route.routeId, "route.routeId");
    assertString(route.routeKey, "route.routeKey");
    if (route.proposedRouteId !== null) fail("selected route proposedRouteId must be null");
    if (route.reasons.length !== 0) fail("selected route cannot contain escalation reasons");
    if (route.stages.length === 0) fail("selected route must contain ordered stages");
    if (route.selectionMode === "override" && route.governanceExceptionRequired !== true) {
      fail("selected override route must require a governance exception");
    }
    if (route.selectionMode === "automatic" && route.governanceExceptionRequired !== false) {
      fail("selected automatic route cannot require a governance exception");
    }
  } else {
    if (route.routeId !== null || route.routeKey !== null) fail("escalated route cannot claim a selected route");
    assertString(route.proposedRouteId, "route.proposedRouteId");
    if (route.reasons.length === 0) fail("escalated route must explain its reasons");
    if (route.stages.length !== 0) fail("escalated route cannot claim executed stages");
    if (route.governanceExceptionRequired !== false) {
      fail("escalated route cannot claim a selected-route governance exception");
    }
  }

  unique(route.stages.map((stage) => stage.id), "route stage id");
  for (const [index, stage] of route.stages.entries()) {
    const stageKeys = ["sequence", "id", "kind", "actor", "role"];
    assertExactKeys(stage, stageKeys, stageKeys, `route.stages[${index}]`);
    if (stage.sequence !== index + 1) fail(`route stage sequence must be contiguous at ${stage.id}`);
    assertString(stage.id, `route.stages[${index}].id`);
    if (!STAGE_KINDS.has(stage.kind)) fail(`route stage ${stage.id} has invalid kind ${stage.kind}`);
    assertString(stage.actor, `route.stages[${index}].actor`);
    if (stage.role !== null) assertString(stage.role, `route.stages[${index}].role`);
  }
}

function validateEvidence(evidence, trailHead, recordedAt, root) {
  if (!Array.isArray(evidence) || evidence.length === 0) fail("evidence must contain at least one item");
  unique(evidence.map((item) => item.id), "evidence id");
  const evidenceIds = new Set();
  let bindingEvidenceCount = 0;
  let latestObservedAt = 0;

  for (const [index, item] of evidence.entries()) {
    const keys = ["id", "kind", "ref", "head", "observedAt", "authority", "digest", "snapshot"];
    assertExactKeys(item, keys, keys, `evidence[${index}]`);
    if (!ID_PATTERN.test(item.id)) fail(`evidence[${index}].id is invalid`);
    evidenceIds.add(item.id);
    if (!EVIDENCE_KINDS.has(item.kind)) fail(`${item.id} has invalid kind ${item.kind}`);
    assertString(item.ref, `${item.id}.ref`, 3);
    if (item.head !== trailHead) fail(`${item.id} is bound to a stale head`);
    const observedAt = assertDateTime(item.observedAt, `${item.id}.observedAt`);
    latestObservedAt = Math.max(latestObservedAt, observedAt);
    if (!EVIDENCE_AUTHORITIES.has(item.authority)) fail(`${item.id} has invalid authority ${item.authority}`);
    if (item.authority === "binding") bindingEvidenceCount += 1;
    if (!DIGEST_PATTERN.test(item.digest)) fail(`${item.id} has invalid digest`);

    if (item.kind === "repository") {
      const repositoryFile = repositoryEvidencePath(item.ref, root);
      assertExactKeys(item.snapshot, ["path", "bytes"], ["path", "bytes"], `${item.id}.snapshot`);
      if (item.snapshot.path !== repositoryFile.relativePath) {
        fail(`${item.id} repository snapshot path mismatch`);
      }
      if (!Number.isInteger(item.snapshot.bytes) || item.snapshot.bytes < 0) {
        fail(`${item.id} repository snapshot bytes are invalid`);
      }
      if (item.snapshot.bytes !== repositoryFile.bytes) {
        fail(`${item.id} repository snapshot bytes mismatch`);
      }
      if (item.digest !== digestFile(repositoryFile.absolutePath)) {
        fail(`${item.id} repository digest mismatch`);
      }
    } else {
      if (item.kind === "github" && !GITHUB_REF_PATTERN.test(item.ref)) fail(`${item.id} has invalid GitHub ref`);
      if (item.kind === "manual" && !MANUAL_REF_PATTERN.test(item.ref)) fail(`${item.id} has invalid manual ref`);
      if (item.digest !== digestSnapshot(item.snapshot)) fail(`${item.id} snapshot digest mismatch`);
    }
  }

  if (latestObservedAt > recordedAt) fail("trail was recorded before its latest evidence");
  return { evidenceIds, bindingEvidenceCount };
}

function validateFindings(findings, evidenceIds) {
  const categories = ["accepted", "rejected", "advisory"];
  assertExactKeys(findings, categories, categories, "findings");
  const allIds = [];
  for (const category of categories) {
    if (!Array.isArray(findings[category])) fail(`findings.${category} must be an array`);
    for (const [index, finding] of findings[category].entries()) {
      const keys = ["id", "source", "summary", "evidenceIds"];
      assertExactKeys(finding, keys, keys, `findings.${category}[${index}]`);
      if (!ID_PATTERN.test(finding.id)) fail(`finding id is invalid: ${finding.id}`);
      allIds.push(finding.id);
      assertString(finding.source, `${finding.id}.source`, 2);
      assertString(finding.summary, `${finding.id}.summary`, 8);
      if (!Array.isArray(finding.evidenceIds) || finding.evidenceIds.length === 0) {
        fail(`${finding.id} must reference evidence`);
      }
      unique(finding.evidenceIds, `${finding.id} evidence reference`);
      for (const evidenceId of finding.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) fail(`${finding.id} references unknown evidence ${evidenceId}`);
      }
    }
  }
  unique(allIds, "finding id");
}

function validateOutcome(trail, recordedAt) {
  const outcomeKeys = ["status", "mergeSha", "completedAt", "governanceException"];
  assertExactKeys(trail.outcome, outcomeKeys, outcomeKeys, "outcome");
  if (!OUTCOME_STATUSES.has(trail.outcome.status)) fail(`outcome has invalid status ${trail.outcome.status}`);
  if (trail.outcome.governanceException !== null) {
    assertString(trail.outcome.governanceException, "outcome.governanceException");
  }

  if (trail.episodeStatus === "IN_PROGRESS") {
    if (trail.outcome.status !== "PENDING") fail("in-progress trail cannot claim a terminal outcome");
    if (trail.outcome.mergeSha !== null || trail.outcome.completedAt !== null) {
      fail("in-progress trail cannot contain merge or completion evidence");
    }
    if (trail.repeatability.shouldRepeatRoute !== null) {
      fail("in-progress trail cannot decide route repeatability");
    }
    return;
  }

  if (trail.outcome.status === "PENDING") fail("terminal episode cannot remain pending");
  const completedAt = assertDateTime(trail.outcome.completedAt, "outcome.completedAt");
  if (completedAt > recordedAt) fail("trail was recorded before outcome completion");

  if (trail.outcome.status === "MERGED") {
    if (!HEAD_PATTERN.test(trail.outcome.mergeSha || "")) fail("merged outcome requires an exact merge SHA");
  } else if (trail.outcome.mergeSha !== null) {
    fail("non-merged outcome cannot contain a merge SHA");
  }

  if (trail.episodeStatus === "ABORTED" && !new Set(["CLOSED_UNMERGED", "BLOCKED"]).has(trail.outcome.status)) {
    fail("aborted trail must end closed-unmerged or blocked");
  }
  if (trail.route.decision === "ESCALATE" && trail.outcome.status === "MERGED") {
    if (!trail.outcome.governanceException) fail("merged escalation requires a governance exception");
    if (trail.repeatability.shouldRepeatRoute !== false) fail("an escalated route cannot be marked repeatable");
  }
  if (trail.route.governanceExceptionRequired && trail.outcome.status === "MERGED" && !trail.outcome.governanceException) {
    fail("selected exception route requires a governance exception in the outcome");
  }
}

export function verifyReviewTrail(trail, options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const schema = options.schema || readJson(
    path.resolve(root, options.schemaPath || "qa/review-trail.schema.json"),
    "review trail schema"
  );
  validateSchemaContract(schema);

  const rootKeys = [
    "contract", "schemaVersion", "trailId", "repository", "prNumber", "head", "taskType",
    "episodeStatus", "depth", "route", "evidence", "findings", "outcome", "repeatability", "recordedAt"
  ];
  assertExactKeys(trail, rootKeys, rootKeys, "trail");
  if (trail.contract !== "RRM-TRAIL-001") fail("unexpected trail contract");
  if (trail.schemaVersion !== 1) fail("unsupported trail schemaVersion");
  if (!Number.isInteger(trail.prNumber) || trail.prNumber < 1) fail("prNumber must be a positive integer");
  if (!HEAD_PATTERN.test(trail.head || "")) fail("head must be an exact lowercase SHA");
  const expectedTrailId = `PR-${trail.prNumber}@${trail.head.slice(0, 12)}`;
  if (trail.trailId !== expectedTrailId) fail(`trailId must be ${expectedTrailId}`);
  if (!REPOSITORY_PATTERN.test(trail.repository || "")) fail("repository must be owner/name");
  assertString(trail.taskType, "taskType", 3);
  if (!EPISODE_STATUSES.has(trail.episodeStatus)) fail(`invalid episodeStatus ${trail.episodeStatus}`);
  if (!DEPTHS.has(trail.depth)) fail(`invalid depth ${trail.depth}`);
  const recordedAt = assertDateTime(trail.recordedAt, "recordedAt");

  validateRoute(trail.route);
  const { evidenceIds, bindingEvidenceCount } = validateEvidence(
    trail.evidence,
    trail.head,
    recordedAt,
    root
  );
  if (trail.episodeStatus !== "IN_PROGRESS" && bindingEvidenceCount < 1) {
    fail("terminal trail requires at least one binding evidence item");
  }
  validateFindings(trail.findings, evidenceIds);

  const repeatabilityKeys = ["shouldRepeatRoute", "needsMoreRuns", "reason"];
  assertExactKeys(trail.repeatability, repeatabilityKeys, repeatabilityKeys, "repeatability");
  if (![true, false, null].includes(trail.repeatability.shouldRepeatRoute)) {
    fail("repeatability.shouldRepeatRoute must be boolean or null");
  }
  if (typeof trail.repeatability.needsMoreRuns !== "boolean") fail("repeatability.needsMoreRuns must be boolean");
  assertString(trail.repeatability.reason, "repeatability.reason", 12);

  validateOutcome(trail, recordedAt);

  return {
    contract: trail.contract,
    valid: true,
    trailId: trail.trailId,
    head: trail.head,
    episodeStatus: trail.episodeStatus,
    routeDecision: trail.route.decision,
    outcome: trail.outcome.status,
    evidenceCount: trail.evidence.length,
    bindingEvidenceCount,
    findingCount: Object.values(trail.findings).reduce((total, list) => total + list.length, 0)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.get("--root") || process.cwd());
  const trail = readJson(path.resolve(root, args.get("--trail")), "review trail");
  const schemaPath = args.get("--schema") || "qa/review-trail.schema.json";
  const result = verifyReviewTrail(trail, { root, schemaPath });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
