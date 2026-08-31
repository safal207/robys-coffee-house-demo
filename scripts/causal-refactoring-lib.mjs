import { createHash } from 'node:crypto';
import { isSafeRepositoryPath } from './repository-path-lib.mjs';

const REGISTRY_SCHEMA = 'robys.fractal-causal-refactoring.v1';
const BUSINESS_TRUTH_SCHEMA = 'robys.business-truth-status.v1';
export const CANONICAL_BUSINESS_PROFILE_PATH = 'qa/business-profile.json';

export const BUSINESS_TRUTH_CRITICALITY_POLICY = Object.freeze({
  version: false,
  name: true,
  siteUrl: false,
  menuUrl: false,
  imageUrl: false,
  streetAddress: true,
  locality: true,
  region: true,
  country: true,
  displayHours: true,
  opens: true,
  closes: true,
  instagramUrl: true,
  instagramHandle: true,
  mapUrl: true
});

const ALLOWED_SCALES = new Set([
  'business_truth',
  'customer_experience',
  'product_system',
  'delivery_system',
  'team_system'
]);

const ALLOWED_PATTERN_STATUSES = new Set([
  'hypothesis',
  'active',
  'monitoring',
  'resolved',
  'rejected'
]);

const ALLOWED_CLAIM_LEVELS = new Set([
  'repository-supported-hypothesis',
  'owner-confirmed',
  'controlled-risk',
  'observed'
]);

const ALLOWED_EVIDENCE_KINDS = new Set([
  'repository-contract',
  'repository-data',
  'runtime-evidence',
  'owner-attestation',
  'experiment'
]);

const ALLOWED_ATTESTATIONS = new Set([
  'owner-confirmed',
  'source-verified',
  'unverified',
  'not-applicable'
]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('business value must be valid JSON');
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  if (isObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  throw new TypeError('business value must be valid JSON');
}

export function digestBusinessValue(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export function validateOwnerAttestationEvidence(status, evidenceText, profile) {
  const errors = [];
  const reference = status?.owner_attestation;
  if (!isObject(reference) || !SHA256_DIGEST.test(reference.canonical_json_sha256)) {
    return ['owner_attestation must contain a valid canonical_json_sha256 before evidence validation'];
  }
  if (!isDateOnly(reference.confirmed_at)) {
    return [
      'owner_attestation.confirmed_at must be a valid YYYY-MM-DD date before evidence validation'
    ];
  }
  if (typeof evidenceText !== 'string') {
    return ['owner attestation evidence must be UTF-8 JSON text'];
  }

  let record;
  try {
    record = JSON.parse(evidenceText);
  } catch (error) {
    return [`owner attestation evidence must be valid JSON: ${error.message}`];
  }
  if (!isObject(record)) return ['owner attestation evidence must be a JSON object'];
  if (!isObject(profile)) return ['owner attestation profile must be an object'];

  if (digestBusinessValue(record) !== reference.canonical_json_sha256) {
    errors.push(
      'owner_attestation canonical_json_sha256 does not match the exact attestation manifest'
    );
  }
  if (record.schema_version !== 'robys.owner-business-truth-attestation.v1') {
    errors.push(
      'owner attestation schema_version must equal robys.owner-business-truth-attestation.v1'
    );
  }
  if (record.confirmed_at !== reference.confirmed_at) {
    errors.push(
      'owner attestation confirmed_at must equal owner_attestation.confirmed_at'
    );
  }
  if (record.source !== status.source) {
    errors.push('owner attestation source must equal business-truth source');
  }
  if (record.authority !== 'accountable-owner') {
    errors.push('owner attestation authority must equal accountable-owner');
  }
  if (typeof record.claim_boundary !== 'string' || record.claim_boundary.trim().length === 0) {
    errors.push('owner attestation claim_boundary must be a non-empty string');
  }
  if (!Array.isArray(record.fields)) {
    errors.push('owner attestation fields must be an array');
    return errors;
  }

  const evidenceByKey = new Map();
  record.fields.forEach((field, index) => {
    if (!isObject(field)) {
      errors.push(`owner attestation fields[${index}] must be an object`);
      return;
    }
    const expectedKeys = ['key', 'source_pointer', 'value', 'value_sha256'];
    if (JSON.stringify(Object.keys(field).sort()) !== JSON.stringify(expectedKeys)) {
      errors.push(`owner attestation fields[${index}] must contain exact field keys`);
    }
    if (typeof field.key !== 'string') {
      errors.push(`owner attestation fields[${index}].key must be a string`);
      return;
    }
    if (evidenceByKey.has(field.key)) {
      errors.push(`owner attestation field is duplicated: ${field.key}`);
    }
    evidenceByKey.set(field.key, field);
  });

  const ownerCriticalLedgerFields = Array.isArray(status.fields)
    ? status.fields.filter((field) => BUSINESS_TRUTH_CRITICALITY_POLICY[field.key] === true)
    : [];
  for (const ledgerField of ownerCriticalLedgerFields) {
    const evidenceField = evidenceByKey.get(ledgerField.key);
    if (!evidenceField) {
      errors.push(`owner attestation field is missing: ${ledgerField.key}`);
      continue;
    }
    const expectedValueDigest = Object.hasOwn(profile, ledgerField.key)
      ? digestBusinessValue(profile[ledgerField.key])
      : null;
    const matches = evidenceField.source_pointer === ledgerField.source_pointer
      && evidenceField.value_sha256 === ledgerField.value_sha256
      && evidenceField.value_sha256 === expectedValueDigest
      && Object.hasOwn(profile, ledgerField.key)
      && canonicalJson(evidenceField.value) === canonicalJson(profile[ledgerField.key]);
    if (!matches) {
      errors.push(
        `owner attestation field ${ledgerField.key} does not match production ledger and business profile`
      );
    }
    evidenceByKey.delete(ledgerField.key);
  }
  for (const unexpectedKey of evidenceByKey.keys()) {
    errors.push(`owner attestation field is not independently owner-critical: ${unexpectedKey}`);
  }
  return errors;
}

function requireString(value, path, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
    return false;
  }
  return true;
}

function requireScore(value, path, errors) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    errors.push(`${path} must be an integer from 1 to 5`);
    return false;
  }
  return true;
}

function requireStringArray(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return false;
  }

  value.forEach((item, index) => requireString(item, `${path}[${index}]`, errors));
  return true;
}

function validateScale(value, path, declaredScales, errors) {
  if (!requireString(value, path, errors)) return;
  if (!ALLOWED_SCALES.has(value)) errors.push(`${path} uses unsupported scale: ${value}`);
  if (declaredScales && !declaredScales.has(value)) {
    errors.push(`${path} is not declared in registry.scales: ${value}`);
  }
}

function validateEvidence(evidence, path, errors) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    errors.push(`${path} must contain at least one evidence reference`);
    return;
  }

  evidence.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(item)) {
      errors.push(`${itemPath} must be an object`);
      return;
    }

    if (!isSafeRepositoryPath(item.path)) {
      errors.push(`${itemPath}.path must be a safe repository-relative path`);
    }
    if (!ALLOWED_EVIDENCE_KINDS.has(item.kind)) {
      errors.push(`${itemPath}.kind is unsupported: ${item.kind}`);
    }
    requireString(item.note, `${itemPath}.note`, errors);
  });
}

function validateSymptoms(symptoms, path, declaredScales, errors) {
  if (!Array.isArray(symptoms) || symptoms.length < 2) {
    errors.push(`${path} must contain at least two symptoms`);
    return;
  }

  const seenScales = new Set();
  symptoms.forEach((symptom, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(symptom)) {
      errors.push(`${itemPath} must be an object`);
      return;
    }

    validateScale(symptom.scale, `${itemPath}.scale`, declaredScales, errors);
    if (typeof symptom.scale === 'string') seenScales.add(symptom.scale);
    requireString(symptom.description, `${itemPath}.description`, errors);
  });

  if (seenScales.size < 2) {
    errors.push(`${path} must show recurrence across at least two distinct scales`);
  }
}

function validateIntervention(intervention, path, declaredScales, errors) {
  if (!isObject(intervention)) {
    errors.push(`${path} must be an object`);
    return;
  }

  requireString(intervention.new_rule, `${path}.new_rule`, errors);

  const actions = intervention.actions;
  if (!Array.isArray(actions) || actions.length < 2) {
    errors.push(`${path}.actions must contain at least two actions`);
  } else {
    const actionScales = new Set();
    actions.forEach((action, index) => {
      const itemPath = `${path}.actions[${index}]`;
      if (!isObject(action)) {
        errors.push(`${itemPath} must be an object`);
        return;
      }

      validateScale(action.scale, `${itemPath}.scale`, declaredScales, errors);
      if (typeof action.scale === 'string') actionScales.add(action.scale);
      requireString(action.action, `${itemPath}.action`, errors);
      requireString(action.owner, `${itemPath}.owner`, errors);
    });

    if (actionScales.size < 2) {
      errors.push(`${path}.actions must change at least two distinct scales`);
    }
  }

  const metrics = intervention.success_metrics;
  if (!Array.isArray(metrics) || metrics.length === 0) {
    errors.push(`${path}.success_metrics must contain at least one metric`);
  } else {
    metrics.forEach((metric, index) => {
      const itemPath = `${path}.success_metrics[${index}]`;
      if (!isObject(metric)) {
        errors.push(`${itemPath} must be an object`);
        return;
      }
      requireString(metric.name, `${itemPath}.name`, errors);
      requireString(metric.target, `${itemPath}.target`, errors);
      requireString(metric.measurement, `${itemPath}.measurement`, errors);
    });
  }

  requireStringArray(intervention.guardrails, `${path}.guardrails`, errors);
  requireString(intervention.rollback, `${path}.rollback`, errors);
}

export function validateRegistry(registry) {
  const errors = [];
  if (!isObject(registry)) return ['registry must be an object'];

  if (registry.schema_version !== REGISTRY_SCHEMA) {
    errors.push(`schema_version must equal ${REGISTRY_SCHEMA}`);
  }
  requireString(registry.system, 'system', errors);
  requireString(registry.claim_boundary, 'claim_boundary', errors);
  if (!isDateOnly(registry.updated_at)) {
    errors.push('updated_at must be a valid YYYY-MM-DD date');
  }

  if (!Array.isArray(registry.scales) || registry.scales.length < 2) {
    errors.push('scales must contain at least two scales');
  }

  const declaredScales = new Set();
  if (Array.isArray(registry.scales)) {
    registry.scales.forEach((scale, index) => {
      validateScale(scale, `scales[${index}]`, null, errors);
      if (declaredScales.has(scale)) errors.push(`scales contains duplicate value: ${scale}`);
      declaredScales.add(scale);
    });
  }

  if (!Array.isArray(registry.patterns) || registry.patterns.length === 0) {
    errors.push('patterns must contain at least one causal pattern');
    return errors;
  }

  const ids = new Set();
  registry.patterns.forEach((pattern, index) => {
    const path = `patterns[${index}]`;
    if (!isObject(pattern)) {
      errors.push(`${path} must be an object`);
      return;
    }

    if (!requireString(pattern.id, `${path}.id`, errors) || !SAFE_ID.test(pattern.id)) {
      errors.push(`${path}.id must be a lowercase kebab-case identifier`);
    } else if (ids.has(pattern.id)) {
      errors.push(`${path}.id is duplicated: ${pattern.id}`);
    } else {
      ids.add(pattern.id);
    }

    requireString(pattern.title, `${path}.title`, errors);
    if (!ALLOWED_PATTERN_STATUSES.has(pattern.status)) {
      errors.push(`${path}.status is unsupported: ${pattern.status}`);
    }
    if (!ALLOWED_CLAIM_LEVELS.has(pattern.claim_level)) {
      errors.push(`${path}.claim_level is unsupported: ${pattern.claim_level}`);
    }
    requireString(pattern.root_rule, `${path}.root_rule`, errors);
    requireString(pattern.falsification, `${path}.falsification`, errors);

    if (!isObject(pattern.scores)) {
      errors.push(`${path}.scores must be an object`);
    } else {
      requireScore(pattern.scores.impact, `${path}.scores.impact`, errors);
      requireScore(pattern.scores.recurrence, `${path}.scores.recurrence`, errors);
      requireScore(pattern.scores.confidence, `${path}.scores.confidence`, errors);
      requireScore(pattern.scores.effort, `${path}.scores.effort`, errors);
    }

    validateEvidence(pattern.evidence, `${path}.evidence`, errors);
    validateSymptoms(pattern.symptoms, `${path}.symptoms`, declaredScales, errors);
    validateIntervention(pattern.intervention, `${path}.intervention`, declaredScales, errors);
  });

  return errors;
}

export function priorityScore(pattern) {
  const { impact, recurrence, confidence, effort } = pattern.scores;
  return Math.round(((impact * recurrence * confidence) / effort) * 100) / 100;
}

export function rankPatterns(registry) {
  return [...registry.patterns]
    .map((pattern) => ({ ...pattern, priority_score: priorityScore(pattern) }))
    .sort((left, right) => (
      right.priority_score - left.priority_score || left.id.localeCompare(right.id, 'en')
    ));
}

export function validateBusinessTruthStatus(status, profile) {
  const errors = [];
  if (!isObject(status)) return ['business truth status must be an object'];
  if (!isObject(profile)) return ['business profile must be an object'];

  if (status.schema_version !== BUSINESS_TRUTH_SCHEMA) {
    errors.push(`schema_version must equal ${BUSINESS_TRUTH_SCHEMA}`);
  }
  if (!['demo', 'production'].includes(status.publication_mode)) {
    errors.push('publication_mode must be demo or production');
  }
  if (!isSafeRepositoryPath(status.source)) {
    errors.push('source must be a safe repository-relative path');
  }
  if (status.source !== CANONICAL_BUSINESS_PROFILE_PATH) {
    errors.push(`source must equal ${CANONICAL_BUSINESS_PROFILE_PATH}`);
  }
  if (!isDateOnly(status.reviewed_at)) {
    errors.push('reviewed_at must be a valid YYYY-MM-DD date');
  }

  const policy = status.production_policy;
  if (!isObject(policy)) {
    errors.push('production_policy must be an object');
  } else {
    if (policy.required_attestation !== 'owner-confirmed') {
      errors.push('production_policy.required_attestation must equal owner-confirmed');
    }
    if (policy.unknown_values_fail_closed !== true) {
      errors.push('production_policy.unknown_values_fail_closed must be true');
    }
  }

  const ownerAttestation = status.owner_attestation;
  const hasOwnerConfirmedFields = Array.isArray(status.fields)
    && status.fields.some(
      (field) => isObject(field) && field.attestation === 'owner-confirmed'
    );
  if (
    status.publication_mode === 'production'
    || hasOwnerConfirmedFields
    || ownerAttestation !== undefined
  ) {
    if (!isObject(ownerAttestation)) {
      if (status.publication_mode === 'production') {
        errors.push('owner_attestation must be an object in production publication mode');
      } else if (hasOwnerConfirmedFields) {
        errors.push('owner_attestation must be an object while any field is owner-confirmed');
      } else {
        errors.push('owner_attestation must be an object when present');
      }
    } else {
      if (!isSafeRepositoryPath(ownerAttestation.path)) {
        errors.push('owner_attestation.path must be a safe repository-relative path');
      }
      if (!isDateOnly(ownerAttestation.confirmed_at)) {
        errors.push('owner_attestation.confirmed_at must be a valid YYYY-MM-DD date');
      } else if (
        isDateOnly(status.reviewed_at)
        && ownerAttestation.confirmed_at > status.reviewed_at
      ) {
        errors.push('owner_attestation.confirmed_at cannot be later than reviewed_at');
      }
      if (!SHA256_DIGEST.test(ownerAttestation.canonical_json_sha256)) {
        errors.push(
          'owner_attestation.canonical_json_sha256 must be sha256:<64 lowercase hex>'
        );
      }
    }
  }

  if (!Array.isArray(status.fields) || status.fields.length === 0) {
    errors.push('fields must contain at least one business-truth field');
    return errors;
  }

  const keys = new Set();
  let ownerCriticalCount = 0;
  status.fields.forEach((field, index) => {
    const path = `fields[${index}]`;
    if (!isObject(field)) {
      errors.push(`${path} must be an object`);
      return;
    }

    let expectedCriticality;
    if (requireString(field.key, `${path}.key`, errors)) {
      if (keys.has(field.key)) errors.push(`${path}.key is duplicated: ${field.key}`);
      keys.add(field.key);
      if (!Object.hasOwn(profile, field.key)) {
        errors.push(`${path}.key is missing from the business profile: ${field.key}`);
      }
      if (field.source_pointer !== `/${field.key}`) {
        errors.push(`${path}.source_pointer must equal /${field.key}`);
      }

      if (!Object.hasOwn(BUSINESS_TRUTH_CRITICALITY_POLICY, field.key)) {
        errors.push(`${path}.key has no independent criticality policy: ${field.key}`);
      } else {
        expectedCriticality = BUSINESS_TRUTH_CRITICALITY_POLICY[field.key];
      }
    }

    if (field.owner_critical !== true && field.owner_critical !== false) {
      errors.push(`${path}.owner_critical must be a boolean`);
    }
    if (
      expectedCriticality !== undefined
      && field.owner_critical !== expectedCriticality
    ) {
      errors.push(
        `${path}.owner_critical must equal independent policy value `
        + `${expectedCriticality} for ${field.key}`
      );
    }
    if (expectedCriticality === true) ownerCriticalCount += 1;

    if (!ALLOWED_ATTESTATIONS.has(field.attestation)) {
      errors.push(`${path}.attestation is unsupported: ${field.attestation}`);
    }
    requireString(field.note, `${path}.note`, errors);

    const bindsCurrentValue = field.attestation === 'owner-confirmed'
      || field.attestation === 'source-verified';
    if (bindsCurrentValue) {
      if (!SHA256_DIGEST.test(field.value_sha256)) {
        errors.push(
          `${path}.value_sha256 must be sha256:<64 lowercase hex> for ${field.attestation}`
        );
      } else if (typeof field.key === 'string' && Object.hasOwn(profile, field.key)) {
        const expectedDigest = digestBusinessValue(profile[field.key]);
        if (field.value_sha256 !== expectedDigest) {
          errors.push(
            `${path} (${field.key}) value_sha256 does not match the current business profile value`
          );
        }
      }
    } else if (field.value_sha256 !== null) {
      errors.push(`${path}.value_sha256 must be null for ${field.attestation}`);
    }

    if (field.attestation === 'not-applicable' && expectedCriticality !== false) {
      errors.push(`${path}.attestation cannot be not-applicable for ${field.key}`);
    }

    if (
      ownerAttestation === undefined
      && expectedCriticality === true
      && field.attestation !== 'unverified'
    ) {
      errors.push(
        `${path} (${field.key}) must be unverified when owner_attestation is absent`
      );
    }

    if (
      status.publication_mode === 'production'
      && expectedCriticality === true
      && field.attestation !== 'owner-confirmed'
    ) {
      errors.push(
        `${path} (${field.key}) blocks production: owner-critical value is ${field.attestation}`
      );
    }
  });

  for (const profileKey of Object.keys(profile)) {
    if (!Object.hasOwn(BUSINESS_TRUTH_CRITICALITY_POLICY, profileKey)) {
      errors.push(`business profile field has no independent criticality policy: ${profileKey}`);
    }
    if (!keys.has(profileKey)) {
      errors.push(`business profile field is missing from the status ledger: ${profileKey}`);
    }
  }

  for (const policyKey of Object.keys(BUSINESS_TRUTH_CRITICALITY_POLICY)) {
    if (!Object.hasOwn(profile, policyKey)) {
      errors.push(`criticality policy field is missing from the business profile: ${policyKey}`);
    }
  }

  if (ownerCriticalCount === 0) {
    errors.push('fields must contain at least one independently owner-critical value');
  }

  return errors;
}

export function renderCausalReport(registry, truthStatus) {
  const ranked = rankPatterns(registry);
  const unresolvedOwnerCritical = truthStatus.fields.filter(
    (field) => BUSINESS_TRUTH_CRITICALITY_POLICY[field.key] === true
      && field.attestation !== 'owner-confirmed'
  );

  const lines = [
    '# Roby’s Fractal Causal Refactoring report',
    '',
    `Publication mode: ${truthStatus.publication_mode}`,
    `Owner-critical fields awaiting encoded confirmation: ${unresolvedOwnerCritical.length}`,
    '',
    '## Ranked causal patterns'
  ];

  ranked.forEach((pattern, index) => {
    lines.push(
      `${index + 1}. ${pattern.title} [${pattern.status}] — priority ${pattern.priority_score}`,
      `   Root rule: ${pattern.root_rule}`,
      `   New rule: ${pattern.intervention.new_rule}`
    );
  });

  lines.push('', '## Claim boundary', registry.claim_boundary);
  return `${lines.join('\n')}\n`;
}

export const causalRefactoringConstants = Object.freeze({
  REGISTRY_SCHEMA,
  BUSINESS_TRUTH_SCHEMA,
  canonicalBusinessProfilePath: CANONICAL_BUSINESS_PROFILE_PATH,
  businessTruthCriticalityPolicy: { ...BUSINESS_TRUTH_CRITICALITY_POLICY },
  scales: [...ALLOWED_SCALES],
  patternStatuses: [...ALLOWED_PATTERN_STATUSES],
  claimLevels: [...ALLOWED_CLAIM_LEVELS],
  evidenceKinds: [...ALLOWED_EVIDENCE_KINDS],
  attestations: [...ALLOWED_ATTESTATIONS]
});
