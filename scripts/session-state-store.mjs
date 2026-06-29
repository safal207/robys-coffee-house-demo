import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { validateSessionState } from './session-state-lib.mjs';

export class SessionStateConflictError extends Error {
  constructor(expectedSequence, actualSequence) {
    super(`Session state sequence conflict: expected=${expectedSequence}, actual=${actualSequence}`);
    this.name = 'SessionStateConflictError';
    this.code = 'SESSION_STATE_CONFLICT';
    this.expectedSequence = expectedSequence;
    this.actualSequence = actualSequence;
  }
}

export class SessionStateBusyError extends Error {
  constructor(lockPath) {
    super(`Session state is locked by another coordinator: ${lockPath}`);
    this.name = 'SessionStateBusyError';
    this.code = 'SESSION_STATE_BUSY';
    this.lockPath = lockPath;
  }
}

async function removeIfPresent(path) {
  if (!path) return;
  try {
    await unlink(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function assertStatePath(statePath) {
  if (typeof statePath !== 'string' || statePath.trim().length === 0) {
    throw new Error('statePath must be a non-empty string');
  }
}

function assertExpectedSequence(expectedSequence, { optional = false } = {}) {
  if (optional && expectedSequence === undefined) return;
  if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 1) {
    throw new Error('expectedSequence must be a positive safe integer');
  }
}

function assertValidState(state, label) {
  const errors = validateSessionState(state);
  if (errors.length > 0) {
    throw new Error([`${label} state is invalid:`, ...errors.map((error) => `  - ${error}`)].join('\n'));
  }
}

async function withSessionStateLock(statePath, operation) {
  assertStatePath(statePath);
  const lockPath = `${statePath}.lock`;
  let lockHandle;

  try {
    try {
      lockHandle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error.code === 'EEXIST') throw new SessionStateBusyError(lockPath);
      throw error;
    }
    return await operation();
  } finally {
    if (lockHandle) {
      await lockHandle.close();
      await removeIfPresent(lockPath);
    }
  }
}

/** Read and validate one canonical sidecar while excluding concurrent writers. */
export async function readLockedSessionStateFile(statePath, { expectedSequence } = {}) {
  assertExpectedSequence(expectedSequence, { optional: true });
  return withSessionStateLock(statePath, async () => {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    assertValidState(state, 'Current');
    if (expectedSequence !== undefined && state.sequence !== expectedSequence) {
      throw new SessionStateConflictError(expectedSequence, state.sequence);
    }
    return structuredClone(state);
  });
}

/**
 * Update a Session Spine sidecar with an exclusive lock and sequence CAS.
 * A changed state must increment sequence by exactly one.
 */
export async function compareAndSwapSessionStateFile(
  statePath,
  { expectedSequence, update }
) {
  assertExpectedSequence(expectedSequence);
  if (typeof update !== 'function') throw new Error('update must be a function');

  return withSessionStateLock(statePath, async () => {
    let temporaryPath;
    let temporaryHandle;

    try {
      const currentState = JSON.parse(await readFile(statePath, 'utf8'));
      assertValidState(currentState, 'Current');
      const previousState = structuredClone(currentState);
      if (currentState.sequence !== expectedSequence) {
        throw new SessionStateConflictError(expectedSequence, currentState.sequence);
      }

      const result = await update(structuredClone(currentState));
      if (
        !result
        || typeof result !== 'object'
        || typeof result.changed !== 'boolean'
        || !result.state
        || typeof result.state !== 'object'
        || Array.isArray(result.state)
      ) {
        throw new Error('update must return { changed, state }');
      }
      assertValidState(result.state, 'Updated');

      if (!result.changed) {
        if (!isDeepStrictEqual(result.state, previousState)) {
          throw new Error('unchanged update must preserve canonical state');
        }
        return { changed: false, previousState, state: previousState };
      }

      if (result.state.sequence !== expectedSequence + 1) {
        throw new Error('changed update must increment sequence exactly once');
      }

      const currentStats = await stat(statePath);
      const currentMode = currentStats.mode & 0o777;
      temporaryPath = join(
        dirname(statePath),
        `.${basename(statePath)}.tmp-${randomUUID()}`
      );
      temporaryHandle = await open(temporaryPath, 'wx', 0o600);
      await temporaryHandle.chmod(currentMode);
      await temporaryHandle.writeFile(`${JSON.stringify(result.state, null, 2)}\n`, 'utf8');
      await temporaryHandle.sync();
      await temporaryHandle.close();
      temporaryHandle = undefined;

      await rename(temporaryPath, statePath);
      temporaryPath = undefined;
      return { changed: true, previousState, state: structuredClone(result.state) };
    } finally {
      if (temporaryHandle) await temporaryHandle.close();
      await removeIfPresent(temporaryPath);
    }
  });
}
