#!/usr/bin/env node
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DesignReviewEpisodeError, loadManifest, validateManifest } from "./verify-design-review-provenance.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const copy = (value) => JSON.parse(JSON.stringify(value));

function invalid(change, pattern) {
  const manifest = copy(loadManifest());
  change(manifest);
  assert.throws(
    () => validateManifest(manifest, ROOT),
    (error) => error instanceof DesignReviewEpisodeError && pattern.test(error.message)
  );
}

const result = validateManifest(loadManifest(), ROOT);
assert.equal(result.episodeId, "DESIGN-REVIEW-EPISODE-001");
assert.equal(result.status, "ARTIFACTS_REQUIRED");
assert.equal(result.officialMasterAssetPresent, false);
assert.equal(result.realWorldEvidence, 2);
assert.equal(result.candidatePackages, 0);
assert.equal(result.blockers, 5);
assert.equal(result.currentDecision, "INCONCLUSIVE");

invalid((m) => { m.baseline.repositoryPlaceholders[0].sha256 = "0".repeat(64); }, /sha256 mismatch/);
invalid((m) => { m.baseline.realWorldEvidence[0].authoritativeMasterAsset = true; }, /master authority/);
invalid((m) => { m.baseline.realWorldEvidence[1].sourceImage = m.baseline.realWorldEvidence[0].sourceImage; }, /image URLs must be unique/);
invalid((m) => { m.baseline.officialInstagramHandle = "invalid value"; }, /Instagram handle is invalid/);
invalid((m) => { m.candidatePackages = [{ label: "candidate-amber" }]; }, /must remain empty/);
invalid((m) => { m.reviewReady = true; }, /reviewReady must remain false/);
invalid((m) => { m.currentDecision = "ACCEPT"; }, /decision must remain INCONCLUSIVE/);

console.log("PASS: real-world logo provenance remains fail closed");
