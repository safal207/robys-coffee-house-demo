import assert from 'node:assert/strict';
import { advanceSessionHead, validateSessionState } from './session-state-lib.mjs';

const oldHead = '1111111111111111111111111111111111111111';
const newHead = '2222222222222222222222222222222222222222';
const now = '2026-06-29T06:00:00.000Z';

const authorizedState = {
  schema_version: 1,
  session_id: 'pr-126',
  sequence: 7,
  goal: 'Prepare PR #126 for merge.',
  repository: 'safal207/robys-coffee-house-demo',
  pull_request: 126,
  head_sha: oldHead,
  status: 'AUTHORIZED',
  completed: ['Implementation complete.'],
  blockers: [],
  next_safe_action: 'Merge with expected-head protection.',
  evidence: [
    {
      id: 'ci-old-head',
      kind: 'github-actions',
      ref: 'run:1',
      sha: oldHead,
      status: 'passed'
    }
  ],
  verified_for_sha: oldHead,
  merge_authorized: true,
  updated_at: '2026-06-29T05:00:00.000Z'
};

assert.deepEqual(validateSessionState(authorizedState), []);

const advanced = advanceSessionHead(authorizedState, newHead, now);
assert.equal(advanced.changed, true);
assert.equal(advanced.state.sequence, 8);
assert.equal(advanced.state.head_sha, newHead);
assert.equal(advanced.state.previous_head_sha, oldHead);
assert.equal(advanced.state.status, 'WAITING_FOR_CURRENT_HEAD_CHECKS');
assert.equal(advanced.state.verified_for_sha, null);
assert.equal(advanced.state.merge_authorized, false);
assert.equal(advanced.state.evidence[0].status, 'stale');
assert.equal(advanced.state.updated_at, now);
assert.deepEqual(validateSessionState(advanced.state, { expectedHeadSha: newHead }), []);

const repeated = advanceSessionHead(advanced.state, newHead, now);
assert.equal(repeated.changed, false);
assert.equal(repeated.state, advanced.state);

const staleAuthorization = {
  ...authorizedState,
  head_sha: newHead
};
const staleErrors = validateSessionState(staleAuthorization);
assert(staleErrors.includes('verified_for_sha must be null or equal head_sha'));
assert(staleErrors.includes('merge_authorized=true requires verified_for_sha to equal head_sha'));
assert(staleErrors.includes('merge_authorized=true requires at least one passed evidence item for head_sha'));

console.log('Session state tests passed.');
