import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  BUSINESS_TRUTH_CRITICALITY_POLICY,
  CANONICAL_BUSINESS_PROFILE_PATH,
  OWNER_ATTESTATION_HISTORY_POLICY,
  digestBusinessValue,
  priorityScore,
  rankPatterns,
  renderCausalReport,
  validateBusinessTruthStatus,
  validateOwnerAttestationEvidence,
  validateOwnerAttestationManifest,
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

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

const registry = JSON.parse(
  await readFile('qa/causal-refactoring/registry.json', 'utf8')
);
const truthStatus = JSON.parse(
  await readFile('qa/causal-refactoring/business-truth-status.json', 'utf8')
);
const profile = JSON.parse(await readFile(truthStatus.source, 'utf8'));
const registeredOwnerAttestations = registry.patterns
  .flatMap((pattern) => pattern.evidence ?? [])
  .filter((evidence) => evidence.kind === 'owner-attestation');
const [ownerAttestationPath] = Object.keys(OWNER_ATTESTATION_HISTORY_POLICY);
const registeredOwnerAttestation = registeredOwnerAttestations.find(
  (evidence) => evidence.path === ownerAttestationPath
);
assert.equal(
  registeredOwnerAttestation?.canonical_json_sha256,
  OWNER_ATTESTATION_HISTORY_POLICY[ownerAttestationPath],
  'the independent historical policy must have one exact registry entry'
);
const ownerAttestationText = await readFile(ownerAttestationPath, 'utf8');
const ownerAttestationRecord = JSON.parse(ownerAttestationText);

assert.deepEqual(validateRegistry(registry), []);
assert.deepEqual(validateBusinessTruthStatus(truthStatus, profile), []);
if (truthStatus.owner_attestation !== undefined) {
  const activeOwnerAttestationText = await readFile(
    truthStatus.owner_attestation.path,
    'utf8'
  );
  assert.deepEqual(
    validateOwnerAttestationEvidence(truthStatus, activeOwnerAttestationText, profile),
    []
  );
}

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

const liveOwnerCriticalFields = truthStatus.fields
  .filter((field) => field.owner_critical);
assert.equal(liveOwnerCriticalFields.length, EXPECTED_OWNER_CRITICAL_KEYS.length);
if (truthStatus.publication_mode === 'production') {
  assert.equal(typeof truthStatus.owner_attestation, 'object');
  assert(
    liveOwnerCriticalFields.every((field) => (
      field.attestation === 'owner-confirmed'
      && field.value_sha256 === digestBusinessValue(profile[field.key])
    ))
  );
} else {
  assert.equal(truthStatus.publication_mode, 'demo');
  if (truthStatus.owner_attestation === undefined) {
    assert(
      liveOwnerCriticalFields.every((field) => (
        field.attestation === 'unverified' && field.value_sha256 === null
      ))
    );
  }
}

const productionFixtureProfile = structuredClone(profile);
const productionOwnerAttestationRecord = {
  schema_version: 'robys.owner-business-truth-attestation.v1',
  confirmed_at: truthStatus.reviewed_at,
  source: CANONICAL_BUSINESS_PROFILE_PATH,
  authority: 'accountable-owner',
  claim_boundary: 'In-memory fixture for generic production-gate validation only.',
  fields: Object.entries(BUSINESS_TRUTH_CRITICALITY_POLICY)
    .filter(([, ownerCritical]) => ownerCritical)
    .map(([key]) => ({
      key,
      source_pointer: `/${key}`,
      value: productionFixtureProfile[key],
      value_sha256: digestBusinessValue(productionFixtureProfile[key])
    }))
};
const productionOwnerAttestationText = JSON.stringify(productionOwnerAttestationRecord);

const productionTruthStatus = structuredClone(truthStatus);
productionTruthStatus.publication_mode = 'production';
productionTruthStatus.owner_attestation = {
  path: 'qa/causal-refactoring/in-memory-owner-attestation.json',
  confirmed_at: productionOwnerAttestationRecord.confirmed_at,
  canonical_json_sha256: digestBusinessValue(productionOwnerAttestationRecord)
};
productionTruthStatus.fields = productionTruthStatus.fields.map((field) => ({
  ...field,
  attestation: BUSINESS_TRUTH_CRITICALITY_POLICY[field.key] === true
    ? 'owner-confirmed'
    : field.attestation,
  value_sha256: BUSINESS_TRUTH_CRITICALITY_POLICY[field.key] === true
    ? digestBusinessValue(productionFixtureProfile[field.key])
    : field.value_sha256
}));
assert.deepEqual(
  validateBusinessTruthStatus(productionTruthStatus, productionFixtureProfile),
  []
);
assert.deepEqual(
  validateOwnerAttestationEvidence(
    productionTruthStatus,
    productionOwnerAttestationText,
    productionFixtureProfile
  ),
  []
);

const canonicalProductionOwnerCriticalFields = productionTruthStatus.fields
  .filter((field) => field.owner_critical);
assert.equal(
  canonicalProductionOwnerCriticalFields.length,
  EXPECTED_OWNER_CRITICAL_KEYS.length
);
assert(
  canonicalProductionOwnerCriticalFields.every((field) => (
    field.attestation === 'owner-confirmed'
    && field.value_sha256 === digestBusinessValue(productionFixtureProfile[field.key])
  ))
);
assert.equal(
  productionTruthStatus.owner_attestation.canonical_json_sha256,
  digestBusinessValue(productionOwnerAttestationRecord)
);

assert.equal(
  productionTruthStatus.owner_attestation.confirmed_at,
  productionOwnerAttestationRecord.confirmed_at
);

const staleOwnerAttestationRecord = structuredClone(productionOwnerAttestationRecord);
staleOwnerAttestationRecord.claim_boundary += ' Stale mutation.';
assert(
  validateOwnerAttestationEvidence(
    productionTruthStatus,
    JSON.stringify(staleOwnerAttestationRecord),
    productionFixtureProfile
  )
    .includes(
      'owner_attestation canonical_json_sha256 does not match the exact attestation manifest'
    )
);

const malformedIntrinsicDigest = structuredClone(ownerAttestationRecord);
malformedIntrinsicDigest.fields[0].value_sha256 = digestBusinessValue(
  `${malformedIntrinsicDigest.fields[0].value} drifted`
);
assert(
  validateOwnerAttestationManifest(JSON.stringify(malformedIntrinsicDigest))
    .includes(
      `owner attestation field ${malformedIntrinsicDigest.fields[0].key} `
      + 'value_sha256 does not match its value'
    )
);

const mismatchedIntrinsicSourcePointer = structuredClone(ownerAttestationRecord);
mismatchedIntrinsicSourcePointer.fields[0].source_pointer = '/different-field';
assert(
  validateOwnerAttestationManifest(JSON.stringify(mismatchedIntrinsicSourcePointer))
    .some((error) => error.includes('source_pointer must equal'))
);

const unsafeIntrinsicSource = structuredClone(ownerAttestationRecord);
unsafeIntrinsicSource.source = '../outside.json';
assert(
  validateOwnerAttestationManifest(JSON.stringify(unsafeIntrinsicSource))
    .includes('owner attestation source must be a safe repository-relative path')
);

const duplicateTopLevelAuthority = ownerAttestationText.replace(
  '{',
  '{"auth\\u006frity":"untrusted",'
);
assert.equal(
  digestBusinessValue(JSON.parse(duplicateTopLevelAuthority)),
  digestBusinessValue(ownerAttestationRecord)
);
assert(
  validateOwnerAttestationManifest(duplicateTopLevelAuthority)
    .includes('owner attestation evidence contains duplicate object key: $.authority')
);

const duplicateNestedFieldKey = JSON.stringify(ownerAttestationRecord).replace(
  '"key":"name"',
  '"k\\u0065y":"ambiguous","key":"name"'
);
assert.equal(
  digestBusinessValue(JSON.parse(duplicateNestedFieldKey)),
  digestBusinessValue(ownerAttestationRecord)
);
assert(
  validateOwnerAttestationManifest(duplicateNestedFieldKey)
    .includes('owner attestation evidence contains duplicate object key: $.fields[0].key')
);

const ownerEvidenceDriftedProfile = { ...productionFixtureProfile, opens: '10:00' };
const ownerEvidenceDriftedLedger = structuredClone(productionTruthStatus);
ownerEvidenceDriftedLedger.fields.find((field) => field.key === 'opens').value_sha256 =
  digestBusinessValue(ownerEvidenceDriftedProfile.opens);
assert.deepEqual(
  validateBusinessTruthStatus(ownerEvidenceDriftedLedger, ownerEvidenceDriftedProfile),
  []
);
assert(
  validateOwnerAttestationEvidence(
    ownerEvidenceDriftedLedger,
    productionOwnerAttestationText,
    ownerEvidenceDriftedProfile
  ).includes(
    'owner attestation field opens does not match production ledger and business profile'
  )
);

const technicalMetadataProfile = {
  ...productionFixtureProfile,
  version: productionFixtureProfile.version + 1
};
const technicalMetadataLedger = structuredClone(productionTruthStatus);
technicalMetadataLedger.reviewed_at = shiftDate(productionTruthStatus.reviewed_at, 1);
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
    productionOwnerAttestationText,
    technicalMetadataProfile
  ),
  []
);

const mismatchedOwnerConfirmationDate = structuredClone(productionTruthStatus);
mismatchedOwnerConfirmationDate.owner_attestation.confirmed_at = shiftDate(
  productionOwnerAttestationRecord.confirmed_at,
  -1
);
assert(
  validateOwnerAttestationEvidence(
    mismatchedOwnerConfirmationDate,
    productionOwnerAttestationText,
    productionFixtureProfile
  ).includes(
    'owner attestation confirmed_at must equal owner_attestation.confirmed_at'
  )
);

const missingOwnerConfirmationDate = structuredClone(productionTruthStatus);
delete missingOwnerConfirmationDate.owner_attestation.confirmed_at;
assert(
  validateBusinessTruthStatus(missingOwnerConfirmationDate, productionFixtureProfile)
    .includes('owner_attestation.confirmed_at must be a valid YYYY-MM-DD date')
);

const futureOwnerConfirmationDate = structuredClone(productionTruthStatus);
futureOwnerConfirmationDate.owner_attestation.confirmed_at = shiftDate(
  productionTruthStatus.reviewed_at,
  1
);
assert(
  validateBusinessTruthStatus(futureOwnerConfirmationDate, productionFixtureProfile)
    .includes('owner_attestation.confirmed_at cannot be later than reviewed_at')
);

const missingOwnerAttestation = structuredClone(productionTruthStatus);
delete missingOwnerAttestation.owner_attestation;
assert(
  validateBusinessTruthStatus(missingOwnerAttestation, productionFixtureProfile)
    .includes('owner_attestation must be an object in production publication mode')
);

const incompleteRevocation = structuredClone(productionTruthStatus);
incompleteRevocation.publication_mode = 'demo';
const incompleteRevokedField = incompleteRevocation.fields.find((field) => field.key === 'opens');
incompleteRevokedField.attestation = 'unverified';
incompleteRevokedField.value_sha256 = null;
assert.deepEqual(
  validateBusinessTruthStatus(incompleteRevocation, productionFixtureProfile),
  []
);
assert(
  validateOwnerAttestationEvidence(
    incompleteRevocation,
    productionOwnerAttestationText,
    productionFixtureProfile
  ).includes(
    'owner attestation field opens does not match production ledger and business profile'
  )
);

const partialRevocationProfile = {
  ...productionFixtureProfile,
  name: `${productionFixtureProfile.name} after partial revocation`
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

const sourceVerifiedRollbackBypass = structuredClone(completeRevocation);
const sourceVerifiedOwnerField = sourceVerifiedRollbackBypass.fields.find(
  (field) => field.key === 'name'
);
sourceVerifiedOwnerField.attestation = 'source-verified';
sourceVerifiedOwnerField.value_sha256 = digestBusinessValue(partialRevocationProfile.name);
assert(
  validateBusinessTruthStatus(sourceVerifiedRollbackBypass, partialRevocationProfile)
    .some((error) => (
      error.includes('(name) must be unverified when owner_attestation is absent')
    ))
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

const missingOwnerEvidenceDigest = structuredClone(registry);
const missingDigestEvidence = missingOwnerEvidenceDigest.patterns
  .flatMap((pattern) => pattern.evidence ?? [])
  .find((evidence) => evidence.kind === 'owner-attestation');
delete missingDigestEvidence.canonical_json_sha256;
assert(
  validateRegistry(missingOwnerEvidenceDigest)
    .some((error) => error.includes('canonical_json_sha256 must be sha256:'))
);

const malformedOwnerEvidenceDigest = structuredClone(registry);
const malformedDigestEvidence = malformedOwnerEvidenceDigest.patterns
  .flatMap((pattern) => pattern.evidence ?? [])
  .find((evidence) => evidence.kind === 'owner-attestation');
malformedDigestEvidence.canonical_json_sha256 = 'sha256:not-a-digest';
assert(
  validateRegistry(malformedOwnerEvidenceDigest)
    .some((error) => error.includes('canonical_json_sha256 must be sha256:'))
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
const unconfirmedProductionTruth = structuredClone(productionTruthStatus);
unconfirmedProductionTruth.fields = unconfirmedProductionTruth.fields.map((field) => ({
  ...field,
  attestation: field.owner_critical ? 'unverified' : field.attestation,
  value_sha256: field.owner_critical ? null : field.value_sha256
}));
const productionErrors = validateBusinessTruthStatus(
  unconfirmedProductionTruth,
  productionFixtureProfile
);
assert.equal(
  productionErrors.filter((error) => error.includes('blocks production')).length,
  ownerCriticalFieldCount
);

const confirmedProductionTruth = structuredClone(unconfirmedProductionTruth);
confirmedProductionTruth.fields = confirmedProductionTruth.fields.map((field) => ({
  ...field,
  attestation: field.owner_critical ? 'owner-confirmed' : field.attestation,
  value_sha256: field.owner_critical
    ? digestBusinessValue(productionFixtureProfile[field.key])
    : field.value_sha256
}));
assert.deepEqual(
  validateBusinessTruthStatus(confirmedProductionTruth, productionFixtureProfile),
  []
);

const criticalityBypass = structuredClone(unconfirmedProductionTruth);
criticalityBypass.fields = criticalityBypass.fields.map((field) => ({
  ...field,
  owner_critical: field.key === 'version',
  attestation: field.key === 'version' ? 'owner-confirmed' : 'source-verified',
  value_sha256: digestBusinessValue(productionFixtureProfile[field.key])
}));
const criticalityBypassErrors = validateBusinessTruthStatus(
  criticalityBypass,
  productionFixtureProfile
);
assert(
  criticalityBypassErrors.some((error) => (
    error.includes('owner_critical must equal independent policy value false for version')
  ))
);
assert.equal(
  criticalityBypassErrors.filter((error) => error.includes('blocks production')).length,
  ownerCriticalFieldCount
);

const driftedConfirmedProfile = { ...productionFixtureProfile, opens: '10:00' };
assert(
  validateBusinessTruthStatus(confirmedProductionTruth, driftedConfirmedProfile)
    .some((error) => error.includes('(opens) value_sha256 does not match'))
);

const unboundConfirmation = structuredClone(productionTruthStatus);
const nameField = unboundConfirmation.fields.find((field) => field.key === 'name');
nameField.attestation = 'owner-confirmed';
nameField.value_sha256 = null;
assert(
  validateBusinessTruthStatus(unboundConfirmation, productionFixtureProfile)
    .some((error) => error.includes('value_sha256 must be sha256:'))
);

const redirectedSource = structuredClone(productionTruthStatus);
redirectedSource.source = 'qa/causal-refactoring/registry.json';
assert(
  validateBusinessTruthStatus(redirectedSource, productionFixtureProfile)
    .includes(`source must equal ${CANONICAL_BUSINESS_PROFILE_PATH}`)
);

const unsafeSource = structuredClone(productionTruthStatus);
unsafeSource.source = 'C:\\outside.json';
assert(
  validateBusinessTruthStatus(unsafeSource, productionFixtureProfile)
    .some((error) => error.includes('source must be a safe repository-relative path'))
);

const missingSourceKey = structuredClone(productionTruthStatus);
missingSourceKey.fields[0].key = 'inventedField';
missingSourceKey.fields[0].source_pointer = '/inventedField';
assert(
  validateBusinessTruthStatus(missingSourceKey, productionFixtureProfile)
    .some((error) => error.includes('missing from the business profile'))
);

const inheritedSourceKey = structuredClone(productionTruthStatus);
inheritedSourceKey.fields[0].key = 'toString';
inheritedSourceKey.fields[0].source_pointer = '/toString';
assert(
  validateBusinessTruthStatus(inheritedSourceKey, productionFixtureProfile)
    .some((error) => error.includes('missing from the business profile: toString'))
);

const incompleteLedger = structuredClone(productionTruthStatus);
incompleteLedger.fields = incompleteLedger.fields.filter((field) => field.key !== 'imageUrl');
assert(
  validateBusinessTruthStatus(incompleteLedger, productionFixtureProfile)
    .includes('business profile field is missing from the status ledger: imageUrl')
);

const profileWithNewField = {
  ...productionFixtureProfile,
  phoneUrl: 'tel:+900000000000'
};
const newFieldErrors = validateBusinessTruthStatus(
  productionTruthStatus,
  profileWithNewField
);
assert(
  newFieldErrors.includes('business profile field is missing from the status ledger: phoneUrl')
);
assert(
  newFieldErrors.includes('business profile field has no independent criticality policy: phoneUrl')
);

const profileMissingPolicyField = { ...productionFixtureProfile };
delete profileMissingPolicyField.mapUrl;
assert(
  validateBusinessTruthStatus(productionTruthStatus, profileMissingPolicyField)
    .includes('criticality policy field is missing from the business profile: mapUrl')
);

const report = renderCausalReport(registry, productionTruthStatus);
assert.match(report, /Publication mode: production/);
assert.match(report, /Owner-critical fields awaiting encoded confirmation: 0/);
assert.match(report, /Business truth can drift/);
assert.match(report, /mechanism does not prove a customer or revenue effect/i);

const verifierPath = resolve('scripts/verify-causal-refactoring.mjs');
const verifier = spawnSync(
  process.execPath,
  [verifierPath, '--report'],
  { encoding: 'utf8' }
);
assert.equal(verifier.status, 0, verifier.stderr);
assert.match(verifier.stdout, /Fractal causal refactoring valid/);
assert.match(verifier.stdout, /Claim boundary/);

const rollbackFixtureRoot = await mkdtemp(join(tmpdir(), 'robys-fcr-rollback-'));
try {
  const fixturePaths = new Set([
    CANONICAL_BUSINESS_PROFILE_PATH,
    'qa/causal-refactoring/registry.json',
    ...Object.keys(OWNER_ATTESTATION_HISTORY_POLICY),
    ...registry.patterns.flatMap((pattern) => (
      (pattern.evidence ?? []).map((evidence) => evidence.path)
    ))
  ]);
  for (const fixturePath of fixturePaths) {
    const destination = join(rollbackFixtureRoot, fixturePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(fixturePath, destination);
  }

  const rollbackTruthStatus = structuredClone(productionTruthStatus);
  rollbackTruthStatus.publication_mode = 'demo';
  delete rollbackTruthStatus.owner_attestation;
  rollbackTruthStatus.fields = rollbackTruthStatus.fields.map((field) => ({
    ...field,
    attestation: BUSINESS_TRUTH_CRITICALITY_POLICY[field.key] === true
      ? 'unverified'
      : field.attestation,
    value_sha256: BUSINESS_TRUTH_CRITICALITY_POLICY[field.key] === true
      ? null
      : field.value_sha256
  }));
  await writeFile(
    join(rollbackFixtureRoot, 'qa/causal-refactoring/business-truth-status.json'),
    `${JSON.stringify(rollbackTruthStatus, null, 2)}\n`,
    'utf8'
  );

  const rollbackVerifier = spawnSync(process.execPath, [verifierPath], {
    cwd: rollbackFixtureRoot,
    encoding: 'utf8'
  });
  assert.equal(rollbackVerifier.status, 0, rollbackVerifier.stderr);
  assert.match(rollbackVerifier.stdout, /publication mode=demo/);

  const registryWithKindAlias = structuredClone(registry);
  registryWithKindAlias.patterns[0].evidence.push({
    path: ownerAttestationPath,
    kind: 'repository-data',
    note: 'Adversarial duplicate alias for the historical owner-attestation path.'
  });
  const fixtureRegistryPath = join(
    rollbackFixtureRoot,
    'qa/causal-refactoring/registry.json'
  );
  await writeFile(
    fixtureRegistryPath,
    `${JSON.stringify(registryWithKindAlias, null, 2)}\n`,
    'utf8'
  );
  const kindAliasVerifier = spawnSync(process.execPath, [verifierPath], {
    cwd: rollbackFixtureRoot,
    encoding: 'utf8'
  });
  assert.equal(kindAliasVerifier.status, 1);
  assert.match(
    kindAliasVerifier.stderr,
    /owner-attestation history policy path must appear exactly once in registry evidence/
  );

  const registryWithoutOwnerHistory = structuredClone(registry);
  registryWithoutOwnerHistory.patterns = registryWithoutOwnerHistory.patterns.map(
    (pattern) => ({
      ...pattern,
      evidence: (pattern.evidence ?? []).filter((evidence) => (
        evidence.path !== ownerAttestationPath
      ))
    })
  );
  await writeFile(
    fixtureRegistryPath,
    `${JSON.stringify(registryWithoutOwnerHistory, null, 2)}\n`,
    'utf8'
  );
  const missingHistoryVerifier = spawnSync(process.execPath, [verifierPath], {
    cwd: rollbackFixtureRoot,
    encoding: 'utf8'
  });
  assert.equal(missingHistoryVerifier.status, 1);
  assert.match(
    missingHistoryVerifier.stderr,
    /owner-attestation history policy entry is missing from registry/
  );
  await writeFile(
    fixtureRegistryPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    'utf8'
  );

  const driftedHistoricalManifest = structuredClone(ownerAttestationRecord);
  const driftedHistoricalOpens = driftedHistoricalManifest.fields.find(
    (field) => field.key === 'opens'
  );
  driftedHistoricalOpens.value = '10:00';
  driftedHistoricalOpens.value_sha256 = digestBusinessValue(
    driftedHistoricalOpens.value
  );
  assert.deepEqual(
    validateOwnerAttestationManifest(JSON.stringify(driftedHistoricalManifest)),
    []
  );
  await writeFile(
    join(rollbackFixtureRoot, ownerAttestationPath),
    `${JSON.stringify(driftedHistoricalManifest, null, 2)}\n`,
    'utf8'
  );
  const historicalDriftVerifier = spawnSync(process.execPath, [verifierPath], {
    cwd: rollbackFixtureRoot,
    encoding: 'utf8'
  });
  assert.equal(historicalDriftVerifier.status, 1);
  assert.match(
    historicalDriftVerifier.stderr,
    /registered owner-attestation manifest digest mismatch/
  );
} finally {
  await rm(rollbackFixtureRoot, { recursive: true, force: true });
}

const invalidOption = spawnSync(
  process.execPath,
  [verifierPath, '--invented'],
  { encoding: 'utf8' }
);
assert.equal(invalidOption.status, 1);
assert.match(invalidOption.stderr, /Unknown option/);

console.log('Fractal causal refactoring tests passed.');
