import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advanceSessionHead } from './session-state-lib.mjs';
import { compareAndSwapSessionStateFile } from './session-state-store.mjs';

const oldHead = '1111111111111111111111111111111111111111';
const newHead = '2222222222222222222222222222222222222222';
const laterHead = '3333333333333333333333333333333333333333';
const now = '2026-06-29T07:00:00.000Z';

const authorizedState = {
  schema_version: 1,
  session_id: 'pr-132',
  sequence: 7,
  goal: 'Protect concurrent Session Spine writers.',
  repository: 'safal207/robys-coffee-house-demo',
  pull_request: 132,
  head_sha: oldHead,
  status: 'AUTHORIZED',
  completed: ['Session Spine v1 merged.'],
  blockers: [],
  next_safe_action: 'Advance to the next exact head.',
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
  updated_at: '2026-06-29T06:00:00.000Z'
};

const root = await mkdtemp(join(tmpdir(), 'session-spine-v2-'));
const statePath = join(root, 'session-state.json');

async function resetState() {
  await writeFile(statePath, `${JSON.stringify(authorizedState, null, 2)}\n`, 'utf8');
}

try {
  await resetState();
  const committed = await compareAndSwapSessionStateFile(statePath, {
    expectedSequence: 7,
    update: (state) => advanceSessionHead(state, newHead, now)
  });
  assert.equal(committed.changed, true);
  assert.equal(committed.state.sequence, 8);
  assert.equal(committed.state.head_sha, newHead);

  const stored = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(stored.sequence, 8);
  assert.equal(stored.head_sha, newHead);

  await assert.rejects(
    compareAndSwapSessionStateFile(statePath, {
      expectedSequence: 7,
      update: (state) => advanceSessionHead(state, laterHead, now)
    }),
    (error) => error.code === 'SESSION_STATE_CONFLICT'
  );
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).head_sha, newHead);

  await resetState();
  let releaseFirstWriter;
  let signalLockAcquired;
  const firstWriterMayFinish = new Promise((resolve) => {
    releaseFirstWriter = resolve;
  });
  const firstWriterHasLock = new Promise((resolve) => {
    signalLockAcquired = resolve;
  });

  const firstWriter = compareAndSwapSessionStateFile(statePath, {
    expectedSequence: 7,
    update: async (state) => {
      signalLockAcquired();
      await firstWriterMayFinish;
      return advanceSessionHead(state, newHead, now);
    }
  });

  await firstWriterHasLock;
  await assert.rejects(
    compareAndSwapSessionStateFile(statePath, {
      expectedSequence: 7,
      update: (state) => advanceSessionHead(state, laterHead, now)
    }),
    (error) => error.code === 'SESSION_STATE_BUSY'
  );

  releaseFirstWriter();
  await firstWriter;

  await assert.rejects(
    compareAndSwapSessionStateFile(statePath, {
      expectedSequence: 7,
      update: (state) => advanceSessionHead(state, laterHead, now)
    }),
    (error) => error.code === 'SESSION_STATE_CONFLICT'
  );

  await assert.rejects(access(`${statePath}.lock`), (error) => error.code === 'ENOENT');

  await resetState();
  const missingSequence = spawnSync(
    process.execPath,
    ['scripts/update-session-state.mjs', statePath, '--head', newHead, '--at', now],
    { encoding: 'utf8' }
  );
  assert.equal(missingSequence.status, 1);
  assert.match(missingSequence.stderr, /Missing expected sequence/);

  const cliSuccess = spawnSync(
    process.execPath,
    [
      'scripts/update-session-state.mjs',
      statePath,
      '--head',
      newHead,
      '--expected-sequence',
      '7',
      '--at',
      now
    ],
    { encoding: 'utf8' }
  );
  assert.equal(cliSuccess.status, 0, cliSuccess.stderr);
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).sequence, 8);

  const staleCliWriter = spawnSync(
    process.execPath,
    [
      'scripts/update-session-state.mjs',
      statePath,
      '--head',
      laterHead,
      '--expected-sequence',
      '7',
      '--at',
      now
    ],
    { encoding: 'utf8' }
  );
  assert.equal(staleCliWriter.status, 1);
  assert.match(staleCliWriter.stderr, /sequence conflict: expected=7, actual=8/);

  console.log('Session state store CAS tests passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
