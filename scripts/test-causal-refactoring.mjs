import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  BUSINESS_TRUTH_CRITICALITY_POLICY,
  CANONICAL_BUSINESS_PROFILE_PATH,
  digestBusinessValue,
  priorityScore,
  rankPatterns,
  renderCausalReport,
  validateBusinessTruthStatus,
  validateOwnerAttestationEvidence,
  validateRegistry
} from './causal-refactoring-lib.mjs';
import { isSafeRepositoryPath } from './repository-path-lib.mjs';

const EXPECTED_OWNER_CRITICAL_KEYS = Object.freeze([
  'closes',
  'country',
  'displayHours',
  'instagramHandle',
  'instagramUrl',
  'locality',
  'mapUrl',
  'name',
  'opens',
  'region',
  'streetAddress'
]);

const EXPECTED_REPOSITORY_CONTROLLED_KEYS = Object.freeze([
  'imageUrl',
  'menuUrl',
  'siteUrl',
  'version'
]);

const registry = JSON.parse(
  await readFile('qa/causal-refactoring/registry.json', 'utf8')
);
const truthStatus = JSON.parse(
  await readFile('qa/causal-refactoring/business-truth-status.json', 'utf8')
);
const profile = JSON.parse(await readFile(truthStatus.source, 'utf8'));
const ownerAttestationText = await readFile(truthStatus.owner_attestation.path, 'utf8');

assert.deepEqual(validateRegistry(registry), []);
assert.deepEqual(validateBusinessTruthStatus(truthStatus, profile), []);
assert.deepEqual(
  validateOwnerAttestationEvidence(truthStatus, ownerAttestationText, profile),
  []
);

assert.equal(truthStatus.source, CANONICAL_BUSINESS_PROFILE_PATH);
assert.equal(
  digestBusinessValue({ b: 2, a: 1 }),
  digestBusinessValue({ a: 1, b: 2 })
);

const ownerCriticalKeys = Object.entries(BUSINESS_TRUTH_CRITICALITY_POLICY)
  .filter(([, ownerCritical]) => ownerCritical)
  .map(([key]) => key)
  .sort((left, right) => left.localeCompare(right, 'en'));
const repositoryControlledKeys = Object.entries(BUSINESS_TRUTH_CRITICALITY_POLICY)
  .filter(([, ownerCritical]) => !ownerCritical)
  .map(([key]) => key)
  .sort((left, right) => left.localeCompare(right, 'en'));
assert.deepEqual(ownerCriticalKeys, EXPECTED_OWNER_CRITICAL_KEYS);
assert.deepEqual(repositoryControlledKeys, EXPECTED_REPOSITORY_CONTROLLED_KEYS);

assert.equal(truthStatus.publication_mode, 'production');
const canonicalOwnerCriticalFields = truthStatus.fields
  .filter((field) => field.owner_critical);
assert.equal(canonicalOwnerCriticalFields.length, EXPECTED_OWNER_CRITICAL_KEYS.length);
assert(
  canonicalOwnerCriticalFields.every((field) => (
    field.attestation === 'owner-confirmed'
    && field.value_sha256 === digestBusinessValue(profile[field.key])
  ))
);
const ownerAttestationRecord = JSON.parse(ownerAttestationText);
assert.equal(
  truthStatus.owner_attestation.canonical_json_sha256,
  digestBusinessValue(ownerAttestationRecord)
);

assert.equal(
  truthStatus.owner_attestation.confirmed_at,
  ownerAttestationRecord.confirmed_at
);

const staleOwnerAttestationRecord = structuredClone(ownerAttestationRecord);
staleOwnerAttestationRecord.claim_boundary += ' Stale mutation.';
assert(
  validateOwnerAttestationEvidence(
    truthStatus,
    JSON.stringify(staleOwnerAttestationRecord),
    profile
  )
    .includes(
      'owner_attestation canonical_json_sha256 does not match the exact attestation manifest'
    )
);

const ownerEvidenceDriftedProfile = { ...profile, opens: '10:00' };
const ownerEvidenceDriftedLedger = structuredClone(truthStatus);
ownerEvidenceDriftedLedger.fields.find((field) => field.key === 'opens').value_sha256 =
  digestBusinessValue(ownerEvidenceDriftedProfile.opens);
assert.deepEqual(
  validateBusinessTruthStatus(ownerEvidenceDriftedLedger, ownerEvidenceDriftedProfile),
  []
);
assert(
  validateOwnerAttestationEvidence(
    ownerEvidenceDriftedLedger,
    ownerAttestationText,
    ownerEvidenceDriftedProfile
  ).includes(
    'owner attestation field opens does not match production ledger and business profile'
  )
);

const technicalMetadataProfile = { ...profile, version: profile.version + 1 };
const technicalMetadataLedger = structuredClone(truthStatus);
technicalMetadataLedger.reviewed_at = '2026-08-31';
const technicalVersionField = technicalMetadataLedger.fields.find(
  (field) => field.key === 'version'
);
technicalVersionField.value_sha256 = digestBusinessValue(
  technicalMetadataProfile.version
);
assert.deepEqual(
  validateBusinessTruthStatus(technicalMetadataLedger, technicalMetadataProfile),
  []
);
assert.deepEqual(
  validateOwnerAttestationEvidence(
    technicalMetadataLedger,
    ownerAttestationText,
    technicalMetadataProfile
  ),
  []
);

const mismatchedOwnerConfirmationDate = structuredClone(truthStatus);
mismatchedOwnerConfirmationDate.owner_attestation.confirmed_at = '2026-08-29';
assert(
  validateOwnerAttestationEvidence(
    mismatchedOwnerConfirmationDate,
    ownerAttestationText,
    profile
  ).includes(
    'owner attestation confirmed_at must equal owner_attestation.confirmed_at'
  )
);

const missingOwnerConfirmationDate = structuredClone(truthStatus);
delete missingOwnerConfirmationDate.owner_attestation.confirmed_at;
assert(
  validateBusinessTruthStatus(missingOwnerConfirmationDate, profile)
    .includes('owner_attestation.confirmed_at must be a valid YYYY-MM-DD date')
);

const futureOwnerConfirmationDate = structuredClone(truthStatus);
futureOwnerConfirmationDate.owner_attestation.confirmed_at = '2026-08-31';
assert(
  validateBusinessTruthStatus(futureOwnerConfirmationDate, profile)
    .includes('owner_attestation.confirmed_at cannot be later than reviewed_at')
);

const missingOwnerAttestation = structuredClone(truthStatus);
delete missingOwnerAttestation.owner_attestation;
assert(
  validateBusinessTruthStatus(missingOwnerAttestation, profile)
    .includes('owner_attestation must be an object in production publication mode')
);

const incompleteRevocation = structuredClone(truthStatus);
incompleteRevocation.publication_mode = 'demo';
const incompleteRevokedField = incompleteRevocation.fields.find((field) => field.key === 'opens');
incompleteRevokedField.attestation = 'unverified';
incompleteRevokedField.value_sha256 = null;
assert.deepEqual(validateBusinessTruthStatus(incompleteRevocation, profile), []);
assert(
  validateOwnerAttestationEvidence(
    incompleteRevocation,
    ownerAttestationText,
    profile
  ).includes(
    'owner attestation field opens does not match production ledger and business profile'
  )
);

const partialRevocationProfile = {
  ...profile,
  name: `${profile.name} after partial revocation`
};
const partialRevocationWithoutEvidence = structuredClone(incompleteRevocation);
delete partialRevocationWithoutEvidence.owner_attestation;
const unboundConfirmedName = partialRevocationWithoutEvidence.fields.find(
  (field) => field.key === 'name'
);
unboundConfirmedName.value_sha256 = digestBusinessValue(partialRevocationProfile.name);
assert(
  validateBusinessTruthStatus(
    partialRevocationWithoutEvidence,
    partialRevocationProfile
  ).includes('owner_attestation must be an object while any field is owner-confirmed')
);

const completeRevocation = structuredClone(partialRevocationWithoutEvidence);
for (const field of completeRevocation.fields.filter((candidate) => candidate.owner_critical)) {
  field.attestation = 'unverified';
  field.value_sha256 = null;
}
assert.deepEqual(
  validateBusinessTruthStatus(completeRevocation, partialRevocationProfile),
  []
);

const invalidDemoOwnerAttestation = structuredClone(completeRevocation);
invalidDemoOwnerAttestation.owner_attestation = null;
assert(
  validateBusinessTruthStatus(invalidDemoOwnerAttestation, partialRevocationProfile)
    .includes('owner_attestation must be an object when present')
);

assert.equal(isSafeRepositoryPath('qa/business-profile.json'), true);
assert.equal(isSafeRepositoryPath('.github/pull_request_template.md'), true);
assert.equal(isSafeRepositoryPath('../outside.json'), false);
assert.equal(isSafeRepositoryPath('/tmp/outside.json'), false);
assert.equal(isSafeRepositoryPath('C:\\outside.json'), false);
assert.equal(isSafeRepositoryPath('qa/../../outside.json'), false);

const unsafeEvidencePath = structuredClone(registry);
unsafeEvidencePath.patterns[0].evidence[0].path = 'C:\\outside.json';
assert(
  validateRegistry(unsafeEvidencePath)
    .some((error) => error.includes('must be a safe repository-relative path'))
);

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

const ownerCriticalFieldCount = EXPECTED_OWNER_CRITICAL_KEYS.length;
const unconfirmedProductionTruth = structuredClone(truthStatus);
unconfirmedProductionTruth.fields = unconfirmedProductionTruth.fields.map((field) => ({
  ...field,
  attestation: field.owner_critical ? 'unverified' : field.attestation,
  value_sha256: field.owner_critical ? null : field.value_sha256
}));
const productionErrors = validateBusinessTruthStatus(unconfirmedProductionTruth, profile);
assert.equal(
  productionErrors.filter((error) => error.includes('blocks production')).length,
  ownerCriticalFieldCount
);

const confirmedProductionTruth = structuredClone(unconfirmedProductionTruth);
confirmedProductionTruth.fields = confirmedProductionTruth.fields.map((field) => ({
  ...field,
  attestation: field.owner_critical ? 'owner-confirmed' : field.attestation,
  value_sha256: field.owner_critical
    ? digestBusinessValue(profile[field.key])
    : field.value_sha256
}));
assert.deepEqual(validateBusinessTruthStatus(confirmedProductionTruth, profile), []);

const criticalityBypass = structuredClone(unconfirmedProductionTruth);
criticalityBypass.fields = criticalityBypass.fields.map((field) => ({
  ...field,
  owner_critical: field.key === 'version',
  attestation: field.key === 'version' ? 'owner-confirmed' : 'source-verified',
  value_sha256: digestBusinessValue(profile[field.key])
}));
const criticalityBypassErrors = validateBusinessTruthStatus(criticalityBypass, profile);
assert(
  criticalityBypassErrors.some((error) => (
    error.includes('owner_critical must equal independent policy value false for version')
  ))
);
assert.equal(
  criticalityBypassErrors.filter((error) => error.includes('blocks production')).length,
  ownerCriticalFieldCount
);

const driftedConfirmedProfile = { ...profile, opens: '10:00' };
assert(
  validateBusinessTruthStatus(confirmedProductionTruth, driftedConfirmedProfile)
    .some((error) => error.includes('(opens) value_sha256 does not match'))
);

const unboundConfirmation = structuredClone(truthStatus);
const nameField = unboundConfirmation.fields.find((field) => field.key === 'name');
nameField.attestation = 'owner-confirmed';
nameField.value_sha256 = null;
assert(
  validateBusinessTruthStatus(unboundConfirmation, profile)
    .some((error) => error.includes('value_sha256 must be sha256:'))
);

const redirectedSource = structuredClone(truthStatus);
redirectedSource.source = 'qa/causal-refactoring/registry.json';
assert(
  validateBusinessTruthStatus(redirectedSource, profile)
    .includes(`source must equal ${CANONICAL_BUSINESS_PROFILE_PATH}`)
);

const unsafeSource = structuredClone(truthStatus);
unsafeSource.source = 'C:\\outside.json';
assert(
  validateBusinessTruthStatus(unsafeSource, profile)
    .some((error) => error.includes('source must be a safe repository-relative path'))
);

const missingSourceKey = structuredClone(truthStatus);
missingSourceKey.fields[0].key = 'inventedField';
missingSourceKey.fields[0].source_pointer = '/inventedField';
assert(
  validateBusinessTruthStatus(missingSourceKey, profile)
    .some((error) => error.includes('missing from the business profile'))
);

const inheritedSourceKey = structuredClone(truthStatus);
inheritedSourceKey.fields[0].key = 'toString';
inheritedSourceKey.fields[0].source_pointer = '/toString';
assert(
  validateBusinessTruthStatus(inheritedSourceKey, profile)
    .some((error) => error.includes('missing from the business profile: toString'))
);

const incompleteLedger = structuredClone(truthStatus);
incompleteLedger.fields = incompleteLedger.fields.filter((field) => field.key !== 'imageUrl');
assert(
  validateBusinessTruthStatus(incompleteLedger, profile)
    .includes('business profile field is missing from the status ledger: imageUrl')
);

const profileWithNewField = { ...profile, phoneUrl: 'tel:+900000000000' };
const newFieldErrors = validateBusinessTruthStatus(truthStatus, profileWithNewField);
assert(
  newFieldErrors.includes('business profile field is missing from the status ledger: phoneUrl')
);
assert(
  newFieldErrors.includes('business profile field has no independent criticality policy: phoneUrl')
);

const profileMissingPolicyField = { ...profile };
delete profileMissingPolicyField.mapUrl;
assert(
  validateBusinessTruthStatus(truthStatus, profileMissingPolicyField)
    .includes('criticality policy field is missing from the business profile: mapUrl')
);

const report = renderCausalReport(registry, truthStatus);
assert.match(report, /Publication mode: production/);
assert.match(report, /Owner-critical fields awaiting encoded confirmation: 0/);
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
