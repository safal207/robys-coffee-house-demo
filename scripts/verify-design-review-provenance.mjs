#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MANIFEST = resolve(ROOT, "qa/design-review/episode-001/manifest.json");
export class DesignReviewEpisodeError extends Error {}

function need(value, message) {
  if (!value) throw new DesignReviewEpisodeError(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validateLocal(item, label, root) {
  need(item?.role === "non-authoritative-site-placeholder", `${label} must remain non-authoritative`);
  need(typeof item.path === "string" && item.path.length > 0, `${label}.path is required`);
  need(!item.path.startsWith("/") && !item.path.split("/").includes(".."), `${label}.path must stay inside the repository`);
  need(isDigest(item.sha256), `${label}.sha256 is invalid`);
  need(/^[a-f0-9]{40}$/.test(item.gitBlobSha || ""), `${label}.gitBlobSha is invalid`);
  need(Number.isInteger(item.byteLength) && item.byteLength >= 0, `${label}.byteLength is invalid`);
  const path = resolve(root, item.path);
  need(path.startsWith(`${resolve(root)}/`), `${label}.path escapes the repository`);
  const bytes = readFileSync(path);
  need(statSync(path).size === item.byteLength, `${label} byteLength mismatch`);
  need(createHash("sha256").update(bytes).digest("hex") === item.sha256, `${label} sha256 mismatch`);
}

export function loadManifest(path = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  need(manifest && typeof manifest === "object" && !Array.isArray(manifest), "manifest must be an object");
  return manifest;
}

export function validateManifest(manifest, root = ROOT) {
  need(manifest.contract === "ROBYS-DESIGN-REVIEW-001", "unexpected contract");
  need(manifest.version === 1, "unsupported version");
  need(manifest.issueRef === "safal207/robys-coffee-house-demo#162", "issueRef must bind to issue #162");
  need(manifest.authority === "review-experiment-only", "authority boundary is invalid");
  need(manifest.productionMutationAuthorized === false, "production mutation must remain unauthorized");

  const baseline = manifest.baseline;
  need(baseline?.officialIdentityStatus === "REAL_WORLD_EVIDENCE_FOUND_MASTER_ASSET_REQUIRED", "official identity status is invalid");
  need(baseline.officialMasterAssetPresent === false, "official master must remain absent until owner evidence is attached");
  need(/^[a-z0-9._]{3,30}$/.test(baseline.officialInstagramHandle || ""), "Instagram handle is invalid");
  for (const field of ["wordmark", "tagline", "symbolDescription", "accentObservation"]) {
    need(typeof baseline.observedIdentity?.[field] === "string" && baseline.observedIdentity[field].trim(), `observedIdentity.${field} is required`);
  }

  const evidence = baseline.realWorldEvidence;
  need(Array.isArray(evidence) && evidence.length >= 2, "at least two real-world evidence records are required");
  need(unique(evidence.map((item) => item.evidenceId)), "evidence ids must be unique");
  need(unique(evidence.map((item) => item.context)), "evidence contexts must be unique");
  need(unique(evidence.map((item) => item.sourceImage)), "evidence image URLs must be unique");
  evidence.forEach((item, index) => {
    const label = `realWorldEvidence[${index}]`;
    need(/^[A-Z0-9-]+$/.test(item.evidenceId || ""), `${label}.evidenceId is invalid`);
    need(typeof item.context === "string" && item.context.length > 0, `${label}.context is required`);
    need(typeof item.sourcePage === "string" && item.sourcePage.startsWith("https://"), `${label}.sourcePage must be HTTPS`);
    need(typeof item.sourceImage === "string" && item.sourceImage.startsWith("https://"), `${label}.sourceImage must be HTTPS`);
    need(/^\d{4}-\d{2}-\d{2}$/.test(item.retrievedOn || ""), `${label}.retrievedOn is invalid`);
    need(typeof item.observation === "string" && item.observation.trim().length >= 24, `${label}.observation is too weak`);
    need(item.authoritativeMasterAsset === false, `${label} must not claim master authority`);
    need(item.licenseStatus === "third-party-public-reference-only-not-cleared-for-republication", `${label}.licenseStatus is invalid`);
  });

  need(Array.isArray(baseline.repositoryPlaceholders) && baseline.repositoryPlaceholders.length >= 1, "repository placeholder evidence is required");
  baseline.repositoryPlaceholders.forEach((item, index) => validateLocal(item, `repositoryPlaceholders[${index}]`, root));
  need(Array.isArray(baseline.authoritativeSourceArtifacts) && baseline.authoritativeSourceArtifacts.length === 0, "authoritative source artifacts must remain empty");

  const labels = manifest.blindProtocol?.candidateLabels;
  need(Array.isArray(labels) && labels.length === 3 && unique(labels), "three unique opaque candidate labels are required");
  need(labels.every((label) => /^candidate-[a-z]+$/.test(label)), "candidate labels are invalid");
  need(manifest.blindProtocol.sourceRoleMappingVisibleToReviewers === false, "source-role mapping must stay hidden");
  need(manifest.blindProtocol.mappingDigest === null, "mapping digest must remain unset");

  need(Array.isArray(manifest.requiredContexts) && manifest.requiredContexts.length === 12 && unique(manifest.requiredContexts), "twelve unique contexts are required");
  need(Array.isArray(manifest.criteria) && manifest.criteria.length === 6, "six criteria are required");
  need(manifest.criteria.reduce((sum, item) => sum + item.weight, 0) === 100, "criterion weights must total 100");
  need(Array.isArray(manifest.candidatePackages) && manifest.candidatePackages.length === 0, "candidate packages must remain empty before official master evidence");
  need(manifest.status === "ARTIFACTS_REQUIRED", "status must remain ARTIFACTS_REQUIRED");
  need(manifest.reviewReady === false, "reviewReady must remain false");
  need(manifest.currentDecision === "INCONCLUSIVE", "decision must remain INCONCLUSIVE");
  need(Array.isArray(manifest.blockingReasons) && manifest.blockingReasons.some((reason) => /official master logo file/i.test(reason)), "official master blocker is required");

  return {
    episodeId: manifest.episodeId,
    status: manifest.status,
    officialMasterAssetPresent: false,
    realWorldEvidence: evidence.length,
    candidatePackages: 0,
    blockers: manifest.blockingReasons.length,
    currentDecision: manifest.currentDecision
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateManifest(loadManifest(process.argv[2]));
    Object.entries(result).forEach(([key, value]) => console.log(`${key.toUpperCase()}: ${value}`));
  } catch (error) {
    console.error(`INVALID: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
