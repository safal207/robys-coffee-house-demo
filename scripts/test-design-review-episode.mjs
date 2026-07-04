#!/usr/bin/env node
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  DesignReviewEpisodeError,
  loadManifest,
  validateManifest
} from "./verify-design-review-episode.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectInvalid(change, pattern) {
  const manifest = copy(loadManifest());
  change(manifest);
  assert.throws(
    () => validateManifest(manifest, ROOT),
    (error) => error instanceof DesignReviewEpisodeError && pattern.test(error.message)
  );
}

const reference = validateManifest(loadManifest(), ROOT);
assert.equal(reference.episodeId, "DESIGN-REVIEW-EPISODE-001");
assert.equal(reference.status, "ARTIFACTS_REQUIRED");
assert.equal(reference.reviewReady, false);
assert.equal(reference.candidatePackages, 0);
assert.equal(reference.blockers, 4);
assert.equal(reference.currentDecision, "INCONCLUSIVE");

expectInvalid(
  (manifest) => { manifest.baseline.sourceArtifacts[0].sha256 = "0".repeat(64); },
  /sha256 mismatch/
);

expectInvalid(
  (manifest) => { manifest.criteria[0].weight = 19; },
  /weights must total 100/
);

expectInvalid(
  (manifest) => {
    manifest.candidatePackages = [{ label: "candidate-amber", sourceRole: "disclosed" }];
  },
  /must not disclose source role/
);

expectInvalid(
  (manifest) => {
    manifest.reviewReady = true;
    manifest.status = "REVIEW_READY";
  },
  /requires three candidate packages/
);

expectInvalid(
  (manifest) => { manifest.currentDecision = "ACCEPT"; },
  /blocked readiness must remain INCONCLUSIVE/
);

expectInvalid(
  (manifest) => {
    manifest.blindProtocol.sourceRoleMappingVisibleToReviewers = true;
  },
  /mapping must remain hidden/
);

console.log("PASS: design review episode fail-closed contract");
