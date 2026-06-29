import { readFile, writeFile } from 'node:fs/promises';
import { advanceSessionHead, validateSessionState } from './session-state-lib.mjs';

const args = process.argv.slice(2);
let path;
let head = process.env.SESSION_HEAD_SHA;
let check = false;
let updatedAt;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--head') {
    head = args[index + 1];
    index += 1;
  } else if (arg.startsWith('--head=')) {
    head = arg.slice('--head='.length);
  } else if (arg === '--check') {
    check = true;
  } else if (arg === '--at') {
    updatedAt = args[index + 1];
    index += 1;
  } else if (arg.startsWith('--at=')) {
    updatedAt = arg.slice('--at='.length);
  } else if (!path) {
    path = arg;
  } else {
    throw new Error(`Unexpected argument: ${arg}`);
  }
}

if (!path) throw new Error('Missing state path. Pass the sidecar state file as the first argument.');
if (!head) throw new Error('Missing head SHA. Pass --head <sha> or set SESSION_HEAD_SHA.');

try {
  const currentState = JSON.parse(await readFile(path, 'utf8'));
  const currentErrors = validateSessionState(currentState);
  if (currentErrors.length > 0) {
    throw new Error(`Current state is invalid:\n${currentErrors.map((error) => `  - ${error}`).join('\n')}`);
  }

  const result = advanceSessionHead(currentState, head, updatedAt);
  if (!result.changed) {
    console.log(`Session head already current: ${head}`);
  } else if (check) {
    console.error(`Session head is stale: state=${currentState.head_sha}, expected=${head}`);
    process.exitCode = 1;
  } else {
    const nextErrors = validateSessionState(result.state, { expectedHeadSha: head });
    if (nextErrors.length > 0) {
      throw new Error(`Updated state would be invalid:\n${nextErrors.map((error) => `  - ${error}`).join('\n')}`);
    }

    await writeFile(path, `${JSON.stringify(result.state, null, 2)}\n`, 'utf8');
    console.log(`Session head advanced: ${currentState.head_sha} -> ${head}`);
    console.log('Current-head verification and merge authorization were reset.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
