import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  priorityScore,
  rankPatterns,
  renderCausalReport,
  validateBusinessTruthStatus,
  validateRegistry
} from './causal-refactoring-lib.mjs';
import { isSafeRepositoryPath } from './repository-path-lib.mjs';

const registry = JSON.parse(
  await readFile('qa/causal-refactoring/registry.json', 'utf8')
);
const truthStatus = JSON.parse(
  await readFile('qa/causal-refactoring/business-truth-status.json', 'utf8')
);
const profile = JSON.parse(await readFile(truthStatus.source, 'utf8'));

assert.deepEqual(validateRegistry(registry), []);
assert.deepEqual(validateBusinessTruthStatus(truthStatus, profile), []);

assert.equal(isSafeRepositoryPath('qa/business-profile.json'), true);
assert.equal(isSafeRepositoryPath('.github/pull_request_template.md'), true);
assert.equal(isSafeRepositoryPath('../outside.json'), false);
assert.equal(isSafeRepositoryPath('/tmp/outside.json'), false);
assert.equal(isSafeRepositoryPath('C:\\outside.json'), false);
assert.equal(isSafeRepositoryPath('qa/../../outside.json'), false);

const ranked = rankPatterns(registry);
assert.equal(ranked[0].id, 'business-truth-drift');
assert.equal(priorityScore(ranked[0]), 40);
assert.deepEqual(
  ranked.map((pattern) => pattern.priority_score),
  [...ranked.map((pattern) => pattern.priority_score)].sort((a, b) => b - a)
);

const duplicate = structuredClone(registry);
duplicate.patterns.push(structuredClone(duplicate.patterns[0]));
assert(
  validateRegistry(duplicate).some((error) => error.includes('is duplicated'))
);

const singleScale = structuredClone(registry);
singleScale.patterns[0].intervention.actions = singleScale.patterns[0].intervention.actions
  .map((action) => ({ ...action, scale: 'business_truth' }));
assert(
  validateRegistry(singleScale)
    .includes('patterns[0].intervention.actions must change at least two distinct scales')
);

const missingEvidence = structuredClone(registry);
missingEvidence.patterns[0].evidence = [];
assert(
  validateRegistry(missingEvidence)
    .includes('patterns[0].evidence must contain at least one evidence reference')
);

const productionTruth = structuredClone(truthStatus);
productionTruth.publication_mode = 'production';
const productionErrors = validateBusinessTruthStatus(productionTruth, profile);
const ownerCriticalFieldCount = truthStatus.fields.filter((field) => field.owner_critical).length;
assert.equal(
  productionErrors.filter((error) => error.includes('blocks production')).length,
  ownerCriticalFieldCount
);

const confirmedProductionTruth = structuredClone(productionTruth);
confirmedProductionTruth.fields = confirmedProductionTruth.fields.map((field) => ({
  ...field,
  attestation: field.owner_critical ? 'owner-confirmed' : field.attestation
}));
assert.deepEqual(validateBusinessTruthStatus(confirmedProductionTruth, profile), []);

const missingSourceKey = structuredClone(truthStatus);
missingSourceKey.fields[0].key = 'inventedField';
missingSourceKey.fields[0].source_pointer = '/inventedField';
assert(
  validateBusinessTruthStatus(missingSourceKey, profile)
    .some((error) => error.includes('missing from the business profile'))
);

const incompleteLedger = structuredClone(truthStatus);
incompleteLedger.fields = incompleteLedger.fields.filter((field) => field.key !== 'imageUrl');
assert(
  validateBusinessTruthStatus(incompleteLedger, profile)
    .includes('business profile field is missing from the status ledger: imageUrl')
);

const profileWithNewField = { ...profile, phoneUrl: 'tel:+900000000000' };
assert(
  validateBusinessTruthStatus(truthStatus, profileWithNewField)
    .includes('business profile field is missing from the status ledger: phoneUrl')
);

const report = renderCausalReport(registry, truthStatus);
assert.match(report, /Publication mode: demo/);
assert.match(report, /Business truth can drift/);
assert.match(report, /mechanism does not prove a customer or revenue effect/i);

const verifier = spawnSync(
  process.execPath,
  ['scripts/verify-causal-refactoring.mjs', '--report'],
  { encoding: 'utf8' }
);
assert.equal(verifier.status, 0, verifier.stderr);
assert.match(verifier.stdout, /Fractal causal refactoring valid/);
assert.match(verifier.stdout, /Claim boundary/);

const invalidOption = spawnSync(
  process.execPath,
  ['scripts/verify-causal-refactoring.mjs', '--invented'],
  { encoding: 'utf8' }
);
assert.equal(invalidOption.status, 1);
assert.match(invalidOption.stderr, /Unknown option/);

console.log('Fractal causal refactoring tests passed.');
