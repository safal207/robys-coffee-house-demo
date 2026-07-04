#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MANIFEST = resolve(
  ROOT,
  "qa/design-review/episode-001/manifest.json"
);

export class DesignReviewEpisodeError extends Error {}

function require(condition, message) {
  if (!condition) throw new DesignReviewEpisodeError(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function loadManifest(path = DEFAULT_MANIFEST) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  require(parsed && typeof parsed === "object" && !Array.isArray(parsed), "manifest must be a JSON object");
  return parsed;
}

export function validateManifest(manifest, root = ROOT) {
  require(manifest.contract === "ROBYS-DESIGN-REVIEW-001", "unsupported design review contract");
  require(manifest.version === 1, "unsupported design review contract version");
  require(manifest.episodeId === "DESIGN-REVIEW-EPISODE-001", "episodeId is invalid");
  require(manifest.issueRef === "safal207/robys-coffee-house-demo#162", "issueRef must bind to issue #162");
  require(manifest.authority === "review-experiment-only", "authority boundary is invalid");
  require(manifest.productionMutationAuthorized === false, "design review must not authorize production mutation");

  const sources = manifest.baseline?.sourceArtifacts;
  require(Array.isArray(sources) && sources.length >= 1, "at least one baseline source artifact is required");
  for (const [index, artifact] of sources.entries()) {
    require(artifact && typeof artifact === "object" && !Array.isArray(artifact), `sourceArtifacts[${index}] must be an object`);
    require(typeof artifact.path === "string" && artifact.path.length > 0, `sourceArtifacts[${index}].path is required`);
    require(!artifact.path.startsWith("/") && !artifact.path.split("/").includes(".."), `sourceArtifacts[${index}].path must stay inside the repository`);
    require(isDigest(artifact.sha256), `sourceArtifacts[${index}].sha256 is invalid`);
    require(typeof artifact.gitBlobSha === "string" && /^[a-f0-9]{40}$/.test(artifact.gitBlobSha), `sourceArtifacts[${index}].gitBlobSha is invalid`);
    require(Number.isInteger(artifact.byteLength) && artifact.byteLength >= 0, `sourceArtifacts[${index}].byteLength is invalid`);

    const absolute = resolve(root, artifact.path);
    require(absolute.startsWith(`${resolve(root)}/`) || absolute === resolve(root), `sourceArtifacts[${index}].path escapes the repository`);
    const bytes = readFileSync(absolute);
    require(statSync(absolute).size === artifact.byteLength, `sourceArtifacts[${index}] byteLength mismatch`);
    require(sha256(bytes) === artifact.sha256, `sourceArtifacts[${index}] sha256 mismatch`);
  }

  const labels = manifest.blindProtocol?.candidateLabels;
  require(Array.isArray(labels) && labels.length === 3 && unique(labels), "exactly three unique blind candidate labels are required");
  require(labels.every((label) => /^candidate-[a-z]+$/.test(label)), "candidate labels must be opaque canonical identifiers");
  require(manifest.blindProtocol.sourceRoleMappingVisibleToReviewers === false, "source-role mapping must remain hidden from reviewers");
  require(manifest.blindProtocol.mappingRevealAllowedAfterFindingsFrozen === true, "mapping reveal must be delayed until findings are frozen");
  require(manifest.blindProtocol.reviewerConflictDisclosureRequired === true, "reviewer conflict disclosure is required");

  const contexts = manifest.requiredContexts;
  require(Array.isArray(contexts) && contexts.length === 12 && unique(contexts), "requiredContexts must contain 12 unique contexts");

  const criteria = manifest.criteria;
  require(Array.isArray(criteria) && criteria.length === 6, "six weighted criteria are required");
  require(unique(criteria.map((criterion) => criterion.id)), "criterion ids must be unique");
  require(criteria.every((criterion) => Number.isInteger(criterion.weight) && criterion.weight > 0), "criterion weights must be positive integers");
  require(criteria.reduce((total, criterion) => total + criterion.weight, 0) === 100, "criterion weights must total 100");

  const packages = manifest.candidatePackages;
  require(Array.isArray(packages), "candidatePackages must be an array");
  for (const [index, candidate] of packages.entries()) {
    require(candidate && typeof candidate === "object" && !Array.isArray(candidate), `candidatePackages[${index}] must be an object`);
    require(labels.includes(candidate.label), `candidatePackages[${index}].label is not declared`);
    require(!("role" in candidate) && !("sourceRole" in candidate), `candidatePackages[${index}] must not disclose source role`);
  }

  require(Array.isArray(manifest.allowedDecisionStates), "allowedDecisionStates must be an array");
  require(manifest.allowedDecisionStates.includes(manifest.currentDecision), "currentDecision is not allowed");

  if (manifest.reviewReady) {
    require(manifest.status === "REVIEW_READY", "reviewReady requires REVIEW_READY status");
    require(packages.length === 3, "reviewReady requires three candidate packages");
    require(unique(packages.map((candidate) => candidate.label)), "reviewReady candidate labels must be unique");
    require(packages.every((candidate) => Array.isArray(candidate.contexts) && candidate.contexts.length === contexts.length && contexts.every((context) => candidate.contexts.includes(context))), "every review-ready candidate must contain every required context");
    require(isDigest(manifest.blindProtocol.mappingDigest), "reviewReady requires a sealed mapping digest");
    require(manifest.controlledDefect.declaredBeforeReview === true, "reviewReady requires a predeclared controlled defect");
    require(isDigest(manifest.controlledDefect.sealedKeyDigest), "reviewReady requires a sealed controlled-defect digest");
    require(manifest.controlledDefect.revealed === false, "controlled defect must remain sealed before review");
    require(manifest.currentDecision === "INCONCLUSIVE", "no final design decision is allowed before findings");
  } else {
    require(manifest.status === "ARTIFACTS_REQUIRED", "blocked readiness requires ARTIFACTS_REQUIRED status");
    require(Array.isArray(manifest.blockingReasons) && manifest.blockingReasons.length > 0, "blocked readiness requires explicit reasons");
    require(manifest.currentDecision === "INCONCLUSIVE", "blocked readiness must remain INCONCLUSIVE");
    require(manifest.blindProtocol.mappingDigest === null, "unfrozen candidate mapping must not claim a digest");
    require(manifest.controlledDefect.declaredBeforeReview === false, "unfrozen controlled defect must not be declared complete");
    require(manifest.controlledDefect.sealedKeyDigest === null, "unfrozen controlled defect must not claim a digest");
  }

  return {
    episodeId: manifest.episodeId,
    status: manifest.status,
    reviewReady: manifest.reviewReady,
    candidatePackages: packages.length,
    blockers: manifest.blockingReasons?.length || 0,
    currentDecision: manifest.currentDecision
  };
}

function main() {
  const manifestPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_MANIFEST;
  try {
    const summary = validateManifest(loadManifest(manifestPath));
    console.log(`VALID: ${summary.episodeId}`);
    console.log(`STATE: ${summary.status}`);
    console.log(`REVIEW_READY: ${summary.reviewReady}`);
    console.log(`CANDIDATE_PACKAGES: ${summary.candidatePackages}`);
    console.log(`BLOCKERS: ${summary.blockers}`);
    console.log(`DECISION: ${summary.currentDecision}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`INVALID: ${message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
