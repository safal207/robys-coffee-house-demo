import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSessionState } from './session-state-lib.mjs';
import { compareAndSwapSessionStateFile } from './session-state-store.mjs';

const fixture = JSON.parse(
  await readFile('qa/fixtures/session-state/pr-126-stale-review.json', 'utf8')
);
fixture.sequence = Number.MAX_SAFE_INTEGER + 1;

assert(
  validateSessionState(fixture)
    .includes('sequence must be a safe integer greater than or equal to 1')
);

await assert.rejects(
  compareAndSwapSessionStateFile('/not/read/because/revision/is/invalid.json', {
    expectedSequence: Number.MAX_SAFE_INTEGER + 1,
    update: (state) => ({ changed: false, state })
  }),
  /expectedSequence must be a positive safe integer/
);

console.log('Session sequence safety tests passed.');
