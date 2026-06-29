import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advanceSessionHead, validateSessionState } from './session-state-lib.mjs';
import { compareAndSwapSessionStateFile } from './session-state-store.mjs';

const fixture = JSON.parse(
  await readFile('qa/fixtures/session-state/pr-126-stale-review.json', 'utf8')
);
const unsafeState = {
  ...fixture,
  sequence: Number.MAX_SAFE_INTEGER + 1
};

assert(
  validateSessionState(unsafeState)
    .includes('sequence must be a safe integer greater than or equal to 1')
);

await assert.rejects(
  compareAndSwapSessionStateFile('/not/read/because/revision/is/invalid.json', {
    expectedSequence: Number.MAX_SAFE_INTEGER + 1,
    update: (state) => ({ changed: false, state })
  }),
  /expectedSequence must be a positive safe integer/
);

assert.throws(
  () => advanceSessionHead(
    { ...fixture, sequence: Number.MAX_SAFE_INTEGER },
    '9999999999999999999999999999999999999999',
    '2026-06-29T08:00:00.000Z'
  ),
  /sequence cannot advance beyond Number.MAX_SAFE_INTEGER/
);

const root = await mkdtemp(join(tmpdir(), 'session-sequence-safety-'));
const statePath = join(root, 'unsafe-state.json');
try {
  await writeFile(statePath, `${JSON.stringify(unsafeState, null, 2)}\n`, 'utf8');
  await assert.rejects(
    compareAndSwapSessionStateFile(statePath, {
      expectedSequence: 1,
      update: (state) => ({ changed: false, state })
    }),
    /Current state is invalid:[\s\S]*sequence must be a safe integer/
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('Session sequence safety tests passed.');
