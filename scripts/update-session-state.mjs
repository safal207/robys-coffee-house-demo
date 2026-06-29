import { advanceSessionHead, validateSessionState } from './session-state-lib.mjs';
import {
  compareAndSwapSessionStateFile,
  readLockedSessionStateFile
} from './session-state-store.mjs';

function requiredFlagValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePositiveInteger(value, flag) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${flag} must be a positive safe integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flag} must be a positive safe integer`);
  }
  return parsed;
}

function transitionState(currentState, head, updatedAt) {
  const currentErrors = validateSessionState(currentState);
  if (currentErrors.length > 0) {
    throw new Error(['Current state is invalid:', ...currentErrors.map((error) => `  - ${error}`)].join('\n'));
  }

  const result = advanceSessionHead(currentState, head, updatedAt);
  if (!result.changed) return result;

  const nextErrors = validateSessionState(result.state, { expectedHeadSha: head });
  if (nextErrors.length > 0) {
    throw new Error(['Updated state would be invalid:', ...nextErrors.map((error) => `  - ${error}`)].join('\n'));
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let statePath;
  let head = process.env.SESSION_HEAD_SHA;
  let expectedSequence;
  let check = false;
  let updatedAt;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--head') {
      head = requiredFlagValue(args, index, '--head');
      index += 1;
    } else if (arg.startsWith('--head=')) {
      head = arg.slice('--head='.length);
      if (!head) throw new Error('Missing value for --head');
    } else if (arg === '--expected-sequence') {
      expectedSequence = parsePositiveInteger(
        requiredFlagValue(args, index, '--expected-sequence'),
        '--expected-sequence'
      );
      index += 1;
    } else if (arg.startsWith('--expected-sequence=')) {
      const value = arg.slice('--expected-sequence='.length);
      if (!value) throw new Error('Missing value for --expected-sequence');
      expectedSequence = parsePositiveInteger(value, '--expected-sequence');
    } else if (arg === '--check') {
      check = true;
    } else if (arg === '--at') {
      updatedAt = requiredFlagValue(args, index, '--at');
      index += 1;
    } else if (arg.startsWith('--at=')) {
      updatedAt = arg.slice('--at='.length);
      if (!updatedAt) throw new Error('Missing value for --at');
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!statePath) {
      statePath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!statePath) throw new Error('Missing state path.');
  if (!head) throw new Error('Missing head SHA. Pass --head or set SESSION_HEAD_SHA.');

  if (check) {
    const currentState = await readLockedSessionStateFile(statePath, { expectedSequence });
    const result = advanceSessionHead(currentState, head, updatedAt);
    if (result.changed) {
      console.error(`Session head is stale: state=${currentState.head_sha}, expected=${head}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Session head already current: ${head} (seq=${currentState.sequence})`);
    return;
  }

  if (expectedSequence === undefined) {
    throw new Error('Missing expected sequence. Pass --expected-sequence <n>.');
  }

  const result = await compareAndSwapSessionStateFile(statePath, {
    expectedSequence,
    update: (currentState) => transitionState(currentState, head, updatedAt)
  });

  if (!result.changed) {
    console.log(`Session head already current: ${head} (seq=${result.state.sequence})`);
    return;
  }

  console.log(
    `Session head advanced: ${result.previousState.head_sha} -> ${head} ` +
    `(seq=${result.previousState.sequence}->${result.state.sequence})`
  );
  console.log('Current-head verification and merge authorization were reset.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
