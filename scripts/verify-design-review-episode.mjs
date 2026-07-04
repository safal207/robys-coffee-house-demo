#!/usr/bin/env node
export {
  DEFAULT_MANIFEST,
  DesignReviewEpisodeError,
  loadManifest,
  validateManifest
} from "./verify-design-review-provenance.mjs";

import {
  loadManifest,
  validateManifest
} from "./verify-design-review-provenance.mjs";

try {
  const result = validateManifest(loadManifest(process.argv[2]));
  Object.entries(result).forEach(([key, value]) => {
    console.log(`${key.toUpperCase()}: ${value}`);
  });
} catch (error) {
  console.error(`INVALID: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
