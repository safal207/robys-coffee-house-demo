#!/usr/bin/env node

import { readFileSync } from "node:fs";

const workflows = [
  ".github/workflows/security.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/ltp-exact-head-audit.yml",
  ".github/workflows/review-ledger.yml"
];
const failures = [];

for (const file of workflows) {
  const content = readFileSync(file, "utf8");
  const uses = [...content.matchAll(/^\s*-?\s*uses:\s*([^\s@]+)@([^\s#]+).*$/gm)];
  if (uses.length === 0) failures.push(`${file}: no external actions found`);
  for (const [, action, revision] of uses) {
    if (action.startsWith("./")) continue;
    if (!/^[0-9a-f]{40}$/i.test(revision)) {
      failures.push(`${file}: ${action}@${revision} is not pinned to a full commit SHA`);
    }
  }
}

if (failures.length) {
  failures.forEach((failure) => console.error(`❌ [CI-PIN-001] ${failure}`));
  throw new Error(`CI-PIN-001 failed: ${failures.length} mutable action reference(s)`);
}

console.log(`✅ CI-PIN-001 passed: all actions in ${workflows.length} security/evidence workflows use full commit SHAs.`);
