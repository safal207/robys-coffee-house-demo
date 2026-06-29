import { readFile, writeFile } from 'node:fs/promises';
import { advanceSessionHead, validateSessionState } from './session-state-lib.mjs';

function requiredFlagValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  let statePath;
  let head = process.env.SESSION_HEAD_SHA;
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

  const currentState = JSON.parse(await readFile(statePath, 'utf8'));
  const currentErrors = validateSessionState(currentState);
  if (currentErrors.length > 0) {
    throw new Error(['Current state is invalid:', ...currentErrors.map((error) => `  - ${error}`)].join('\n'));
  }

  const result = advanceSessionHead(currentState, head, updatedAt);
  if (!result.changed) {
    console.log(`Session head already current: ${head}`);
    return;
  }

  if (check) {
    console.error(`Session head is stale: state=${currentState.head_sha}, expected=${head}`);
    process.exitCode = 1;
    return;
  }

  const nextErrors = validateSessionState(result.state, { expectedHeadSha: head });
  if (nextErrors.length > 0) {
    throw new Error(['Updated state would be invalid:', ...nextErrors.map((error) => `  - ${error}`)].join('\n'));
  }

  await writeFile(statePath, `${JSON.stringify(result.state, null, 2)}\n`, 'utf8');
  console.log(`Session head advanced: ${currentState.head_sha} -> ${head}`);
  console.log('Current-head verification and merge authorization were reset.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
