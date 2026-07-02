import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { digestSnapshot, verifyReviewTrail } from "./verify-review-trail.mjs";

const HEAD_PATTERN = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`RRM-TRAIL-RECORD-001: ${message}`);
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail("expected --source, --output and optional --root");
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

function repositoryPath(ref, root) {
  if (typeof ref !== "string" || !ref.startsWith("repo:")) fail(`invalid repository evidence ref ${ref}`);
  const relativePath = ref.slice("repo:".length).replaceAll("\\", "/");
  const absolutePath = path.resolve(root, relativePath);
  const relative = path.relative(root, absolutePath);
  if (!relativePath || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`repository evidence escapes root: ${relativePath}`);
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    fail(`repository evidence does not exist: ${relativePath}`);
  }
  return { relativePath, absolutePath };
}

function digestFile(filePath) {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

function normalizeRoute(routeResult) {
  assertObject(routeResult, "routeResult");
  if (routeResult.contract !== "RRM-ROUTE-001") fail("routeResult has unexpected contract");
  if (!new Set(["SELECTED", "ESCALATE"]).has(routeResult.decision)) fail("routeResult has invalid decision");

  if (routeResult.decision === "SELECTED") {
    if (!Array.isArray(routeResult.stages) || routeResult.stages.length === 0) {
      fail("selected routeResult has no stages");
    }
    return {
      decision: "SELECTED",
      authority: routeResult.authority,
      selectionMode: routeResult.selectionMode,
      routeId: routeResult.routeId,
      proposedRouteId: null,
      routeKey: routeResult.routeKey,
      governanceExceptionRequired: routeResult.governanceExceptionRequired,
      reasons: [],
      stages: routeResult.stages.map((stage, index) => ({
        sequence: index + 1,
        id: stage.id,
        kind: stage.kind,
        actor: stage.actor,
        role: stage.role ?? null
      }))
    };
  }

  return {
    decision: "ESCALATE",
    authority: routeResult.authority,
    selectionMode: routeResult.selectionMode,
    routeId: null,
    proposedRouteId: routeResult.proposedRouteId,
    routeKey: null,
    governanceExceptionRequired: false,
    reasons: [...new Set(routeResult.reasons || [])],
    stages: []
  };
}

function normalizeEvidence(items, head, root) {
  if (!Array.isArray(items) || items.length === 0) fail("source evidence must not be empty");
  return items.map((item, index) => {
    assertObject(item, `evidence[${index}]`);
    const base = {
      id: item.id,
      kind: item.kind,
      ref: item.ref,
      head,
      observedAt: item.observedAt,
      authority: item.authority
    };

    if (item.kind === "repository") {
      const { relativePath, absolutePath } = repositoryPath(item.ref, root);
      return {
        ...base,
        digest: digestFile(absolutePath),
        snapshot: {
          path: relativePath,
          bytes: statSync(absolutePath).size
        }
      };
    }

    if (!("snapshot" in item)) fail(`${item.id || index} external evidence requires a snapshot`);
    return {
      ...base,
      digest: digestSnapshot(item.snapshot),
      snapshot: item.snapshot
    };
  });
}

export function recordReviewTrail(source, options = {}) {
  assertObject(source, "source");
  const root = path.resolve(options.root || process.cwd());
  if (!HEAD_PATTERN.test(source.head || "")) fail("source head must be an exact lowercase SHA");
  if (!Number.isInteger(source.prNumber) || source.prNumber < 1) fail("source prNumber must be positive");
  if (source.depthResult?.contract !== "RRM-DEPTH-001") fail("source depthResult has unexpected contract");
  if (source.routeResult?.head && source.routeResult.head !== source.head) fail("source routeResult is bound to another head");
  if (source.routeResult?.depth !== source.depthResult.depth) fail("source route and depth disagree");

  const trail = {
    contract: "RRM-TRAIL-001",
    schemaVersion: 1,
    trailId: `PR-${source.prNumber}@${source.head.slice(0, 12)}`,
    repository: source.repository,
    prNumber: source.prNumber,
    head: source.head,
    taskType: source.taskType,
    episodeStatus: source.episodeStatus,
    depth: source.depthResult.depth,
    route: normalizeRoute(source.routeResult),
    evidence: normalizeEvidence(source.evidence, source.head, root),
    findings: source.findings,
    outcome: source.outcome,
    repeatability: source.repeatability,
    recordedAt: source.recordedAt
  };

  verifyReviewTrail(trail, { root, schemaPath: options.schemaPath || "qa/review-trail.schema.json" });
  return trail;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.get("--root") || process.cwd());
  const sourcePath = path.resolve(root, args.get("--source"));
  const outputPath = path.resolve(root, args.get("--output"));
  const source = readJson(sourcePath, "review trail source");
  const trail = recordReviewTrail(source, { root });
  writeFileSync(outputPath, `${JSON.stringify(trail, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ trailId: trail.trailId, output: path.relative(root, outputPath) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
