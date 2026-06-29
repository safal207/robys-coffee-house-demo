const STATUS_VALUES = new Set([
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'WAITING_FOR_CURRENT_HEAD_CHECKS',
  'READY_FOR_REVIEW',
  'AUTHORIZED',
  'DONE'
]);

const EVIDENCE_STATUS_VALUES = new Set(['observed', 'passed', 'failed', 'stale']);
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[^/\s]+\/[^/\s]+$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const TOP_LEVEL_KEYS = new Set([
  '$schema',
  'schema_version',
  'session_id',
  'sequence',
  'goal',
  'repository',
  'pull_request',
  'head_sha',
  'previous_head_sha',
  'status',
  'completed',
  'blockers',
  'next_safe_action',
  'evidence',
  'verified_for_sha',
  'merge_authorized',
  'updated_at'
]);
const EVIDENCE_KEYS = new Set(['id', 'kind', 'ref', 'sha', 'status']);

/** Return true when a value is a non-empty string after trimming. */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Return true when an array contains no duplicate primitive values. */
function uniqueStrings(values) {
  return new Set(values).size === values.length;
}

/** Validate a full RFC 3339-style date-time accepted by the published schema. */
function isIsoDateTime(value) {
  return isNonEmptyString(value)
    && DATE_TIME_PATTERN.test(value)
    && !Number.isNaN(Date.parse(value));
}

/** Append an error for every property that is not part of the structural contract. */
function collectUnknownPropertyErrors(value, allowedKeys, prefix, errors) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`${prefix}${key} is not allowed`);
  }
}

/**
 * Validate one Session Spine state.
 *
 * The JSON Schema defines the structural envelope. This function additionally
 * enforces semantic cross-field invariants required for safe authorization.
 *
 * @param {unknown} state state object to validate
 * @param {{ expectedHeadSha?: string }} options optional exact observed head
 * @returns {string[]} accumulated validation errors
 */
export function validateSessionState(state, { expectedHeadSha } = {}) {
  const errors = [];

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return ['state must be a JSON object'];
  }

  collectUnknownPropertyErrors(state, TOP_LEVEL_KEYS, '', errors);

  if (state.schema_version !== 1) {
    errors.push('schema_version must equal 1');
  }

  if (!isNonEmptyString(state.session_id)) {
    errors.push('session_id must be a non-empty string');
  }

  if (!Number.isSafeInteger(state.sequence) || state.sequence < 1) {
    errors.push('sequence must be a safe integer greater than or equal to 1');
  }

  if (!isNonEmptyString(state.goal)) {
    errors.push('goal must be a non-empty string');
  }

  if (!isNonEmptyString(state.repository) || !REPOSITORY_PATTERN.test(state.repository)) {
    errors.push('repository must use owner/name format');
  }

  if (state.pull_request !== null && (!Number.isInteger(state.pull_request) || state.pull_request < 1)) {
    errors.push('pull_request must be null or a positive integer');
  }

  if (!isNonEmptyString(state.head_sha) || !SHA_PATTERN.test(state.head_sha)) {
    errors.push('head_sha must be a lowercase 40-character commit SHA');
  }

  if (expectedHeadSha !== undefined) {
    if (!isNonEmptyString(expectedHeadSha) || !SHA_PATTERN.test(expectedHeadSha)) {
      errors.push('expected head SHA must be a lowercase 40-character commit SHA');
    } else if (state.head_sha !== expectedHeadSha) {
      errors.push(`head_sha is stale: state=${state.head_sha}, expected=${expectedHeadSha}`);
    }
  }

  if (
    state.previous_head_sha !== undefined
    && state.previous_head_sha !== null
    && (!isNonEmptyString(state.previous_head_sha) || !SHA_PATTERN.test(state.previous_head_sha))
  ) {
    errors.push('previous_head_sha must be null or a lowercase 40-character commit SHA');
  }

  if (!STATUS_VALUES.has(state.status)) {
    errors.push(`status must be one of: ${[...STATUS_VALUES].join(', ')}`);
  }

  for (const field of ['completed', 'blockers']) {
    if (!Array.isArray(state[field]) || !state[field].every(isNonEmptyString)) {
      errors.push(`${field} must be an array of non-empty strings`);
    } else if (!uniqueStrings(state[field])) {
      errors.push(`${field} must not contain duplicates`);
    }
  }

  if (!isNonEmptyString(state.next_safe_action)) {
    errors.push('next_safe_action must be a non-empty string');
  }

  if (!Array.isArray(state.evidence)) {
    errors.push('evidence must be an array');
  } else {
    const ids = [];
    state.evidence.forEach((item, index) => {
      const prefix = `evidence[${index}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      collectUnknownPropertyErrors(item, EVIDENCE_KEYS, `${prefix}.`, errors);
      if (!isNonEmptyString(item.id)) errors.push(`${prefix}.id must be a non-empty string`);
      if (!isNonEmptyString(item.kind)) errors.push(`${prefix}.kind must be a non-empty string`);
      if (!isNonEmptyString(item.ref)) errors.push(`${prefix}.ref must be a non-empty string`);
      if (item.sha !== null && (!isNonEmptyString(item.sha) || !SHA_PATTERN.test(item.sha))) {
        errors.push(`${prefix}.sha must be null or a lowercase 40-character commit SHA`);
      }
      if (!EVIDENCE_STATUS_VALUES.has(item.status)) {
        errors.push(`${prefix}.status must be one of: ${[...EVIDENCE_STATUS_VALUES].join(', ')}`);
      }
      if (item.id) ids.push(item.id);
    });
    if (!uniqueStrings(ids)) errors.push('evidence ids must be unique');
  }

  if (state.verified_for_sha !== null && (!isNonEmptyString(state.verified_for_sha) || !SHA_PATTERN.test(state.verified_for_sha))) {
    errors.push('verified_for_sha must be null or a lowercase 40-character commit SHA');
  }

  if (state.verified_for_sha !== null && state.verified_for_sha !== state.head_sha) {
    errors.push('verified_for_sha must be null or equal head_sha');
  }

  if (typeof state.merge_authorized !== 'boolean') {
    errors.push('merge_authorized must be a boolean');
  }

  if (!isIsoDateTime(state.updated_at)) {
    errors.push('updated_at must be a full ISO-8601 date-time timestamp');
  }

  if (state.merge_authorized === true) {
    if (!['AUTHORIZED', 'DONE'].includes(state.status)) {
      errors.push('merge_authorized=true requires status AUTHORIZED or DONE');
    }
    if (state.verified_for_sha !== state.head_sha) {
      errors.push('merge_authorized=true requires verified_for_sha to equal head_sha');
    }
    if (Array.isArray(state.blockers) && state.blockers.length > 0) {
      errors.push('merge_authorized=true requires blockers to be empty');
    }
    const hasPassedCurrentHeadEvidence = Array.isArray(state.evidence)
      && state.evidence.some((item) => item?.sha === state.head_sha && item?.status === 'passed');
    if (!hasPassedCurrentHeadEvidence) {
      errors.push('merge_authorized=true requires at least one passed evidence item for head_sha');
    }
  }

  if (['AUTHORIZED', 'DONE'].includes(state.status) && state.merge_authorized !== true) {
    errors.push(`${state.status} requires merge_authorized=true`);
  }

  return errors;
}

/**
 * Move a valid state to a new product head and invalidate all head-bound trust.
 * Repeating the operation for the same SHA is idempotent.
 *
 * @param {object} state current state
 * @param {string} newHeadSha newly observed exact product head
 * @param {string} updatedAt full ISO date-time timestamp for the transition
 * @returns {{ changed: boolean, state: object }} transition result
 */
export function advanceSessionHead(state, newHeadSha, updatedAt = new Date().toISOString()) {
  if (!SHA_PATTERN.test(newHeadSha)) {
    throw new Error('new head SHA must be a lowercase 40-character commit SHA');
  }
  if (!isIsoDateTime(updatedAt)) {
    throw new Error('updatedAt must be a full ISO-8601 date-time timestamp');
  }

  if (state.head_sha === newHeadSha) {
    return { changed: false, state };
  }
  if (state.sequence === Number.MAX_SAFE_INTEGER) {
    throw new Error('sequence cannot advance beyond Number.MAX_SAFE_INTEGER');
  }

  const previousHeadSha = state.head_sha;
  const staleEvidence = Array.isArray(state.evidence)
    ? state.evidence.map((item) => {
        if (item.sha && item.sha !== newHeadSha && item.status !== 'failed') {
          return { ...item, status: 'stale' };
        }
        return item;
      })
    : [];

  const verificationBlocker = `Current-head verification required for ${newHeadSha}.`;
  const blockers = Array.isArray(state.blockers)
    ? [...state.blockers.filter((item) => !item.startsWith('Current-head verification required for ')), verificationBlocker]
    : [verificationBlocker];

  return {
    changed: true,
    state: {
      ...state,
      sequence: Number.isSafeInteger(state.sequence) ? state.sequence + 1 : 1,
      head_sha: newHeadSha,
      status: 'WAITING_FOR_CURRENT_HEAD_CHECKS',
      blockers,
      next_safe_action: `Run all required checks and obtain fresh review evidence for head ${newHeadSha}.`,
      evidence: staleEvidence,
      verified_for_sha: null,
      merge_authorized: false,
      updated_at: updatedAt,
      previous_head_sha: previousHeadSha
    }
  };
}
